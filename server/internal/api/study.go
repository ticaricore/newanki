package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/newanki/server/internal/db/userdb"
	"github.com/newanki/server/internal/srs"
)

func (s *Server) handleStudyQueue(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	qs := r.URL.Query()
	var deckID int64
	if v := qs.Get("deck_uid"); v != "" {
		uid, err := parseUID(v, "deck_uid")
		if err != nil {
			return err
		}
		d, err := getDeck(r, rc, uid)
		if err != nil {
			return err
		}
		deckID = d.ID
	}
	// ahead_days > 0 also returns cards due in the next days, so an offline client can keep studying
	// after midnight. total_due still counts only cards due now.
	var ahead int64
	if v := qs.Get("ahead_days"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 || n > 7 {
			return errField("ahead_days", "0 ile 7 arasında olmalı")
		}
		ahead = int64(n) * int64(24*time.Hour/time.Millisecond)
	}
	limit := 100
	if v := qs.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 500 {
			return errField("limit", "1 ile 500 arasında olmalı")
		}
		limit = n
	}
	now := s.now().UnixMilli()
	rows, err := rc.udb.Q.DueCards(r.Context(), now+ahead, deckID, limit)
	if err != nil {
		return err
	}
	total, err := rc.udb.Q.CountDue(r.Context(), now, deckID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, StudyQueueResponse{Cards: cardDTOs(rows), TotalDue: total})
	return nil
}

// maxClientSkew bounds how far in the past a client timestamp may place a review (offline answers).
const maxClientSkew = 30 * 24 * time.Hour

// Batch statuses.
const (
	reviewApplied   = "applied"   // the answer moved the card
	reviewDuplicate = "duplicate" // the uid was already stored; the original outcome is returned
	reviewStale     = "stale"     // logged, but the card was already reviewed later (another device)
	reviewRejected  = "rejected"  // invalid input or unknown card; the client should drop it
)

type reviewCtx struct {
	sched   srs.Scheduler
	loc     *time.Location
	dayHour int
	now     time.Time
}

func (s *Server) newReviewCtx(r *http.Request, rc *reqCtx) (reviewCtx, error) {
	loc, dayHour, _, err := s.userClock(r.Context(), rc.udb.Q)
	if err != nil {
		return reviewCtx{}, err
	}
	return reviewCtx{sched: s.scheduler(), loc: loc, dayHour: dayHour, now: s.now()}, nil
}

// reviewTime is when the answer was given: the client timestamp, clamped to [now-30d, now].
func (c reviewCtx) reviewTime(clientTS *int64) time.Time {
	if clientTS == nil {
		return c.now
	}
	t := time.UnixMilli(*clientTS)
	if t.After(c.now) {
		return c.now
	}
	if t.Before(c.now.Add(-maxClientSkew)) {
		return c.now.Add(-maxClientSkew)
	}
	return t
}

// applyReview stores one answer inside tx. It returns an *APIError for input the client should not retry.
func applyReview(ctx context.Context, q *userdb.Queries, c reviewCtx, in ReviewInput) (ReviewResult, string, error) {
	reviewUID, err := parseUID(in.UID, "uid")
	if err != nil {
		return ReviewResult{}, "", err
	}
	cardUID, err := parseUID(in.CardUID, "card_uid")
	if err != nil {
		return ReviewResult{}, "", err
	}
	if in.DurationMs < 0 || in.DurationMs > int64(time.Hour/time.Millisecond) {
		in.DurationMs = 0
	}

	// A retried submission returns the original outcome instead of applying the answer twice.
	if prev, err := q.GetReviewByUID(ctx, reviewUID); err == nil {
		return ReviewResult{
			UID: reviewUID, CardUID: cardUID, LevelBefore: prev.LevelBefore, LevelAfter: prev.LevelAfter,
			DueAt: prev.DueAfter, Duplicate: true,
		}, reviewDuplicate, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return ReviewResult{}, "", err
	}

	card, err := q.GetCardRow(ctx, cardUID)
	if errors.Is(err, sql.ErrNoRows) {
		return ReviewResult{}, "", errNotFound("kart")
	}
	if err != nil {
		return ReviewResult{}, "", err
	}

	at := c.reviewTime(in.ClientTS)
	before := c.sched.Clamp(int(card.Level))
	after := c.sched.Next(before, in.Correct)
	due := c.sched.DueAt(at, after, c.loc, c.dayHour).UnixMilli()
	status := reviewApplied

	// An older offline answer must not overwrite a newer review from another device:
	// keep it in the log (it counts for stats and streaks) but leave the card state alone.
	if card.LastReviewedAt.Valid && at.UnixMilli() < card.LastReviewedAt.Int64 {
		status = reviewStale
		after = before
		due = card.DueAt
	} else {
		var lapse int64
		if !in.Correct {
			lapse = 1
		}
		if err := q.UpdateCardState(ctx, userdb.UpdateCardStateParams{
			Level: int64(after), DueAt: due,
			LastReviewedAt: sql.NullInt64{Int64: at.UnixMilli(), Valid: true}, Lapses: lapse, CardID: card.ID,
		}); err != nil {
			return ReviewResult{}, "", err
		}
	}
	correct := int64(0)
	if in.Correct {
		correct = 1
	}
	if err := q.InsertReview(ctx, userdb.InsertReviewParams{
		Uid: reviewUID, CardID: card.ID, Correct: correct, LevelBefore: int64(before), LevelAfter: int64(after),
		DueAfter: due, ReviewedAt: at.UnixMilli(), ClientTs: nullInt64Ptr(in.ClientTS),
		DurationMs: in.DurationMs, Day: srs.DayKey(at, c.loc, c.dayHour),
	}); err != nil {
		return ReviewResult{}, "", err
	}
	return ReviewResult{
		UID: reviewUID, CardUID: cardUID, LevelBefore: int64(before), LevelAfter: int64(after), DueAt: due,
	}, status, nil
}

func (s *Server) handleReview(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in ReviewInput
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	c, err := s.newReviewCtx(r, rc)
	if err != nil {
		return err
	}
	tx, err := rc.udb.DB.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, status, err := applyReview(r.Context(), rc.udb.Q.WithTx(tx), c, in)
	if err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	code := http.StatusCreated
	if status == reviewDuplicate {
		code = http.StatusOK
	}
	writeJSON(w, code, res)
	return nil
}

const maxBatchReviews = 500

// handleReviewBatch stores answers collected offline. Items are applied oldest first in one transaction;
// a bad item is reported as rejected without failing the others.
func (s *Server) handleReviewBatch(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in ReviewBatchRequest
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	if len(in.Reviews) == 0 || len(in.Reviews) > maxBatchReviews {
		return errField("reviews", fmt.Sprintf("1 ile %d arasında cevap gönderin", maxBatchReviews))
	}
	c, err := s.newReviewCtx(r, rc)
	if err != nil {
		return err
	}

	order := make([]int, len(in.Reviews))
	for i := range order {
		order[i] = i
	}
	ts := func(i int) int64 { return c.reviewTime(in.Reviews[i].ClientTS).UnixMilli() }
	sort.SliceStable(order, func(a, b int) bool { return ts(order[a]) < ts(order[b]) })

	tx, err := rc.udb.DB.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	q := rc.udb.Q.WithTx(tx)

	results := make([]ReviewBatchItem, len(in.Reviews))
	for _, i := range order {
		res, status, err := applyReview(r.Context(), q, c, in.Reviews[i])
		var apiErr *APIError
		switch {
		case err == nil:
			results[i] = ReviewBatchItem{ReviewResult: res, Status: status}
		case errors.As(err, &apiErr):
			results[i] = ReviewBatchItem{ReviewResult: ReviewResult{UID: in.Reviews[i].UID, CardUID: in.Reviews[i].CardUID},
				Status: reviewRejected, ErrorCode: apiErr.Code}
		default:
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, ReviewBatchResponse{Results: results})
	return nil
}

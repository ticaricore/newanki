package api

import (
	"database/sql"
	"errors"
	"net/http"
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
	limit := 100
	if v := qs.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 500 {
			return errField("limit", "1 ile 500 arasında olmalı")
		}
		limit = n
	}
	now := s.now().UnixMilli()
	rows, err := rc.udb.Q.DueCards(r.Context(), now, deckID, limit)
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

func (s *Server) handleReview(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in ReviewInput
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	reviewUID, err := parseUID(in.UID, "uid")
	if err != nil {
		return err
	}
	cardUID, err := parseUID(in.CardUID, "card_uid")
	if err != nil {
		return err
	}
	if in.DurationMs < 0 || in.DurationMs > int64(time.Hour/time.Millisecond) {
		in.DurationMs = 0
	}
	loc, dayHour, _, err := s.userClock(r.Context(), rc.udb.Q)
	if err != nil {
		return err
	}

	tx, err := rc.udb.DB.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	q := rc.udb.Q.WithTx(tx)

	// A retried submission returns the original outcome instead of applying the answer twice.
	if prev, err := q.GetReviewByUID(r.Context(), reviewUID); err == nil {
		writeJSON(w, http.StatusOK, ReviewResult{
			UID: reviewUID, CardUID: cardUID, LevelBefore: prev.LevelBefore, LevelAfter: prev.LevelAfter,
			DueAt: prev.DueAfter, Duplicate: true,
		})
		return nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	card, err := q.GetCardRow(r.Context(), cardUID)
	if errors.Is(err, sql.ErrNoRows) {
		return errNotFound("kart")
	}
	if err != nil {
		return err
	}

	sched := s.scheduler()
	now := s.now()
	before := sched.Clamp(int(card.Level))
	after := sched.Next(before, in.Correct)
	due := sched.DueAt(now, after, loc, dayHour)
	var lapse int64
	if !in.Correct {
		lapse = 1
	}
	if err := q.UpdateCardState(r.Context(), userdb.UpdateCardStateParams{
		Level: int64(after), DueAt: due.UnixMilli(),
		LastReviewedAt: sql.NullInt64{Int64: now.UnixMilli(), Valid: true}, Lapses: lapse, CardID: card.ID,
	}); err != nil {
		return err
	}
	correct := int64(0)
	if in.Correct {
		correct = 1
	}
	if err := q.InsertReview(r.Context(), userdb.InsertReviewParams{
		Uid: reviewUID, CardID: card.ID, Correct: correct, LevelBefore: int64(before), LevelAfter: int64(after),
		DueAfter: due.UnixMilli(), ReviewedAt: now.UnixMilli(), ClientTs: nullInt64Ptr(in.ClientTS),
		DurationMs: in.DurationMs, Day: srs.DayKey(now, loc, dayHour),
	}); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, ReviewResult{
		UID: reviewUID, CardUID: cardUID, LevelBefore: int64(before), LevelAfter: int64(after), DueAt: due.UnixMilli(),
	})
	return nil
}

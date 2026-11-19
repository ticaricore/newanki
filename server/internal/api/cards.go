package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/newanki/server/internal/db/userdb"
)

const maxTextLen = 4000

func cardDTO(c userdb.CardRow) CardDTO {
	fields := json.RawMessage(c.Fields)
	if !json.Valid(fields) {
		fields = json.RawMessage(`{}`)
	}
	return CardDTO{
		UID: c.Uid, DeckUID: c.DeckUid, Type: c.Type, Front: c.Front, Back: c.Back, Fields: fields,
		Level: c.Level, DueAt: c.DueAt, Reviews: c.Reviews, Lapses: c.Lapses,
		LastReviewedAt: nullInt(c.LastReviewedAt), CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt,
	}
}

func cardDTOs(rows []userdb.CardRow) []CardDTO {
	out := make([]CardDTO, 0, len(rows))
	for _, c := range rows {
		out = append(out, cardDTO(c))
	}
	return out
}

func validCardType(t string) bool {
	return t == "word" || t == "audio" || t == "image" || t == "quran"
}

// normalizeCard trims input, keeps only the fields that belong to the card type, fills derived
// front/back for Kur'an cards, and checks required fields and referenced media.
func normalizeCard(ctx context.Context, q *userdb.Queries, typ string, front, back string, f CardFields) (string, string, CardFields, error) {
	front, back = strings.TrimSpace(front), strings.TrimSpace(back)
	t := strings.TrimSpace
	var out CardFields
	switch typ {
	case "word":
		out = CardFields{IPA: t(f.IPA), POS: t(f.POS), Example: t(f.Example), Lang: t(f.Lang)}
		if front == "" {
			return "", "", out, errField("front", "ön yüz boş olamaz")
		}
		if back == "" {
			return "", "", out, errField("back", "arka yüz boş olamaz")
		}
	case "audio":
		out = CardFields{MediaUID: t(f.MediaUID), Duration: f.Duration}
		if back == "" {
			return "", "", out, errField("back", "yazılı cevap boş olamaz")
		}
		if out.Duration < 0 || out.Duration > 600 {
			return "", "", out, errField("fields.duration", "süre 0–600 saniye olmalı")
		}
	case "image":
		out = CardFields{MediaUID: t(f.MediaUID), Extra: t(f.Extra)}
		if front == "" {
			return "", "", out, errField("front", "soru boş olamaz")
		}
		if back == "" {
			return "", "", out, errField("back", "cevap boş olamaz")
		}
	case "quran":
		out = CardFields{Sure: t(f.Sure), Ayah: t(f.Ayah), Arabic: t(f.Arabic), Translit: t(f.Translit),
			Meal: t(f.Meal), Tefsir: t(f.Tefsir), Reciter: t(f.Reciter)}
		if out.Arabic == "" && out.Meal == "" {
			return "", "", out, errField("fields.arabic", "Arapça metin veya meal girilmeli")
		}
		if front == "" {
			front = strings.TrimSpace(strings.Join(nonEmpty(out.Sure, out.Ayah), " · "))
		}
		if back == "" {
			back = out.Meal
		}
	default:
		return "", "", out, errField("type", "tip word, audio, image veya quran olmalı")
	}
	if utf8.RuneCountInString(front) > maxTextLen || utf8.RuneCountInString(back) > maxTextLen {
		return "", "", out, errField("front", "metin çok uzun")
	}
	b, _ := json.Marshal(out)
	if len(b) > 4*maxTextLen {
		return "", "", out, errField("fields", "alanlar çok uzun")
	}
	if out.MediaUID != "" {
		uid, err := parseUID(out.MediaUID, "fields.media_uid")
		if err != nil {
			return "", "", out, err
		}
		out.MediaUID = uid
		ok, err := q.MediaExists(ctx, uid, map[string]string{"audio": "audio", "image": "image"}[typ])
		if err != nil {
			return "", "", out, err
		}
		if !ok {
			return "", "", out, errField("fields.media_uid", "medya bulunamadı")
		}
	}
	return front, back, out, nil
}

func nonEmpty(ss ...string) []string {
	var out []string
	for _, s := range ss {
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

func getCardRow(r *http.Request, rc *reqCtx, uid string) (userdb.CardRow, error) {
	c, err := rc.udb.Q.GetCardRow(r.Context(), uid)
	if errors.Is(err, sql.ErrNoRows) {
		return c, errNotFound("kart")
	}
	return c, err
}

func (s *Server) handleListCards(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	qs := r.URL.Query()
	p := userdb.ListCardsParams{Query: strings.TrimSpace(qs.Get("q")), Limit: 50}
	if v := qs.Get("deck_uid"); v != "" {
		uid, err := parseUID(v, "deck_uid")
		if err != nil {
			return err
		}
		d, err := getDeck(r, rc, uid)
		if err != nil {
			return err
		}
		p.DeckID = d.ID
	}
	if v := qs.Get("type"); v != "" && v != "all" {
		if !validCardType(v) {
			return errField("type", "geçersiz kart tipi")
		}
		p.Type = v
	}
	if v := qs.Get("cursor"); v != "" {
		uid, err := parseUID(v, "cursor")
		if err != nil {
			return err
		}
		p.AfterUID = uid
	}
	// Fetch one extra row to know whether another page exists.
	limit := p.Limit
	p.Limit = limit + 1
	rows, err := rc.udb.Q.ListCards(r.Context(), p)
	if err != nil {
		return err
	}
	resp := CardListResponse{}
	if len(rows) > limit {
		rows = rows[:limit]
		if userdb.FTSQuery(p.Query) == "" {
			resp.NextCursor = rows[len(rows)-1].Uid
		}
	}
	resp.Cards = cardDTOs(rows)
	writeJSON(w, http.StatusOK, resp)
	return nil
}

func (s *Server) handleGetCard(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	uid, err := pathUID(r, "uid")
	if err != nil {
		return err
	}
	c, err := getCardRow(r, rc, uid)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, cardDTO(c))
	return nil
}

func (s *Server) handleCreateCard(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in CardInput
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	uid, err := optionalUID(in.UID, "uid")
	if err != nil {
		return err
	}
	// Idempotent create.
	if existing, err := rc.udb.Q.GetCardByUIDAny(r.Context(), uid); err == nil {
		if existing.DeletedAt.Valid {
			return &APIError{Status: http.StatusConflict, Code: "uid_taken", Message: "bu uid silinmiş bir karta ait"}
		}
		row, err := getCardRow(r, rc, uid)
		if err != nil {
			return err
		}
		writeJSON(w, http.StatusOK, cardDTO(row))
		return nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	deckUID, err := parseUID(in.DeckUID, "deck_uid")
	if err != nil {
		return err
	}
	d, err := getDeck(r, rc, deckUID)
	if err != nil {
		return err
	}
	front, back, fields, err := normalizeCard(r.Context(), rc.udb.Q, in.Type, in.Front, in.Back, in.Fields)
	if err != nil {
		return err
	}
	fb, _ := json.Marshal(fields)
	now := s.now().UnixMilli()

	tx, err := rc.udb.DB.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	q := rc.udb.Q.WithTx(tx)
	c, err := q.CreateCard(r.Context(), userdb.CreateCardParams{
		Uid: uid, DeckID: d.ID, Type: in.Type, Front: front, Back: back, Fields: string(fb),
		CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		return err
	}
	if err := q.CreateCardState(r.Context(), userdb.CreateCardStateParams{CardID: c.ID, Level: 0, DueAt: now}); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	row, err := getCardRow(r, rc, uid)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, cardDTO(row))
	return nil
}

func (s *Server) handlePatchCard(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	uid, err := pathUID(r, "uid")
	if err != nil {
		return err
	}
	var in CardPatch
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	cur, err := getCardRow(r, rc, uid)
	if err != nil {
		return err
	}
	var fields CardFields
	_ = json.Unmarshal([]byte(cur.Fields), &fields)
	front, back, deckUID := cur.Front, cur.Back, cur.DeckUid
	if in.Front != nil {
		front = *in.Front
	}
	if in.Back != nil {
		back = *in.Back
	}
	if in.Fields != nil {
		fields = *in.Fields
	}
	if in.DeckUID != nil {
		if deckUID, err = parseUID(*in.DeckUID, "deck_uid"); err != nil {
			return err
		}
	}
	d, err := getDeck(r, rc, deckUID)
	if err != nil {
		return err
	}
	front, back, fields, err = normalizeCard(r.Context(), rc.udb.Q, cur.Type, front, back, fields)
	if err != nil {
		return err
	}
	fb, _ := json.Marshal(fields)
	if err := rc.udb.Q.UpdateCard(r.Context(), userdb.UpdateCardParams{
		DeckID: d.ID, Front: front, Back: back, Fields: string(fb), UpdatedAt: s.now().UnixMilli(), ID: cur.ID,
	}); err != nil {
		return err
	}
	row, err := getCardRow(r, rc, uid)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, cardDTO(row))
	return nil
}

func (s *Server) handleDeleteCard(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	uid, err := pathUID(r, "uid")
	if err != nil {
		return err
	}
	c, err := getCardRow(r, rc, uid)
	if err != nil {
		return err
	}
	now := s.now().UnixMilli()
	if err := rc.udb.Q.SoftDeleteCard(r.Context(), userdb.SoftDeleteCardParams{
		DeletedAt: sql.NullInt64{Int64: now, Valid: true}, UpdatedAt: now, ID: c.ID,
	}); err != nil {
		return err
	}
	return noContent(w)
}

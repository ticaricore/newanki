package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/newanki/server/internal/db/userdb"
	"github.com/newanki/server/internal/srs"
)

func deckDTO(d userdb.Deck, c userdb.DeckCounts) DeckDTO {
	return DeckDTO{
		UID: d.Uid, Name: d.Name, Category: d.Category, Color: d.Color, Icon: d.Icon,
		CardCount: c.Cards, DueCount: c.Due, LearnedCount: c.Learned, LastStudiedAt: nullInt(c.LastStudiedAt),
		CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt,
	}
}

func validateDeck(name, category, color, icon string) error {
	if n := utf8.RuneCountInString(strings.TrimSpace(name)); n == 0 || n > 120 {
		return errField("name", "deste adı 1–120 karakter olmalı")
	}
	if utf8.RuneCountInString(category) > 40 {
		return errField("category", "kategori en fazla 40 karakter olabilir")
	}
	if !hexColor.MatchString(color) {
		return errField("color", "#RRGGBB biçiminde olmalı")
	}
	if utf8.RuneCountInString(icon) > 40 {
		return errField("icon", "ikon adı en fazla 40 karakter olabilir")
	}
	return nil
}

// getDeck loads a live deck by its {uid} path value.
func getDeck(r *http.Request, rc *reqCtx, uid string) (userdb.Deck, error) {
	d, err := rc.udb.Q.GetDeckByUID(r.Context(), uid)
	if errors.Is(err, sql.ErrNoRows) {
		return d, errNotFound("deste")
	}
	return d, err
}

func (s *Server) deckWithCounts(r *http.Request, rc *reqCtx, d userdb.Deck) (DeckDTO, error) {
	counts, err := rc.udb.Q.DeckCountsAll(r.Context(), s.now().UnixMilli(), srs.LearnedLevel)
	if err != nil {
		return DeckDTO{}, err
	}
	return deckDTO(d, counts[d.ID]), nil
}

func (s *Server) handleListDecks(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	decks, err := rc.udb.Q.ListDecks(r.Context())
	if err != nil {
		return err
	}
	counts, err := rc.udb.Q.DeckCountsAll(r.Context(), s.now().UnixMilli(), srs.LearnedLevel)
	if err != nil {
		return err
	}
	out := make([]DeckDTO, 0, len(decks))
	for _, d := range decks {
		out = append(out, deckDTO(d, counts[d.ID]))
	}
	writeJSON(w, http.StatusOK, DeckListResponse{Decks: out})
	return nil
}

func (s *Server) handleGetDeck(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	uid, err := pathUID(r, "uid")
	if err != nil {
		return err
	}
	d, err := getDeck(r, rc, uid)
	if err != nil {
		return err
	}
	dto, err := s.deckWithCounts(r, rc, d)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, dto)
	return nil
}

func (s *Server) handleCreateDeck(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in DeckInput
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	uid, err := optionalUID(in.UID, "uid")
	if err != nil {
		return err
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Color == "" {
		in.Color = "#34D399"
	}
	if err := validateDeck(in.Name, in.Category, in.Color, in.Icon); err != nil {
		return err
	}
	// Idempotent: a retried create with the same uid returns the existing deck.
	if existing, err := rc.udb.Q.GetDeckByUIDAny(r.Context(), uid); err == nil {
		if existing.DeletedAt.Valid {
			return &APIError{Status: http.StatusConflict, Code: "uid_taken", Message: "bu uid silinmiş bir desteye ait"}
		}
		dto, err := s.deckWithCounts(r, rc, existing)
		if err != nil {
			return err
		}
		writeJSON(w, http.StatusOK, dto)
		return nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	now := s.now().UnixMilli()
	d, err := rc.udb.Q.CreateDeck(r.Context(), userdb.CreateDeckParams{
		Uid: uid, Name: in.Name, Category: in.Category, Color: strings.ToUpper(in.Color), Icon: in.Icon,
		CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, deckDTO(d, userdb.DeckCounts{}))
	return nil
}

func (s *Server) handlePatchDeck(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	uid, err := pathUID(r, "uid")
	if err != nil {
		return err
	}
	var in DeckPatch
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	d, err := getDeck(r, rc, uid)
	if err != nil {
		return err
	}
	if in.Name != nil {
		d.Name = strings.TrimSpace(*in.Name)
	}
	if in.Category != nil {
		d.Category = *in.Category
	}
	if in.Color != nil {
		d.Color = strings.ToUpper(*in.Color)
	}
	if in.Icon != nil {
		d.Icon = *in.Icon
	}
	if err := validateDeck(d.Name, d.Category, d.Color, d.Icon); err != nil {
		return err
	}
	d, err = rc.udb.Q.UpdateDeck(r.Context(), userdb.UpdateDeckParams{
		Name: d.Name, Category: d.Category, Color: d.Color, Icon: d.Icon, UpdatedAt: s.now().UnixMilli(), ID: d.ID,
	})
	if err != nil {
		return err
	}
	dto, err := s.deckWithCounts(r, rc, d)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, dto)
	return nil
}

func (s *Server) handleDeleteDeck(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	uid, err := pathUID(r, "uid")
	if err != nil {
		return err
	}
	d, err := getDeck(r, rc, uid)
	if err != nil {
		return err
	}
	now := s.now().UnixMilli()
	tx, err := rc.udb.DB.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	q := rc.udb.Q.WithTx(tx)
	if err := q.SoftDeleteDeckCards(r.Context(), userdb.SoftDeleteDeckCardsParams{
		DeletedAt: sql.NullInt64{Int64: now, Valid: true}, UpdatedAt: now, DeckID: d.ID,
	}); err != nil {
		return err
	}
	if err := q.SoftDeleteDeck(r.Context(), userdb.SoftDeleteDeckParams{
		DeletedAt: sql.NullInt64{Int64: now, Valid: true}, UpdatedAt: now, ID: d.ID,
	}); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return noContent(w)
}

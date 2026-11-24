package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/newanki/server/internal/db/userdb"
)

const maxCategories = 100

// categoryPalette gives new categories a color when the client does not pick one.
var categoryPalette = []string{"#F87171", "#60A5FA", "#2DD4BF", "#A78BFA", "#FCD34D", "#F472B6", "#FB923C", "#34D399", "#818CF8", "#94A3B8"}

func categoryDTO(c userdb.Category, decks int64) CategoryDTO {
	return CategoryDTO{UID: c.Uid, Name: c.Name, Color: c.Color, DeckCount: decks}
}

func validCategoryName(name string) (string, error) {
	name = strings.Join(strings.Fields(name), " ")
	if n := utf8.RuneCountInString(name); n == 0 || n > 40 {
		return "", errField("name", "kategori adı 1–40 karakter olmalı")
	}
	return name, nil
}

// nameTaken reports whether another category already uses name (case-insensitive, Turkish İ/ı aware).
func nameTaken(list []userdb.Category, name string, exceptID int64) bool {
	fold := func(s string) string {
		return strings.ToLowerSpecial(unicode.TurkishCase, s)
	}
	for _, c := range list {
		if c.ID != exceptID && fold(c.Name) == fold(name) {
			return true
		}
	}
	return false
}

func errNameTaken() *APIError {
	msg := "bu adla bir kategori zaten var"
	return &APIError{Status: http.StatusConflict, Code: "name_taken", Message: msg, Fields: map[string]string{"name": msg}}
}

func getCategory(r *http.Request, rc *reqCtx) (userdb.Category, error) {
	uid, err := pathUID(r, "uid")
	if err != nil {
		return userdb.Category{}, err
	}
	c, err := rc.udb.Q.GetCategoryByUID(r.Context(), uid)
	if errors.Is(err, sql.ErrNoRows) {
		return c, errNotFound("kategori")
	}
	return c, err
}

func (s *Server) handleListCategories(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	list, err := rc.udb.Q.ListCategories(r.Context())
	if err != nil {
		return err
	}
	rows, err := rc.udb.Q.CategoryDeckCounts(r.Context())
	if err != nil {
		return err
	}
	counts := make(map[string]int64, len(rows))
	for _, row := range rows {
		counts[row.Category] = row.Decks
	}
	out := make([]CategoryDTO, 0, len(list))
	for _, c := range list {
		out = append(out, categoryDTO(c, counts[c.Uid]))
	}
	writeJSON(w, http.StatusOK, CategoryListResponse{Categories: out})
	return nil
}

func (s *Server) handleCreateCategory(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in CategoryInput
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	uid, err := optionalUID(in.UID, "uid")
	if err != nil {
		return err
	}
	name, err := validCategoryName(in.Name)
	if err != nil {
		return err
	}
	// Idempotent: a retried create returns the existing category.
	if c, err := rc.udb.Q.GetCategoryByUID(r.Context(), uid); err == nil {
		writeJSON(w, http.StatusOK, categoryDTO(c, 0))
		return nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	list, err := rc.udb.Q.ListCategories(r.Context())
	if err != nil {
		return err
	}
	if len(list) >= maxCategories {
		return errBadRequest("too_many", "en fazla 100 kategori olabilir")
	}
	if nameTaken(list, name, 0) {
		return errNameTaken()
	}
	color := categoryPalette[len(list)%len(categoryPalette)]
	if in.Color != nil {
		if !hexColor.MatchString(*in.Color) {
			return errField("color", "#RRGGBB biçiminde olmalı")
		}
		color = strings.ToUpper(*in.Color)
	}
	pos, err := rc.udb.Q.CategoryNextPosition(r.Context())
	if err != nil {
		return err
	}
	now := s.now().UnixMilli()
	c, err := rc.udb.Q.CreateCategory(r.Context(), userdb.CreateCategoryParams{
		Uid: uid, Name: name, Color: color, Position: pos, CreatedAt: now, UpdatedAt: now,
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, categoryDTO(c, 0))
	return nil
}

func (s *Server) handlePatchCategory(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in CategoryPatch
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	c, err := getCategory(r, rc)
	if err != nil {
		return err
	}
	if in.Name != nil {
		name, err := validCategoryName(*in.Name)
		if err != nil {
			return err
		}
		list, err := rc.udb.Q.ListCategories(r.Context())
		if err != nil {
			return err
		}
		if nameTaken(list, name, c.ID) {
			return errNameTaken()
		}
		c.Name = name
	}
	if in.Color != nil {
		if !hexColor.MatchString(*in.Color) {
			return errField("color", "#RRGGBB biçiminde olmalı")
		}
		c.Color = strings.ToUpper(*in.Color)
	}
	c, err = rc.udb.Q.UpdateCategory(r.Context(), userdb.UpdateCategoryParams{
		Name: c.Name, Color: c.Color, UpdatedAt: s.now().UnixMilli(), ID: c.ID,
	})
	if err != nil {
		return err
	}
	rows, err := rc.udb.Q.CategoryDeckCounts(r.Context())
	if err != nil {
		return err
	}
	var decks int64
	for _, row := range rows {
		if row.Category == c.Uid {
			decks = row.Decks
		}
	}
	writeJSON(w, http.StatusOK, categoryDTO(c, decks))
	return nil
}

// handleDeleteCategory removes a category; its decks stay and become uncategorized.
func (s *Server) handleDeleteCategory(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	c, err := getCategory(r, rc)
	if err != nil {
		return err
	}
	tx, err := rc.udb.DB.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	q := rc.udb.Q.WithTx(tx)
	if err := q.ClearDeckCategory(r.Context(), userdb.ClearDeckCategoryParams{UpdatedAt: s.now().UnixMilli(), Category: c.Uid}); err != nil {
		return err
	}
	if err := q.DeleteCategory(r.Context(), c.ID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

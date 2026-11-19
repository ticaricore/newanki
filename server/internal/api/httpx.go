package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/google/uuid"

	"github.com/newanki/server/internal/accounts"
)

// APIError is an error with an HTTP status and a stable machine-readable code.
type APIError struct {
	Status  int
	Code    string
	Message string
	Fields  map[string]string
}

func (e *APIError) Error() string { return fmt.Sprintf("%d %s: %s", e.Status, e.Code, e.Message) }

func errBadRequest(code, msg string) *APIError {
	return &APIError{Status: http.StatusBadRequest, Code: code, Message: msg}
}

func errField(field, msg string) *APIError {
	return &APIError{Status: http.StatusBadRequest, Code: "validation", Message: msg, Fields: map[string]string{field: msg}}
}

func errNotFound(what string) *APIError {
	return &APIError{Status: http.StatusNotFound, Code: "not_found", Message: what + " bulunamadı"}
}

var (
	errUnauthorized = &APIError{Status: http.StatusUnauthorized, Code: "unauthorized", Message: "oturum açmanız gerekiyor"}
	errForbidden    = &APIError{Status: http.StatusForbidden, Code: "forbidden", Message: "bu işlem için yetkiniz yok"}
	errPwChange     = &APIError{Status: http.StatusForbidden, Code: "password_change_required", Message: "devam etmeden önce şifrenizi değiştirin"}
)

// ErrorBody is the JSON shape of every error response.
type ErrorBody struct {
	Error ErrorDetail `json:"error"`
}

// ErrorDetail describes an error.
type ErrorDetail struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

type handlerFunc func(w http.ResponseWriter, r *http.Request) error

func (s *Server) wrap(h handlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := h(w, r); err != nil {
			s.writeError(w, r, err)
		}
	})
}

func (s *Server) writeError(w http.ResponseWriter, r *http.Request, err error) {
	var apiErr *APIError
	var vErr *accounts.ValidationError
	switch {
	case errors.As(err, &apiErr):
	case errors.As(err, &vErr):
		apiErr = errField(vErr.Field, vErr.Message)
	case errors.Is(err, accounts.ErrEmailTaken):
		apiErr = &APIError{Status: http.StatusConflict, Code: "email_taken", Message: "bu e-posta zaten kayıtlı",
			Fields: map[string]string{"email": "bu e-posta zaten kayıtlı"}}
	case errors.Is(err, sql.ErrNoRows):
		apiErr = errNotFound("kayıt")
	default:
		s.log.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
		apiErr = &APIError{Status: http.StatusInternalServerError, Code: "internal", Message: "beklenmeyen bir hata oluştu"}
	}
	writeJSON(w, apiErr.Status, ErrorBody{Error: ErrorDetail{Code: apiErr.Code, Message: apiErr.Message, Fields: apiErr.Fields}})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func noContent(w http.ResponseWriter) error {
	w.WriteHeader(http.StatusNoContent)
	return nil
}

const maxJSONBody = 1 << 20

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBody)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		if errors.Is(err, io.EOF) {
			return errBadRequest("invalid_json", "istek gövdesi boş")
		}
		return errBadRequest("invalid_json", "geçersiz JSON")
	}
	return nil
}

// pathUID parses a {uid} path value; malformed uids are a 400.
func pathUID(r *http.Request, name string) (string, error) {
	return parseUID(r.PathValue(name), name)
}

func parseUID(raw, field string) (string, error) {
	u, err := uuid.Parse(raw)
	if err != nil {
		return "", errField(field, "geçersiz uid")
	}
	return u.String(), nil
}

// optionalUID validates a client-supplied uid or generates a UUIDv7.
func optionalUID(raw *string, field string) (string, error) {
	if raw == nil || *raw == "" {
		u, err := uuid.NewV7()
		if err != nil {
			return "", err
		}
		return u.String(), nil
	}
	return parseUID(*raw, field)
}

func nullInt(v sql.NullInt64) *int64 {
	if !v.Valid {
		return nil
	}
	n := v.Int64
	return &n
}

func nullInt64Ptr(v *int64) sql.NullInt64 {
	if v == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *v, Valid: true}
}

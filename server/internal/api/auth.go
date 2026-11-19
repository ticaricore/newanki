package api

import (
	"context"
	"database/sql"
	"errors"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/newanki/server/internal/accounts"
	"github.com/newanki/server/internal/auth"
	"github.com/newanki/server/internal/db"
	"github.com/newanki/server/internal/db/maindb"
)

const (
	sessionCookie = "na_session"
	sessionTTL    = 30 * 24 * time.Hour
	touchEvery    = time.Hour
)

// reqCtx carries the authenticated user (and their database when the route needs it).
type reqCtx struct {
	user      maindb.User
	uid       uuid.UUID
	sessionID string
	udb       *db.UserDB
}

type authedFunc func(w http.ResponseWriter, r *http.Request, rc *reqCtx) error

// authed resolves the session, enforces the auth level and, if needUserDB, opens the user's database
// for the duration of the request.
func (s *Server) authed(level authLevel, needUserDB bool, h authedFunc) http.Handler {
	return s.wrap(func(w http.ResponseWriter, r *http.Request) error {
		rc, err := s.loadSession(r.Context(), r)
		if err != nil {
			if errors.Is(err, errUnauthorized) {
				clearSessionCookie(w, s.cfg.CookieSecure)
			}
			return err
		}
		if level != levelPendingPwOK && rc.user.MustChangePassword != 0 {
			return errPwChange
		}
		if level == levelAdmin && rc.user.Role != "admin" {
			return errForbidden
		}
		if needUserDB {
			udb, release, err := s.users.Acquire(r.Context(), rc.uid)
			if err != nil {
				return err
			}
			defer release()
			rc.udb = udb
		}
		return h(w, r, rc)
	})
}

func (s *Server) loadSession(ctx context.Context, r *http.Request) (*reqCtx, error) {
	c, err := r.Cookie(sessionCookie)
	if err != nil || c.Value == "" {
		return nil, errUnauthorized
	}
	id := auth.SessionID(c.Value)
	sess, err := s.mainQ.GetSession(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errUnauthorized
	}
	if err != nil {
		return nil, err
	}
	now := s.now()
	if sess.ExpiresAt < now.UnixMilli() {
		_ = s.mainQ.DeleteSession(ctx, id)
		return nil, errUnauthorized
	}
	u, err := s.mainQ.GetUserByID(ctx, sess.UserID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errUnauthorized
	}
	if err != nil {
		return nil, err
	}
	if u.Status != "active" {
		return nil, errUnauthorized
	}
	uid, err := uuid.Parse(u.Uid)
	if err != nil {
		return nil, err
	}
	// Sliding expiry, written at most once per hour per session.
	if now.UnixMilli()-sess.LastSeenAt > touchEvery.Milliseconds() {
		_ = s.mainQ.TouchSession(ctx, maindb.TouchSessionParams{
			LastSeenAt: now.UnixMilli(), ExpiresAt: now.Add(sessionTTL).UnixMilli(), ID: id,
		})
	}
	return &reqCtx{user: u, uid: uid, sessionID: id}, nil
}

func setSessionCookie(w http.ResponseWriter, token string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: token, Path: "/", MaxAge: int(sessionTTL.Seconds()),
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

func userDTO(u maindb.User) UserDTO {
	return UserDTO{
		UID: u.Uid, Email: u.Email, Name: u.Name, Role: u.Role, Status: u.Status,
		MustChangePassword: u.MustChangePassword != 0, CreatedAt: u.CreatedAt, LastLoginAt: nullInt(u.LastLoginAt),
	}
}

var errInvalidCredentials = &APIError{Status: http.StatusUnauthorized, Code: "invalid_credentials", Message: "e-posta veya şifre hatalı"}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) error {
	var in LoginRequest
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	email := accounts.NormalizeEmail(in.Email)
	key := s.clientIP(r) + "|" + email
	if !s.limiter.allow(key, s.now()) {
		return &APIError{Status: http.StatusTooManyRequests, Code: "rate_limited", Message: "çok fazla deneme; birkaç dakika sonra tekrar deneyin"}
	}
	u, err := s.mainQ.GetUserByEmail(r.Context(), email)
	if errors.Is(err, sql.ErrNoRows) {
		auth.VerifyDummy(in.Password)
		s.limiter.fail(key, s.now())
		return errInvalidCredentials
	}
	if err != nil {
		return err
	}
	if !auth.VerifyPassword(in.Password, u.PasswordHash) || u.Status != "active" {
		s.limiter.fail(key, s.now())
		return errInvalidCredentials
	}
	s.limiter.reset(key)

	token, id, err := auth.NewSessionToken()
	if err != nil {
		return err
	}
	now := s.now()
	ua := r.UserAgent()
	if len(ua) > 300 {
		ua = ua[:300]
	}
	if err := s.mainQ.CreateSession(r.Context(), maindb.CreateSessionParams{
		ID: id, UserID: u.ID, CreatedAt: now.UnixMilli(), ExpiresAt: now.Add(sessionTTL).UnixMilli(),
		LastSeenAt: now.UnixMilli(), UserAgent: ua,
	}); err != nil {
		return err
	}
	_ = s.mainQ.TouchUserLogin(r.Context(), maindb.TouchUserLoginParams{LastLoginAt: sql.NullInt64{Int64: now.UnixMilli(), Valid: true}, ID: u.ID})
	u.LastLoginAt = sql.NullInt64{Int64: now.UnixMilli(), Valid: true}
	setSessionCookie(w, token, s.cfg.CookieSecure)
	writeJSON(w, http.StatusOK, MeResponse{User: userDTO(u)})
	return nil
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	if err := s.mainQ.DeleteSession(r.Context(), rc.sessionID); err != nil {
		return err
	}
	clearSessionCookie(w, s.cfg.CookieSecure)
	return noContent(w)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	writeJSON(w, http.StatusOK, MeResponse{User: userDTO(rc.user)})
	return nil
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in ChangePasswordRequest
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	if !auth.VerifyPassword(in.CurrentPassword, rc.user.PasswordHash) {
		return errField("current_password", "mevcut şifre hatalı")
	}
	if in.NewPassword == in.CurrentPassword {
		return errField("new_password", "yeni şifre eskisiyle aynı olamaz")
	}
	if err := s.accounts.SetPassword(r.Context(), rc.user.ID, in.NewPassword, false); err != nil {
		var v *accounts.ValidationError
		if errors.As(err, &v) {
			return errField("new_password", v.Message)
		}
		return err
	}
	// Sign out every other device.
	if err := s.mainQ.DeleteUserSessionsExcept(r.Context(), maindb.DeleteUserSessionsExceptParams{UserID: rc.user.ID, ID: rc.sessionID}); err != nil {
		return err
	}
	return noContent(w)
}

func (s *Server) clientIP(r *http.Request) string {
	if s.cfg.TrustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			first, _, _ := strings.Cut(xff, ",")
			return strings.TrimSpace(first)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// loginLimiter allows 5 failed logins per (ip, email) per 15 minutes.
type loginLimiter struct {
	mu      sync.Mutex
	entries map[string]*limitEntry
}

type limitEntry struct {
	failures int
	reset    time.Time
}

const (
	loginMaxFailures = 5
	loginWindow      = 15 * time.Minute
)

func newLoginLimiter() *loginLimiter { return &loginLimiter{entries: map[string]*limitEntry{}} }

func (l *loginLimiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	e, ok := l.entries[key]
	if !ok || now.After(e.reset) {
		return true
	}
	return e.failures < loginMaxFailures
}

func (l *loginLimiter) fail(key string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.entries) > 10000 { // drop expired entries opportunistically
		for k, e := range l.entries {
			if now.After(e.reset) {
				delete(l.entries, k)
			}
		}
	}
	e, ok := l.entries[key]
	if !ok || now.After(e.reset) {
		e = &limitEntry{reset: now.Add(loginWindow)}
		l.entries[key] = e
	}
	e.failures++
}

func (l *loginLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, key)
}

// Package api is the JSON HTTP API under /api/v1.
package api

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/newanki/server/internal/accounts"
	"github.com/newanki/server/internal/ai"
	"github.com/newanki/server/internal/config"
	"github.com/newanki/server/internal/db"
	"github.com/newanki/server/internal/db/maindb"
)

// Server wires dependencies to HTTP handlers.
type Server struct {
	cfg      config.Config
	mainDB   *sql.DB
	mainQ    *maindb.Queries
	users    *db.UserDBManager
	accounts *accounts.Service
	log      *slog.Logger
	limiter  *loginLimiter
	ai       ai.Generator // nil when ANTHROPIC_API_KEY is not set
	app      atomic.Pointer[AppSettings]
	now      func() time.Time
}

// Deps are the dependencies of New.
type Deps struct {
	Config   config.Config
	MainDB   *sql.DB
	Users    *db.UserDBManager
	Accounts *accounts.Service
	Logger   *slog.Logger
	AI       ai.Generator // optional
}

// New builds the API server and loads global settings.
func New(ctx context.Context, d Deps) (*Server, error) {
	s := &Server{
		cfg:      d.Config,
		mainDB:   d.MainDB,
		mainQ:    maindb.New(d.MainDB),
		users:    d.Users,
		accounts: d.Accounts,
		log:      d.Logger,
		limiter:  newLoginLimiter(),
		ai:       d.AI,
		now:      time.Now,
	}
	if err := s.reloadAppSettings(ctx); err != nil {
		return nil, err
	}
	return s, nil
}

type authLevel int

const (
	levelUser        authLevel = iota // active user who has no pending password change
	levelPendingPwOK                  // also allowed while a password change is pending
	levelAdmin                        // admin, no pending password change
)

// Handler returns the /api/v1 handler.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	p := "/api/v1"

	mux.Handle("POST "+p+"/auth/login", s.wrap(s.handleLogin))
	mux.Handle("POST "+p+"/auth/logout", s.authed(levelPendingPwOK, false, s.handleLogout))
	mux.Handle("GET "+p+"/me", s.authed(levelPendingPwOK, false, s.handleMe))
	mux.Handle("PATCH "+p+"/me/password", s.authed(levelPendingPwOK, false, s.handleChangePassword))

	mux.Handle("GET "+p+"/settings", s.authed(levelUser, true, s.handleGetSettings))
	mux.Handle("PATCH "+p+"/settings", s.authed(levelUser, true, s.handlePatchSettings))

	mux.Handle("GET "+p+"/decks", s.authed(levelUser, true, s.handleListDecks))
	mux.Handle("POST "+p+"/decks", s.authed(levelUser, true, s.handleCreateDeck))
	mux.Handle("GET "+p+"/decks/{uid}", s.authed(levelUser, true, s.handleGetDeck))
	mux.Handle("PATCH "+p+"/decks/{uid}", s.authed(levelUser, true, s.handlePatchDeck))
	mux.Handle("DELETE "+p+"/decks/{uid}", s.authed(levelUser, true, s.handleDeleteDeck))

	mux.Handle("GET "+p+"/cards", s.authed(levelUser, true, s.handleListCards))
	mux.Handle("POST "+p+"/cards", s.authed(levelUser, true, s.handleCreateCard))
	mux.Handle("GET "+p+"/cards/{uid}", s.authed(levelUser, true, s.handleGetCard))
	mux.Handle("PATCH "+p+"/cards/{uid}", s.authed(levelUser, true, s.handlePatchCard))
	mux.Handle("DELETE "+p+"/cards/{uid}", s.authed(levelUser, true, s.handleDeleteCard))

	mux.Handle("GET "+p+"/study/queue", s.authed(levelUser, true, s.handleStudyQueue))
	mux.Handle("POST "+p+"/reviews", s.authed(levelUser, true, s.handleReview))
	mux.Handle("POST "+p+"/reviews/batch", s.authed(levelUser, true, s.handleReviewBatch))

	mux.Handle("GET "+p+"/stats/summary", s.authed(levelUser, true, s.handleStatsSummary))
	mux.Handle("GET "+p+"/stats/heatmap", s.authed(levelUser, true, s.handleStatsHeatmap))
	mux.Handle("GET "+p+"/stats/activity", s.authed(levelUser, true, s.handleStatsActivity))
	mux.Handle("GET "+p+"/stats/distribution", s.authed(levelUser, true, s.handleStatsDistribution))
	mux.Handle("GET "+p+"/stats/decks", s.authed(levelUser, true, s.handleListDecks))

	mux.Handle("POST "+p+"/media", s.authed(levelUser, true, s.handleUploadMedia))
	mux.Handle("GET "+p+"/media/{uid}", s.authed(levelUser, true, s.handleGetMedia))
	mux.Handle("GET "+p+"/export/sqlite", s.authed(levelUser, true, s.handleExportSQLite))

	mux.Handle("GET "+p+"/admin/users", s.authed(levelAdmin, false, s.handleAdminListUsers))
	mux.Handle("POST "+p+"/admin/users", s.authed(levelAdmin, false, s.handleAdminCreateUser))
	mux.Handle("PATCH "+p+"/admin/users/{uid}", s.authed(levelAdmin, false, s.handleAdminPatchUser))
	mux.Handle("DELETE "+p+"/admin/users/{uid}", s.authed(levelAdmin, false, s.handleAdminDeleteUser))
	mux.Handle("GET "+p+"/admin/settings", s.authed(levelAdmin, false, s.handleAdminGetSettings))
	mux.Handle("PUT "+p+"/admin/settings", s.authed(levelAdmin, false, s.handleAdminPutSettings))
	mux.Handle("GET "+p+"/admin/stats", s.authed(levelAdmin, false, s.handleAdminStats))
	mux.Handle("GET "+p+"/ai/status", s.authed(levelUser, false, s.handleAIStatus))
	mux.Handle("POST "+p+"/ai/generate", s.authed(levelUser, true, s.handleAIGenerate))

	mux.Handle(p+"/", s.wrap(func(w http.ResponseWriter, r *http.Request) error {
		return errNotFound("uç nokta")
	}))

	return csrfGuard(mux)
}

// csrfGuard requires a custom header on state-changing requests. Browsers cannot add it cross-site
// without a CORS preflight, which this server never approves. SameSite=Lax cookies are the first line.
func csrfGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
		default:
			if r.Header.Get("X-Requested-With") == "" {
				writeJSON(w, http.StatusForbidden, ErrorBody{Error: ErrorDetail{Code: "csrf", Message: "X-Requested-With başlığı gerekli"}})
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

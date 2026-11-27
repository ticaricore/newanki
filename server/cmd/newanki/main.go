// Command newanki is the NewAnki server: API + embedded PWA, backed by SQLite.
//
//	newanki serve [-addr :8080] [-data ./data] [-dev]
//	newanki migrate [-data ./data]               # migrate main.db and every user database
//	newanki admin reset-password -email x [-data ./data]
package main

import (
	"bufio"
	"cmp"
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	_ "time/tzdata" // timezone database for minimal containers

	"golang.org/x/term"

	"github.com/newanki/server/internal/accounts"
	"github.com/newanki/server/internal/ai"
	"github.com/newanki/server/internal/api"
	"github.com/newanki/server/internal/config"
	"github.com/newanki/server/internal/db"
	"github.com/newanki/server/internal/db/maindb"
	"github.com/newanki/server/internal/seed"
	"github.com/newanki/server/internal/web"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)

	args := os.Args[1:]
	cmd := "serve"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		cmd, args = args[0], args[1:]
	}
	var err error
	switch cmd {
	case "serve":
		err = serve(args, log)
	case "migrate":
		err = migrateAll(args, log)
	case "admin":
		err = admin(args, log)
	default:
		err = fmt.Errorf("unknown command %q (serve | migrate | admin reset-password)", cmd)
	}
	if err != nil {
		log.Error(err.Error())
		os.Exit(1)
	}
}

type app struct {
	mainDB   *maindbHandle
	users    *db.UserDBManager
	accounts *accounts.Service
}

type maindbHandle struct {
	*maindb.Queries
	close func() error
}

func openApp(ctx context.Context, dataDir string, log *slog.Logger) (*app, func(), error) {
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return nil, nil, err
	}
	sqlDB, err := db.Open(ctx, filepath.Join(dataDir, "main.db"), 8)
	if err != nil {
		return nil, nil, err
	}
	migs, err := db.LoadMigrations(maindb.Migrations, "migrations")
	if err != nil {
		sqlDB.Close()
		return nil, nil, err
	}
	if err := db.Migrate(ctx, sqlDB, migs); err != nil {
		sqlDB.Close()
		return nil, nil, fmt.Errorf("migrate main.db: %w", err)
	}
	users, err := db.NewUserDBManager(filepath.Join(dataDir, "users"), db.ManagerOptions{Logger: log})
	if err != nil {
		sqlDB.Close()
		return nil, nil, err
	}
	q := maindb.New(sqlDB)
	acc := &accounts.Service{DB: sqlDB, Q: q, Users: users, Log: log}
	cleanup := func() {
		users.Close()
		sqlDB.Close()
	}
	return &app{mainDB: &maindbHandle{Queries: q, close: sqlDB.Close}, users: users, accounts: acc}, cleanup, nil
}

func serve(args []string, log *slog.Logger) error {
	cfg, err := config.Load(args)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	a, cleanup, err := openApp(ctx, cfg.DataDir, log)
	if err != nil {
		return err
	}
	defer cleanup()

	if err := a.accounts.CleanupProvisioning(ctx); err != nil {
		return err
	}
	if _, err := a.accounts.EnsureBootstrapAdmin(ctx, cfg.AdminEmail, cfg.AdminPassword); err != nil {
		return err
	}
	if cfg.Dev {
		if err := seed.EnsureDemo(ctx, a.accounts, log); err != nil {
			return fmt.Errorf("seed demo data: %w", err)
		}
	}

	deps := api.Deps{Config: cfg, MainDB: a.accounts.DB, Users: a.users, Accounts: a.accounts, Logger: log}
	if gen := ai.NewClaude(cfg.AnthropicAPIKey, cfg.AIModel); gen != nil {
		deps.AI = gen
		log.Info("AI card generation enabled", "model", cmp.Or(cfg.AIModel, ai.DefaultModel))
	} else {
		log.Info("AI card generation off (set ANTHROPIC_API_KEY to enable)")
	}
	srv, err := api.New(ctx, deps)
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	mux.Handle("/api/", srv.Handler())
	mux.Handle("/", web.Handler())
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("ok")) })

	httpSrv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// Expired sessions are swept hourly.
	go func() {
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				_ = a.mainDB.DeleteExpiredSessions(context.Background(), time.Now().UnixMilli())
			}
		}
	}()

	errCh := make(chan error, 1)
	go func() {
		log.Info("NewAnki listening", "addr", cfg.Addr, "data", cfg.DataDir, "dev", cfg.Dev)
		errCh <- httpSrv.ListenAndServe()
	}()
	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Info("shutting down")
		shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return httpSrv.Shutdown(shutCtx)
	}
	return nil
}

func migrateAll(args []string, log *slog.Logger) error {
	fs := flag.NewFlagSet("migrate", flag.ContinueOnError)
	dataDir := fs.String("data", envOr("NEWANKI_DATA_DIR", "./data"), "data directory")
	if err := fs.Parse(args); err != nil {
		return err
	}
	ctx := context.Background()
	a, cleanup, err := openApp(ctx, *dataDir, log)
	if err != nil {
		return err
	}
	defer cleanup()
	uids, err := a.users.ListUIDs()
	if err != nil {
		return err
	}
	for _, uid := range uids {
		_, release, err := a.users.Acquire(ctx, uid) // Acquire applies pending migrations
		if err != nil {
			return fmt.Errorf("user %s: %w", uid, err)
		}
		release()
	}
	log.Info("migrations applied", "user_databases", len(uids))
	return nil
}

func admin(args []string, log *slog.Logger) error {
	if len(args) == 0 || args[0] != "reset-password" {
		return errors.New("usage: newanki admin reset-password -email x [-data ./data]")
	}
	fs := flag.NewFlagSet("reset-password", flag.ContinueOnError)
	dataDir := fs.String("data", envOr("NEWANKI_DATA_DIR", "./data"), "data directory")
	email := fs.String("email", "", "user email")
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if *email == "" {
		return errors.New("-email is required")
	}
	ctx := context.Background()
	a, cleanup, err := openApp(ctx, *dataDir, log)
	if err != nil {
		return err
	}
	defer cleanup()
	u, err := a.mainDB.GetUserByEmail(ctx, accounts.NormalizeEmail(*email))
	if err != nil {
		return fmt.Errorf("user %s: %w", *email, err)
	}
	pw, err := readPassword("Yeni şifre: ")
	if err != nil {
		return err
	}
	if err := a.accounts.SetPassword(ctx, u.ID, pw, false); err != nil {
		return err
	}
	if err := a.mainDB.DeleteUserSessions(ctx, u.ID); err != nil {
		return err
	}
	log.Info("password reset", "email", u.Email)
	return nil
}

func readPassword(prompt string) (string, error) {
	fmt.Fprint(os.Stderr, prompt)
	if term.IsTerminal(int(os.Stdin.Fd())) {
		b, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
		return string(b), err
	}
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && line == "" {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

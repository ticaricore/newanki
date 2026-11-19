package db

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/newanki/server/internal/db/maindb"
	"github.com/newanki/server/internal/db/userdb"
)

func TestMigrateMainDBIdempotent(t *testing.T) {
	ctx := context.Background()
	sqlDB, err := Open(ctx, filepath.Join(t.TempDir(), "main.db"), 2)
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	migs, err := LoadMigrations(maindb.Migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := Migrate(ctx, sqlDB, migs); err != nil {
			t.Fatalf("run %d: %v", i, err)
		}
	}
	v, _ := Version(ctx, sqlDB)
	if v != migs[len(migs)-1].Version {
		t.Fatalf("version = %d, want %d", v, migs[len(migs)-1].Version)
	}
	n, err := maindb.New(sqlDB).CountUsers(ctx)
	if err != nil || n != 0 {
		t.Fatalf("CountUsers = %d, %v", n, err)
	}
}

func newManager(t *testing.T) *UserDBManager {
	t.Helper()
	m, err := NewUserDBManager(filepath.Join(t.TempDir(), "users"), ManagerOptions{MaxOpen: 2})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(m.Close)
	return m
}

func TestManagerCreateAcquireDelete(t *testing.T) {
	ctx := context.Background()
	m := newManager(t)
	uid := uuid.Must(uuid.NewV7())

	if _, _, err := m.Acquire(ctx, uid); !errors.Is(err, ErrUserDBNotFound) {
		t.Fatalf("Acquire before create: %v, want ErrUserDBNotFound", err)
	}

	udb, release, err := m.Create(ctx, uid)
	if err != nil {
		t.Fatal(err)
	}
	if err := udb.Q.UpsertSetting(ctx, userdb.UpsertSettingParams{Key: "daily_goal", Value: "40"}); err != nil {
		t.Fatal(err)
	}
	// FTS trigger works.
	deck, err := udb.Q.CreateDeck(ctx, userdb.CreateDeckParams{Uid: uuid.NewString(), Name: "D", CreatedAt: 1, UpdatedAt: 1})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := udb.Q.CreateCard(ctx, userdb.CreateCardParams{Uid: uuid.NewString(), DeckID: deck.ID, Type: "word", Front: "serendipity", Back: "tesadüf", Fields: `{"example":"bakara"}`, CreatedAt: 1, UpdatedAt: 1}); err != nil {
		t.Fatal(err)
	}
	var hits int
	if err := udb.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM cards_fts WHERE cards_fts MATCH 'bakara'`).Scan(&hits); err != nil || hits != 1 {
		t.Fatalf("fts hits = %d, %v", hits, err)
	}
	release()

	if _, _, err := m.Create(ctx, uid); !errors.Is(err, ErrUserDBExists) {
		t.Fatalf("second Create: %v, want ErrUserDBExists", err)
	}

	m.CloseIdle(0)
	if m.OpenCount() != 0 {
		t.Fatalf("OpenCount after CloseIdle = %d", m.OpenCount())
	}

	udb, release, err = m.Acquire(ctx, uid)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := udb.Q.ListSettings(ctx)
	if err != nil || len(rows) != 1 {
		t.Fatalf("settings after reopen = %v, %v", rows, err)
	}
	release()

	if err := m.Delete(uid); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(m.Path(uid)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("db file still exists: %v", err)
	}
	if _, _, err := m.Acquire(ctx, uid); !errors.Is(err, ErrUserDBNotFound) {
		t.Fatalf("Acquire after delete: %v", err)
	}
}

func TestManagerConcurrentAcquireAndEviction(t *testing.T) {
	ctx := context.Background()
	m := newManager(t)
	uids := make([]uuid.UUID, 4)
	for i := range uids {
		uids[i] = uuid.Must(uuid.NewV7())
		_, rel, err := m.Create(ctx, uids[i])
		if err != nil {
			t.Fatal(err)
		}
		rel()
	}
	if m.OpenCount() > 2 {
		t.Fatalf("OpenCount = %d, want <= MaxOpen 2", m.OpenCount())
	}

	var wg sync.WaitGroup
	errs := make(chan error, 64)
	for i := 0; i < 64; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			udb, rel, err := m.Acquire(ctx, uids[i%len(uids)])
			if err != nil {
				errs <- err
				return
			}
			defer rel()
			if _, err := udb.Q.ListDecks(ctx); err != nil {
				errs <- err
			}
			time.Sleep(time.Millisecond)
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
}

func TestManagerDeleteWhileInUse(t *testing.T) {
	ctx := context.Background()
	m := newManager(t)
	uid := uuid.Must(uuid.NewV7())
	udb, release, err := m.Create(ctx, uid)
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Delete(uid); err != nil {
		t.Fatal(err)
	}
	_ = udb
	release() // must close the orphaned handle without panicking
	if m.OpenCount() != 0 {
		t.Fatalf("OpenCount = %d", m.OpenCount())
	}
}

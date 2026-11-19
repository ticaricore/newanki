package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/newanki/server/internal/db/userdb"
)

// ErrUserDBNotFound means the user's database file does not exist (never created, or deleted).
var ErrUserDBNotFound = errors.New("user database not found")

// ErrUserDBExists is returned by Create when the file is already there.
var ErrUserDBExists = errors.New("user database already exists")

// UserDB is an open per-user database handle.
type UserDB struct {
	UID uuid.UUID
	DB  *sql.DB
	Q   *userdb.Queries
	// MediaDir is where this user's uploaded files live (created on first upload).
	MediaDir string
}

type entry struct {
	udb      *UserDB
	refs     int
	lastUsed time.Time
}

// UserDBManager opens per-user SQLite files on demand, keeps recently used ones open, and closes idle
// ones. Paths are built only from a typed uuid.UUID, never from request input.
type UserDBManager struct {
	dir      string
	maxOpen  int
	idle     time.Duration
	conns    int
	migs     []Migration
	log      *slog.Logger
	mu       sync.Mutex
	open     map[uuid.UUID]*entry
	stopOnce sync.Once
	stop     chan struct{}
	done     chan struct{}
}

// ManagerOptions tunes the cache. Zero values get sensible defaults.
type ManagerOptions struct {
	MaxOpen     int           // max cached open databases (default 256)
	IdleTimeout time.Duration // close databases unused for this long (default 10m)
	ConnsPerDB  int           // database/sql pool size per user DB (default 4)
	Logger      *slog.Logger
}

// NewUserDBManager prepares the users directory and starts the idle janitor.
func NewUserDBManager(dir string, opts ManagerOptions) (*UserDBManager, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	migs, err := LoadMigrations(userdb.Migrations, "migrations")
	if err != nil {
		return nil, err
	}
	if opts.MaxOpen <= 0 {
		opts.MaxOpen = 256
	}
	if opts.IdleTimeout <= 0 {
		opts.IdleTimeout = 10 * time.Minute
	}
	if opts.ConnsPerDB <= 0 {
		opts.ConnsPerDB = 4
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	m := &UserDBManager{
		dir:     dir,
		maxOpen: opts.MaxOpen,
		idle:    opts.IdleTimeout,
		conns:   opts.ConnsPerDB,
		migs:    migs,
		log:     opts.Logger,
		open:    map[uuid.UUID]*entry{},
		stop:    make(chan struct{}),
		done:    make(chan struct{}),
	}
	go m.janitor()
	return m, nil
}

// Path returns the database file path for a user.
func (m *UserDBManager) Path(uid uuid.UUID) string {
	return filepath.Join(m.dir, uid.String()+".db")
}

// MediaDir returns the media directory for a user.
func (m *UserDBManager) MediaDir(uid uuid.UUID) string {
	return filepath.Join(m.dir, uid.String(), "media")
}

// Acquire returns an open handle for an existing user database. Call release when the request is done;
// the handle must not be used afterwards. Pending migrations are applied when the file is first opened.
func (m *UserDBManager) Acquire(ctx context.Context, uid uuid.UUID) (*UserDB, func(), error) {
	return m.acquire(ctx, uid, false)
}

// Create creates, migrates and opens a new user database and returns it acquired.
func (m *UserDBManager) Create(ctx context.Context, uid uuid.UUID) (*UserDB, func(), error) {
	return m.acquire(ctx, uid, true)
}

func (m *UserDBManager) acquire(ctx context.Context, uid uuid.UUID, create bool) (*UserDB, func(), error) {
	if uid == uuid.Nil {
		return nil, nil, errors.New("nil user uid")
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	path := m.Path(uid)
	if e, ok := m.open[uid]; ok {
		if create {
			return nil, nil, ErrUserDBExists
		}
		e.refs++
		e.lastUsed = time.Now()
		return e.udb, m.releaser(uid, e), nil
	}

	_, statErr := os.Stat(path)
	switch {
	case create && statErr == nil:
		return nil, nil, ErrUserDBExists
	case !create && errors.Is(statErr, os.ErrNotExist):
		return nil, nil, ErrUserDBNotFound
	case statErr != nil && !errors.Is(statErr, os.ErrNotExist):
		return nil, nil, statErr
	}

	// Opening while holding the lock keeps the logic simple; open+migrate is a few milliseconds.
	sqlDB, err := Open(ctx, path, m.conns)
	if err != nil {
		return nil, nil, err
	}
	if err := Migrate(ctx, sqlDB, m.migs); err != nil {
		sqlDB.Close()
		if create {
			removeDBFiles(path)
		}
		return nil, nil, fmt.Errorf("migrate user db: %w", err)
	}
	udb := &UserDB{UID: uid, DB: sqlDB, Q: userdb.New(sqlDB), MediaDir: m.MediaDir(uid)}
	e := &entry{udb: udb, refs: 1, lastUsed: time.Now()}
	m.open[uid] = e
	m.evictLocked()
	return udb, m.releaser(uid, e), nil
}

func (m *UserDBManager) releaser(uid uuid.UUID, e *entry) func() {
	var once sync.Once
	return func() {
		once.Do(func() {
			m.mu.Lock()
			defer m.mu.Unlock()
			e.refs--
			e.lastUsed = time.Now()
			// The entry may have been dropped by Delete while in use; close it once the last user leaves.
			if cur, ok := m.open[uid]; (!ok || cur != e) && e.refs == 0 {
				e.udb.DB.Close()
			}
		})
	}
}

// Delete closes the user's database and removes its files and media.
func (m *UserDBManager) Delete(uid uuid.UUID) error {
	if uid == uuid.Nil {
		return errors.New("nil user uid")
	}
	m.mu.Lock()
	if e, ok := m.open[uid]; ok {
		delete(m.open, uid)
		if e.refs == 0 {
			e.udb.DB.Close()
		}
	}
	m.mu.Unlock()

	if err := removeDBFiles(m.Path(uid)); err != nil {
		return err
	}
	return os.RemoveAll(filepath.Join(m.dir, uid.String()))
}

func removeDBFiles(path string) error {
	var errs []error
	for _, p := range []string{path, path + "-wal", path + "-shm"} {
		if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// Size returns the on-disk size of the user's database (main file + WAL).
func (m *UserDBManager) Size(uid uuid.UUID) int64 {
	var total int64
	for _, p := range []string{m.Path(uid), m.Path(uid) + "-wal"} {
		if fi, err := os.Stat(p); err == nil {
			total += fi.Size()
		}
	}
	return total
}

// OpenCount reports how many user databases are currently cached open.
func (m *UserDBManager) OpenCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.open)
}

// evictLocked closes least-recently-used idle databases above maxOpen. Caller holds m.mu.
func (m *UserDBManager) evictLocked() {
	if len(m.open) <= m.maxOpen {
		return
	}
	type cand struct {
		uid  uuid.UUID
		used time.Time
	}
	var idle []cand
	for uid, e := range m.open {
		if e.refs == 0 {
			idle = append(idle, cand{uid, e.lastUsed})
		}
	}
	sort.Slice(idle, func(i, j int) bool { return idle[i].used.Before(idle[j].used) })
	for _, c := range idle {
		if len(m.open) <= m.maxOpen {
			break
		}
		m.open[c.uid].udb.DB.Close()
		delete(m.open, c.uid)
	}
}

func (m *UserDBManager) janitor() {
	defer close(m.done)
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-m.stop:
			return
		case <-t.C:
			m.CloseIdle(m.idle)
		}
	}
}

// CloseIdle closes databases that have had no users for at least d.
func (m *UserDBManager) CloseIdle(d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	cutoff := time.Now().Add(-d)
	for uid, e := range m.open {
		if e.refs == 0 && !e.lastUsed.After(cutoff) {
			e.udb.DB.Close()
			delete(m.open, uid)
		}
	}
}

// Close stops the janitor and closes every cached database.
func (m *UserDBManager) Close() {
	m.stopOnce.Do(func() { close(m.stop) })
	<-m.done
	m.mu.Lock()
	defer m.mu.Unlock()
	for uid, e := range m.open {
		e.udb.DB.Close()
		delete(m.open, uid)
	}
}

// ListUIDs returns the uids of every user database file on disk.
func (m *UserDBManager) ListUIDs() ([]uuid.UUID, error) {
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		return nil, err
	}
	var out []uuid.UUID
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || filepath.Ext(name) != ".db" {
			continue
		}
		if uid, err := uuid.Parse(name[:len(name)-3]); err == nil {
			out = append(out, uid)
		}
	}
	return out, nil
}

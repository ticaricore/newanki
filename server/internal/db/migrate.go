package db

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strconv"
	"strings"
)

// Migration is one forward-only schema step. Version is the NNNN prefix of the file name.
type Migration struct {
	Version int
	Name    string
	SQL     string
}

// LoadMigrations reads NNNN_name.sql files from dir in fsys, sorted by version.
func LoadMigrations(fsys fs.FS, dir string) ([]Migration, error) {
	entries, err := fs.ReadDir(fsys, dir)
	if err != nil {
		return nil, err
	}
	var out []Migration
	seen := map[int]string{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		prefix, _, ok := strings.Cut(e.Name(), "_")
		if !ok {
			return nil, fmt.Errorf("migration %q: expected NNNN_name.sql", e.Name())
		}
		v, err := strconv.Atoi(prefix)
		if err != nil || v <= 0 {
			return nil, fmt.Errorf("migration %q: bad version", e.Name())
		}
		if other, dup := seen[v]; dup {
			return nil, fmt.Errorf("migrations %q and %q share version %d", other, e.Name(), v)
		}
		seen[v] = e.Name()
		body, err := fs.ReadFile(fsys, path.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		out = append(out, Migration{Version: v, Name: e.Name(), SQL: string(body)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Version < out[j].Version })
	return out, nil
}

// Migrate applies every migration newer than PRAGMA user_version, each in its own transaction
// together with the user_version bump, so a failure leaves the database at the last good version.
func Migrate(ctx context.Context, sqlDB *sql.DB, migs []Migration) error {
	for _, m := range migs {
		if err := applyOne(ctx, sqlDB, m); err != nil {
			return err
		}
	}
	return nil
}

func applyOne(ctx context.Context, sqlDB *sql.DB, m Migration) error {
	tx, err := sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Read the version inside the (immediate) transaction so two processes cannot both apply it.
	var current int
	if err := tx.QueryRowContext(ctx, "PRAGMA user_version").Scan(&current); err != nil {
		return err
	}
	if m.Version <= current {
		return nil
	}
	if _, err := tx.ExecContext(ctx, m.SQL); err != nil {
		return fmt.Errorf("migration %s: %w", m.Name, err)
	}
	if _, err := tx.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", m.Version)); err != nil {
		return err
	}
	return tx.Commit()
}

// Version returns PRAGMA user_version.
func Version(ctx context.Context, sqlDB *sql.DB) (int, error) {
	var v int
	err := sqlDB.QueryRowContext(ctx, "PRAGMA user_version").Scan(&v)
	return v, err
}

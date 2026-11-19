// Package db holds SQLite plumbing shared by main.db and the per-user databases.
package db

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"

	_ "modernc.org/sqlite" // registers the "sqlite" driver
)

// Open opens (and creates if missing) a SQLite database with the pragmas every NewAnki database uses.
// Transactions start with BEGIN IMMEDIATE so concurrent writers wait on busy_timeout instead of failing
// with SQLITE_BUSY when upgrading a read lock.
func Open(ctx context.Context, path string, maxConns int) (*sql.DB, error) {
	q := url.Values{}
	q.Add("_pragma", "journal_mode(WAL)")
	q.Add("_pragma", "busy_timeout(5000)")
	q.Add("_pragma", "foreign_keys(1)")
	q.Add("_pragma", "synchronous(NORMAL)")
	q.Set("_txlock", "immediate")
	dsn := "file:" + path + "?" + q.Encode()

	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	if maxConns < 1 {
		maxConns = 1
	}
	sqlDB.SetMaxOpenConns(maxConns)
	sqlDB.SetMaxIdleConns(maxConns)
	if err := sqlDB.PingContext(ctx); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("ping %s: %w", path, err)
	}
	return sqlDB, nil
}

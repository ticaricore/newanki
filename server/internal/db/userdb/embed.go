package userdb

import "embed"

// Migrations holds the per-user database schema migrations.
//
//go:embed migrations/*.sql
var Migrations embed.FS

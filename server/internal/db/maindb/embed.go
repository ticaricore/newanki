package maindb

import "embed"

// Migrations holds the main.db schema migrations.
//
//go:embed migrations/*.sql
var Migrations embed.FS

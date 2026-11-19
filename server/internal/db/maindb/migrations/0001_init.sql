-- main.db: users, sessions, global settings, audit log.
-- All timestamps are unix milliseconds (UTC).

CREATE TABLE users (
  id                   INTEGER PRIMARY KEY,
  uid                  TEXT    NOT NULL UNIQUE,
  email                TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name                 TEXT    NOT NULL,
  password_hash        TEXT    NOT NULL,
  role                 TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status               TEXT    NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning', 'active', 'disabled')),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  last_login_at        INTEGER
);

CREATE TABLE sessions (
  id           TEXT    PRIMARY KEY, -- hex sha256 of the session token
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  user_agent   TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX sessions_user_id ON sessions (user_id);
CREATE INDEX sessions_expires_at ON sessions (expires_at);

CREATE TABLE app_settings (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL, -- JSON
  updated_at INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id       INTEGER PRIMARY KEY,
  actor_id INTEGER,
  action   TEXT    NOT NULL,
  target   TEXT    NOT NULL DEFAULT '',
  detail   TEXT    NOT NULL DEFAULT '',
  at       INTEGER NOT NULL
);

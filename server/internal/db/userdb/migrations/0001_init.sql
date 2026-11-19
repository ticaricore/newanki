-- users/<uid>.db: one file per user. All timestamps are unix milliseconds (UTC).
-- Internal keys are INTEGER PRIMARY KEY (rowid); `uid` (UUIDv7) is the only id exposed outside.

CREATE TABLE decks (
  id         INTEGER PRIMARY KEY,
  uid        TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  category   TEXT    NOT NULL DEFAULT '',
  color      TEXT    NOT NULL DEFAULT '#34D399',
  icon       TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE cards (
  id         INTEGER PRIMARY KEY,
  uid        TEXT    NOT NULL UNIQUE,
  deck_id    INTEGER NOT NULL REFERENCES decks (id),
  type       TEXT    NOT NULL CHECK (type IN ('word', 'audio', 'image', 'quran')),
  front      TEXT    NOT NULL DEFAULT '',
  back       TEXT    NOT NULL DEFAULT '',
  fields     TEXT    NOT NULL DEFAULT '{}', -- JSON, type-specific
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX cards_deck_id ON cards (deck_id);
CREATE INDEX cards_created ON cards (created_at, id);

CREATE TABLE card_state (
  card_id          INTEGER PRIMARY KEY REFERENCES cards (id) ON DELETE CASCADE,
  level            INTEGER NOT NULL DEFAULT 0,
  due_at           INTEGER NOT NULL,
  last_reviewed_at INTEGER,
  reviews          INTEGER NOT NULL DEFAULT 0,
  lapses           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX card_state_due_at ON card_state (due_at);

CREATE TABLE reviews (
  id           INTEGER PRIMARY KEY,
  uid          TEXT    NOT NULL UNIQUE,
  card_id      INTEGER NOT NULL REFERENCES cards (id),
  correct      INTEGER NOT NULL CHECK (correct IN (0, 1)),
  level_before INTEGER NOT NULL,
  level_after  INTEGER NOT NULL,
  due_after    INTEGER NOT NULL,
  reviewed_at  INTEGER NOT NULL,
  client_ts    INTEGER,
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  day          TEXT    NOT NULL -- local study day (YYYY-MM-DD) per user's timezone and day start
);

CREATE INDEX reviews_day ON reviews (day);
CREATE INDEX reviews_card_id ON reviews (card_id);

CREATE TABLE media (
  id         INTEGER PRIMARY KEY,
  uid        TEXT    NOT NULL UNIQUE,
  kind       TEXT    NOT NULL CHECK (kind IN ('image', 'audio')),
  mime       TEXT    NOT NULL,
  size       INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL -- JSON
);

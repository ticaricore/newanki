-- AI card generation usage per user and UTC day (daily limit + admin stats).
CREATE TABLE ai_usage (
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day           TEXT    NOT NULL, -- YYYY-MM-DD (UTC)
  requests      INTEGER NOT NULL DEFAULT 0,
  cards         INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
) WITHOUT ROWID;

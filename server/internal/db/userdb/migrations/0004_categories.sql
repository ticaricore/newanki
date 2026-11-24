-- Deck categories become the user's own list: renameable, with their own color.
-- decks.category now holds a category uid ('' = no category).
CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  uid        TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  color      TEXT    NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX categories_name ON categories (name COLLATE NOCASE);

-- Random (v4) uids: SQL cannot make v7 ones, and categories are never sorted by uid.

INSERT INTO categories (uid, name, color, position, created_at, updated_at)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
       substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
       name, color, position, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM (SELECT 'Türkçe' AS name, '#F87171' AS color, 1 AS position
      UNION ALL SELECT 'İngilizce', '#60A5FA', 2
      UNION ALL SELECT 'Arapça', '#2DD4BF', 3);

-- Old fixed category keys (from the first design) and their labels/colors.
CREATE TABLE _catmap (key TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL);
INSERT INTO _catmap VALUES
  ('ingilizce', 'İngilizce', '#60A5FA'),
  ('almanca', 'Almanca', '#A78BFA'),
  ('kuran', 'Kurʼan', '#34D399'),
  ('biyoloji', 'Biyoloji', '#F472B6'),
  ('tarih', 'Tarih', '#FCD34D'),
  ('felsefe', 'Felsefe', '#FB923C');

-- Keep every category already used by a deck.
INSERT OR IGNORE INTO categories (uid, name, color, position, created_at, updated_at)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
       substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
       substr(COALESCE(m.name, trim(d.category)), 1, 40), COALESCE(m.color, '#94A3B8'),
       3 + row_number() OVER (ORDER BY COALESCE(m.name, d.category) COLLATE NOCASE),
       CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM (SELECT DISTINCT category FROM decks WHERE trim(category) != '') d
LEFT JOIN _catmap m ON m.key = d.category;

UPDATE decks SET category = COALESCE((
  SELECT c.uid FROM categories c
  WHERE c.name = substr(COALESCE((SELECT m.name FROM _catmap m WHERE m.key = decks.category), trim(decks.category)), 1, 40) COLLATE NOCASE
), '')
WHERE category != '';

DROP TABLE _catmap;

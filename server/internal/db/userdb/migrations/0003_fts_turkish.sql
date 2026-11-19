-- Turkish dotless ı is a separate letter, not a diacritic, so unicode61 does not fold it to i.
-- Index text with ı→i (the query side does the same in userdb.FTSQuery) so "dayanikli" finds "dayanıklı".
DROP TRIGGER cards_fts_ai;
DROP TRIGGER cards_fts_au;

CREATE TRIGGER cards_fts_ai AFTER INSERT ON cards WHEN NEW.deleted_at IS NULL BEGIN
  INSERT INTO cards_fts (rowid, front, back, extra)
  VALUES (NEW.id, replace(NEW.front, 'ı', 'i'), replace(NEW.back, 'ı', 'i'),
          replace((SELECT COALESCE(group_concat(value, ' '), '') FROM json_each(NEW.fields) WHERE type = 'text'), 'ı', 'i'));
END;

CREATE TRIGGER cards_fts_au AFTER UPDATE ON cards BEGIN
  DELETE FROM cards_fts WHERE rowid = OLD.id;
  INSERT INTO cards_fts (rowid, front, back, extra)
  SELECT NEW.id, replace(NEW.front, 'ı', 'i'), replace(NEW.back, 'ı', 'i'),
         replace((SELECT COALESCE(group_concat(value, ' '), '') FROM json_each(NEW.fields) WHERE type = 'text'), 'ı', 'i')
  WHERE NEW.deleted_at IS NULL;
END;

-- Rebuild the index for existing cards.
DELETE FROM cards_fts;
INSERT INTO cards_fts (rowid, front, back, extra)
SELECT c.id, replace(c.front, 'ı', 'i'), replace(c.back, 'ı', 'i'),
       replace((SELECT COALESCE(group_concat(value, ' '), '') FROM json_each(c.fields) WHERE type = 'text'), 'ı', 'i')
FROM cards c
WHERE c.deleted_at IS NULL;

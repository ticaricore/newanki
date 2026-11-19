-- Full-text search over cards. rowid = cards.id. `extra` holds every string value in cards.fields.
CREATE VIRTUAL TABLE cards_fts USING fts5 (
  front,
  back,
  extra,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER cards_fts_ai AFTER INSERT ON cards WHEN NEW.deleted_at IS NULL BEGIN
  INSERT INTO cards_fts (rowid, front, back, extra)
  VALUES (NEW.id, NEW.front, NEW.back,
          (SELECT COALESCE(group_concat(value, ' '), '') FROM json_each(NEW.fields) WHERE type = 'text'));
END;

CREATE TRIGGER cards_fts_au AFTER UPDATE ON cards BEGIN
  DELETE FROM cards_fts WHERE rowid = OLD.id;
  INSERT INTO cards_fts (rowid, front, back, extra)
  SELECT NEW.id, NEW.front, NEW.back,
         (SELECT COALESCE(group_concat(value, ' '), '') FROM json_each(NEW.fields) WHERE type = 'text')
  WHERE NEW.deleted_at IS NULL;
END;

CREATE TRIGGER cards_fts_ad AFTER DELETE ON cards BEGIN
  DELETE FROM cards_fts WHERE rowid = OLD.id;
END;

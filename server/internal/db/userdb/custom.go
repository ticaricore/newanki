package userdb

// Hand-written queries that sqlc's SQLite engine cannot type well (dynamic filters, aggregates, FTS).

import (
	"context"
	"database/sql"
	"strings"
	"unicode"
)

// CardRow is a card joined with its deck uid and scheduling state.
type CardRow struct {
	ID             int64
	Uid            string
	DeckUid        string
	Type           string
	Front          string
	Back           string
	Fields         string
	CreatedAt      int64
	UpdatedAt      int64
	Level          int64
	DueAt          int64
	Reviews        int64
	Lapses         int64
	LastReviewedAt sql.NullInt64
}

const cardRowSelect = `
SELECT c.id, c.uid, d.uid, c.type, c.front, c.back, c.fields, c.created_at, c.updated_at,
       s.level, s.due_at, s.reviews, s.lapses, s.last_reviewed_at
FROM cards c
JOIN decks d ON d.id = c.deck_id
JOIN card_state s ON s.card_id = c.id`

func scanCardRows(rows *sql.Rows) ([]CardRow, error) {
	defer rows.Close()
	out := []CardRow{}
	for rows.Next() {
		var r CardRow
		if err := rows.Scan(&r.ID, &r.Uid, &r.DeckUid, &r.Type, &r.Front, &r.Back, &r.Fields, &r.CreatedAt,
			&r.UpdatedAt, &r.Level, &r.DueAt, &r.Reviews, &r.Lapses, &r.LastReviewedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// GetCardRow returns one live card by uid.
func (q *Queries) GetCardRow(ctx context.Context, uid string) (CardRow, error) {
	rows, err := q.db.QueryContext(ctx, cardRowSelect+`
WHERE c.uid = ? AND c.deleted_at IS NULL AND d.deleted_at IS NULL`, uid)
	if err != nil {
		return CardRow{}, err
	}
	list, err := scanCardRows(rows)
	if err != nil {
		return CardRow{}, err
	}
	if len(list) == 0 {
		return CardRow{}, sql.ErrNoRows
	}
	return list[0], nil
}

// ListCardsParams filters ListCards. Zero values mean "no filter".
type ListCardsParams struct {
	DeckID   int64
	Type     string
	Query    string // full-text search; disables cursor paging
	AfterUID string // cursor: return cards created before this card
	Limit    int
}

// ListCards lists live cards, newest first, or by relevance when Query is set.
func (q *Queries) ListCards(ctx context.Context, p ListCardsParams) ([]CardRow, error) {
	var sb strings.Builder
	var args []any
	sb.WriteString(cardRowSelect)
	match := FTSQuery(p.Query)
	if match != "" {
		sb.WriteString(` JOIN cards_fts f ON f.rowid = c.id`)
	}
	sb.WriteString(` WHERE c.deleted_at IS NULL AND d.deleted_at IS NULL`)
	if match != "" {
		sb.WriteString(` AND cards_fts MATCH ?`)
		args = append(args, match)
	}
	if p.DeckID != 0 {
		sb.WriteString(` AND c.deck_id = ?`)
		args = append(args, p.DeckID)
	}
	if p.Type != "" {
		sb.WriteString(` AND c.type = ?`)
		args = append(args, p.Type)
	}
	if match == "" && p.AfterUID != "" {
		sb.WriteString(` AND (c.created_at, c.id) < (SELECT created_at, id FROM cards WHERE uid = ?)`)
		args = append(args, p.AfterUID)
	}
	if match != "" {
		sb.WriteString(` ORDER BY f.rank`)
	} else {
		sb.WriteString(` ORDER BY c.created_at DESC, c.id DESC`)
	}
	if p.Limit <= 0 || p.Limit > 200 {
		p.Limit = 50
	}
	sb.WriteString(` LIMIT ?`)
	args = append(args, p.Limit)

	rows, err := q.db.QueryContext(ctx, sb.String(), args...)
	if err != nil {
		return nil, err
	}
	return scanCardRows(rows)
}

// FTSQuery turns user input into a safe FTS5 prefix query: every word quoted, with a trailing '*'.
func FTSQuery(input string) string {
	words := strings.FieldsFunc(input, func(r rune) bool {
		return !(unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.Is(unicode.Mn, r))
	})
	if len(words) > 8 {
		words = words[:8]
	}
	parts := make([]string, 0, len(words))
	for _, w := range words {
		// Fold Turkish dotless ı/I to i like the index does (migration 0003).
		w = strings.NewReplacer("ı", "i", "I", "i", "İ", "i").Replace(w)
		parts = append(parts, `"`+w+`"*`)
	}
	return strings.Join(parts, " ")
}

// DueCards returns cards due at or before now, oldest due first.
func (q *Queries) DueCards(ctx context.Context, now int64, deckID int64, limit int) ([]CardRow, error) {
	query := cardRowSelect + ` WHERE c.deleted_at IS NULL AND d.deleted_at IS NULL AND s.due_at <= ?`
	args := []any{now}
	if deckID != 0 {
		query += ` AND c.deck_id = ?`
		args = append(args, deckID)
	}
	query += ` ORDER BY s.due_at, c.id LIMIT ?`
	args = append(args, limit)
	rows, err := q.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	return scanCardRows(rows)
}

// CountDue counts cards due at or before now.
func (q *Queries) CountDue(ctx context.Context, now int64, deckID int64) (int64, error) {
	query := `SELECT COUNT(*) FROM cards c JOIN decks d ON d.id = c.deck_id JOIN card_state s ON s.card_id = c.id
WHERE c.deleted_at IS NULL AND d.deleted_at IS NULL AND s.due_at <= ?`
	args := []any{now}
	if deckID != 0 {
		query += ` AND c.deck_id = ?`
		args = append(args, deckID)
	}
	var n int64
	err := q.db.QueryRowContext(ctx, query, args...).Scan(&n)
	return n, err
}

// DeckCounts holds per-deck aggregates.
type DeckCounts struct {
	Cards         int64
	Due           int64
	Learned       int64
	LastStudiedAt sql.NullInt64
}

// DeckCountsAll returns aggregates keyed by deck id for every deck with live cards.
func (q *Queries) DeckCountsAll(ctx context.Context, now int64, learnedLevel int) (map[int64]DeckCounts, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT c.deck_id,
       COUNT(*),
       COALESCE(SUM(CASE WHEN s.due_at <= ? THEN 1 ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN s.level >= ? THEN 1 ELSE 0 END), 0),
       MAX(s.last_reviewed_at)
FROM cards c JOIN card_state s ON s.card_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.deck_id`, now, learnedLevel)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]DeckCounts{}
	for rows.Next() {
		var id int64
		var dc DeckCounts
		if err := rows.Scan(&id, &dc.Cards, &dc.Due, &dc.Learned, &dc.LastStudiedAt); err != nil {
			return nil, err
		}
		out[id] = dc
	}
	return out, rows.Err()
}

// DayStat is the review count for one study day.
type DayStat struct {
	Day     string
	Count   int64
	Correct int64
}

// ReviewDays returns review counts per study day on or after fromDay (YYYY-MM-DD), ascending.
func (q *Queries) ReviewDays(ctx context.Context, fromDay string) ([]DayStat, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT day, COUNT(*), COALESCE(SUM(correct), 0) FROM reviews WHERE day >= ? GROUP BY day ORDER BY day`, fromDay)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DayStat{}
	for rows.Next() {
		var d DayStat
		if err := rows.Scan(&d.Day, &d.Count, &d.Correct); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// LevelCounts returns the number of live cards per SRS level.
func (q *Queries) LevelCounts(ctx context.Context) (map[int64]int64, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT s.level, COUNT(*) FROM card_state s JOIN cards c ON c.id = s.card_id
JOIN decks d ON d.id = c.deck_id
WHERE c.deleted_at IS NULL AND d.deleted_at IS NULL GROUP BY s.level`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]int64{}
	for rows.Next() {
		var lvl, n int64
		if err := rows.Scan(&lvl, &n); err != nil {
			return nil, err
		}
		out[lvl] = n
	}
	return out, rows.Err()
}

// MediaExists reports whether a live media item with the uid and kind exists.
func (q *Queries) MediaExists(ctx context.Context, uid, kind string) (bool, error) {
	var n int
	err := q.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM media WHERE uid = ? AND kind = ? AND deleted_at IS NULL`, uid, kind).Scan(&n)
	return n > 0, err
}

// FrontExists reports whether a live card in a live deck has this front (case-insensitive for ASCII).
func (q *Queries) FrontExists(ctx context.Context, front string) (bool, error) {
	var n int
	err := q.db.QueryRowContext(ctx, `
SELECT COUNT(*) FROM cards c JOIN decks d ON d.id = c.deck_id
WHERE c.deleted_at IS NULL AND d.deleted_at IS NULL AND c.front = ? COLLATE NOCASE`, front).Scan(&n)
	return n > 0, err
}

// DeckFronts returns the fronts of a deck's live cards, newest first.
func (q *Queries) DeckFronts(ctx context.Context, deckID int64, limit int) ([]string, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT front FROM cards WHERE deck_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?`, deckID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var f string
		if err := rows.Scan(&f); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

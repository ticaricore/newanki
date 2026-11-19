-- name: CreateDeck :one
INSERT INTO decks (uid, name, category, color, icon, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetDeckByUID :one
SELECT * FROM decks WHERE uid = ? AND deleted_at IS NULL;

-- name: GetDeckByUIDAny :one
SELECT * FROM decks WHERE uid = ?;

-- name: GetDeckByID :one
SELECT * FROM decks WHERE id = ?;

-- name: ListDecks :many
SELECT * FROM decks WHERE deleted_at IS NULL ORDER BY created_at, id;

-- name: UpdateDeck :one
UPDATE decks SET name = ?, category = ?, color = ?, icon = ?, updated_at = ?
WHERE id = ?
RETURNING *;

-- name: SoftDeleteDeck :exec
UPDATE decks SET deleted_at = ?, updated_at = ? WHERE id = ?;

-- name: SoftDeleteDeckCards :exec
UPDATE cards SET deleted_at = ?, updated_at = ? WHERE deck_id = ? AND deleted_at IS NULL;

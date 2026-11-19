-- name: CreateCard :one
INSERT INTO cards (uid, deck_id, type, front, back, fields, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: CreateCardState :exec
INSERT INTO card_state (card_id, level, due_at) VALUES (?, ?, ?);

-- name: GetCardByUIDAny :one
SELECT * FROM cards WHERE uid = ?;

-- name: UpdateCard :exec
UPDATE cards SET deck_id = ?, front = ?, back = ?, fields = ?, updated_at = ? WHERE id = ?;

-- name: SoftDeleteCard :exec
UPDATE cards SET deleted_at = ?, updated_at = ? WHERE id = ?;

-- name: GetCardState :one
SELECT * FROM card_state WHERE card_id = ?;

-- name: UpdateCardState :exec
UPDATE card_state
SET level = ?, due_at = ?, last_reviewed_at = ?, reviews = reviews + 1, lapses = lapses + ?
WHERE card_id = ?;

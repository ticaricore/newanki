-- name: ListCategories :many
SELECT * FROM categories ORDER BY position, id;

-- name: GetCategoryByUID :one
SELECT * FROM categories WHERE uid = ?;

-- name: CategoryNextPosition :one
SELECT CAST(COALESCE(MAX(position), 0) + 1 AS INTEGER) FROM categories;

-- name: CountCategories :one
SELECT COUNT(*) FROM categories;

-- name: CreateCategory :one
INSERT INTO categories (uid, name, color, position, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateCategory :one
UPDATE categories SET name = ?, color = ?, updated_at = ? WHERE id = ?
RETURNING *;

-- name: DeleteCategory :exec
DELETE FROM categories WHERE id = ?;

-- name: ClearDeckCategory :exec
UPDATE decks SET category = '', updated_at = ? WHERE category = ?;

-- name: CategoryDeckCounts :many
SELECT category, COUNT(*) AS decks FROM decks
WHERE deleted_at IS NULL AND category != ''
GROUP BY category;

-- name: CreateMedia :one
INSERT INTO media (uid, kind, mime, size, created_at) VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: GetMediaByUID :one
SELECT * FROM media WHERE uid = ? AND deleted_at IS NULL;

-- name: ListSettings :many
SELECT * FROM settings;

-- name: UpsertSetting :exec
INSERT INTO settings (key, value) VALUES (?, ?)
ON CONFLICT (key) DO UPDATE SET value = excluded.value;

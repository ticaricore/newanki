-- name: ListAppSettings :many
SELECT * FROM app_settings ORDER BY key;

-- name: UpsertAppSetting :exec
INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

-- name: InsertAudit :exec
INSERT INTO audit_log (actor_id, action, target, detail, at) VALUES (?, ?, ?, ?, ?);

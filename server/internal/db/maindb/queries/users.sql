-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: CreateUser :one
INSERT INTO users (uid, email, name, password_hash, role, status, must_change_password, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, 'provisioning', ?, ?, ?)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = ?;

-- name: GetUserByUID :one
SELECT * FROM users WHERE uid = ?;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = ?;

-- name: ListUsers :many
SELECT * FROM users WHERE status != 'provisioning' ORDER BY created_at;

-- name: ListProvisioningUsers :many
SELECT * FROM users WHERE status = 'provisioning';

-- name: SetUserStatus :exec
UPDATE users SET status = ?, updated_at = ? WHERE id = ?;

-- name: UpdateUserProfile :exec
UPDATE users SET name = ?, role = ?, status = ?, updated_at = ? WHERE id = ?;

-- name: SetUserPassword :exec
UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?;

-- name: TouchUserLogin :exec
UPDATE users SET last_login_at = ? WHERE id = ?;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = ?;

-- name: CountActiveAdmins :one
SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active';

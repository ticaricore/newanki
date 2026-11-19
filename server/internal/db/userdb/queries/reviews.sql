-- name: GetReviewByUID :one
SELECT * FROM reviews WHERE uid = ?;

-- name: InsertReview :exec
INSERT INTO reviews (uid, card_id, correct, level_before, level_after, due_after, reviewed_at, client_ts, duration_ms, day)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

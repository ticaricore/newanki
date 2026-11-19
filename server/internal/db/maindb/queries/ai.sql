-- name: GetAIRequests :one
SELECT CAST(COALESCE((SELECT requests FROM ai_usage WHERE user_id = ? AND day = ?), 0) AS INTEGER) AS requests;

-- name: AddAIUsage :exec
INSERT INTO ai_usage (user_id, day, requests, cards, input_tokens, output_tokens) VALUES (?, ?, 1, ?, ?, ?)
ON CONFLICT (user_id, day) DO UPDATE SET
  requests = requests + 1,
  cards = cards + excluded.cards,
  input_tokens = input_tokens + excluded.input_tokens,
  output_tokens = output_tokens + excluded.output_tokens;

-- name: AIUsageForDay :one
SELECT CAST(COALESCE(SUM(requests), 0) AS INTEGER) AS requests,
       CAST(COALESCE(SUM(cards), 0) AS INTEGER) AS cards,
       CAST(COALESCE(SUM(input_tokens), 0) AS INTEGER) AS input_tokens,
       CAST(COALESCE(SUM(output_tokens), 0) AS INTEGER) AS output_tokens
FROM ai_usage WHERE day = ?;

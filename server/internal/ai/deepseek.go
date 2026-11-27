package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DeepSeekDefaultModel is used with the DeepSeek provider unless NEWANKI_AI_MODEL overrides it.
const DeepSeekDefaultModel = "deepseek-flash"

const deepSeekURL = "https://api.deepseek.com/chat/completions"

// DeepSeek is a Generator backed by DeepSeek's chat completions API in JSON mode.
// JSON mode does not enforce a schema, so the reply is checked here and by the API layer.
type DeepSeek struct {
	apiKey string
	model  string
	url    string
	http   *http.Client
}

// NewDeepSeek returns a DeepSeek generator, or nil when apiKey is empty.
func NewDeepSeek(apiKey, model string) *DeepSeek {
	if strings.TrimSpace(apiKey) == "" {
		return nil
	}
	if model == "" {
		model = DeepSeekDefaultModel
	}
	return &DeepSeek{apiKey: strings.TrimSpace(apiKey), model: model, url: deepSeekURL, http: &http.Client{Timeout: 120 * time.Second}}
}

// ModelName is the configured model.
func (d *DeepSeek) ModelName() string { return d.model }

// JSON mode needs the word "json" and an example of the shape in the prompt.
const deepSeekJSONPrompt = `

Reply with a single JSON object only, no other text, in exactly this shape (every field is a string; use "" when not applicable):
{"cards":[{"front":"ephemeral","back":"geçici; kısa ömürlü","ipa":"/ɪˈfɛmərəl/","pos":"sıfat","example":"Fame in the age of social media is often ephemeral.","example_tr":"Sosyal medya çağında şöhret çoğu zaman geçicidir.","synonyms":"fleeting, transient, short-lived"}]}`

type dsMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type dsRequest struct {
	Model          string            `json:"model"`
	Messages       []dsMessage       `json:"messages"`
	MaxTokens      int               `json:"max_tokens"`
	Temperature    float64           `json:"temperature"`
	ResponseFormat map[string]string `json:"response_format"`
	Thinking       map[string]string `json:"thinking"`
	Stream         bool              `json:"stream"`
}

type dsResponse struct {
	Model   string `json:"model"`
	Choices []struct {
		Message struct {
			Content *string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int64 `json:"prompt_tokens"`
		CompletionTokens int64 `json:"completion_tokens"`
	} `json:"usage"`
}

// Generate asks for the cards as JSON. A blank reply (DeepSeek blanks output it cannot parse as JSON)
// is retried once.
func (d *DeepSeek) Generate(ctx context.Context, r Request) (Result, error) {
	maxTokens := 4000
	if r.Mode == ModeList {
		maxTokens = 16000
	}
	body, err := json.Marshal(dsRequest{
		Model: d.model,
		Messages: []dsMessage{
			{Role: "system", Content: systemPrompt + deepSeekJSONPrompt},
			{Role: "user", Content: userPrompt(r)},
		},
		MaxTokens:      maxTokens,
		Temperature:    0.7,
		ResponseFormat: map[string]string{"type": "json_object"},
		// Vocabulary cards do not need reasoning; thinking would only add latency and cost.
		Thinking: map[string]string{"type": "disabled"},
	})
	if err != nil {
		return Result{}, err
	}
	var total Result
	for attempt := 0; ; attempt++ {
		res, err := d.call(ctx, body)
		total.Model = res.Model
		total.InputTokens += res.InputTokens
		total.OutputTokens += res.OutputTokens
		if errors.Is(err, errBlank) && attempt == 0 {
			continue
		}
		total.Cards = res.Cards
		if errors.Is(err, errBlank) {
			err = fmt.Errorf("%w: empty reply", ErrBadOutput)
		}
		return total, err
	}
}

var errBlank = errors.New("blank reply")

func (d *DeepSeek) call(ctx context.Context, body []byte) (Result, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.url, bytes.NewReader(body))
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("Authorization", "Bearer "+d.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := d.http.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return Result{}, ctx.Err()
		}
		return Result{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return Result{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	if resp.StatusCode != http.StatusOK {
		msg := strings.TrimSpace(string(raw))
		if len(msg) > 300 {
			msg = msg[:300]
		}
		err := fmt.Errorf("deepseek: HTTP %d: %s", resp.StatusCode, msg)
		switch {
		case resp.StatusCode == http.StatusTooManyRequests, resp.StatusCode >= 500:
			return Result{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
		}
		return Result{}, err // 401 bad key, 402 no balance, 400/422 bad request: logged by the caller
	}
	var out dsResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return Result{}, fmt.Errorf("%w: %v", ErrBadOutput, err)
	}
	res := Result{Model: out.Model, InputTokens: out.Usage.PromptTokens, OutputTokens: out.Usage.CompletionTokens}
	if res.Model == "" {
		res.Model = d.model
	}
	if len(out.Choices) == 0 {
		return res, fmt.Errorf("%w: no choices", ErrBadOutput)
	}
	ch := out.Choices[0]
	switch ch.FinishReason {
	case "content_filter":
		return res, ErrRefused
	case "length":
		return res, fmt.Errorf("%w: output truncated", ErrBadOutput)
	case "insufficient_system_resource":
		return res, fmt.Errorf("%w: insufficient system resource", ErrUnavailable)
	}
	text := ""
	if ch.Message.Content != nil {
		text = strings.TrimSpace(*ch.Message.Content)
	}
	if text == "" {
		return res, errBlank
	}
	cards, err := parseCards(text)
	if err != nil {
		return res, err
	}
	res.Cards = cards
	return res, nil
}

// parseCards reads {"cards":[...]} leniently: missing fields stay empty, a bare array is accepted,
// and non-string values are rejected as unusable output.
func parseCards(text string) ([]Card, error) {
	text = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(text), "```json"), "```"))
	var obj struct {
		Cards *[]Card `json:"cards"`
	}
	if err := json.Unmarshal([]byte(text), &obj); err == nil && obj.Cards != nil {
		return *obj.Cards, nil
	}
	var arr []Card
	if err := json.Unmarshal([]byte(text), &arr); err == nil {
		return arr, nil
	}
	return nil, fmt.Errorf("%w: reply is not the expected JSON", ErrBadOutput)
}

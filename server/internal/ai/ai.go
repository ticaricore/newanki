// Package ai generates flashcard content with the Claude API or DeepSeek.
package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/anthropics/anthropic-sdk-go/v2"
	"github.com/anthropics/anthropic-sdk-go/v2/option"
)

// DefaultModel is used unless NEWANKI_AI_MODEL overrides it.
const DefaultModel = "claude-opus-5-5"

// Modes of a request.
const (
	ModeWord = "word" // one word or phrase → exactly one card
	ModeList = "list" // a topic or a pasted text → several cards
)

// MaxCards bounds a list request.
const MaxCards = 30

var (
	// ErrRefused means the model declined the request (safety classifiers).
	ErrRefused = errors.New("ai: request refused")
	// ErrUnavailable means the API could not be reached or is overloaded; retrying later may work.
	ErrUnavailable = errors.New("ai: service unavailable")
	// ErrBadOutput means the response could not be used (truncated or unparseable).
	ErrBadOutput = errors.New("ai: unusable response")
)

// Request describes what to generate.
type Request struct {
	Mode       string
	Input      string
	SourceLang string   // language being learned, e.g. "en"
	TargetLang string   // language of the meanings, e.g. "tr"
	Count      int      // list mode: how many cards
	Avoid      []string // list mode: fronts the deck already has
}

// Card is one generated word card. Empty strings mean "not applicable".
type Card struct {
	Front     string `json:"front"`
	Back      string `json:"back"`
	IPA       string `json:"ipa"`
	POS       string `json:"pos"`
	Example   string `json:"example"`
	ExampleTr string `json:"example_tr"`
	Synonyms  string `json:"synonyms"`
}

// Result is the outcome of a request.
type Result struct {
	Cards        []Card
	Model        string
	InputTokens  int64
	OutputTokens int64
}

// Generator produces cards. The API server depends on this interface so tests can fake it.
type Generator interface {
	Generate(ctx context.Context, req Request) (Result, error)
}

// Claude is a Generator backed by the Claude API.
type Claude struct {
	client anthropic.Client
	model  string
}

// NewClaude returns a Claude generator, or nil when apiKey is empty (AI is then off).
func NewClaude(apiKey, model string) *Claude {
	if strings.TrimSpace(apiKey) == "" {
		return nil
	}
	if model == "" {
		model = DefaultModel
	}
	return &Claude{client: anthropic.NewClient(option.WithAPIKey(apiKey)), model: model}
}

// ModelName is the configured model.
func (c *Claude) ModelName() string { return c.model }

// Providers.
const (
	ProviderAnthropic = "anthropic"
	ProviderDeepSeek  = "deepseek"
)

// Config picks the provider. An empty Provider means: Anthropic if its key is set, else DeepSeek.
type Config struct {
	Provider     string
	AnthropicKey string
	DeepSeekKey  string
	Model        string // overrides the provider's default model
}

// New returns the configured generator, or nil (AI off) when the chosen provider has no key.
// It also reports the provider it chose.
func New(c Config) (Generator, string, error) {
	p := strings.ToLower(strings.TrimSpace(c.Provider))
	if p == "" {
		switch {
		case strings.TrimSpace(c.AnthropicKey) != "":
			p = ProviderAnthropic
		case strings.TrimSpace(c.DeepSeekKey) != "":
			p = ProviderDeepSeek
		default:
			return nil, "", nil
		}
	}
	switch p {
	case ProviderAnthropic, "claude":
		if g := NewClaude(c.AnthropicKey, c.Model); g != nil {
			return g, ProviderAnthropic, nil
		}
		return nil, ProviderAnthropic, nil
	case ProviderDeepSeek:
		if g := NewDeepSeek(c.DeepSeekKey, c.Model); g != nil {
			return g, ProviderDeepSeek, nil
		}
		return nil, ProviderDeepSeek, nil
	}
	return nil, p, fmt.Errorf("unknown AI provider %q (use anthropic or deepseek)", c.Provider)
}

// LangName turns a language code into the English name used in the prompt.
func LangName(code string) string {
	if n, ok := languages[code]; ok {
		return n
	}
	return ""
}

var languages = map[string]string{
	"en": "English", "tr": "Turkish", "de": "German", "fr": "French", "es": "Spanish",
	"it": "Italian", "ar": "Arabic", "ru": "Russian", "ja": "Japanese",
}

const systemPrompt = `You write flashcards for a spaced-repetition app used by Turkish-speaking learners.

Each card teaches one word or short phrase of the learner's study language:
- front: the word or phrase in the study language, in its dictionary form (lowercase unless it is a proper noun or the language requires capitals, as German nouns do).
- back: its meaning in the learner's language. Give the one to three most common senses, separated by "; ", short and natural. Do not repeat the front.
- ipa: the pronunciation in IPA between slashes, for the study language. Empty for Arabic script if unsure.
- pos: part of speech in the learner's language, short (for Turkish: isim, fiil, sıfat, zarf, deyim, ifade…). Add the grammatical gender or plural when the language marks it (German: "isim · der, -e").
- example: one natural example sentence in the study language using the word, at an intermediate level.
- example_tr: that sentence translated into the learner's language.
- synonyms: up to four synonyms in the study language, comma separated, or empty.

Be accurate: if a word is ambiguous, prefer its most frequent meaning. Never invent words. If the input is not something a card can teach (empty, gibberish, or a request unrelated to learning words), return an empty "cards" array.`

func cardSchema() json.RawMessage {
	str := map[string]any{"type": "string"}
	props := map[string]any{"front": str, "back": str, "ipa": str, "pos": str, "example": str, "example_tr": str, "synonyms": str}
	schema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"cards": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type":                 "object",
					"properties":           props,
					"required":             []string{"front", "back", "ipa", "pos", "example", "example_tr", "synonyms"},
					"additionalProperties": false,
				},
			},
		},
		"required":             []string{"cards"},
		"additionalProperties": false,
	}
	b, _ := json.Marshal(schema)
	return b
}

var schema = cardSchema()

// userPrompt builds the request text. The learner's input is fenced so it reads as data.
func userPrompt(r Request) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Study language: %s. Learner's language: %s.\n\n", LangName(r.SourceLang), LangName(r.TargetLang))
	switch r.Mode {
	case ModeWord:
		b.WriteString("Write exactly one card for this word or phrase. If it is written in the learner's language, write the card for its most common translation in the study language instead.\n")
	default:
		fmt.Fprintf(&b, "Write up to %d cards. The input is either a topic (choose the most useful words for it, common ones first) or a text (pick the words in it most worth learning, in their dictionary form). Each front must be different.\n", r.Count)
		if len(r.Avoid) > 0 {
			b.WriteString("The deck already has these fronts, do not repeat them: ")
			b.WriteString(strings.Join(r.Avoid, ", "))
			b.WriteString("\n")
		}
	}
	b.WriteString("\n<input>\n")
	b.WriteString(r.Input)
	b.WriteString("\n</input>")
	return b.String()
}

// Generate calls the Messages API with a JSON schema for the cards.
func (c *Claude) Generate(ctx context.Context, r Request) (Result, error) {
	maxTokens := int64(4000)
	if r.Mode == ModeList {
		maxTokens = 16000
	}
	resp, err := c.client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     c.model,
		MaxTokens: maxTokens,
		System:    []anthropic.BetaTextBlockParam{{Text: systemPrompt}},
		Messages:  []anthropic.BetaMessageParam{anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(userPrompt(r)))},
		OutputConfig: anthropic.BetaOutputConfigParam{
			// Vocabulary cards are a simple, latency-sensitive task.
			Effort: anthropic.BetaOutputConfigEffortLow,
			Format: anthropic.BetaJSONOutputFormatParam{Schema: schema},
		},
		// A request a safety classifier declines is re-served by a fallback model in the same call.
		Fallbacks: anthropic.BetaFallbacksParamOfDefault(),
		Betas:     []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01},
	})
	if err != nil {
		var apiErr *anthropic.Error
		if errors.As(err, &apiErr) {
			switch {
			case apiErr.StatusCode == http.StatusTooManyRequests, apiErr.StatusCode >= 500:
				return Result{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
			}
			return Result{}, err // 4xx: a bug in the request or a bad key; logged by the caller
		}
		if ctx.Err() != nil {
			return Result{}, ctx.Err()
		}
		return Result{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	res := Result{Model: string(resp.Model), InputTokens: resp.Usage.InputTokens, OutputTokens: resp.Usage.OutputTokens}
	switch resp.StopReason {
	case anthropic.BetaStopReasonRefusal:
		return res, ErrRefused
	case anthropic.BetaStopReasonMaxTokens:
		return res, fmt.Errorf("%w: output truncated", ErrBadOutput)
	}
	var text strings.Builder
	for _, block := range resp.Content {
		if t, ok := block.AsAny().(anthropic.BetaTextBlock); ok {
			text.WriteString(t.Text)
		}
	}
	var out struct {
		Cards []Card `json:"cards"`
	}
	if err := json.Unmarshal([]byte(text.String()), &out); err != nil {
		return res, fmt.Errorf("%w: %v", ErrBadOutput, err)
	}
	res.Cards = out.Cards
	return res, nil
}

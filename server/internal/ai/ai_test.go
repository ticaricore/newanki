package ai

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestUserPrompt(t *testing.T) {
	p := userPrompt(Request{Mode: ModeList, Input: "havaalanı", SourceLang: "en", TargetLang: "tr", Count: 12, Avoid: []string{"gate", "luggage"}})
	for _, want := range []string{"Study language: English. Learner's language: Turkish.", "up to 12 cards", "gate, luggage", "<input>\nhavaalanı\n</input>"} {
		if !strings.Contains(p, want) {
			t.Errorf("prompt misses %q:\n%s", want, p)
		}
	}
	if w := userPrompt(Request{Mode: ModeWord, Input: "x", SourceLang: "de", TargetLang: "tr"}); !strings.Contains(w, "exactly one card") || strings.Contains(w, "already has") {
		t.Errorf("word prompt:\n%s", w)
	}
}

func TestSchemaIsStrict(t *testing.T) {
	var s struct {
		AdditionalProperties bool `json:"additionalProperties"`
		Properties           struct {
			Cards struct {
				Items struct {
					Required             []string `json:"required"`
					AdditionalProperties bool     `json:"additionalProperties"`
				} `json:"items"`
			} `json:"cards"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(schema, &s); err != nil {
		t.Fatal(err)
	}
	if s.AdditionalProperties || s.Properties.Cards.Items.AdditionalProperties || len(s.Properties.Cards.Items.Required) != 7 {
		t.Fatalf("schema = %s", schema)
	}
}

func TestNewClaudeNeedsKey(t *testing.T) {
	if NewClaude("  ", "") != nil {
		t.Fatal("empty key must disable AI")
	}
	if c := NewClaude("sk-test", ""); c == nil || c.model != DefaultModel {
		t.Fatal("default model")
	}
}

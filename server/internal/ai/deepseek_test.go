package ai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// fakeDeepSeek serves replies in order and records the requests it saw.
func fakeDeepSeek(t *testing.T, replies ...func(w http.ResponseWriter)) (*DeepSeek, *[]dsRequest) {
	t.Helper()
	var seen []dsRequest
	var n atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			t.Errorf("auth header = %q", r.Header.Get("Authorization"))
		}
		var req dsRequest
		b, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(b, &req); err != nil {
			t.Errorf("bad request body: %v", err)
		}
		seen = append(seen, req)
		i := int(n.Add(1)) - 1
		if i >= len(replies) {
			t.Errorf("unexpected request %d", i+1)
			w.WriteHeader(500)
			return
		}
		replies[i](w)
	}))
	t.Cleanup(srv.Close)
	d := NewDeepSeek("sk-test", "")
	d.url = srv.URL
	return d, &seen
}

func reply(content string, finish string) func(w http.ResponseWriter) {
	return func(w http.ResponseWriter) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"model":   "deepseek-flash",
			"choices": []any{map[string]any{"message": map[string]any{"role": "assistant", "content": content}, "finish_reason": finish}},
			"usage":   map[string]any{"prompt_tokens": 100, "completion_tokens": 50},
		})
	}
}

func status(code int) func(w http.ResponseWriter) {
	return func(w http.ResponseWriter) {
		w.WriteHeader(code)
		_, _ = w.Write([]byte(`{"error":{"message":"nope"}}`))
	}
}

var wordReq = Request{Mode: ModeWord, Input: "ephemeral", SourceLang: "en", TargetLang: "tr"}

func TestDeepSeekGenerate(t *testing.T) {
	d, seen := fakeDeepSeek(t, reply(`{"cards":[{"front":"ephemeral","back":"geçici","ipa":"/ɪˈfɛmərəl/"}]}`, "stop"))
	res, err := d.Generate(context.Background(), wordReq)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Cards) != 1 || res.Cards[0].Front != "ephemeral" || res.Cards[0].Back != "geçici" || res.Cards[0].POS != "" {
		t.Fatalf("cards = %+v", res.Cards)
	}
	if res.Model != "deepseek-flash" || res.InputTokens != 100 || res.OutputTokens != 50 {
		t.Fatalf("result = %+v", res)
	}
	req := (*seen)[0]
	if req.Model != "deepseek-flash" || req.ResponseFormat["type"] != "json_object" || req.Thinking["type"] != "disabled" || req.Stream {
		t.Fatalf("request = %+v", req)
	}
	if len(req.Messages) != 2 || !strings.Contains(strings.ToLower(req.Messages[0].Content), "json") || !strings.Contains(req.Messages[1].Content, "<input>\nephemeral\n</input>") {
		t.Fatalf("messages = %+v", req.Messages)
	}
}

func TestDeepSeekBlankReplyIsRetriedOnce(t *testing.T) {
	d, seen := fakeDeepSeek(t, reply("   ", "stop"), reply(`[{"front":"a","back":"b"}]`, "stop"))
	res, err := d.Generate(context.Background(), wordReq)
	if err != nil || len(res.Cards) != 1 || len(*seen) != 2 || res.InputTokens != 200 {
		t.Fatalf("res = %+v, err = %v, calls = %d", res, err, len(*seen))
	}

	d, _ = fakeDeepSeek(t, reply("", "stop"), reply(" ", "stop"))
	if _, err := d.Generate(context.Background(), wordReq); !errors.Is(err, ErrBadOutput) {
		t.Fatalf("two blanks: err = %v", err)
	}
}

func TestDeepSeekErrors(t *testing.T) {
	cases := []struct {
		name  string
		reply func(w http.ResponseWriter)
		want  error
	}{
		{"filtered", reply("", "content_filter"), ErrRefused},
		{"truncated", reply(`{"cards":[{"front":"a"`, "length"), ErrBadOutput},
		{"not json", reply(`hello`, "stop"), ErrBadOutput},
		{"wrong types", reply(`{"cards":[{"front":1}]}`, "stop"), ErrBadOutput},
		{"busy", status(503), ErrUnavailable},
		{"rate limited", status(429), ErrUnavailable},
		{"no resource", reply("", "insufficient_system_resource"), ErrUnavailable},
	}
	for _, c := range cases {
		d, _ := fakeDeepSeek(t, c.reply)
		if _, err := d.Generate(context.Background(), wordReq); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", c.name, err, c.want)
		}
	}
	// A bad key is a configuration problem, not "try again later".
	d, _ := fakeDeepSeek(t, status(401))
	_, err := d.Generate(context.Background(), wordReq)
	if err == nil || errors.Is(err, ErrUnavailable) || !strings.Contains(err.Error(), "401") {
		t.Fatalf("401: err = %v", err)
	}
}

func TestNewPicksProvider(t *testing.T) {
	cases := []struct {
		cfg      Config
		provider string
		model    string
	}{
		{Config{}, "", ""},
		{Config{AnthropicKey: "a"}, ProviderAnthropic, DefaultModel},
		{Config{DeepSeekKey: "d"}, ProviderDeepSeek, DeepSeekDefaultModel},
		{Config{AnthropicKey: "a", DeepSeekKey: "d"}, ProviderAnthropic, DefaultModel},
		{Config{Provider: "DeepSeek", AnthropicKey: "a", DeepSeekKey: "d", Model: "deepseek-v4-pro"}, ProviderDeepSeek, "deepseek-v4-pro"},
		{Config{Provider: "deepseek", AnthropicKey: "a"}, ProviderDeepSeek, ""}, // chosen provider has no key: AI off
	}
	for _, c := range cases {
		g, p, err := New(c.cfg)
		if err != nil || p != c.provider {
			t.Errorf("%+v: provider = %q, err = %v", c.cfg, p, err)
			continue
		}
		model := ""
		if g != nil {
			model = g.(interface{ ModelName() string }).ModelName()
		}
		if model != c.model {
			t.Errorf("%+v: model = %q, want %q", c.cfg, model, c.model)
		}
	}
	if _, _, err := New(Config{Provider: "openai", DeepSeekKey: "d"}); err == nil {
		t.Error("unknown provider accepted")
	}
}

package api

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/newanki/server/internal/ai"
)

type fakeAI struct {
	last ai.Request
	err  error
}

func (f *fakeAI) Generate(_ context.Context, r ai.Request) (ai.Result, error) {
	f.last = r
	res := ai.Result{InputTokens: 100, OutputTokens: 50}
	if f.err != nil {
		return res, f.err
	}
	if r.Mode == ai.ModeWord {
		res.Cards = []ai.Card{{Front: r.Input, Back: "tesadüfi keşif", IPA: "/ˌsɛrənˈdɪpɪti/", POS: "isim",
			Example: "It was pure serendipity.", ExampleTr: "Tamamen tesadüftü.", Synonyms: "chance, fluke"}}
		return res, nil
	}
	res.Cards = []ai.Card{
		{Front: "Apple", Back: "elma"}, // already in the deck
		{Front: "pear", Back: "armut"},
		{Front: "PEAR", Back: "armut"}, // repeated
		{Front: "plum", Back: "   "},   // incomplete
		{Front: "  cherry ", Back: " kiraz "},
	}
	return res, nil
}

func TestAINotConfigured(t *testing.T) {
	e := newEnv(t)
	c := signedInUser(t, e)
	var st AIStatus
	c.must(200, "GET", "/ai/status", nil, &st)
	if st.Available || st.Reason != "not_configured" {
		t.Fatalf("status = %+v", st)
	}
	var eb ErrorBody
	c.must(503, "POST", "/ai/generate", AIGenerateRequest{Mode: "word", Input: "x", SourceLang: "en", TargetLang: "tr"}, &eb)
	if eb.Error.Code != "ai_not_configured" {
		t.Fatalf("code = %s", eb.Error.Code)
	}
}

func TestAIGenerate(t *testing.T) {
	gen := &fakeAI{}
	e := newEnvAI(t, gen)
	c := signedInUser(t, e)

	var st AIStatus
	c.must(200, "GET", "/ai/status", nil, &st)
	if !st.Available || st.Limit != 30 || st.Remaining != 30 {
		t.Fatalf("status = %+v", st)
	}

	// Validation.
	c.must(400, "POST", "/ai/generate", AIGenerateRequest{Mode: "poem", Input: "x", SourceLang: "en", TargetLang: "tr"}, nil)
	c.must(400, "POST", "/ai/generate", AIGenerateRequest{Mode: "word", Input: "x", SourceLang: "en", TargetLang: "en"}, nil)
	c.must(400, "POST", "/ai/generate", AIGenerateRequest{Mode: "list", Input: "x", SourceLang: "en", TargetLang: "tr", Count: 31}, nil)
	c.must(400, "POST", "/ai/generate", AIGenerateRequest{Mode: "word", Input: "  ", SourceLang: "en", TargetLang: "tr"}, nil)

	// One word → one card with every field, ready for POST /cards.
	var out AIGenerateResponse
	c.must(200, "POST", "/ai/generate", AIGenerateRequest{Mode: "word", Input: "serendipity", SourceLang: "en", TargetLang: "tr"}, &out)
	if len(out.Cards) != 1 || out.Remaining != 29 {
		t.Fatalf("word = %+v", out)
	}
	w := out.Cards[0]
	if w.Front != "serendipity" || w.Fields.Lang != "en→tr" || w.Fields.ExampleTr == "" || w.Fields.Synonyms == "" || w.Exists {
		t.Fatalf("word card = %+v", w)
	}

	var deck DeckDTO
	c.must(201, "POST", "/decks", DeckInput{Name: "Meyveler", Color: "#34D399"}, &deck)
	var saved CardDTO
	c.must(201, "POST", "/cards", CardInput{DeckUID: deck.UID, Type: "word", Front: w.Front, Back: w.Back, Fields: w.Fields}, &saved)
	var f CardFields
	_ = json.Unmarshal(saved.Fields, &f)
	if f.ExampleTr != "Tamamen tesadüftü." || f.Synonyms != "chance, fluke" {
		t.Fatalf("saved fields = %+v", f)
	}
	c.must(201, "POST", "/cards", CardInput{DeckUID: deck.UID, Type: "word", Front: "apple", Back: "elma"}, nil)

	// A topic for a deck: the deck's fronts are passed on, output is cleaned and checked against the deck.
	c.must(200, "POST", "/ai/generate", AIGenerateRequest{Mode: "list", Input: "meyveler", SourceLang: "en", TargetLang: "tr", Count: 5, DeckUID: &deck.UID}, &out)
	if len(gen.last.Avoid) != 2 || gen.last.Count != 5 {
		t.Fatalf("request = %+v", gen.last)
	}
	if len(out.Cards) != 3 {
		t.Fatalf("list = %+v", out.Cards)
	}
	if !out.Cards[0].Exists || out.Cards[1].Front != "pear" || out.Cards[2].Front != "cherry" || out.Cards[2].Back != "kiraz" {
		t.Fatalf("list cards = %+v", out.Cards)
	}

	// Refusals are reported and still count against the limit (tokens were billed).
	gen.err = ai.ErrRefused
	var eb ErrorBody
	c.must(422, "POST", "/ai/generate", AIGenerateRequest{Mode: "word", Input: "x", SourceLang: "en", TargetLang: "tr"}, &eb)
	if eb.Error.Code != "ai_refused" {
		t.Fatalf("refused code = %s", eb.Error.Code)
	}
	gen.err = nil
	c.must(200, "GET", "/ai/status", nil, &st)
	if st.Used != 3 {
		t.Fatalf("used = %d", st.Used)
	}

	// Admin: lower the limit, then turn AI off.
	admin := e.client()
	admin.must(200, "POST", "/auth/login", LoginRequest{Email: "admin@newanki.local", Password: "Yeni-Sifre-2026"}, nil)
	var as AppSettings
	admin.must(200, "GET", "/admin/settings", nil, &as)
	if !as.AIEnabled || as.AIDailyLimit != 30 {
		t.Fatalf("app settings = %+v", as)
	}
	as.AIDailyLimit = 3
	admin.must(200, "PUT", "/admin/settings", as, nil)
	c.must(429, "POST", "/ai/generate", AIGenerateRequest{Mode: "word", Input: "x", SourceLang: "en", TargetLang: "tr"}, &eb)
	if eb.Error.Code != "ai_limit" {
		t.Fatalf("limit code = %s", eb.Error.Code)
	}
	as.AIDailyLimit, as.AIEnabled = 10, false
	admin.must(200, "PUT", "/admin/settings", as, nil)
	c.must(403, "POST", "/ai/generate", AIGenerateRequest{Mode: "word", Input: "x", SourceLang: "en", TargetLang: "tr"}, nil)

	var stats AdminStats
	admin.must(200, "GET", "/admin/stats", nil, &stats)
	if !stats.AIConfigured || stats.AIRequests != 3 || stats.AICards != 4 || stats.AITokens != 450 {
		t.Fatalf("admin stats = %+v", stats)
	}
}

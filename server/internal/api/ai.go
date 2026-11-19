package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/newanki/server/internal/ai"
	"github.com/newanki/server/internal/db/maindb"
)

// aiDay is the bucket for the daily AI limit (UTC, so it is the same for every user).
func aiDay(t time.Time) string { return t.UTC().Format("2006-01-02") }

func (s *Server) aiModel() string {
	if s.ai == nil {
		return ""
	}
	if s.cfg.AIModel != "" {
		return s.cfg.AIModel
	}
	return ai.DefaultModel
}

func (s *Server) aiStatus(ctx context.Context, rc *reqCtx) (AIStatus, error) {
	a := s.appSettings()
	used, err := s.mainQ.GetAIRequests(ctx, maindb.GetAIRequestsParams{UserID: rc.user.ID, Day: aiDay(s.now())})
	if err != nil {
		return AIStatus{}, err
	}
	st := AIStatus{Limit: a.AIDailyLimit, Used: used, Remaining: max(0, int64(a.AIDailyLimit)-used)}
	switch {
	case s.ai == nil:
		st.Reason = "not_configured"
	case !a.AIEnabled:
		st.Reason = "disabled"
	case st.Remaining == 0:
		st.Reason = "limit"
	default:
		st.Available = true
	}
	return st, nil
}

func (s *Server) handleAIStatus(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	st, err := s.aiStatus(r.Context(), rc)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, st)
	return nil
}

// Input limits, in characters.
const (
	aiMaxWordInput = 100
	aiMaxListInput = 8000
)

func (s *Server) handleAIGenerate(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in AIGenerateRequest
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	req := ai.Request{Mode: in.Mode, Input: strings.TrimSpace(in.Input), SourceLang: in.SourceLang, TargetLang: in.TargetLang, Count: in.Count}
	switch req.Mode {
	case ai.ModeWord:
		req.Count = 1
		if n := utf8.RuneCountInString(req.Input); n == 0 || n > aiMaxWordInput {
			return errField("input", "1–100 karakterlik bir kelime veya ifade yazın")
		}
	case ai.ModeList:
		if req.Count == 0 {
			req.Count = 10
		}
		if req.Count < 1 || req.Count > ai.MaxCards {
			return errField("count", "1 ile 30 arasında olmalı")
		}
		if n := utf8.RuneCountInString(req.Input); n == 0 || n > aiMaxListInput {
			return errField("input", "1–8000 karakterlik bir konu veya metin yazın")
		}
	default:
		return errField("mode", "word veya list olmalı")
	}
	if ai.LangName(req.SourceLang) == "" {
		return errField("source_lang", "desteklenmeyen dil")
	}
	if ai.LangName(req.TargetLang) == "" || req.TargetLang == req.SourceLang {
		return errField("target_lang", "kaynak dilden farklı, desteklenen bir dil seçin")
	}

	st, err := s.aiStatus(r.Context(), rc)
	if err != nil {
		return err
	}
	switch st.Reason {
	case "not_configured":
		return &APIError{Status: http.StatusServiceUnavailable, Code: "ai_not_configured", Message: "AI ile üretim bu sunucuda yapılandırılmamış"}
	case "disabled":
		return &APIError{Status: http.StatusForbidden, Code: "ai_disabled", Message: "AI ile üretim yönetici tarafından kapatıldı"}
	case "limit":
		return &APIError{Status: http.StatusTooManyRequests, Code: "ai_limit", Message: "Bugünkü AI hakkınız doldu, yarın tekrar deneyin"}
	}

	if req.Mode == ai.ModeList && in.DeckUID != nil {
		uid, err := parseUID(*in.DeckUID, "deck_uid")
		if err != nil {
			return err
		}
		d, err := getDeck(r, rc, uid)
		if err != nil {
			return err
		}
		if req.Avoid, err = rc.udb.Q.DeckFronts(r.Context(), d.ID, 200); err != nil {
			return err
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 100*time.Second)
	defer cancel()
	res, genErr := s.ai.Generate(ctx, req)
	var cards []AICard
	if genErr == nil {
		if cards, err = s.cleanAICards(r.Context(), rc, req, res.Cards); err != nil {
			return err
		}
	}
	if res.InputTokens > 0 || genErr == nil {
		// Count every answered request: its tokens were billed even if the output was unusable.
		if err := s.mainQ.AddAIUsage(r.Context(), maindb.AddAIUsageParams{
			UserID: rc.user.ID, Day: aiDay(s.now()), Cards: int64(len(cards)),
			InputTokens: res.InputTokens, OutputTokens: res.OutputTokens,
		}); err != nil {
			s.log.Error("ai usage", "err", err)
		}
	}
	if genErr != nil {
		return s.aiError(r, genErr)
	}
	if len(cards) == 0 {
		return &APIError{Status: http.StatusUnprocessableEntity, Code: "ai_no_result", Message: "Bu girdiden kart üretilemedi. Farklı bir kelime veya konu deneyin."}
	}
	writeJSON(w, http.StatusOK, AIGenerateResponse{Cards: cards, Remaining: max(0, st.Remaining-1)})
	return nil
}

func (s *Server) aiError(r *http.Request, err error) error {
	switch {
	case errors.Is(err, ai.ErrRefused):
		return &APIError{Status: http.StatusUnprocessableEntity, Code: "ai_refused", Message: "Bu istek için içerik üretilemedi. Farklı bir girdi deneyin."}
	case errors.Is(err, ai.ErrUnavailable):
		s.log.Warn("ai unavailable", "err", err)
		return &APIError{Status: http.StatusServiceUnavailable, Code: "ai_unavailable", Message: "AI servisi şu an yoğun, biraz sonra tekrar deneyin"}
	case errors.Is(err, context.DeadlineExceeded):
		return &APIError{Status: http.StatusGatewayTimeout, Code: "ai_timeout", Message: "AI yanıtı çok uzun sürdü, daha kısa bir istek deneyin"}
	case errors.Is(err, context.Canceled):
		return err
	default:
		s.log.Error("ai generate", "path", r.URL.Path, "err", err)
		return &APIError{Status: http.StatusBadGateway, Code: "ai_error", Message: "AI yanıtı kullanılamadı, tekrar deneyin"}
	}
}

func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return strings.TrimSpace(string([]rune(s)[:n])) + "…"
}

// cleanAICards trims and bounds the model output, drops incomplete and repeated cards, and marks
// cards whose front the user already has.
func (s *Server) cleanAICards(ctx context.Context, rc *reqCtx, req ai.Request, in []ai.Card) ([]AICard, error) {
	out := []AICard{}
	seen := map[string]bool{}
	for _, c := range in {
		front, back := clip(c.Front, 120), clip(c.Back, 300)
		key := strings.ToLower(front)
		if front == "" || back == "" || seen[key] {
			continue
		}
		seen[key] = true
		exists, err := rc.udb.Q.FrontExists(ctx, front)
		if err != nil {
			return nil, err
		}
		out = append(out, AICard{
			Front: front, Back: back, Exists: exists,
			Fields: CardFields{
				IPA: clip(c.IPA, 120), POS: clip(c.POS, 80), Example: clip(c.Example, 400),
				ExampleTr: clip(c.ExampleTr, 400), Synonyms: clip(c.Synonyms, 200),
				Lang: req.SourceLang + "→" + req.TargetLang,
			},
		})
		if len(out) == req.Count {
			break
		}
	}
	return out, nil
}

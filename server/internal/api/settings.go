package api

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/newanki/server/internal/db/maindb"
	"github.com/newanki/server/internal/db/userdb"
	"github.com/newanki/server/internal/srs"
)

var hexColor = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

func defaultAppSettings() AppSettings {
	return AppSettings{
		SrsIntervals:     append([]int(nil), srs.DefaultIntervals...),
		DefaultDailyGoal: 40,
		UploadMaxBytes:   5 << 20,
		AppName:          "NewAnki",
	}
}

var appSettingKeys = map[string]func(*AppSettings) any{
	"srs.intervals":       func(a *AppSettings) any { return &a.SrsIntervals },
	"defaults.daily_goal": func(a *AppSettings) any { return &a.DefaultDailyGoal },
	"uploads.max_bytes":   func(a *AppSettings) any { return &a.UploadMaxBytes },
	"app.name":            func(a *AppSettings) any { return &a.AppName },
}

func (s *Server) reloadAppSettings(ctx context.Context) error {
	a := defaultAppSettings()
	rows, err := s.mainQ.ListAppSettings(ctx)
	if err != nil {
		return err
	}
	for _, row := range rows {
		if ptr, ok := appSettingKeys[row.Key]; ok {
			if err := json.Unmarshal([]byte(row.Value), ptr(&a)); err != nil {
				s.log.Warn("ignoring bad app setting", "key", row.Key, "err", err)
			}
		}
	}
	if srs.ValidateIntervals(a.SrsIntervals) != nil {
		a.SrsIntervals = append([]int(nil), srs.DefaultIntervals...)
	}
	s.app.Store(&a)
	return nil
}

func (s *Server) appSettings() AppSettings { return *s.app.Load() }

func (s *Server) scheduler() srs.Scheduler { return srs.New(s.appSettings().SrsIntervals) }

func validateAppSettings(a AppSettings) error {
	if err := srs.ValidateIntervals(a.SrsIntervals); err != nil {
		return errField("srs_intervals", err.Error())
	}
	if a.DefaultDailyGoal < 1 || a.DefaultDailyGoal > 1000 {
		return errField("default_daily_goal", "1 ile 1000 arasında olmalı")
	}
	if a.UploadMaxBytes < 100<<10 || a.UploadMaxBytes > 100<<20 {
		return errField("upload_max_bytes", "100 KB ile 100 MB arasında olmalı")
	}
	if n := len(strings.TrimSpace(a.AppName)); n == 0 || n > 60 {
		return errField("app_name", "1–60 karakter olmalı")
	}
	return nil
}

func (s *Server) handleAdminGetSettings(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	writeJSON(w, http.StatusOK, s.appSettings())
	return nil
}

func (s *Server) handleAdminPutSettings(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in AppSettings
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	in.AppName = strings.TrimSpace(in.AppName)
	if err := validateAppSettings(in); err != nil {
		return err
	}
	now := time.Now().UnixMilli()
	tx, err := s.mainDB.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	q := s.mainQ.WithTx(tx)
	for key, ptr := range appSettingKeys {
		b, _ := json.Marshal(ptr(&in))
		if err := q.UpsertAppSetting(r.Context(), maindb.UpsertAppSettingParams{Key: key, Value: string(b), UpdatedAt: now}); err != nil {
			return err
		}
	}
	s.audit(r.Context(), q, rc, "settings.update", "app", "")
	if err := tx.Commit(); err != nil {
		return err
	}
	if err := s.reloadAppSettings(r.Context()); err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, s.appSettings())
	return nil
}

// ---- per-user settings ----

func (s *Server) defaultUserSettings() UserSettings {
	return UserSettings{
		DailyGoal:       s.appSettings().DefaultDailyGoal,
		Timezone:        "Europe/Istanbul",
		DayStartsAtHour: 4,
		Theme:           "dark",
		Accent:          "#34D399",
		Density:         "balanced",
		Font:            "geist",
		FlipStyle:       "flip",
		VisualDirection: "glass",
		Onboarded:       false,
	}
}

// loadUserSettings overlays stored keys on the defaults.
func (s *Server) loadUserSettings(ctx context.Context, q *userdb.Queries) (UserSettings, error) {
	st := s.defaultUserSettings()
	rows, err := q.ListSettings(ctx)
	if err != nil {
		return st, err
	}
	stored := map[string]json.RawMessage{}
	for _, row := range rows {
		stored[row.Key] = json.RawMessage(row.Value)
	}
	if len(stored) > 0 {
		b, _ := json.Marshal(stored)
		var overlay UserSettings = st
		if err := json.Unmarshal(b, &overlay); err == nil {
			st = overlay
		} else {
			s.log.Warn("ignoring corrupt user settings", "err", err)
		}
	}
	return st, nil
}

// userClock returns the user's location and day start hour.
func (s *Server) userClock(ctx context.Context, q *userdb.Queries) (*time.Location, int, UserSettings, error) {
	st, err := s.loadUserSettings(ctx, q)
	if err != nil {
		return nil, 0, st, err
	}
	loc, err := time.LoadLocation(st.Timezone)
	if err != nil {
		loc = time.UTC
	}
	return loc, st.DayStartsAtHour, st, nil
}

func (s *Server) settingsResponse(st UserSettings) SettingsResponse {
	return SettingsResponse{UserSettings: st, SrsIntervals: s.appSettings().SrsIntervals}
}

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	st, err := s.loadUserSettings(r.Context(), rc.udb.Q)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, s.settingsResponse(st))
	return nil
}

func oneOf(field, v string, allowed ...string) error {
	for _, a := range allowed {
		if v == a {
			return nil
		}
	}
	return errField(field, "geçersiz değer: "+strings.Join(allowed, ", ")+" olmalı")
}

func (s *Server) handlePatchSettings(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	var in SettingsPatch
	if err := decodeJSON(w, r, &in); err != nil {
		return err
	}
	set := map[string]any{}
	if in.DailyGoal != nil {
		if *in.DailyGoal < 1 || *in.DailyGoal > 1000 {
			return errField("daily_goal", "1 ile 1000 arasında olmalı")
		}
		set["daily_goal"] = *in.DailyGoal
	}
	if in.Timezone != nil {
		if _, err := time.LoadLocation(*in.Timezone); err != nil || *in.Timezone == "" || *in.Timezone == "Local" {
			return errField("timezone", "geçersiz saat dilimi")
		}
		set["timezone"] = *in.Timezone
	}
	if in.DayStartsAtHour != nil {
		if *in.DayStartsAtHour < 0 || *in.DayStartsAtHour > 23 {
			return errField("day_starts_at_hour", "0 ile 23 arasında olmalı")
		}
		set["day_starts_at_hour"] = *in.DayStartsAtHour
	}
	checks := []struct {
		key     string
		v       *string
		allowed []string
	}{
		{"theme", in.Theme, []string{"system", "dark", "light", "oled"}},
		{"density", in.Density, []string{"compact", "balanced", "spacious"}},
		{"font", in.Font, []string{"geist", "inter", "sfpro", "serif"}},
		{"flip_style", in.FlipStyle, []string{"flip", "fade", "slide"}},
		{"vd", in.VisualDirection, []string{"minimal", "glass", "character"}},
	}
	for _, c := range checks {
		if c.v == nil {
			continue
		}
		if err := oneOf(c.key, *c.v, c.allowed...); err != nil {
			return err
		}
		set[c.key] = *c.v
	}
	if in.Accent != nil {
		if !hexColor.MatchString(*in.Accent) {
			return errField("accent", "#RRGGBB biçiminde olmalı")
		}
		set["accent"] = strings.ToUpper(*in.Accent)
	}
	if in.Onboarded != nil {
		set["onboarded"] = *in.Onboarded
	}

	tx, err := rc.udb.DB.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	q := rc.udb.Q.WithTx(tx)
	for k, v := range set {
		b, _ := json.Marshal(v)
		if err := q.UpsertSetting(r.Context(), userdb.UpsertSettingParams{Key: k, Value: string(b)}); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return s.handleGetSettings(w, r, rc)
}

func (s *Server) audit(ctx context.Context, q *maindb.Queries, rc *reqCtx, action, target, detail string) {
	var actor *int64
	if rc != nil {
		actor = &rc.user.ID
	}
	if err := q.InsertAudit(ctx, maindb.InsertAuditParams{
		ActorID: nullInt64Ptr(actor), Action: action, Target: target, Detail: detail, At: time.Now().UnixMilli(),
	}); err != nil {
		s.log.Warn("audit write failed", "action", action, "err", err)
	}
}

package api

import "encoding/json"

// Wire types shared with the web client (generated into web/src/api/types.gen.ts by tygo).
// Internal integer ids never appear here; every reference is a uid.

// UserDTO is a user as seen by the client.
type UserDTO struct {
	UID                string `json:"uid"`
	Email              string `json:"email"`
	Name               string `json:"name"`
	Role               string `json:"role"`
	Status             string `json:"status"`
	MustChangePassword bool   `json:"must_change_password"`
	CreatedAt          int64  `json:"created_at"`
	LastLoginAt        *int64 `json:"last_login_at" tstype:"number | null"`
}

// MeResponse is returned by GET /me and POST /auth/login.
type MeResponse struct {
	User UserDTO `json:"user"`
}

// LoginRequest is the body of POST /auth/login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// ChangePasswordRequest is the body of PATCH /me/password.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// UserSettings are per-user preferences stored in the user's database.
type UserSettings struct {
	DailyGoal       int    `json:"daily_goal"`
	Timezone        string `json:"timezone"`
	DayStartsAtHour int    `json:"day_starts_at_hour"`
	Theme           string `json:"theme"`      // system | dark | light | oled
	Accent          string `json:"accent"`     // #RRGGBB
	Density         string `json:"density"`    // compact | balanced | spacious
	Font            string `json:"font"`       // geist | inter | sfpro | serif
	FlipStyle       string `json:"flip_style"` // flip | fade | slide
	VisualDirection string `json:"vd"`         // minimal | glass | character
	Onboarded       bool   `json:"onboarded"`
}

// SettingsResponse is returned by GET/PATCH /settings.
type SettingsResponse struct {
	UserSettings `tstype:",extends"`
	SrsIntervals []int `json:"srs_intervals"` // read-only, from global settings
}

// SettingsPatch is the body of PATCH /settings; omitted fields are unchanged.
type SettingsPatch struct {
	DailyGoal       *int    `json:"daily_goal,omitempty" tstype:",optional"`
	Timezone        *string `json:"timezone,omitempty" tstype:",optional"`
	DayStartsAtHour *int    `json:"day_starts_at_hour,omitempty" tstype:",optional"`
	Theme           *string `json:"theme,omitempty" tstype:",optional"`
	Accent          *string `json:"accent,omitempty" tstype:",optional"`
	Density         *string `json:"density,omitempty" tstype:",optional"`
	Font            *string `json:"font,omitempty" tstype:",optional"`
	FlipStyle       *string `json:"flip_style,omitempty" tstype:",optional"`
	VisualDirection *string `json:"vd,omitempty" tstype:",optional"`
	Onboarded       *bool   `json:"onboarded,omitempty" tstype:",optional"`
}

// DeckDTO is a deck with its live counters.
type DeckDTO struct {
	UID           string `json:"uid"`
	Name          string `json:"name"`
	Category      string `json:"category"` // category uid, "" for none
	Color         string `json:"color"`
	Icon          string `json:"icon"`
	CardCount     int64  `json:"card_count"`
	DueCount      int64  `json:"due_count"`
	LearnedCount  int64  `json:"learned_count"`
	LastStudiedAt *int64 `json:"last_studied_at" tstype:"number | null"`
	CreatedAt     int64  `json:"created_at"`
	UpdatedAt     int64  `json:"updated_at"`
}

// DeckListResponse is returned by GET /decks.
type DeckListResponse struct {
	Decks []DeckDTO `json:"decks"`
}

// DeckInput is the body of POST /decks. UID may be client-generated (idempotent create).
type DeckInput struct {
	UID      *string `json:"uid,omitempty" tstype:",optional"`
	Name     string  `json:"name"`
	Category string  `json:"category"`
	Color    string  `json:"color"`
	Icon     string  `json:"icon"`
}

// DeckPatch is the body of PATCH /decks/{uid}.
type DeckPatch struct {
	Name     *string `json:"name,omitempty" tstype:",optional"`
	Category *string `json:"category,omitempty" tstype:",optional"`
	Color    *string `json:"color,omitempty" tstype:",optional"`
	Icon     *string `json:"icon,omitempty" tstype:",optional"`
}

// CategoryDTO is one of the user's deck categories. Decks refer to it by uid (DeckDTO.Category).
type CategoryDTO struct {
	UID       string `json:"uid"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	DeckCount int64  `json:"deck_count"`
}

// CategoryListResponse is returned by GET /categories, in the user's order.
type CategoryListResponse struct {
	Categories []CategoryDTO `json:"categories"`
}

// CategoryInput is the body of POST /categories. Color defaults to the next palette color.
type CategoryInput struct {
	UID   *string `json:"uid,omitempty" tstype:",optional"`
	Name  string  `json:"name"`
	Color *string `json:"color,omitempty" tstype:",optional"`
}

// CategoryPatch is the body of PATCH /categories/{uid}.
type CategoryPatch struct {
	Name  *string `json:"name,omitempty" tstype:",optional"`
	Color *string `json:"color,omitempty" tstype:",optional"`
}

// CardDTO is a card with its scheduling state.
type CardDTO struct {
	UID            string          `json:"uid"`
	DeckUID        string          `json:"deck_uid"`
	Type           string          `json:"type"` // word | audio | image | quran
	Front          string          `json:"front"`
	Back           string          `json:"back"`
	Fields         json.RawMessage `json:"fields" tstype:"CardFields"`
	Level          int64           `json:"level"`
	DueAt          int64           `json:"due_at"`
	Reviews        int64           `json:"reviews"`
	Lapses         int64           `json:"lapses"`
	LastReviewedAt *int64          `json:"last_reviewed_at" tstype:"number | null"`
	CreatedAt      int64           `json:"created_at"`
	UpdatedAt      int64           `json:"updated_at"`
}

// CardFields holds the type-specific card fields. Only the keys relevant to the card type are kept.
type CardFields struct {
	// word
	IPA       string `json:"ipa,omitempty" tstype:",optional"`
	POS       string `json:"pos,omitempty" tstype:",optional"`
	Example   string `json:"example,omitempty" tstype:",optional"`
	ExampleTr string `json:"example_tr,omitempty" tstype:",optional"` // translation of the example
	Synonyms  string `json:"synonyms,omitempty" tstype:",optional"`
	Lang      string `json:"lang,omitempty" tstype:",optional"`
	// audio + image
	MediaUID string `json:"media_uid,omitempty" tstype:",optional"`
	// audio
	Duration float64 `json:"duration,omitempty" tstype:",optional"`
	// image
	Extra string `json:"extra,omitempty" tstype:",optional"`
	// quran
	Sure     string `json:"sure,omitempty" tstype:",optional"`
	Ayah     string `json:"ayah,omitempty" tstype:",optional"`
	Arabic   string `json:"arabic,omitempty" tstype:",optional"`
	Translit string `json:"translit,omitempty" tstype:",optional"`
	Meal     string `json:"meal,omitempty" tstype:",optional"`
	Tefsir   string `json:"tefsir,omitempty" tstype:",optional"`
	Reciter  string `json:"reciter,omitempty" tstype:",optional"`
}

// CardInput is the body of POST /cards. UID may be client-generated (idempotent create).
type CardInput struct {
	UID     *string    `json:"uid,omitempty" tstype:",optional"`
	DeckUID string     `json:"deck_uid"`
	Type    string     `json:"type"`
	Front   string     `json:"front"`
	Back    string     `json:"back"`
	Fields  CardFields `json:"fields"`
}

// CardPatch is the body of PATCH /cards/{uid}. Fields, when present, replaces all fields.
type CardPatch struct {
	DeckUID *string     `json:"deck_uid,omitempty" tstype:",optional"`
	Front   *string     `json:"front,omitempty" tstype:",optional"`
	Back    *string     `json:"back,omitempty" tstype:",optional"`
	Fields  *CardFields `json:"fields,omitempty" tstype:",optional"`
}

// CardListResponse is returned by GET /cards. NextCursor is empty on the last page.
type CardListResponse struct {
	Cards      []CardDTO `json:"cards"`
	NextCursor string    `json:"next_cursor"`
}

// StudyQueueResponse is returned by GET /study/queue.
type StudyQueueResponse struct {
	Cards    []CardDTO `json:"cards"`
	TotalDue int64     `json:"total_due"`
}

// ReviewInput is the body of POST /reviews. UID is generated by the client so retries are safe.
type ReviewInput struct {
	UID        string `json:"uid"`
	CardUID    string `json:"card_uid"`
	Correct    bool   `json:"correct"`
	ClientTS   *int64 `json:"client_ts,omitempty" tstype:",optional"`
	DurationMs int64  `json:"duration_ms"`
}

// ReviewResult is returned by POST /reviews.
type ReviewResult struct {
	UID         string `json:"uid"`
	CardUID     string `json:"card_uid"`
	LevelBefore int64  `json:"level_before"`
	LevelAfter  int64  `json:"level_after"`
	DueAt       int64  `json:"due_at"`
	Duplicate   bool   `json:"duplicate"`
}

// ReviewBatchRequest is the body of POST /reviews/batch (answers queued offline).
type ReviewBatchRequest struct {
	Reviews []ReviewInput `json:"reviews"`
}

// ReviewBatchItem is the outcome of one queued answer, in request order.
type ReviewBatchItem struct {
	ReviewResult `tstype:",extends"`
	Status       string `json:"status"` // applied | duplicate | stale | rejected
	ErrorCode    string `json:"error_code,omitempty" tstype:",optional"`
}

// ReviewBatchResponse is returned by POST /reviews/batch.
type ReviewBatchResponse struct {
	Results []ReviewBatchItem `json:"results"`
}

// StatsSummary is returned by GET /stats/summary.
type StatsSummary struct {
	Streak        int     `json:"streak"`
	BestStreak    int     `json:"best_streak"`
	RecallRate    float64 `json:"recall_rate"` // 0..1 over the last 30 days; 0 when no reviews
	ReviewedToday int64   `json:"reviewed_today"`
	DailyGoal     int     `json:"daily_goal"`
	DueNow        int64   `json:"due_now"`
	TotalCards    int64   `json:"total_cards"`
	LearnedCards  int64   `json:"learned_cards"`
	ReviewsLast7d int64   `json:"reviews_last_7d"`
	Today         string  `json:"today"` // study day YYYY-MM-DD
}

// DayCount is one day of activity.
type DayCount struct {
	Day     string `json:"day"`
	Count   int64  `json:"count"`
	Correct int64  `json:"correct"`
}

// DaysResponse is returned by GET /stats/heatmap and /stats/activity (dense, oldest first).
type DaysResponse struct {
	Days []DayCount `json:"days"`
}

// LevelCount is the number of cards at one SRS level.
type LevelCount struct {
	Level        int   `json:"level"`
	IntervalDays int   `json:"interval_days"`
	Count        int64 `json:"count"`
}

// DistributionResponse is returned by GET /stats/distribution.
type DistributionResponse struct {
	Levels []LevelCount `json:"levels"`
}

// MediaDTO describes an uploaded file.
type MediaDTO struct {
	UID  string `json:"uid"`
	Kind string `json:"kind"` // image | audio
	Mime string `json:"mime"`
	Size int64  `json:"size"`
	URL  string `json:"url"`
}

// AppSettings are global settings managed by admins.
type AppSettings struct {
	SrsIntervals     []int  `json:"srs_intervals"`
	DefaultDailyGoal int    `json:"default_daily_goal"`
	UploadMaxBytes   int64  `json:"upload_max_bytes"`
	AppName          string `json:"app_name"`
	AIEnabled        bool   `json:"ai_enabled"`
	AIDailyLimit     int    `json:"ai_daily_limit"` // generate requests per user per day
}

// AdminUserDTO is a user in the admin panel.
type AdminUserDTO struct {
	UserDTO `tstype:",extends"`
	DBBytes int64 `json:"db_bytes"`
}

// AdminUserListResponse is returned by GET /admin/users.
type AdminUserListResponse struct {
	Users []AdminUserDTO `json:"users"`
}

// AdminUserCreate is the body of POST /admin/users.
type AdminUserCreate struct {
	Email              string `json:"email"`
	Name               string `json:"name"`
	Password           string `json:"password"`
	Role               string `json:"role"`
	MustChangePassword *bool  `json:"must_change_password,omitempty" tstype:",optional"` // default false
}

// AdminUserPatch is the body of PATCH /admin/users/{uid}.
type AdminUserPatch struct {
	Name     *string `json:"name,omitempty" tstype:",optional"`
	Role     *string `json:"role,omitempty" tstype:",optional"`
	Status   *string `json:"status,omitempty" tstype:",optional"`   // active | disabled
	Password *string `json:"password,omitempty" tstype:",optional"` // reset; user must change it at next login
}

// AdminStats is returned by GET /admin/stats.
type AdminStats struct {
	Users         int    `json:"users"`
	ActiveUsers   int    `json:"active_users"`
	Admins        int    `json:"admins"`
	TotalDBBytes  int64  `json:"total_db_bytes"`
	OpenDatabases int    `json:"open_databases"`
	AIConfigured  bool   `json:"ai_configured"` // ANTHROPIC_API_KEY is set
	AIModel       string `json:"ai_model"`
	AIRequests    int64  `json:"ai_requests_today"`
	AICards       int64  `json:"ai_cards_today"`
	AITokens      int64  `json:"ai_tokens_today"`
}

// AIStatus is returned by GET /ai/status.
type AIStatus struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty" tstype:",optional"` // not_configured | disabled | limit
	Limit     int    `json:"daily_limit"`
	Used      int64  `json:"used_today"`
	Remaining int64  `json:"remaining_today"`
}

// AIGenerateRequest is the body of POST /ai/generate.
type AIGenerateRequest struct {
	Mode       string  `json:"mode"` // word | list
	Input      string  `json:"input"`
	SourceLang string  `json:"source_lang"`
	TargetLang string  `json:"target_lang"`
	Count      int     `json:"count,omitempty" tstype:",optional"`    // list mode, 1–30 (default 10)
	DeckUID    *string `json:"deck_uid,omitempty" tstype:",optional"` // list mode: skip words the deck has
}

// AICard is a generated word card, ready for POST /cards.
type AICard struct {
	Front  string     `json:"front"`
	Back   string     `json:"back"`
	Fields CardFields `json:"fields"`
	Exists bool       `json:"exists"` // a card with this front is already in the user's decks
}

// AIGenerateResponse is returned by POST /ai/generate.
type AIGenerateResponse struct {
	Cards     []AICard `json:"cards"`
	Remaining int64    `json:"remaining_today"`
}

package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"

	"github.com/newanki/server/internal/accounts"
	"github.com/newanki/server/internal/ai"
	"github.com/newanki/server/internal/config"
	"github.com/newanki/server/internal/db"
	"github.com/newanki/server/internal/db/maindb"
)

type env struct {
	t     *testing.T
	ts    *httptest.Server
	users *db.UserDBManager
	acc   *accounts.Service
}

func newEnv(t *testing.T) *env {
	t.Helper()
	return newEnvAI(t, nil)
}

// newEnvAI is newEnv with an AI generator (nil: AI not configured).
func newEnvAI(t *testing.T, gen ai.Generator) *env {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	sqlDB, err := db.Open(ctx, filepath.Join(dir, "main.db"), 4)
	if err != nil {
		t.Fatal(err)
	}
	migs, _ := db.LoadMigrations(maindb.Migrations, "migrations")
	if err := db.Migrate(ctx, sqlDB, migs); err != nil {
		t.Fatal(err)
	}
	users, err := db.NewUserDBManager(filepath.Join(dir, "users"), db.ManagerOptions{Logger: log})
	if err != nil {
		t.Fatal(err)
	}
	acc := &accounts.Service{DB: sqlDB, Q: maindb.New(sqlDB), Users: users, Log: log}
	if created, err := acc.EnsureBootstrapAdmin(ctx, "admin@newanki.local", "Admin123!"); err != nil || !created {
		t.Fatalf("bootstrap: %v %v", created, err)
	}
	if created, _ := acc.EnsureBootstrapAdmin(ctx, "admin@newanki.local", "Other123!"); created {
		t.Fatal("bootstrap must not run twice")
	}
	srv, err := New(ctx, Deps{Config: config.Config{}, MainDB: sqlDB, Users: users, Accounts: acc, Logger: log, AI: gen})
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(func() { ts.Close(); users.Close(); sqlDB.Close() })
	return &env{t: t, ts: ts, users: users, acc: acc}
}

type client struct {
	e *env
	c *http.Client
}

func (e *env) client() *client {
	jar, _ := cookiejar.New(nil)
	return &client{e: e, c: &http.Client{Jar: jar}}
}

func (c *client) do(method, path string, body any, out any) int {
	c.e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.e.ts.URL+"/api/v1"+path, rd)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "newanki")
	resp, err := c.c.Do(req)
	if err != nil {
		c.e.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			c.e.t.Fatalf("%s %s: decode %q: %v", method, path, raw, err)
		}
	}
	return resp.StatusCode
}

func (c *client) must(want int, method, path string, body any, out any) {
	c.e.t.Helper()
	var raw json.RawMessage
	got := c.do(method, path, body, &raw)
	if got != want {
		c.e.t.Fatalf("%s %s = %d, want %d: %s", method, path, got, want, raw)
	}
	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			c.e.t.Fatal(err)
		}
	}
}

func TestFullFlow(t *testing.T) {
	e := newEnv(t)
	admin := e.client()

	// Bootstrap admin can work right away; changing the default password is optional.
	admin.must(401, "POST", "/auth/login", LoginRequest{Email: "admin@newanki.local", Password: "wrong"}, nil)
	var me MeResponse
	admin.must(200, "POST", "/auth/login", LoginRequest{Email: "ADMIN@newanki.local", Password: "Admin123!"}, &me)
	if me.User.MustChangePassword || me.User.Role != "admin" {
		t.Fatalf("bootstrap admin = %+v", me.User)
	}
	admin.must(200, "GET", "/admin/users", nil, nil)
	admin.must(400, "PATCH", "/me/password", ChangePasswordRequest{CurrentPassword: "Admin123!", NewPassword: "Admin123!"}, nil)
	admin.must(204, "PATCH", "/me/password", ChangePasswordRequest{CurrentPassword: "Admin123!", NewPassword: "Yeni-Sifre-2026"}, nil)

	// A user created with "must change password" is blocked until they do.
	tr := true
	admin.must(201, "POST", "/admin/users", AdminUserCreate{Email: "gecici@example.com", Name: "Geçici", Password: "Parola123", Role: "user", MustChangePassword: &tr}, nil)
	tmp := e.client()
	tmp.must(200, "POST", "/auth/login", LoginRequest{Email: "gecici@example.com", Password: "Parola123"}, &me)
	if !me.User.MustChangePassword {
		t.Fatalf("temp user = %+v", me.User)
	}
	var errBody ErrorBody
	tmp.must(403, "GET", "/decks", nil, &errBody)
	if errBody.Error.Code != "password_change_required" {
		t.Fatalf("code = %q", errBody.Error.Code)
	}
	tmp.must(204, "PATCH", "/me/password", ChangePasswordRequest{CurrentPassword: "Parola123", NewPassword: "Yeni-Parola-1"}, nil)
	tmp.must(200, "GET", "/me", nil, &me)
	if me.User.MustChangePassword {
		t.Fatal("must_change_password still set")
	}
	admin.must(200, "GET", "/me", nil, &me)

	// CSRF header is required on writes.
	req, _ := http.NewRequest("POST", e.ts.URL+"/api/v1/decks", bytes.NewReader([]byte(`{}`)))
	resp, _ := admin.c.Do(req)
	if resp.StatusCode != 403 {
		t.Fatalf("missing X-Requested-With = %d, want 403", resp.StatusCode)
	}
	resp.Body.Close()

	// Admin creates two users.
	var u1, u2 AdminUserDTO
	f := false
	admin.must(201, "POST", "/admin/users", AdminUserCreate{Email: "ayse@example.com", Name: "Ayşe", Password: "Parola123", Role: "user", MustChangePassword: &f}, &u1)
	admin.must(201, "POST", "/admin/users", AdminUserCreate{Email: "mehmet@example.com", Name: "Mehmet", Password: "Parola123", Role: "user", MustChangePassword: &f}, &u2)
	admin.must(409, "POST", "/admin/users", AdminUserCreate{Email: "ayse@example.com", Name: "X", Password: "Parola123"}, nil)
	admin.must(400, "POST", "/admin/users", AdminUserCreate{Email: "bad", Name: "X", Password: "Parola123"}, nil)
	if _, err := os.Stat(e.users.Path(uuid.MustParse(u1.UID))); err != nil {
		t.Fatalf("user db file missing: %v", err)
	}
	admin.must(400, "PATCH", "/admin/users/"+me.User.UID, AdminUserPatch{Role: ptr("user")}, nil) // self-demote blocked

	// User 1: deck → card → queue → review.
	c1 := e.client()
	c1.must(200, "POST", "/auth/login", LoginRequest{Email: "ayse@example.com", Password: "Parola123"}, nil)
	c1.must(403, "GET", "/admin/users", nil, nil)

	deckUID := uuid.Must(uuid.NewV7()).String()
	var deck DeckDTO
	c1.must(201, "POST", "/decks", DeckInput{UID: &deckUID, Name: "English B2", Color: "#60a5fa"}, &deck)
	c1.must(200, "POST", "/decks", DeckInput{UID: &deckUID, Name: "English B2", Color: "#60A5FA"}, nil) // idempotent
	if deck.Color != "#60A5FA" {
		t.Fatalf("color = %s", deck.Color)
	}
	c1.must(400, "POST", "/cards", CardInput{DeckUID: deckUID, Type: "word", Front: "x"}, nil) // back missing
	var card CardDTO
	c1.must(201, "POST", "/cards", CardInput{DeckUID: deckUID, Type: "word", Front: "serendipity", Back: "tesadüfi keşif",
		Fields: CardFields{IPA: "/ˌsɛrənˈdɪpɪti/", Example: "A serendipitous encounter", Meal: "dropped for word"}}, &card)
	if card.Level != 0 || card.DeckUID != deckUID {
		t.Fatalf("card = %+v", card)
	}
	var fields map[string]any
	_ = json.Unmarshal(card.Fields, &fields)
	if _, ok := fields["meal"]; ok {
		t.Fatal("fields of other types must be dropped")
	}
	var quran CardDTO
	c1.must(201, "POST", "/cards", CardInput{DeckUID: deckUID, Type: "quran", Fields: CardFields{Sure: "Bakara", Ayah: "1–2", Meal: "İşte o Kitap"}}, &quran)
	if quran.Front != "Bakara · 1–2" || quran.Back != "İşte o Kitap" {
		t.Fatalf("quran derived front/back = %q / %q", quran.Front, quran.Back)
	}

	var queue StudyQueueResponse
	c1.must(200, "GET", "/study/queue?deck_uid="+deckUID, nil, &queue)
	if queue.TotalDue != 2 || len(queue.Cards) != 2 {
		t.Fatalf("queue = %+v", queue)
	}

	reviewUID := uuid.Must(uuid.NewV7()).String()
	var res ReviewResult
	c1.must(201, "POST", "/reviews", ReviewInput{UID: reviewUID, CardUID: card.UID, Correct: true}, &res)
	if res.LevelBefore != 0 || res.LevelAfter != 1 || res.Duplicate {
		t.Fatalf("review = %+v", res)
	}
	c1.must(200, "POST", "/reviews", ReviewInput{UID: reviewUID, CardUID: card.UID, Correct: true}, &res)
	if !res.Duplicate || res.LevelAfter != 1 {
		t.Fatalf("duplicate review = %+v", res)
	}
	c1.must(201, "POST", "/reviews", ReviewInput{UID: uuid.NewString(), CardUID: quran.UID, Correct: false}, &res)
	if res.LevelAfter != 0 {
		t.Fatalf("wrong at level 0 → %d", res.LevelAfter)
	}

	c1.must(200, "GET", "/study/queue", nil, &queue)
	if queue.TotalDue != 1 { // serendipity moved to tomorrow, quran stays due now
		t.Fatalf("queue after reviews = %d", queue.TotalDue)
	}

	var sum StatsSummary
	c1.must(200, "GET", "/stats/summary", nil, &sum)
	if sum.ReviewedToday != 2 || sum.Streak != 1 || sum.RecallRate != 0.5 || sum.TotalCards != 2 || sum.DailyGoal != 40 {
		t.Fatalf("summary = %+v", sum)
	}
	var days DaysResponse
	c1.must(200, "GET", "/stats/activity", nil, &days)
	if len(days.Days) != 14 || days.Days[13].Count != 2 {
		t.Fatalf("activity = %+v", days.Days[len(days.Days)-1])
	}
	c1.must(200, "GET", "/stats/heatmap?range=1y", nil, &days)
	if len(days.Days) != 364 {
		t.Fatalf("heatmap days = %d", len(days.Days))
	}
	var dist DistributionResponse
	c1.must(200, "GET", "/stats/distribution", nil, &dist)
	if len(dist.Levels) != 10 || dist.Levels[0].Count != 1 || dist.Levels[1].Count != 1 {
		t.Fatalf("distribution = %+v", dist.Levels[:2])
	}

	// Search (FTS, diacritics-insensitive) and paging.
	var list CardListResponse
	c1.must(200, "GET", "/cards?q=tesadufi", nil, &list)
	if len(list.Cards) != 1 || list.Cards[0].UID != card.UID {
		t.Fatalf("search = %+v", list.Cards)
	}
	c1.must(201, "POST", "/cards", CardInput{DeckUID: deckUID, Type: "word", Front: "resilient", Back: "dayanıklı"}, nil)
	c1.must(200, "GET", "/cards?q=dayanikli", nil, &list)
	if len(list.Cards) != 1 || list.Cards[0].Back != "dayanıklı" {
		t.Fatalf("Turkish ı folding search = %+v", list.Cards)
	}
	c1.must(200, "GET", "/cards?q=DAYANIKLI", nil, &list)
	if len(list.Cards) != 1 {
		t.Fatalf("uppercase Turkish search = %d", len(list.Cards))
	}
	c1.must(200, "GET", "/cards?q=serendip", nil, &list)
	if len(list.Cards) != 1 {
		t.Fatalf("prefix search = %d", len(list.Cards))
	}
	c1.must(200, "GET", "/cards?type=quran", nil, &list)
	if len(list.Cards) != 1 {
		t.Fatalf("type filter = %d", len(list.Cards))
	}

	// Settings.
	var st SettingsResponse
	c1.must(200, "PATCH", "/settings", SettingsPatch{Theme: ptr("oled"), DailyGoal: ptrInt(60), Onboarded: ptrBool(true)}, &st)
	if st.Theme != "oled" || st.DailyGoal != 60 || !st.Onboarded || len(st.SrsIntervals) != 10 {
		t.Fatalf("settings = %+v", st)
	}
	c1.must(400, "PATCH", "/settings", SettingsPatch{Timezone: ptr("Mars/Olympus")}, nil)
	c1.must(400, "PATCH", "/settings", SettingsPatch{Accent: ptr("red")}, nil)

	// Media upload (PNG) and use in an image card.
	png := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89")
	var m MediaDTO
	if code := c1.upload("image.png", "image/png", png, &m); code != 201 || m.Kind != "image" {
		t.Fatalf("upload = %d %+v", code, m)
	}
	c1.must(201, "POST", "/cards", CardInput{DeckUID: deckUID, Type: "image", Front: "Bu ne?", Back: "Mitokondri", Fields: CardFields{MediaUID: m.UID}}, nil)
	c1.must(400, "POST", "/cards", CardInput{DeckUID: deckUID, Type: "image", Front: "Bu ne?", Back: "X", Fields: CardFields{MediaUID: uuid.NewString()}}, nil)
	if code := c1.upload("x.html", "text/html", []byte("<html><script>alert(1)</script>"), nil); code != 400 {
		t.Fatalf("html upload = %d, want 400", code)
	}

	// Isolation: user 2 sees nothing of user 1.
	c2 := e.client()
	c2.must(200, "POST", "/auth/login", LoginRequest{Email: "mehmet@example.com", Password: "Parola123"}, nil)
	var decks DeckListResponse
	c2.must(200, "GET", "/decks", nil, &decks)
	if len(decks.Decks) != 0 {
		t.Fatalf("user 2 sees %d decks", len(decks.Decks))
	}
	c2.must(404, "GET", "/cards/"+card.UID, nil, nil)
	c2.must(404, "GET", "/media/"+m.UID, nil, nil)
	c2.must(404, "POST", "/reviews", ReviewInput{UID: uuid.NewString(), CardUID: card.UID, Correct: true}, nil)

	// Deck delete hides its cards.
	c1.must(204, "DELETE", "/decks/"+deckUID, nil, nil)
	c1.must(404, "GET", "/cards/"+card.UID, nil, nil)
	c1.must(400, "GET", "/decks/not-a-uuid", nil, nil)

	// Disabling a user kills their sessions; deleting removes the file.
	admin.must(200, "PATCH", "/admin/users/"+u2.UID, AdminUserPatch{Status: ptr("disabled")}, nil)
	c2.must(401, "GET", "/me", nil, nil)
	admin.must(204, "DELETE", "/admin/users/"+u1.UID, nil, nil)
	if _, err := os.Stat(e.users.Path(uuid.MustParse(u1.UID))); !os.IsNotExist(err) {
		t.Fatalf("user db file still exists after delete: %v", err)
	}
	c1.must(401, "GET", "/me", nil, nil)

	// Global settings.
	var app AppSettings
	admin.must(400, "PUT", "/admin/settings", AppSettings{SrsIntervals: []int{0, 5, 2}, DefaultDailyGoal: 40, UploadMaxBytes: 5 << 20, AppName: "X"}, nil)
	admin.must(200, "PUT", "/admin/settings", AppSettings{SrsIntervals: []int{0, 1, 3, 7}, DefaultDailyGoal: 30, UploadMaxBytes: 5 << 20, AppName: "NewAnki"}, &app)
	if len(app.SrsIntervals) != 4 {
		t.Fatalf("app settings = %+v", app)
	}
	var stats AdminStats
	admin.must(200, "GET", "/admin/stats", nil, &stats)
	if stats.Users != 3 || stats.Admins != 1 { // admin, gecici and one remaining user
		t.Fatalf("admin stats = %+v", stats)
	}
}

func (c *client) upload(name, mime string, data []byte, out any) int {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	h := make(map[string][]string)
	h["Content-Disposition"] = []string{`form-data; name="file"; filename="` + name + `"`}
	h["Content-Type"] = []string{mime}
	part, _ := mw.CreatePart(h)
	part.Write(data)
	mw.Close()
	req, _ := http.NewRequest("POST", c.e.ts.URL+"/api/v1/media", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("X-Requested-With", "newanki")
	resp, err := c.c.Do(req)
	if err != nil {
		c.e.t.Fatal(err)
	}
	defer resp.Body.Close()
	if out != nil {
		json.NewDecoder(resp.Body).Decode(out)
	}
	return resp.StatusCode
}

func ptr(s string) *string { return &s }
func ptrInt(i int) *int    { return &i }
func ptrBool(b bool) *bool { return &b }

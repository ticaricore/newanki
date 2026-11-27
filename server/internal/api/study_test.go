package api

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

// signedInUser creates a regular user through the admin API and returns a signed-in client.
func signedInUser(t *testing.T, e *env) *client {
	t.Helper()
	admin := e.client()
	admin.must(200, "POST", "/auth/login", LoginRequest{Email: "admin@newanki.local", Password: "Admin123!"}, nil)
	admin.must(204, "PATCH", "/me/password", ChangePasswordRequest{CurrentPassword: "Admin123!", NewPassword: "Yeni-Sifre-2026"}, nil)
	f := false
	admin.must(201, "POST", "/admin/users", AdminUserCreate{Email: "ayse@example.com", Name: "Ayşe", Password: "Parola123", Role: "user", MustChangePassword: &f}, nil)
	c := e.client()
	c.must(200, "POST", "/auth/login", LoginRequest{Email: "ayse@example.com", Password: "Parola123"}, nil)
	return c
}

func TestReviewBatch(t *testing.T) {
	e := newEnv(t)
	c := signedInUser(t, e)

	var deck DeckDTO
	c.must(201, "POST", "/decks", DeckInput{Name: "Offline", Color: "#34D399"}, &deck)
	var a, b CardDTO
	c.must(201, "POST", "/cards", CardInput{DeckUID: deck.UID, Type: "word", Front: "a", Back: "A"}, &a)
	c.must(201, "POST", "/cards", CardInput{DeckUID: deck.UID, Type: "word", Front: "b", Back: "B"}, &b)

	c.must(400, "POST", "/reviews/batch", ReviewBatchRequest{}, nil)

	now := time.Now()
	ms := func(d time.Duration) *int64 { v := now.Add(d).UnixMilli(); return &v }
	r1 := uuid.Must(uuid.NewV7()).String()
	r2 := uuid.Must(uuid.NewV7()).String()

	// Sent out of order: the server applies answers oldest first.
	var out ReviewBatchResponse
	c.must(200, "POST", "/reviews/batch", ReviewBatchRequest{Reviews: []ReviewInput{
		{UID: r2, CardUID: a.UID, Correct: true, ClientTS: ms(-1 * time.Hour)},
		{UID: r1, CardUID: a.UID, Correct: true, ClientTS: ms(-2 * time.Hour)},
		{UID: uuid.NewString(), CardUID: uuid.NewString(), Correct: true},
		{UID: "not-a-uuid", CardUID: a.UID, Correct: true},
	}}, &out)
	if len(out.Results) != 4 {
		t.Fatalf("results = %+v", out.Results)
	}
	if got := out.Results[1]; got.Status != reviewApplied || got.UID != r1 || got.LevelBefore != 0 || got.LevelAfter != 1 {
		t.Fatalf("older answer = %+v", got)
	}
	if got := out.Results[0]; got.Status != reviewApplied || got.LevelBefore != 1 || got.LevelAfter != 2 {
		t.Fatalf("newer answer = %+v", got)
	}
	if got := out.Results[2]; got.Status != reviewRejected || got.ErrorCode != "not_found" {
		t.Fatalf("unknown card = %+v", got)
	}
	if got := out.Results[3]; got.Status != reviewRejected || got.ErrorCode != "validation" {
		t.Fatalf("bad uid = %+v", got)
	}

	// Resending the same batch (lost response) changes nothing.
	c.must(200, "POST", "/reviews/batch", ReviewBatchRequest{Reviews: []ReviewInput{
		{UID: r1, CardUID: a.UID, Correct: true, ClientTS: ms(-2 * time.Hour)},
	}}, &out)
	if got := out.Results[0]; got.Status != reviewDuplicate || got.LevelAfter != 1 {
		t.Fatalf("resent = %+v", got)
	}
	var card CardDTO
	c.must(200, "GET", "/cards/"+a.UID, nil, &card)
	if card.Level != 2 || card.Reviews != 2 || card.LastReviewedAt == nil || *card.LastReviewedAt != *ms(-1 * time.Hour) {
		t.Fatalf("card a = %+v", card)
	}

	// An old offline answer arriving after a newer online one is logged but does not move the card.
	c.must(201, "POST", "/reviews", ReviewInput{UID: uuid.NewString(), CardUID: b.UID, Correct: true}, nil)
	c.must(200, "POST", "/reviews/batch", ReviewBatchRequest{Reviews: []ReviewInput{
		{UID: uuid.NewString(), CardUID: b.UID, Correct: false, ClientTS: ms(-3 * time.Hour)},
	}}, &out)
	if got := out.Results[0]; got.Status != reviewStale || got.LevelAfter != 1 {
		t.Fatalf("stale = %+v", got)
	}
	c.must(200, "GET", "/cards/"+b.UID, nil, &card)
	if card.Level != 1 || card.Lapses != 0 {
		t.Fatalf("card b = %+v", card)
	}

	// Timestamps from the future are clamped to now.
	var res ReviewResult
	c.must(201, "POST", "/reviews", ReviewInput{UID: uuid.NewString(), CardUID: b.UID, Correct: false, ClientTS: ms(48 * time.Hour)}, &res)
	if res.LevelAfter != 0 || res.DueAt > time.Now().UnixMilli() {
		t.Fatalf("future client_ts = %+v", res)
	}

	// ahead_days returns upcoming cards for offline use; total_due still counts only what is due now.
	var q StudyQueueResponse
	c.must(200, "GET", "/study/queue", nil, &q)
	if len(q.Cards) != 1 || q.TotalDue != 1 {
		t.Fatalf("queue = %d cards, %d due", len(q.Cards), q.TotalDue)
	}
	c.must(200, "GET", "/study/queue?ahead_days=3", nil, &q)
	if len(q.Cards) != 2 || q.TotalDue != 1 {
		t.Fatalf("queue ahead = %d cards, %d due", len(q.Cards), q.TotalDue)
	}
	c.must(400, "GET", "/study/queue?ahead_days=8", nil, nil)
}

// Passwords set by an admin are final: no forced change on first login or after a reset.
func TestAdminSetPasswordIsFinal(t *testing.T) {
	e := newEnv(t)
	admin := e.client()
	admin.must(200, "POST", "/auth/login", LoginRequest{Email: "admin@newanki.local", Password: "Admin123!"}, nil)
	var u AdminUserDTO
	admin.must(201, "POST", "/admin/users", AdminUserCreate{Email: "ali@example.com", Name: "Ali", Password: "Parola123", Role: "user"}, &u)

	c := e.client()
	var me MeResponse
	c.must(200, "POST", "/auth/login", LoginRequest{Email: "ali@example.com", Password: "Parola123"}, &me)
	if me.User.MustChangePassword {
		t.Fatal("new user must not be forced to change the password")
	}
	c.must(200, "GET", "/decks", nil, nil)

	pw := "Baska-Parola-1"
	admin.must(200, "PATCH", "/admin/users/"+u.UID, AdminUserPatch{Password: &pw}, nil)
	c = e.client()
	c.must(200, "POST", "/auth/login", LoginRequest{Email: "ali@example.com", Password: pw}, &me)
	if me.User.MustChangePassword {
		t.Fatal("reset password must not force a change")
	}
}

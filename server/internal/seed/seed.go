// Package seed creates a demo user with the decks and cards from the design prototype (dev mode only).
package seed

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"math"
	"time"

	"github.com/google/uuid"

	"github.com/newanki/server/internal/accounts"
	"github.com/newanki/server/internal/db/userdb"
	"github.com/newanki/server/internal/srs"
)

// Demo account credentials (dev mode only).
const (
	DemoEmail    = "demo@newanki.local"
	DemoPassword = "Demo1234!"
)

type deck struct {
	key, name, category, color, icon string
}

var decks = []deck{
	{"eng-b2", "English B2 — Academic", "ingilizce", "#60A5FA", "textT"},
	{"de-a1", "Deutsch A1 — Grundwortschatz", "almanca", "#A78BFA", "textT"},
	{"quran", "Kurʼan — Bakara · 1–60", "kuran", "#34D399", "book"},
	{"bio", "Hücre Biyolojisi", "biyoloji", "#F472B6", "image"},
	{"tarih", "Osmanlı Tarihi · 1300–1453", "tarih", "#FCD34D", "textT"},
	{"felsefe", "Antik Felsefe", "felsefe", "#FB923C", "textT"},
}

type card struct {
	deck, typ, front, back string
	fields                 map[string]any
	level                  int
	dueToday               bool
}

var cards = []card{
	{"eng-b2", "word", "serendipity", "tesadüfi keşif; aramadığını bulma şansı",
		map[string]any{"ipa": "/ˌsɛrənˈdɪpɪti/", "pos": "noun", "lang": "en→tr", "example": "A serendipitous encounter at the library changed her career path."}, 4, true},
	{"eng-b2", "word", "ephemeral", "geçici, kısa ömürlü", map[string]any{"ipa": "/ɪˈfɛmərəl/", "pos": "adj", "lang": "en→tr"}, 2, true},
	{"de-a1", "word", "die Bäckerei", "fırın, ekmek dükkanı", map[string]any{"pos": "plural: die Bäckereien", "lang": "de→tr"}, 1, true},
	{"eng-b2", "word", "pertinent", "ilgili, konuyla alakalı", map[string]any{"ipa": "/ˈpɜːtɪnənt/", "pos": "adj", "lang": "en→tr"}, 3, false},
	{"eng-b2", "audio", "Ses kaydını dinleyin", "The ephemeral beauty of cherry blossoms reminded her of how fleeting moments can be.", map[string]any{"duration": 8}, 2, true},
	{"de-a1", "audio", "Was hörst du?", "Ich gehe morgens immer in die Bäckerei, um frisches Brot zu kaufen.", map[string]any{"duration": 6}, 1, true},
	{"bio", "image", "Bu organel ne?", "Mitokondri", map[string]any{"extra": "Hücrenin enerji üreten organeli. ATP sentezi yapar."}, 3, true},
	{"tarih", "image", "Bu binayı kim yaptırdı?", "Mimar Sinan · Süleymaniye · 1557", map[string]any{}, 2, false},
	{"quran", "quran", "", "", map[string]any{
		"sure":     "Bakara",
		"ayah":     "1–2",
		"arabic":   "الٓمٓ ۚ ذَٰلِكَ ٱلْكِتَـٰبُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًۭى لِّلْمُتَّقِينَ",
		"translit": "Elif, Lām, Mīm. Zālikel kitābu lā raybe fīh; hudel lil-muttaqīn.",
		"meal":     "Elif, Lâm, Mîm. İşte o Kitap; onda asla şüphe yoktur. O, müttakîler için bir hidayet rehberidir.",
		"tefsir":   "Bakara sûresinin ilk üç âyeti, Kurʼanʼın kendisine ve müttakîlerin niteliklerine giriş yapar.",
		"reciter":  "Mishary Rashid Alafasy",
	}, 5, true},
}

// EnsureDemo creates the demo user and their data once. It does nothing if the user exists.
func EnsureDemo(ctx context.Context, acc *accounts.Service, log *slog.Logger) error {
	if _, err := acc.Q.GetUserByEmail(ctx, DemoEmail); err == nil {
		return nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	u, err := acc.Create(ctx, accounts.CreateParams{Email: DemoEmail, Name: "Ahmet Yılmaz", Password: DemoPassword, Role: "user"})
	if err != nil {
		return err
	}
	uid, _ := uuid.Parse(u.Uid)
	udb, release, err := acc.Users.Acquire(ctx, uid)
	if err != nil {
		return err
	}
	defer release()

	tx, err := udb.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	q := udb.Q.WithTx(tx)

	loc, _ := time.LoadLocation("Europe/Istanbul")
	now := time.Now()
	nowMs := now.UnixMilli()
	sched := srs.New(nil)

	deckIDs := map[string]int64{}
	for _, d := range decks {
		row, err := q.CreateDeck(ctx, userdb.CreateDeckParams{
			Uid: newUID(), Name: d.name, Category: d.category, Color: d.color, Icon: d.icon, CreatedAt: nowMs, UpdatedAt: nowMs,
		})
		if err != nil {
			return err
		}
		deckIDs[d.key] = row.ID
	}

	var cardIDs []int64
	for _, c := range cards {
		front, back := c.front, c.back
		if c.typ == "quran" {
			front = c.fields["sure"].(string) + " · " + c.fields["ayah"].(string)
			back = c.fields["meal"].(string)
		}
		fb, _ := json.Marshal(c.fields)
		row, err := q.CreateCard(ctx, userdb.CreateCardParams{
			Uid: newUID(), DeckID: deckIDs[c.deck], Type: c.typ, Front: front, Back: back, Fields: string(fb),
			CreatedAt: nowMs, UpdatedAt: nowMs,
		})
		if err != nil {
			return err
		}
		due := nowMs
		if !c.dueToday {
			due = sched.DueAt(now, c.level, loc, 4).UnixMilli()
		}
		if err := q.CreateCardState(ctx, userdb.CreateCardStateParams{CardID: row.ID, Level: int64(c.level), DueAt: due}); err != nil {
			return err
		}
		cardIDs = append(cardIDs, row.ID)
	}

	// Synthetic review history for the last ~6 months so the dashboard and heatmap have data.
	for dayOff := 180; dayOff >= 1; dayOff-- {
		seedV := float64(dayOff) * 7.31
		v := math.Abs(math.Sin(seedV)+math.Cos(seedV*0.5)) * 0.5
		if dayOff < 50 {
			v *= 1.6
		}
		if dayOff > 5 && math.Sin(seedV*1.8) > 0.6 {
			continue // rest day
		}
		n := int(math.Min(1, v) * 30)
		if dayOff <= 5 && n < 8 {
			n = 8 // keep a live streak in the demo
		}
		at := now.AddDate(0, 0, -dayOff)
		day := srs.DayKey(at, loc, 4)
		for i := 0; i < n; i++ {
			correct := int64(1)
			if (dayOff+i)%11 == 0 {
				correct = 0
			}
			cid := cardIDs[i%len(cardIDs)]
			if err := q.InsertReview(ctx, userdb.InsertReviewParams{
				Uid: newUID(), CardID: cid, Correct: correct, LevelBefore: 1, LevelAfter: 1 + correct,
				DueAfter: at.UnixMilli(), ReviewedAt: at.UnixMilli(), DurationMs: 6000, Day: day,
			}); err != nil {
				return err
			}
		}
	}
	for k, v := range map[string]string{"onboarded": "true", "daily_goal": "40"} {
		if err := q.UpsertSetting(ctx, userdb.UpsertSettingParams{Key: k, Value: v}); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	log.Info("demo user created", "email", DemoEmail, "password", DemoPassword)
	return nil
}

func newUID() string { return uuid.Must(uuid.NewV7()).String() }

package srs

import (
	"testing"
	"time"
)

func TestNext(t *testing.T) {
	s := New(nil)
	tests := []struct {
		level   int
		correct bool
		want    int
	}{
		{0, true, 1},
		{0, false, 0},
		{4, true, 5},
		{4, false, 3},
		{9, true, 9},
		{9, false, 8},
		{-3, true, 1},
		{42, false, 8},
	}
	for _, tt := range tests {
		if got := s.Next(tt.level, tt.correct); got != tt.want {
			t.Errorf("Next(%d, %v) = %d, want %d", tt.level, tt.correct, got, tt.want)
		}
	}
}

func TestValidateIntervals(t *testing.T) {
	for _, bad := range [][]int{nil, {1}, {0, 3, 2}, {0, -1}, {0, 4000}} {
		if ValidateIntervals(bad) == nil {
			t.Errorf("ValidateIntervals(%v) = nil, want error", bad)
		}
	}
	if err := ValidateIntervals(DefaultIntervals); err != nil {
		t.Errorf("default ladder invalid: %v", err)
	}
	if got := New([]int{5}).Intervals; len(got) != len(DefaultIntervals) {
		t.Errorf("New(invalid) did not fall back to default: %v", got)
	}
}

func TestDayStartAndKey(t *testing.T) {
	ist, err := time.LoadLocation("Europe/Istanbul") // UTC+3, no DST
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		now  time.Time
		want string
	}{
		{"after boundary", time.Date(2026, 11, 19, 10, 0, 0, 0, ist), "2026-11-19"},
		{"before 04:00 belongs to previous day", time.Date(2026, 11, 19, 3, 59, 0, 0, ist), "2026-11-18"},
		{"exactly at boundary", time.Date(2026, 11, 19, 4, 0, 0, 0, ist), "2026-11-19"},
		{"UTC input converted to local", time.Date(2026, 11, 19, 0, 30, 0, 0, time.UTC), "2026-11-18"}, // 03:30 local
	}
	for _, tt := range tests {
		if got := DayKey(tt.now, ist, 4); got != tt.want {
			t.Errorf("%s: DayKey = %s, want %s", tt.name, got, tt.want)
		}
	}
}

func TestDueAt(t *testing.T) {
	s := New(nil)
	ist, _ := time.LoadLocation("Europe/Istanbul")
	now := time.Date(2026, 11, 19, 22, 15, 0, 0, ist)

	if got := s.DueAt(now, 0, ist, 4); !got.Equal(now) {
		t.Errorf("level 0 due = %v, want now", got)
	}
	want1 := time.Date(2026, 11, 20, 4, 0, 0, 0, ist)
	if got := s.DueAt(now, 1, ist, 4); !got.Equal(want1) {
		t.Errorf("level 1 due = %v, want %v", got, want1)
	}
	want5 := time.Date(2026, 12, 19, 4, 0, 0, 0, ist) // 30 days
	if got := s.DueAt(now, 5, ist, 4); !got.Equal(want5) {
		t.Errorf("level 5 due = %v, want %v", got, want5)
	}
	// Answered at 02:00 (still yesterday's study day) with a 1-day interval → due today at 04:00.
	late := time.Date(2026, 11, 20, 2, 0, 0, 0, ist)
	if got := s.DueAt(late, 1, ist, 4); !got.Equal(time.Date(2026, 11, 20, 4, 0, 0, 0, ist)) {
		t.Errorf("late-night due = %v", got)
	}
}

func TestDueAtAcrossDST(t *testing.T) {
	s := New(nil)
	berlin, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		t.Fatal(err)
	}
	// 2026-03-29 is the spring-forward day in Europe; the wall-clock boundary must stay 04:00.
	now := time.Date(2026, 3, 28, 12, 0, 0, 0, berlin)
	got := s.DueAt(now, 2, berlin, 4).In(berlin)
	if got.Hour() != 4 || got.Day() != 30 {
		t.Errorf("DST due = %v, want 2026-03-30 04:00 local", got)
	}
}

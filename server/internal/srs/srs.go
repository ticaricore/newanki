// Package srs implements NewAnki's fixed-ladder spaced repetition: a correct answer moves a card one
// interval up, a wrong answer one interval down (never below 0).
package srs

import (
	"errors"
	"fmt"
	"time"
)

// DefaultIntervals is the ladder from the design: days until the next review at each level.
var DefaultIntervals = []int{0, 1, 2, 3, 7, 30, 60, 90, 180, 360}

// LearnedLevel is the level from which a card counts as "öğrenildi" (interval of a week or more
// with the default ladder).
const LearnedLevel = 4

// Scheduler computes levels and due dates for a given interval ladder.
type Scheduler struct {
	Intervals []int
}

// New returns a scheduler for the ladder, falling back to DefaultIntervals if it is invalid.
func New(intervals []int) Scheduler {
	if ValidateIntervals(intervals) != nil {
		intervals = DefaultIntervals
	}
	return Scheduler{Intervals: append([]int(nil), intervals...)}
}

// ValidateIntervals checks a ladder: 2–20 non-decreasing day counts between 0 and 3650.
func ValidateIntervals(iv []int) error {
	if len(iv) < 2 || len(iv) > 20 {
		return errors.New("aralık listesi 2 ile 20 eleman arasında olmalı")
	}
	for i, d := range iv {
		if d < 0 || d > 3650 {
			return fmt.Errorf("aralık %d geçersiz: 0–3650 gün olmalı", d)
		}
		if i > 0 && d < iv[i-1] {
			return errors.New("aralıklar artan sırada olmalı")
		}
	}
	return nil
}

// MaxLevel is the highest level on the ladder.
func (s Scheduler) MaxLevel() int { return len(s.Intervals) - 1 }

// Clamp keeps a stored level inside the ladder (the ladder may have been shortened by an admin).
func (s Scheduler) Clamp(level int) int {
	if level < 0 {
		return 0
	}
	if level > s.MaxLevel() {
		return s.MaxLevel()
	}
	return level
}

// Next returns the level after an answer.
func (s Scheduler) Next(level int, correct bool) int {
	level = s.Clamp(level)
	if correct {
		return s.Clamp(level + 1)
	}
	return s.Clamp(level - 1)
}

// IntervalDays returns the interval for a level.
func (s Scheduler) IntervalDays(level int) int { return s.Intervals[s.Clamp(level)] }

// DueAt returns when a card at newLevel is next due. Interval 0 means "again in this session" (now).
// Otherwise the card becomes due at the start of the study day N days from today, so it shows up
// for that whole day regardless of the time it was answered.
func (s Scheduler) DueAt(now time.Time, newLevel int, loc *time.Location, dayStartHour int) time.Time {
	d := s.IntervalDays(newLevel)
	if d == 0 {
		return now
	}
	return DayStart(now, loc, dayStartHour).AddDate(0, 0, d)
}

// DayStart returns the most recent study-day boundary (dayStartHour:00 local) at or before now.
func DayStart(now time.Time, loc *time.Location, dayStartHour int) time.Time {
	if loc == nil {
		loc = time.UTC
	}
	t := now.In(loc)
	start := time.Date(t.Year(), t.Month(), t.Day(), dayStartHour, 0, 0, 0, loc)
	if t.Before(start) {
		start = start.AddDate(0, 0, -1)
	}
	return start
}

// DayKey is the study day (YYYY-MM-DD) that now falls in.
func DayKey(now time.Time, loc *time.Location, dayStartHour int) string {
	return DayStart(now, loc, dayStartHour).Format("2006-01-02")
}

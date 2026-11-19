package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/newanki/server/internal/srs"
)

// dayKeys returns n consecutive study-day keys ending today, oldest first.
func dayKeys(now time.Time, loc *time.Location, dayHour, n int) []string {
	start := srs.DayStart(now, loc, dayHour)
	out := make([]string, n)
	for i := 0; i < n; i++ {
		out[n-1-i] = start.AddDate(0, 0, -i).Format("2006-01-02")
	}
	return out
}

func (s *Server) denseDays(r *http.Request, rc *reqCtx, n int) ([]DayCount, error) {
	loc, dayHour, _, err := s.userClock(r.Context(), rc.udb.Q)
	if err != nil {
		return nil, err
	}
	keys := dayKeys(s.now(), loc, dayHour, n)
	rows, err := rc.udb.Q.ReviewDays(r.Context(), keys[0])
	if err != nil {
		return nil, err
	}
	byDay := make(map[string]DayCount, len(rows))
	for _, d := range rows {
		byDay[d.Day] = DayCount{Day: d.Day, Count: d.Count, Correct: d.Correct}
	}
	out := make([]DayCount, n)
	for i, k := range keys {
		if d, ok := byDay[k]; ok {
			out[i] = d
		} else {
			out[i] = DayCount{Day: k}
		}
	}
	return out, nil
}

func (s *Server) handleStatsSummary(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	ctx := r.Context()
	loc, dayHour, st, err := s.userClock(ctx, rc.udb.Q)
	if err != nil {
		return err
	}
	now := s.now()
	today := srs.DayKey(now, loc, dayHour)
	start := srs.DayStart(now, loc, dayHour)

	all, err := rc.udb.Q.ReviewDays(ctx, "")
	if err != nil {
		return err
	}
	active := make(map[string]int64, len(all))
	for _, d := range all {
		active[d.Day] = d.Count
	}
	day := func(offset int) string { return start.AddDate(0, 0, -offset).Format("2006-01-02") }

	// Current streak: consecutive days with reviews ending today, or yesterday if today is still empty.
	streak := 0
	first := 0
	if active[today] == 0 {
		first = 1
	}
	for i := first; active[day(i)] > 0; i++ {
		streak++
	}
	// Best streak over all history (days are sorted ascending).
	best, run := 0, 0
	var prev time.Time
	for _, d := range all {
		t, err := time.ParseInLocation("2006-01-02", d.Day, loc)
		if err != nil {
			continue
		}
		if !prev.IsZero() && prev.AddDate(0, 0, 1).Format("2006-01-02") == d.Day {
			run++
		} else {
			run = 1
		}
		prev = t
		if run > best {
			best = run
		}
	}
	if streak > best {
		best = streak
	}

	var total30, correct30, last7 int64
	from30, from7 := day(29), day(6)
	for _, d := range all {
		if d.Day >= from30 {
			total30 += d.Count
			correct30 += d.Correct
		}
		if d.Day >= from7 {
			last7 += d.Count
		}
	}
	recall := 0.0
	if total30 > 0 {
		recall = float64(correct30) / float64(total30)
	}

	due, err := rc.udb.Q.CountDue(ctx, now.UnixMilli(), 0)
	if err != nil {
		return err
	}
	levels, err := rc.udb.Q.LevelCounts(ctx)
	if err != nil {
		return err
	}
	var totalCards, learned int64
	for lvl, n := range levels {
		totalCards += n
		if lvl >= srs.LearnedLevel {
			learned += n
		}
	}

	writeJSON(w, http.StatusOK, StatsSummary{
		Streak: streak, BestStreak: best, RecallRate: recall, ReviewedToday: active[today], DailyGoal: st.DailyGoal,
		DueNow: due, TotalCards: totalCards, LearnedCards: learned, ReviewsLast7d: last7, Today: today,
	})
	return nil
}

func (s *Server) handleStatsHeatmap(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	n := 26 * 7
	switch r.URL.Query().Get("range") {
	case "", "6m":
	case "1y":
		n = 52 * 7
	default:
		return errField("range", "6m veya 1y olmalı")
	}
	days, err := s.denseDays(r, rc, n)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, DaysResponse{Days: days})
	return nil
}

func (s *Server) handleStatsActivity(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	n := 14
	if v := r.URL.Query().Get("days"); v != "" {
		d, err := strconv.Atoi(v)
		if err != nil || d < 1 || d > 90 {
			return errField("days", "1 ile 90 arasında olmalı")
		}
		n = d
	}
	days, err := s.denseDays(r, rc, n)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, DaysResponse{Days: days})
	return nil
}

func (s *Server) handleStatsDistribution(w http.ResponseWriter, r *http.Request, rc *reqCtx) error {
	levels, err := rc.udb.Q.LevelCounts(r.Context())
	if err != nil {
		return err
	}
	sched := s.scheduler()
	out := make([]LevelCount, len(sched.Intervals))
	for i, d := range sched.Intervals {
		out[i] = LevelCount{Level: i, IntervalDays: d}
	}
	for lvl, n := range levels {
		i := sched.Clamp(int(lvl))
		out[i].Count += n
	}
	writeJSON(w, http.StatusOK, DistributionResponse{Levels: out})
	return nil
}

/** Swipe distance (px) past which a drag on a revealed card counts as an answer. */
export const SWIPE_THRESHOLD = 110

export function swipeDecision(dx: number): 'correct' | 'wrong' | null {
  if (dx > SWIPE_THRESHOLD) return 'correct'
  if (dx < -SWIPE_THRESHOLD) return 'wrong'
  return null
}

/** Mirrors server/internal/srs: one level up on correct, one down on wrong, clamped to the ladder. */
export function nextLevel(level: number, correct: boolean, intervals: number[]) {
  const max = intervals.length - 1
  const l = Math.max(0, Math.min(max, level))
  return Math.max(0, Math.min(max, l + (correct ? 1 : -1)))
}

export function intervalAfter(level: number, correct: boolean, intervals: number[]) {
  return intervals[nextLevel(level, correct, intervals)] ?? 0
}

/** "+7g sonra", "bugün tekrar" labels on the rating buttons. */
export function intervalLabel(days: number) {
  return days === 0 ? 'bu oturumda tekrar' : `${days}g sonra`
}

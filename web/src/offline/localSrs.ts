// Client-side copy of server/internal/srs DueAt, used while offline. The server recomputes on sync.

const DAY = 86_400_000

/** Wall-clock parts of instant t in timeZone. */
function wall(t: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(t)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') }
}

/** Offset of timeZone from UTC at instant t, in ms. */
function offset(t: number, timeZone: string) {
  const w = wall(t, timeZone)
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(t / 1000) * 1000
}

/** Instant of a local wall-clock time in timeZone (handles DST by re-checking the offset). */
function fromWall(y: number, m: number, d: number, h: number, timeZone: string) {
  const guess = Date.UTC(y, m - 1, d, h)
  const first = guess - offset(guess, timeZone)
  return guess - offset(first, timeZone)
}

/** Start of the study day containing now: dayStartHour local time, today or yesterday. */
export function dayStart(now: number, timeZone: string, dayStartHour: number) {
  const w = wall(now, timeZone)
  const start = fromWall(w.y, w.m, w.d, dayStartHour, timeZone)
  if (start <= now) return start
  const prev = wall(now - DAY, timeZone)
  return fromWall(prev.y, prev.m, prev.d, dayStartHour, timeZone)
}

/** When a card at newLevel is due again; interval 0 means right away (same session). */
export function localDueAt(now: number, newLevel: number, intervals: number[], timeZone: string, dayStartHour: number) {
  const days = intervals[Math.max(0, Math.min(intervals.length - 1, newLevel))] ?? 0
  if (days === 0) return now
  const start = wall(dayStart(now, timeZone, dayStartHour), timeZone)
  return fromWall(start.y, start.m, start.d + days, dayStartHour, timeZone)
}

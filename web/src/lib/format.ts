const nf = new Intl.NumberFormat('tr-TR')

/** 1412 → "1,4k" (design shows compact totals). */
export function compact(n: number) {
  if (n < 1000) return nf.format(n)
  return new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function num(n: number) {
  return nf.format(n)
}

export function percent(x: number) {
  return Math.round(x * 100)
}

export function todayLong(d = new Date()) {
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
}

const rtf = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' })

/** "2 saat önce", "dün", "3 gün önce" from a unix-ms timestamp. */
export function ago(ms: number | null | undefined) {
  if (!ms) return 'henüz çalışılmadı'
  const diff = (ms - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'az önce'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  return rtf.format(Math.round(diff / (86400 * 30)), 'month')
}

/** When a card is next due, relative to now ("şimdi", "yarın", "5 gün sonra"). */
export function dueLabel(ms: number) {
  const diff = ms - Date.now()
  if (diff <= 0) return 'bugün'
  const days = Math.round(diff / 86_400_000)
  if (days <= 0) return 'bugün'
  return rtf.format(days, 'day')
}

/** Short Turkish weekday for a YYYY-MM-DD study day. */
export function weekdayShort(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(new Date(y!, m! - 1, d!))
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}

export function duration(ms: number) {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

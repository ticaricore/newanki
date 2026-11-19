import { describe, expect, it } from 'vitest'
import { dayStart, localDueAt } from './localSrs'

const IV = [0, 1, 2, 3, 7, 30, 60, 90, 180, 360]
const t = (iso: string) => Date.parse(iso)

describe('localDueAt (mirrors server srs.DueAt)', () => {
  it('interval 0 is due right away', () => {
    const now = t('2026-11-19T07:00:00Z')
    expect(localDueAt(now, 0, IV, 'Europe/Istanbul', 4)).toBe(now)
  })

  it('counts days from the 04:00 study-day start in the user time zone', () => {
    // 10:00 in Istanbul (UTC+3) → day started 04:00 local = 01:00Z.
    const now = t('2026-11-19T07:00:00Z')
    expect(dayStart(now, 'Europe/Istanbul', 4)).toBe(t('2026-11-19T01:00:00Z'))
    expect(localDueAt(now, 1, IV, 'Europe/Istanbul', 4)).toBe(t('2026-11-20T01:00:00Z'))
    expect(localDueAt(now, 4, IV, 'Europe/Istanbul', 4)).toBe(t('2026-11-26T01:00:00Z'))
  })

  it('before 04:00 still belongs to the previous study day', () => {
    const now = t('2026-11-18T23:00:00Z') // 02:00 on the 19th in Istanbul
    expect(dayStart(now, 'Europe/Istanbul', 4)).toBe(t('2026-11-18T01:00:00Z'))
    expect(localDueAt(now, 1, IV, 'Europe/Istanbul', 4)).toBe(t('2026-11-19T01:00:00Z'))
  })

  it('keeps 04:00 local across a DST change', () => {
    const now = t('2026-03-28T09:00:00Z') // 10:00 CET in Berlin; DST starts on the 29th
    expect(localDueAt(now, 1, IV, 'Europe/Berlin', 4)).toBe(t('2026-03-29T02:00:00Z')) // 04:00 CEST
  })
})

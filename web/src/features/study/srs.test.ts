import { describe, expect, it } from 'vitest'
import { intervalAfter, intervalLabel, nextLevel, swipeDecision } from './srs'

const LADDER = [0, 1, 2, 3, 7, 30, 60, 90, 180, 360]

describe('nextLevel', () => {
  it('moves one step and clamps to the ladder', () => {
    expect(nextLevel(0, true, LADDER)).toBe(1)
    expect(nextLevel(0, false, LADDER)).toBe(0)
    expect(nextLevel(4, false, LADDER)).toBe(3)
    expect(nextLevel(9, true, LADDER)).toBe(9)
    expect(nextLevel(42, false, LADDER)).toBe(8)
  })
  it('matches the design labels', () => {
    expect(intervalAfter(4, true, LADDER)).toBe(30)
    expect(intervalLabel(intervalAfter(0, false, LADDER))).toBe('bu oturumda tekrar')
    expect(intervalLabel(7)).toBe('7g sonra')
  })
})

describe('swipeDecision', () => {
  it('requires passing the threshold', () => {
    expect(swipeDecision(0)).toBeNull()
    expect(swipeDecision(110)).toBeNull()
    expect(swipeDecision(111)).toBe('correct')
    expect(swipeDecision(-140)).toBe('wrong')
  })
})

import { describe, expect, it } from 'vitest'
import { applyBp } from './money.ts'

describe('applyBp', () => {
  it.each([
    // amount, bp, expected
    [100_000, 1_500, 15_000], // 15% of R$ 1.000,00
    [100_000, 10_000, 100_000], // 100%
    [100_000, 0, 0],
    [0, 1_500, 0],
    [12_345, 1_000, 1_235], // 1234.5 → half rounds up
    [12_344, 1_000, 1_234], // 1234.4 → down
    [12_346, 1_000, 1_235], // 1234.6 → up
    [1, 5_000, 1], // 0.5 → 1
    [1, 4_999, 0], // 0.4999 → 0
    [-12_345, 1_000, -1_235], // reversal mirrors the original: half away from zero
    [-1, 5_000, -1],
    [99_999_999_999, 10_000, 99_999_999_999], // ~R$ 1 bi stays exact
  ])('applyBp(%i, %i) = %i', (amount, bp, expected) => {
    expect(applyBp(amount, bp)).toBe(expected)
  })

  it('computes the salesperson share on the rounded brokerage amount (ADR-010)', () => {
    const brokerage = applyBp(123_457, 1_250) // 15432.125 → 15432
    expect(brokerage).toBe(15_432)
    expect(applyBp(brokerage, 3_333)).toBe(5_143) // 5143.4856 → 5143
  })

  it.each([
    [10.5, 100],
    [100, 12.5],
    [100, -1],
    [Number.MAX_SAFE_INTEGER, 10_000],
  ])('rejects non-integer, negative or overflowing input (%d, %d)', (amount, bp) => {
    expect(() => applyBp(amount, bp)).toThrow(RangeError)
  })
})

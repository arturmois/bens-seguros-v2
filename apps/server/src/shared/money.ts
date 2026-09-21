// Money is integer cents; percentages are integer basis points (10000 bp = 100%).
export type Cents = number
export type BasisPoints = number

export const BP_PER_WHOLE = 10_000

function assertInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value))
    throw new RangeError(`${label} must be a safe integer: ${value}`)
}

// `amount × bp / 10000`, rounded half away from zero (so a reversal mirrors the original exactly).
// Integer arithmetic: exact for any amount up to ~9 × 10^11 cents.
export function applyBp(amount: Cents, bp: BasisPoints): Cents {
  assertInteger(amount, 'amount')
  assertInteger(bp, 'bp')
  if (bp < 0) throw new RangeError(`bp must not be negative: ${bp}`)

  const product = Math.abs(amount) * bp
  if (!Number.isSafeInteger(product)) throw new RangeError('amount × bp exceeds the safe range')
  const rounded = Math.floor((product + BP_PER_WHOLE / 2) / BP_PER_WHOLE)
  return amount < 0 ? -rounded : rounded
}

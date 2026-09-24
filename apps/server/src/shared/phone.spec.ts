import { describe, expect, it } from 'vitest'
import { normalizePhone } from './phone.ts'

describe('normalizePhone', () => {
  it('normalizes brazilian numbers without a country code', () => {
    const cases: [string, string][] = [
      ['(11) 98765-4321', '+5511987654321'],
      ['11987654321', '+5511987654321'],
      ['011 98765-4321', '+5511987654321'],
      ['0 11 98765-4321', '+5511987654321'],
      ['5511987654321', '+5511987654321'],
      ['(21) 98765-4321', '+5521987654321'],
      ['(11) 3456-7890', '+551134567890'],
    ]
    for (const [raw, expected] of cases) expect(normalizePhone(raw), raw).toBe(expected)
  })

  it('keeps the country of an international number', () => {
    expect(normalizePhone('+1 202 456 1111')).toBe('+12024561111')
    expect(normalizePhone('+351 912 345 678')).toBe('+351912345678')
  })

  it('rejects what is not a valid phone', () => {
    const invalid = [
      '123',
      'abc',
      '+55 11 1234',
      '(11) 98765-4321 ramal 2',
      '',
      '(11) 2345-678',
      // Plausible length, invalid digits: only the `max` metadata refuses these.
      '(11) 1234-5678',
      '(11) 0876-4321',
      '98765-4321',
    ]
    for (const raw of invalid) expect(normalizePhone(raw), raw).toBeNull()
  })
})

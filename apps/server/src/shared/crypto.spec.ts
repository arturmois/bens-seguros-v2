import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decrypt, encrypt, hmac, parseKey } from './crypto.ts'

const key = randomBytes(32)
const otherKey = randomBytes(32)

describe('encrypt / decrypt', () => {
  it('round-trips unicode text', () => {
    const plaintext = '123.456.789-09 · João da Silva'

    expect(decrypt(key, encrypt(key, plaintext))).toBe(plaintext)
    expect(decrypt(key, encrypt(key, ''))).toBe('')
  })

  it('uses a fresh IV per call and a versioned format', () => {
    const first = encrypt(key, '12345678909')
    const second = encrypt(key, '12345678909')

    expect(first).not.toBe(second)
    expect(first).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/)
  })

  it('rejects another key, tampered ciphertext and malformed payloads', () => {
    const payload = encrypt(key, '12345678909')
    const [version, iv, tag, ciphertext] = payload.split('.')
    const flipped = Buffer.from(ciphertext ?? '', 'base64url')
    flipped[0] = (flipped[0] ?? 0) ^ 1

    expect(() => decrypt(otherKey, payload)).toThrow()
    expect(() =>
      decrypt(key, [version, iv, tag, flipped.toString('base64url')].join('.')),
    ).toThrow()
    expect(() => decrypt(key, 'v0.a.b.c')).toThrow(/Malformed/)
    expect(() => decrypt(key, `${payload}.extra`)).toThrow(/Malformed/)
  })
})

describe('hmac', () => {
  it('is deterministic per key and differs across keys and values', () => {
    expect(hmac(key, '12345678909')).toBe(hmac(key, '12345678909'))
    expect(hmac(key, '12345678909')).not.toBe(hmac(otherKey, '12345678909'))
    expect(hmac(key, '12345678909')).not.toBe(hmac(key, '12345678900'))
    expect(hmac(key, '12345678909')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('parseKey', () => {
  it('accepts 32 bytes in base64 and rejects other sizes', () => {
    expect(parseKey(key.toString('base64'))).toEqual(key)
    expect(() => parseKey(randomBytes(16).toString('base64'))).toThrow(RangeError)
  })
})

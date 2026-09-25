import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../shared/config.ts'
import {
  buildVisitorCookie,
  readVisitorToken,
  signVisitorToken,
  VISITOR_TTL_SECONDS,
  type VisitorSession,
  visitorCookieFor,
  visitorTokenKey,
} from './visitor-token.ts'

const key = visitorTokenKey('test-secret-with-at-least-32-characters')
const session: VisitorSession = {
  organizationId: '0199aaaa-0000-7000-8000-000000000001',
  contactId: '0199aaaa-0000-7000-8000-000000000002',
  conversationId: '0199aaaa-0000-7000-8000-000000000003',
  fromSeq: 7,
}
const issuedAt = new Date('2026-09-25T12:00:00Z')
const expiresAt = issuedAt.getTime() + VISITOR_TTL_SECONDS * 1000

function flip(part: string) {
  const bytes = Buffer.from(part, 'base64url')
  bytes[0] = (bytes[0] ?? 0) ^ 1
  return bytes.toString('base64url')
}

describe('visitor token', () => {
  it('round-trips the visitor session', () => {
    const token = signVisitorToken(key, session, issuedAt)

    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(readVisitorToken(key, token, issuedAt)).toEqual(session)
  })

  it('rejects tampered, foreign, expired and malformed tokens', () => {
    const token = signVisitorToken(key, session, issuedAt)
    const [version, payload = '', signature = ''] = token.split('.')
    const otherKey = visitorTokenKey('another-secret-with-at-least-32-characters')
    const cases: Record<string, [string, Date]> = {
      'payload byte': [`${version}.${flip(payload)}.${signature}`, issuedAt],
      'signature byte': [`${version}.${payload}.${flip(signature)}`, issuedAt],
      'other secret': [signVisitorToken(otherKey, session, issuedAt), issuedAt],
      version: [`v2.${payload}.${signature}`, issuedAt],
      expired: [token, new Date(expiresAt + 1000)],
      garbage: ['not-a-token', issuedAt],
      empty: ['', issuedAt],
      'extra part': [`${token}.x`, issuedAt],
    }

    for (const [name, [value, now]] of Object.entries(cases)) {
      expect(readVisitorToken(key, value, now), name).toBeNull()
    }
  })

  it('accepts a token just inside its expiry', () => {
    const token = signVisitorToken(key, session, issuedAt)

    expect(readVisitorToken(key, token, new Date(expiresAt - 1000))).toEqual(session)
  })

  it('marks the cookie secure in production', () => {
    const plain = buildVisitorCookie('v1.a.b', { publicChatKey: 'k'.repeat(32), secure: false })
    const secure = buildVisitorCookie('v1.a.b', { publicChatKey: 'k'.repeat(32), secure: true })

    expect(plain).toBe(
      `bens_visitor=v1.a.b; Path=/api/public/chat/${'k'.repeat(32)}; Max-Age=2592000; HttpOnly; SameSite=Lax`,
    )
    expect(secure).toBe(`${plain}; Secure`)

    const env = {
      DATABASE_URL: 'postgresql://bens:bens@localhost:5432/bens',
      SMTP_URL: 'smtp://localhost:1025',
      EMAIL_FROM: 'Bens Seguros <nao-responda@bensseguros.local>',
      APP_URL: 'https://app.example.com',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      TURNSTILE_SECRET_KEY: 'secret-key',
      TURNSTILE_SITE_KEY: 'site-key',
    }
    const link = 'k'.repeat(32)
    expect(visitorCookieFor(loadConfig({ ...env, NODE_ENV: 'production' }), link, 'v1.a.b')).toBe(
      secure,
    )
    expect(visitorCookieFor(loadConfig({ ...env, NODE_ENV: 'test' }), link, 'v1.a.b')).toBe(plain)
  })
})

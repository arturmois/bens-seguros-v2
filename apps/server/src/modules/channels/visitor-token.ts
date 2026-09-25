import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { Config } from '../../shared/config.ts'

// The Web Chat visitor's session (AD-018): which conversation this browser may read and from which
// `seq` on. Signed, never stored: nothing in the database revokes it; it expires.
export type VisitorSession = {
  organizationId: string
  contactId: string
  conversationId: string
  fromSeq: number
}

export const VISITOR_COOKIE = 'bens_visitor'
export const VISITOR_TTL_SECONDS = 30 * 24 * 60 * 60

const VERSION = 'v1'

const payloadSchema = z
  .object({
    o: z.uuid(),
    ct: z.uuid(),
    cv: z.uuid(),
    fs: z.number().int().min(1),
    exp: z.number().int(),
  })
  .strict()

// Derived from the auth secret with its own label, so no new variable reaches the `.env` (AD-012).
export function visitorTokenKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('visitor-token').digest()
}

function sign(key: Buffer, payload: string) {
  return createHmac('sha256', key).update(`${VERSION}.${payload}`).digest()
}

export function signVisitorToken(key: Buffer, session: VisitorSession, now = new Date()): string {
  const payload = Buffer.from(
    JSON.stringify({
      o: session.organizationId,
      ct: session.contactId,
      cv: session.conversationId,
      fs: session.fromSeq,
      exp: Math.floor(now.getTime() / 1000) + VISITOR_TTL_SECONDS,
    }),
  ).toString('base64url')
  return `${VERSION}.${payload}.${sign(key, payload).toString('base64url')}`
}

// `null` for anything but an untampered, unexpired token signed with this key.
export function readVisitorToken(
  key: Buffer,
  token: string,
  now = new Date(),
): VisitorSession | null {
  const [version, payload, signature, ...rest] = token.split('.')
  if (version !== VERSION || !payload || !signature || rest.length > 0) return null
  const expected = sign(key, payload)
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const parsed = payloadSchema.safeParse(decoded)
  if (!parsed.success || parsed.data.exp * 1000 <= now.getTime()) return null
  return {
    organizationId: parsed.data.o,
    contactId: parsed.data.ct,
    conversationId: parsed.data.cv,
    fromSeq: parsed.data.fs,
  }
}

// One cookie per link: two brokerages' links in the same browser never overwrite each other.
export function buildVisitorCookie(
  token: string,
  options: { publicChatKey: string; secure: boolean },
): string {
  const cookie = `${VISITOR_COOKIE}=${token}; Path=/api/public/chat/${options.publicChatKey}; Max-Age=${VISITOR_TTL_SECONDS}; HttpOnly; SameSite=Lax`
  return options.secure ? `${cookie}; Secure` : cookie
}

// The cookie the route sets: `Secure` in production (plan door 4).
export function visitorCookieFor(
  config: Pick<Config, 'NODE_ENV'>,
  publicChatKey: string,
  token: string,
): string {
  return buildVisitorCookie(token, { publicChatKey, secure: config.NODE_ENV === 'production' })
}

// The visitor cookie from a `Cookie` header, or `null`.
export function visitorCookieOf(header: string | undefined): string | null {
  for (const part of header?.split(';') ?? []) {
    const [name, ...value] = part.trim().split('=')
    if (name === VISITOR_COOKIE) return value.join('=')
  }
  return null
}

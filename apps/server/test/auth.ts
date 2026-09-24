import { createHmac, randomInt, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { App } from '../src/app.ts'
import type { Deps } from '../src/dependencies.ts'
import { TEST_APP_URL } from './app.ts'

// A distinct client address per test client: the auth rate limit is per IP and survives between the
// test files that share a worker schema.
export function randomIp() {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`
}

export function uniqueEmail(label = 'pessoa') {
  return `${label}-${randomUUID()}@example.com`
}

export const PASSWORD = 'senha-segura-123'

type RequestOptions = {
  payload?: unknown
  headers?: Record<string, string>
}

// A browser stand-in over `app.inject`: same origin, a fixed client address and a cookie jar.
export class TestClient {
  readonly cookies = new Map<string, string>()
  readonly app: App
  readonly ip: string
  readonly origin: string

  constructor(app: App, options: { ip?: string; origin?: string } = {}) {
    this.app = app
    this.ip = options.ip ?? randomIp()
    this.origin = options.origin ?? TEST_APP_URL
  }

  get cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    options: RequestOptions = {},
  ) {
    const response = await this.app.inject({
      method,
      url,
      remoteAddress: this.ip,
      headers: {
        origin: this.origin,
        ...(this.cookies.size > 0 && { cookie: this.cookieHeader }),
        ...options.headers,
      },
      ...(options.payload !== undefined && { payload: options.payload as object }),
    })
    for (const cookie of setCookies(response.headers['set-cookie'])) {
      const [pair = ''] = cookie.split(';')
      const separator = pair.indexOf('=')
      const name = pair.slice(0, separator)
      const value = pair.slice(separator + 1)
      if (value === '' || /max-age=0/i.test(cookie)) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
    return response
  }

  get(url: string, options?: RequestOptions) {
    return this.request('GET', url, options)
  }

  post(url: string, payload: unknown = {}, options: Omit<RequestOptions, 'payload'> = {}) {
    return this.request('POST', url, { ...options, payload })
  }

  put(url: string, payload: unknown = {}, options: Omit<RequestOptions, 'payload'> = {}) {
    return this.request('PUT', url, { ...options, payload })
  }

  patch(url: string, payload: unknown = {}, options: Omit<RequestOptions, 'payload'> = {}) {
    return this.request('PATCH', url, { ...options, payload })
  }

  delete(url: string, options: Omit<RequestOptions, 'payload'> = {}) {
    return this.request('DELETE', url, options)
  }
}

export async function acceptCurrentTerms(client: TestClient) {
  const me = await client.get('/api/v1/me')
  if (me.statusCode !== 200) throw new Error(`me failed: ${me.body}`)
  const terms = z
    .object({ terms: z.object({ termsVersion: z.string(), privacyVersion: z.string() }) })
    .parse(me.json())
  const accepted = await client.post('/api/v1/me/terms-acceptance', terms.terms)
  if (accepted.statusCode !== 200) throw new Error(`terms failed: ${accepted.body}`)
}

export function setCookies(header: string | string[] | undefined): string[] {
  if (header === undefined) return []
  return Array.isArray(header) ? header : [header]
}

// The session token cookie being issued (with or without the __Secure- prefix); a Set-Cookie that
// clears it (empty value, Max-Age=0) is not a session.
export function sessionCookieOf(header: string | string[] | undefined) {
  return setCookies(header).find(
    (cookie) =>
      /^(__Secure-)?better-auth\.session_token=[^;]/.test(cookie) && !/max-age=0/i.test(cookie),
  )
}

const emailJob = z.discriminatedUnion('template', [
  z.object({
    template: z.enum(['verify-email', 'reset-password']),
    to: z.string(),
    props: z.object({ name: z.string(), url: z.url() }),
  }),
  z.object({
    template: z.literal('invitation'),
    to: z.string(),
    props: z.object({ organizationName: z.string(), url: z.url() }),
  }),
])

function bossSchema(deps: Deps) {
  return `${new URL(deps.config.DATABASE_URL).searchParams.get('schema')}_pgboss`
}

// Payloads of `email.send` jobs to `to`, oldest first.
export async function emailJobsTo(deps: Deps, to: string, template?: string) {
  const rows = await deps.db.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM "${bossSchema(deps)}".job
      WHERE name = 'email.send' AND data->>'to' = $1 ORDER BY created_on, id`,
    to,
  )
  return rows
    .map((row) => emailJob.parse(row.data))
    .filter((job) => template === undefined || job.template === template)
}

export async function lastEmailUrl(deps: Deps, to: string, template: string) {
  const job = (await emailJobsTo(deps, to, template)).at(-1)
  if (!job) throw new Error(`No ${template} e-mail queued for ${to}`)
  const url = new URL(job.props.url)
  return `${url.pathname}${url.search}`
}

export async function signUp(client: TestClient, email = uniqueEmail(), password = PASSWORD) {
  const response = await client.post('/api/auth/sign-up/email', {
    name: 'Maria Souza',
    email,
    password,
  })
  if (response.statusCode !== 200) throw new Error(`sign-up failed: ${response.body}`)
  return { email, password }
}

// Signed up and verified through the real e-mail link; the client ends signed in.
export async function signedInUser(client: TestClient, deps: Deps, email = uniqueEmail()) {
  await signUp(client, email)
  const verify = await client.get(await lastEmailUrl(deps, email, 'verify-email'))
  if (verify.statusCode !== 302) throw new Error(`verify-email failed: ${verify.body}`)
  const user = await deps.db.user.findUniqueOrThrow({ where: { email } })
  return { email, password: PASSWORD, userId: user.id }
}

// RFC 6238 (SHA-1, 30 s, 6 digits), the authenticator app's side of the TOTP.
export function totp(secretBase32: string, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of secretBase32.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  }
  const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? [])
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const hmac = createHmac('sha1', key).update(counter).digest()
  const offset = (hmac.at(-1) ?? 0) & 0xf
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return code.toString().padStart(6, '0')
}

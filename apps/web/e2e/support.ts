import { createHmac, randomUUID } from 'node:crypto'
import {
  type APIRequestContext,
  test as base,
  expect,
  type Page,
  request as playwrightRequest,
} from '@playwright/test'
import pg from 'pg'

const mailpit = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025'
// Application role (row level security applies); RateLimit is a user-level table it can clear.
const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgresql://bens_app:bens_app@localhost:5432/bens'

export const PASSWORD = 'senha-segura-123'
export const NAME = 'Maria Souza'

export function uniqueEmail(label = 'e2e') {
  return `${label}-${randomUUID()}@example.com`
}

// Every e2e request comes from the same address, so the per-IP auth limits (5 sign-ups an hour)
// would trip after a few tests. Each test starts from clean counters; the 429 screens are proven
// with a mocked response.
async function clearRateLimits() {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query('DELETE FROM "RateLimit"')
  } finally {
    await client.end()
  }
}

export const test = base.extend<{ api: APIRequestContext }>({
  api: async ({ baseURL }, use) => {
    if (!baseURL) throw new Error('baseURL is not configured')
    await clearRateLimits()
    // A separate cookie jar: the browser page stays signed out until the test signs in.
    const api = await playwrightRequest.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { origin: new URL(baseURL).origin },
    })
    await use(api)
    await api.dispose()
  },
})

export { expect }

type MailpitMessage = { ID: string; Subject: string }

export async function inbox(to: string): Promise<MailpitMessage[]> {
  const response = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
  const body: { messages: MailpitMessage[] } = await response.json()
  return body.messages
}

// The link of the newest e-mail to `to` with this subject, waiting for the queue to deliver it.
export async function emailLink(to: string, subject: string) {
  let message: MailpitMessage | undefined
  await expect
    .poll(
      async () => {
        message = (await inbox(to)).find((item) => item.Subject === subject)
        return message !== undefined
      },
      { timeout: 20_000 },
    )
    .toBe(true)
  const response = await fetch(`${mailpit}/api/v1/message/${message?.ID}`)
  const body: { Text: string } = await response.json()
  const url = body.Text.match(/https?:\/\/\S+\/api\/auth\/\S+/)?.[0]
  if (!url) throw new Error(`No auth link in the e-mail to ${to}`)
  const parsed = new URL(url)
  return `${parsed.pathname}${parsed.search}`
}

export async function signUp(api: APIRequestContext, email = uniqueEmail(), name = NAME) {
  const response = await api.post('/api/auth/sign-up/email', {
    data: { name, email, password: PASSWORD, callbackURL: '/login' },
    // Cloudflare's always-pass test secret accepts this token; ignored when Turnstile is off.
    headers: { 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' },
  })
  expect(response.status()).toBe(200)
  return { email, password: PASSWORD, name }
}

// A user whose e-mail link was already opened (by the API context, not the page).
export async function onboard(api: APIRequestContext, name = 'Corretora') {
  const response = await api.post('/api/v1/onboarding', {
    data: { name: `${name} ${randomUUID().slice(0, 8)}` },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as {
    id: string
    name: string
    slug: string
    role: string
    publicChatKey: string
  }
}

// No active organization now, and none remembered for the next sign-in (org-web door 4).
export async function clearActiveOrganization(userId: string) {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query('UPDATE "Session" SET "activeOrganizationId" = NULL WHERE "userId" = $1', [
      userId,
    ])
    await client.query('UPDATE "User" SET "lastActiveOrganizationId" = NULL WHERE "id" = $1', [
      userId,
    ])
  } finally {
    await client.end()
  }
}

export async function verifiedUser(api: APIRequestContext, options: { terms?: boolean } = {}) {
  const user = await signUp(api)
  const verify = await api.get(await emailLink(user.email, 'Confirme seu e-mail'), {
    maxRedirects: 0,
  })
  expect(verify.status()).toBe(302)
  if (options.terms !== false) {
    const acceptance = await api.post('/api/v1/me/terms-acceptance', {
      data: { termsVersion: '1.0', privacyVersion: '1.0' },
    })
    expect(acceptance.status()).toBe(200)
  }
  return user
}

// RFC 6238 (SHA-1, 30 s, 6 digits): the authenticator app's side.
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
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0')
}

// Signs in through the API context and turns TOTP on; returns the secret and the backup codes.
export async function userWithTwoFactor(api: APIRequestContext) {
  const user = await verifiedUser(api)
  await onboard(api)
  const enable = await api.post('/api/auth/two-factor/enable', { data: { password: PASSWORD } })
  const { totpURI, backupCodes } = await enable.json()
  const secret = new URL(totpURI).searchParams.get('secret') ?? ''
  const verify = await api.post('/api/auth/two-factor/verify-totp', {
    data: { code: totp(secret) },
  })
  expect(verify.status()).toBe(200)
  return { ...user, secret, backupCodes: backupCodes as string[] }
}

export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha').fill(user.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // The click returns before the session request settles. A later goto would cancel it.
  await expect(page).not.toHaveURL(/\/login/)
}

// A new sign-in starts in the last active organization, or the only one (door 4).
export async function enterApp(page: Page, organizationName: string) {
  await expect(page).toHaveURL('/dashboard')
  await expect(page.getByRole('banner').getByText(organizationName)).toBeVisible()
}

export async function invitationToken(to: string) {
  let text = ''
  await expect
    .poll(async () => {
      const message = (await inbox(to)).find((item) => item.Subject.startsWith('Convite para '))
      if (!message) return false
      const response = await fetch(`${mailpit}/api/v1/message/${message.ID}`)
      const body = (await response.json()) as { Text: string }
      text = body.Text
      return text.includes('accept-invitation?token=')
    })
    .toBe(true)
  const token = text.match(/accept-invitation\?token=([^\s]+)/)?.[1]
  if (!token) throw new Error(`no invitation token for ${to}`)
  return token
}

export function requireBase(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('baseURL is required')
  return baseURL
}

export async function acceptInvite(
  baseURL: string | undefined,
  email: string,
  options: { name?: string; ownBrokerage?: string } = {},
) {
  const origin = requireBase(baseURL)
  const guest = await playwrightRequest.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin: new URL(origin).origin },
  })
  await signUp(guest, email, options.name)
  const verify = await guest.get(await emailLink(email, 'Confirme seu e-mail'), { maxRedirects: 0 })
  expect(verify.status()).toBe(302)
  expect(
    (
      await guest.post('/api/v1/me/terms-acceptance', {
        data: { termsVersion: '1.0', privacyVersion: '1.0' },
      })
    ).ok(),
  ).toBeTruthy()
  const own = options.ownBrokerage ? await onboard(guest, options.ownBrokerage) : undefined
  const token = await invitationToken(email)
  expect((await guest.post('/api/v1/invitations/accept', { data: { token } })).ok()).toBeTruthy()
  await guest.dispose()
  return { email, password: PASSWORD, own }
}

export async function invite(api: APIRequestContext, email: string, role: string) {
  const response = await api.post('/api/v1/invitations', { data: { email, role } })
  expect(response.ok()).toBeTruthy()
}

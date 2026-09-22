import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { PASSWORD, sessionCookieOf, signedInUser, TestClient, totp } from '../../../test/auth.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'

let app: App
let deps: Deps
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp({ workers: true }))
  await app.ready()
})

afterAll(() => close())

function secretOf(totpURI: string) {
  return new URL(totpURI).searchParams.get('secret') ?? ''
}

// Signed in with TOTP turned on and confirmed; returns the authenticator secret.
async function userWithTotp() {
  const client = new TestClient(app)
  const user = await signedInUser(client, deps)
  const enable = await client.post('/api/auth/two-factor/enable', { password: PASSWORD })
  const secret = secretOf(enable.json().totpURI)
  const verify = await client.post('/api/auth/two-factor/verify-totp', { code: totp(secret) })
  if (verify.statusCode !== 200) throw new Error(`verify-totp failed: ${verify.body}`)
  return { ...user, secret, client }
}

async function twoFactorEnabled(userId: string) {
  return (await deps.db.user.findUniqueOrThrow({ where: { id: userId } })).twoFactorEnabled
}

describe('two-factor (TOTP)', () => {
  it('enables totp only after a valid code', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)

    const enable = await client.post('/api/auth/two-factor/enable', { password: PASSWORD })

    expect(enable.statusCode).toBe(200)
    const { totpURI, backupCodes } = enable.json()
    const uri = new URL(totpURI)
    expect(uri.protocol).toBe('otpauth:')
    expect(uri.searchParams.get('issuer')).toBe('Bens Seguros')
    expect(backupCodes.length).toBeGreaterThan(0)
    expect(await twoFactorEnabled(userId)).toBe(false)

    const verify = await client.post('/api/auth/two-factor/verify-totp', {
      code: totp(secretOf(totpURI)),
    })

    expect(verify.statusCode).toBe(200)
    expect(await twoFactorEnabled(userId)).toBe(true)
  })

  it('sign-in asks for the second factor', async () => {
    const { email, userId } = await userWithTotp()
    const sessionsBefore = await deps.db.session.count({ where: { userId } })

    const response = await new TestClient(app).post('/api/auth/sign-in/email', {
      email,
      password: PASSWORD,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ twoFactorRedirect: true })
    expect(sessionCookieOf(response.headers['set-cookie'])).toBeUndefined()
    expect(await deps.db.session.count({ where: { userId } })).toBe(sessionsBefore)
  })

  it('verifies the totp code to finish sign-in', async () => {
    const { email, userId, secret } = await userWithTotp()
    const wrongCode = new TestClient(app)
    await wrongCode.post('/api/auth/sign-in/email', { email, password: PASSWORD })
    const sessionsBefore = await deps.db.session.count({ where: { userId } })

    const rejected = await wrongCode.post('/api/auth/two-factor/verify-totp', {
      code: totp(secret) === '000000' ? '111111' : '000000',
    })

    expect(rejected.statusCode).toBe(401)
    expect(sessionCookieOf(rejected.headers['set-cookie'])).toBeUndefined()
    expect(await deps.db.session.count({ where: { userId } })).toBe(sessionsBefore)

    const client = new TestClient(app)
    await client.post('/api/auth/sign-in/email', { email, password: PASSWORD })
    const accepted = await client.post('/api/auth/two-factor/verify-totp', { code: totp(secret) })

    expect(accepted.statusCode).toBe(200)
    expect(sessionCookieOf(accepted.headers['set-cookie'])).toBeDefined()
    const me = await client.get('/api/v1/me')
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ id: userId, twoFactorEnabled: true })
  })

  it('disabling totp restores the plain sign-in', async () => {
    const { email, userId, client } = await userWithTotp()

    const disable = await client.post('/api/auth/two-factor/disable', { password: PASSWORD })

    expect(disable.statusCode).toBe(200)
    expect(await twoFactorEnabled(userId)).toBe(false)
    const signIn = await new TestClient(app).post('/api/auth/sign-in/email', {
      email,
      password: PASSWORD,
    })
    expect(signIn.statusCode).toBe(200)
    expect(signIn.json()).not.toHaveProperty('twoFactorRedirect')
    expect(sessionCookieOf(signIn.headers['set-cookie'])).toBeDefined()
  })

  it('stores the totp secret encrypted', async () => {
    const { userId, secret } = await userWithTotp()

    const stored = await deps.db.twoFactor.findFirstOrThrow({ where: { userId } })

    expect(secret).not.toBe('')
    expect(stored.secret).not.toBe(secret)
    expect(stored.secret).not.toContain(secret)
  })
})

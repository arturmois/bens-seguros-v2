import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { PASSWORD, sessionCookieOf, signedInUser, signUp, TestClient } from '../../../test/auth.ts'
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

describe('POST /api/auth/sign-in/email', () => {
  it('rejects an unverified user with 403', async () => {
    const client = new TestClient(app)
    const { email } = await signUp(client)

    const response = await client.post('/api/auth/sign-in/email', { email, password: PASSWORD })

    expect(response.statusCode).toBe(403)
    expect(sessionCookieOf(response.headers['set-cookie'])).toBeUndefined()
  })

  it('issues a host-only lax http-only session cookie', async () => {
    const { email } = await signedInUser(new TestClient(app), deps)

    const response = await new TestClient(app).post('/api/auth/sign-in/email', {
      email,
      password: PASSWORD,
    })

    expect(response.statusCode).toBe(200)
    const cookie = sessionCookieOf(response.headers['set-cookie'])
    expect(cookie).toMatch(/^better-auth\.session_token=/)
    expect(cookie).toMatch(/;\s*HttpOnly/i)
    expect(cookie).toMatch(/;\s*SameSite=Lax/i)
    expect(cookie).toMatch(/;\s*Path=\/(;|$)/i)
    expect(cookie).not.toMatch(/;\s*Domain=/i)
    expect(cookie).not.toMatch(/;\s*Secure/i)
  })

  it('rejects a wrong password with 401', async () => {
    const { email } = await signedInUser(new TestClient(app), deps)

    const response = await new TestClient(app).post('/api/auth/sign-in/email', {
      email,
      password: 'senha-errada-000',
    })

    expect(response.statusCode).toBe(401)
    expect(sessionCookieOf(response.headers['set-cookie'])).toBeUndefined()
  })

  it('rejects sign-in from another origin', async () => {
    const { email } = await signedInUser(new TestClient(app), deps)

    const response = await new TestClient(app).post(
      '/api/auth/sign-in/email',
      { email, password: PASSWORD },
      { headers: { origin: 'https://evil.example' } },
    )

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origem da requisição não permitida.' },
    })
    expect(sessionCookieOf(response.headers['set-cookie'])).toBeUndefined()
  })
})

describe('POST /api/auth/sign-out', () => {
  it('sign-out deletes the session', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    const cookie = client.cookieHeader
    expect(await deps.db.session.count({ where: { userId } })).toBe(1)

    const response = await client.post('/api/auth/sign-out')

    expect(response.statusCode).toBe(200)
    expect(await deps.db.session.count({ where: { userId } })).toBe(0)
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })
    expect(me.statusCode).toBe(401)
  })
})

describe('GET /api/auth/get-session', () => {
  it('get-session returns the signed-in user', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)

    const signedIn = await client.get('/api/auth/get-session')
    const anonymous = await new TestClient(app).get('/api/auth/get-session')

    expect(signedIn.statusCode).toBe(200)
    expect(signedIn.json().user.id).toBe(userId)
    expect(anonymous.statusCode).toBe(200)
    expect(anonymous.json()).toBeNull()
  })
})

describe('session cookie under https', () => {
  let secure: Awaited<ReturnType<typeof buildTestApp>>

  beforeAll(async () => {
    secure = await buildTestApp({ workers: true, env: { APP_URL: 'https://app.bens.test' } })
    await secure.app.ready()
  })

  afterAll(() => secure.close())

  it('uses a secure prefixed cookie under https', async () => {
    const origin = 'https://app.bens.test'
    const { email } = await signedInUser(new TestClient(secure.app, { origin }), secure.deps)

    const response = await new TestClient(secure.app, { origin }).post('/api/auth/sign-in/email', {
      email,
      password: PASSWORD,
    })

    expect(response.statusCode).toBe(200)
    const cookie = sessionCookieOf(response.headers['set-cookie'])
    expect(cookie).toMatch(/^__Secure-better-auth\.session_token=/)
    expect(cookie).toMatch(/;\s*Secure/i)
    expect(cookie).not.toMatch(/;\s*Domain=/i)

    // The same sign-in under the http APP_URL of the default test app.
    const { email: plainEmail } = await signedInUser(new TestClient(app), deps)
    const plain = await new TestClient(app).post('/api/auth/sign-in/email', {
      email: plainEmail,
      password: PASSWORD,
    })
    const plainCookie = sessionCookieOf(plain.headers['set-cookie'])
    expect(plainCookie).toMatch(/^better-auth\.session_token=/)
    expect(plainCookie).not.toMatch(/;\s*Secure/i)
  })
})

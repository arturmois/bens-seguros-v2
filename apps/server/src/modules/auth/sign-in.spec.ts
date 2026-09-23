import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import {
  acceptCurrentTerms,
  lastEmailUrl,
  PASSWORD,
  sessionCookieOf,
  signedInUser,
  signUp,
  TestClient,
  uniqueEmail,
} from '../../../test/auth.ts'
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

describe('initial organization of a new session', () => {
  async function signInAgain(email: string) {
    const client = new TestClient(app)
    const response = await client.post('/api/auth/sign-in/email', { email, password: PASSWORD })
    expect(response.statusCode).toBe(200)
    return client
  }

  async function activeOrganizationOf(client: TestClient) {
    const me = await client.get('/api/v1/me')
    expect(me.statusCode).toBe(200)
    return me.json().activeOrganizationId as string | null
  }

  async function lastActiveOrganizationOf(userId: string) {
    const user = await deps.db.user.findUniqueOrThrow({ where: { id: userId } })
    return user.lastActiveOrganizationId
  }

  async function forgetLastActiveOrganization(userId: string) {
    await deps.db.user.update({ where: { id: userId }, data: { lastActiveOrganizationId: null } })
  }

  // Signed in, terms accepted, and a member of every organization created through onboarding.
  async function ownerOf(...names: string[]) {
    const client = new TestClient(app)
    const user = await signedInUser(client, deps)
    await acceptCurrentTerms(client)
    const ids: string[] = []
    for (const name of names) {
      const created = await client.post('/api/v1/onboarding', { name })
      expect(created.statusCode).toBe(200)
      ids.push(created.json().id)
    }
    return { client, ...user, ids }
  }

  // `guest` joins the owner's active organization through a real invitation.
  async function join(owner: TestClient, guest: TestClient, guestEmail: string) {
    const invited = await owner.post('/api/v1/invitations', { email: guestEmail, role: 'ADMIN' })
    expect(invited.statusCode).toBe(200)
    const token = new URL(
      await lastEmailUrl(deps, guestEmail, 'invitation'),
      'http://localhost',
    ).searchParams.get('token')
    const accepted = await guest.post('/api/v1/invitations/accept', { token })
    expect(accepted.statusCode).toBe(200)
  }

  it('starts the session in the last active organization', async () => {
    const { client, email, ids } = await ownerOf('Primeira', 'Segunda')
    const [first] = ids
    const switched = await client.post('/api/v1/me/active-organization', { organizationId: first })
    expect(switched.statusCode).toBe(200)

    expect(await activeOrganizationOf(await signInAgain(email))).toBe(first)
  })

  it('falls back to the only active organization', async () => {
    const owner = await ownerOf('Da Dona')
    const guestClient = new TestClient(app)
    const guestEmail = uniqueEmail('inicial')
    const guest = await signedInUser(guestClient, deps, guestEmail)
    await acceptCurrentTerms(guestClient)
    const own = await guestClient.post('/api/v1/onboarding', { name: 'Da Convidada' })
    expect(own.statusCode).toBe(200)
    await join(owner.client, guestClient, guestEmail)
    expect(await lastActiveOrganizationOf(guest.userId)).toBe(owner.ids[0])

    const members = await owner.client.get('/api/v1/members')
    const membership = members
      .json()
      .items.find((item: { email: string }) => item.email === guestEmail)
    const deactivated = await owner.client.patch(`/api/v1/members/${membership.id}`, {
      active: false,
    })
    expect(deactivated.statusCode).toBe(200)

    expect(await activeOrganizationOf(await signInAgain(guestEmail))).toBe(own.json().id)

    const single = await ownerOf('Sozinha')
    await forgetLastActiveOrganization(single.userId)
    expect(await activeOrganizationOf(await signInAgain(single.email))).toBe(single.ids[0])
  })

  it('leaves the organization open when there is a choice', async () => {
    const two = await ownerOf('Uma', 'Outra')
    await forgetLastActiveOrganization(two.userId)
    expect(await activeOrganizationOf(await signInAgain(two.email))).toBeNull()

    const none = new TestClient(app)
    const { email } = await signedInUser(none, deps)
    expect(await activeOrganizationOf(none)).toBeNull()
    expect(await activeOrganizationOf(await signInAgain(email))).toBeNull()
  })

  it('remembers the organization that was made active', async () => {
    const owner = await ownerOf('Lembrada', 'Depois')
    const [first, second] = owner.ids
    expect(await lastActiveOrganizationOf(owner.userId)).toBe(second)

    const switched = await owner.client.post('/api/v1/me/active-organization', {
      organizationId: first,
    })
    expect(switched.statusCode).toBe(200)
    expect(await lastActiveOrganizationOf(owner.userId)).toBe(first)

    const guestClient = new TestClient(app)
    const guestEmail = uniqueEmail('lembra')
    const guest = await signedInUser(guestClient, deps, guestEmail)
    await acceptCurrentTerms(guestClient)
    await join(owner.client, guestClient, guestEmail)
    expect(await lastActiveOrganizationOf(guest.userId)).toBe(first)
  })
})

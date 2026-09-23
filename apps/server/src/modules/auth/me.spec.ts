import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import {
  acceptCurrentTerms,
  lastEmailUrl,
  PASSWORD,
  signedInUser,
  TestClient,
  uniqueEmail,
} from '../../../test/auth.ts'
import { createOrganization } from '../../../test/factories.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'
import { permissionsFor, type Role } from '../../shared/permissions.ts'
import { byNameThenId } from './me.ts'
import { currentUser, requireSession } from './session-context.ts'

let app: App
let deps: Deps
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp({ workers: true }))
  // What an authenticated route receives in `request.user`.
  app.get('/test/user', { preHandler: [requireSession(deps.auth)] }, async (request) =>
    currentUser(request),
  )
  await app.ready()
})

afterAll(() => close())

const HOUR = 3_600_000
const DAY = 24 * HOUR

const unauthenticated = {
  error: { code: 'UNAUTHENTICATED', message: 'Sessão inválida ou expirada.' },
}

describe('GET /api/v1/me', () => {
  it('returns the signed-in user', async () => {
    const client = new TestClient(app)
    const { email, userId } = await signedInUser(client, deps)

    const response = await client.get('/api/v1/me')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      id: userId,
      name: 'Maria Souza',
      email,
      emailVerified: true,
      twoFactorEnabled: false,
      isSuperAdmin: false,
      activeOrganizationId: null,
      role: null,
      permissions: [],
      organizations: [],
      terms: { pending: true, termsVersion: '1.0', privacyVersion: '1.0' },
    })
  })

  it('reports role and permissions for the active membership', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    await acceptCurrentTerms(client)
    const created = await client.post('/api/v1/onboarding', { name: 'Meu Papel' })
    const organizationId = created.json().id as string
    const roles: Role[] = ['OWNER', 'ADMIN', 'MANAGER', 'COMMERCIAL', 'VIEWER']

    for (const role of roles) {
      await deps.db.withTenant({ organizationId }, (tx) =>
        tx.member.update({
          where: { organizationId_userId: { organizationId, userId } },
          data: { role },
        }),
      )
      const response = await client.get('/api/v1/me')
      expect(response.statusCode, role).toBe(200)
      expect(response.json(), role).toMatchObject({
        role,
        permissions: [...permissionsFor(role)],
        activeOrganizationId: organizationId,
      })
    }

    await deps.db.session.updateMany({ where: { userId }, data: { activeOrganizationId: null } })
    const cleared = await client.get('/api/v1/me')
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json()).toMatchObject({
      role: null,
      permissions: [],
      activeOrganizationId: null,
    })
  })

  it('rejects every invalid session with 401', async () => {
    const noCookie = await app.inject({ method: 'GET', url: '/api/v1/me' })
    const unknownToken = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: `better-auth.session_token=${randomUUID()}.assinatura` },
    })

    const expiredClient = new TestClient(app)
    const expired = await signedInUser(expiredClient, deps)
    await deps.db.session.updateMany({
      where: { userId: expired.userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const deletedClient = new TestClient(app)
    const deleted = await signedInUser(deletedClient, deps)
    expect((await deletedClient.get('/api/v1/me')).statusCode).toBe(200)
    await deps.db.session.deleteMany({ where: { userId: deleted.userId } })

    for (const response of [
      noCookie,
      unknownToken,
      await expiredClient.get('/api/v1/me'),
      await deletedClient.get('/api/v1/me'),
    ]) {
      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual(unauthenticated)
    }
  })

  it('session lasts three days and refreshes after twelve hours', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    const signedInAt = Date.now()
    const session = await deps.db.session.findFirstOrThrow({ where: { userId } })
    expect(Math.abs(session.expiresAt.getTime() - (signedInAt + 3 * DAY))).toBeLessThan(60_000)

    // As if issued 11 h ago: used now, it keeps its expiry.
    const recentExpiry = new Date(Date.now() + 3 * DAY - 11 * HOUR)
    await deps.db.session.update({
      where: { id: session.id },
      data: { expiresAt: recentExpiry, updatedAt: new Date(Date.now() - 11 * HOUR) },
    })
    expect((await client.get('/api/v1/me')).statusCode).toBe(200)
    expect(
      (await deps.db.session.findUniqueOrThrow({ where: { id: session.id } })).expiresAt,
    ).toEqual(recentExpiry)

    // As if issued 13 h ago: used now, it is extended to three days from now.
    await deps.db.session.update({
      where: { id: session.id },
      data: {
        expiresAt: new Date(Date.now() + 3 * DAY - 13 * HOUR),
        updatedAt: new Date(Date.now() - 13 * HOUR),
      },
    })
    const usedAt = Date.now()
    expect((await client.get('/api/v1/me')).statusCode).toBe(200)
    const refreshed = await deps.db.session.findUniqueOrThrow({ where: { id: session.id } })
    expect(Math.abs(refreshed.expiresAt.getTime() - (usedAt + 3 * DAY))).toBeLessThan(60_000)
  })

  it('only an effective super-admin is a super-admin', async () => {
    const cases = [
      { isSuperAdmin: false, twoFactorEnabled: false, expected: false },
      { isSuperAdmin: true, twoFactorEnabled: false, expected: false },
      { isSuperAdmin: true, twoFactorEnabled: true, expected: true },
      { isSuperAdmin: false, twoFactorEnabled: true, expected: false },
    ]
    for (const { isSuperAdmin, twoFactorEnabled, expected } of cases) {
      const client = new TestClient(app)
      const { userId } = await signedInUser(client, deps)
      await deps.db.user.update({ where: { id: userId }, data: { isSuperAdmin, twoFactorEnabled } })
      const label = JSON.stringify({ isSuperAdmin, twoFactorEnabled })

      const me = await client.get('/api/v1/me')
      const user = await client.get('/test/user')

      expect(me.json().isSuperAdmin, label).toBe(expected)
      expect(user.json(), label).toMatchObject({ userId, isSuperAdmin: expected })
    }
  })

  it('ignores server-controlled fields from the client', async () => {
    const organization = await createOrganization(deps.db)
    const client = new TestClient(app)
    const email = uniqueEmail()

    const signUp = await client.post('/api/auth/sign-up/email', {
      name: 'Maria Souza',
      email,
      password: PASSWORD,
      isSuperAdmin: true,
      activeOrganizationId: organization.id,
    })

    expect(signUp.statusCode).toBe(200)
    const created = await deps.db.user.findUniqueOrThrow({ where: { email } })
    expect(created.isSuperAdmin).toBe(false)
    await client.get(await lastEmailUrl(deps, email, 'verify-email'))

    const superAdmin = await client.post('/api/auth/update-user', {
      name: 'Maria Atualizada',
      isSuperAdmin: true,
    })
    const activeOrganization = await client.post('/api/auth/update-user', {
      name: 'Maria Atualizada',
      activeOrganizationId: organization.id,
    })

    expect(superAdmin.statusCode).toBe(400)
    expect(activeOrganization.statusCode).toBe(200)
    expect((await deps.db.user.findUniqueOrThrow({ where: { email } })).isSuperAdmin).toBe(false)
    const sessions = await deps.db.session.findMany({ where: { userId: created.id } })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.activeOrganizationId).toBeNull()
    expect((await client.get('/api/v1/me')).json()).toMatchObject({
      isSuperAdmin: false,
      activeOrganizationId: null,
    })
  })

  it('lists the active organizations by name', async () => {
    const named = new TestClient(app)
    await signedInUser(named, deps)
    await acceptCurrentTerms(named)
    expect((await named.get('/api/v1/me')).json().organizations).toEqual([])

    // Created in reverse order, so insertion order is not the expected one.
    const beta = await named.post('/api/v1/onboarding', { name: 'Beta' })
    const alfa = await named.post('/api/v1/onboarding', { name: 'Alfa' })
    expect(alfa.statusCode).toBe(200)
    expect(beta.statusCode).toBe(200)
    expect((await named.get('/api/v1/me')).json().organizations).toEqual([
      { id: alfa.json().id, name: 'Alfa', role: 'OWNER' },
      { id: beta.json().id, name: 'Beta', role: 'OWNER' },
    ])

    const owner = new TestClient(app)
    await signedInUser(owner, deps)
    await acceptCurrentTerms(owner)
    expect((await owner.post('/api/v1/onboarding', { name: 'Aaa' })).statusCode).toBe(200)
    const guestEmail = uniqueEmail('lista')
    expect(
      (await owner.post('/api/v1/invitations', { email: guestEmail, role: 'ADMIN' })).statusCode,
    ).toBe(200)

    const guest = new TestClient(app)
    await signedInUser(guest, deps, guestEmail)
    const token = new URL(
      await lastEmailUrl(deps, guestEmail, 'invitation'),
      'http://localhost',
    ).searchParams.get('token')
    const accepted = await guest.post('/api/v1/invitations/accept', { token })
    expect(accepted.statusCode).toBe(200)

    const members = await owner.get('/api/v1/members')
    const guestMember = members
      .json()
      .items.find((item: { email: string }) => item.email === guestEmail)
    const deactivated = await owner.patch(`/api/v1/members/${guestMember.id}`, { active: false })
    expect(deactivated.statusCode).toBe(200)

    const first = await guest.post('/api/v1/onboarding', { name: 'Igual' })
    const second = await guest.post('/api/v1/onboarding', { name: 'Igual' })
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    const ids = [first.json().id as string, second.json().id as string].toSorted()

    expect((await guest.get('/api/v1/me')).json().organizations).toEqual([
      { id: ids[0], name: 'Igual', role: 'OWNER' },
      { id: ids[1], name: 'Igual', role: 'OWNER' },
    ])
  })
})

describe('byNameThenId', () => {
  it('orders organizations by name, then by id', () => {
    const rows = [
      { id: 'c', name: 'Beta' },
      { id: 'b', name: 'Alfa' },
      { id: 'a', name: 'Beta' },
      { id: 'a', name: 'Alfa' },
    ]

    expect(rows.toSorted(byNameThenId)).toEqual([
      { id: 'a', name: 'Alfa' },
      { id: 'b', name: 'Alfa' },
      { id: 'a', name: 'Beta' },
      { id: 'c', name: 'Beta' },
    ])
  })
})

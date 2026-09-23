import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, createTestDeps, TEST_APP_URL } from '../../../test/app.ts'
import {
  acceptCurrentTerms,
  emailJobsTo,
  signedInUser,
  TestClient,
  uniqueEmail,
} from '../../../test/auth.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'
import { closeDependencies } from '../../dependencies.ts'
import { sendEmail } from '../../emails/send-email.tsx'
import type { Role } from '../../shared/permissions.ts'
import { acceptInvitation } from './invitation.ts'

const WEEK = 7 * 24 * 60 * 60 * 1000

let app: App
let deps: Deps
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp({ workers: true }))
  await app.ready()
})

afterAll(() => close())

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

async function brokerage(name = `Corretora ${randomUUID().slice(0, 8)}`) {
  const client = new TestClient(app)
  const user = await signedInUser(client, deps)
  await acceptCurrentTerms(client)
  const created = await client.post('/api/v1/onboarding', { name })
  expect(created.statusCode).toBe(200)
  return {
    client,
    userId: user.userId,
    email: user.email,
    organizationId: created.json().id as string,
    name,
  }
}

async function setRole(organizationId: string, userId: string, role: Role) {
  await deps.db.withTenant({ organizationId }, (tx) =>
    tx.member.updateMany({ where: { userId }, data: { role } }),
  )
}

async function addMember(organizationId: string, active = true) {
  const user = await deps.db.user.create({
    data: { name: 'Membro', email: uniqueEmail('membro') },
  })
  await deps.db.withTenant({ organizationId }, (tx) =>
    tx.member.create({ data: { userId: user.id, role: 'COMMERCIAL', active } }),
  )
  return user
}

async function invitationsOf(organizationId: string) {
  return deps.db.withTenant({ organizationId }, (tx) =>
    tx.invitation.findMany({ orderBy: { id: 'asc' } }),
  )
}

async function memberCount(organizationId: string, userId?: string) {
  return deps.db.withTenant({ organizationId }, (tx) =>
    tx.member.count({ where: userId === undefined ? { active: true } : { userId } }),
  )
}

async function auditOf(organizationId: string, action: string) {
  return deps.db.withTenant({ organizationId }, (tx) =>
    tx.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } }),
  )
}

// Waits until some connection is blocked inserting an invitation (a unique-index wait).
async function waitForLockedInsert() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [row] = await deps.db.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND query ILIKE '%INSERT INTO%Invitation%'`
    if ((row?.waiting ?? 0) > 0) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('no invitation insert waited on the unique index within 5s')
}

async function tokenFor(email: string) {
  const job = (await emailJobsTo(deps, email, 'invitation')).at(-1)
  const url = job?.props.url
  if (!url) throw new Error(`no invitation e-mail for ${email}`)
  return new URL(url).searchParams.get('token') ?? ''
}

async function activeOrganizationId(userId: string) {
  const session = await deps.db.session.findFirstOrThrow({ where: { userId } })
  return session.activeOrganizationId
}

describe('POST /api/v1/invitations', () => {
  it('creates a pending invitation and queues the e-mail', async () => {
    const host = await brokerage()
    const roles = ['ADMIN', 'MANAGER', 'COMMERCIAL', 'VIEWER'] as const
    const before = Date.now()

    for (const role of roles) {
      const email = uniqueEmail(role.toLowerCase())
      const response = await host.client.post('/api/v1/invitations', { email, role })
      const after = Date.now()

      expect(response.statusCode, role).toBe(200)
      const body = response.json()
      expect(body.role).toBe(role)
      expect(body.status).toBe('PENDING')
      expect(body.email).toBe(email)
      expect(Object.keys(body).sort()).toEqual(['email', 'expiresAt', 'id', 'role', 'status'])
      const expiresAt = new Date(body.expiresAt as string).getTime()
      expect(expiresAt).toBeGreaterThanOrEqual(before + WEEK)
      expect(expiresAt).toBeLessThanOrEqual(after + WEEK + 1000)

      const token = await tokenFor(email)
      expect(Buffer.from(token, 'base64url')).toHaveLength(32)
      expect(JSON.stringify(body)).not.toContain(token)
      const [job] = await emailJobsTo(deps, email, 'invitation')
      expect(job).toMatchObject({
        template: 'invitation',
        to: email,
        props: { organizationName: host.name },
      })
      expect(job?.props.url).toBe(`${TEST_APP_URL}/accept-invitation?token=${token}`)
      const stored = (await invitationsOf(host.organizationId)).find((row) => row.email === email)
      expect(stored?.tokenHash).toBe(sha256(token))
      expect(stored?.tokenHash).not.toBe(token)
      expect(JSON.stringify(stored)).not.toContain(token)
    }

    expect(await memberCount(host.organizationId)).toBe(1)

    await setRole(host.organizationId, host.userId, 'ADMIN')
    const asAdmin = await host.client.post('/api/v1/invitations', {
      email: uniqueEmail('admin-invite'),
      role: 'COMMERCIAL',
    })
    expect(asAdmin.statusCode).toBe(200)
    expect(await memberCount(host.organizationId)).toBe(1)
  })

  it('rejects a body that is not an email and an invitable role', async () => {
    const host = await brokerage()
    const before = await invitationsOf(host.organizationId)

    const rejected = [
      { email: uniqueEmail(), role: 'OWNER' },
      { role: 'VIEWER' },
      { email: uniqueEmail() },
      { email: uniqueEmail(), role: 'VIEWER', extra: true },
      { email: 'nao-e-email', role: 'VIEWER' },
    ]
    for (const body of rejected) {
      const response = await host.client.post('/api/v1/invitations', body)
      expect(response.statusCode, JSON.stringify(body)).toBe(400)
      expect(response.json().error.code).toBe('VALIDATION_ERROR')
    }
    expect(await invitationsOf(host.organizationId)).toHaveLength(before.length)
  })

  it('rejects an invitation from a role without invitation:create', async () => {
    const host = await brokerage()
    for (const role of ['MANAGER', 'COMMERCIAL', 'VIEWER'] as const) {
      await setRole(host.organizationId, host.userId, role)
      const response = await host.client.post('/api/v1/invitations', {
        email: uniqueEmail(role.toLowerCase()),
        role: 'VIEWER',
      })
      expect(response.statusCode, role).toBe(403)
      expect(response.json().error.code).toBe('FORBIDDEN')
    }
    expect(await invitationsOf(host.organizationId)).toEqual([])
  })

  it('requires a session', async () => {
    const origin = TEST_APP_URL
    const requests = [
      app.inject({
        method: 'POST',
        url: '/api/v1/invitations',
        headers: { origin },
        payload: { email: uniqueEmail(), role: 'VIEWER' },
      }),
      app.inject({ method: 'GET', url: '/api/v1/invitations' }),
      app.inject({
        method: 'DELETE',
        url: `/api/v1/invitations/${randomUUID()}`,
        headers: { origin },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/invitations/accept',
        headers: { origin },
        payload: { token: 'token' },
      }),
    ]
    for (const pending of requests) {
      const response = await pending
      expect(response.statusCode).toBe(401)
      expect(response.json().error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('blocks an invitation while terms are pending', async () => {
    const client = new TestClient(app)
    await signedInUser(client, deps)
    const onboarded = await client.post('/api/v1/onboarding', { name: 'Sem Termos' })
    expect(onboarded.statusCode).toBe(200)

    const response = await client.post('/api/v1/invitations', {
      email: uniqueEmail(),
      role: 'VIEWER',
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('TERMS_NOT_ACCEPTED')
    expect(await invitationsOf(onboarded.json().id as string)).toEqual([])
  })

  it('rejects an invitation for someone who is already a member', async () => {
    const host = await brokerage()
    for (const active of [true, false]) {
      const person = new TestClient(app)
      const user = await signedInUser(person, deps)
      await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
        tx.member.create({ data: { userId: user.userId, role: 'VIEWER', active } }),
      )
      const response = await host.client.post('/api/v1/invitations', {
        email: user.email,
        role: 'COMMERCIAL',
      })
      expect(response.statusCode, String(active)).toBe(409)
      expect(response.json()).toEqual({
        error: {
          code: 'ALREADY_MEMBER',
          message: 'Esta pessoa já é membro da organização.',
        },
      })
    }
    expect(await invitationsOf(host.organizationId)).toEqual([])
  })

  it('rejects a second pending invitation for the same email', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    expect(
      (await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })).statusCode,
    ).toBe(200)

    const response = await host.client.post('/api/v1/invitations', { email, role: 'MANAGER' })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      error: {
        code: 'INVITATION_PENDING',
        message: 'Já existe um convite pendente para este e-mail.',
      },
    })
    expect(await invitationsOf(host.organizationId)).toHaveLength(1)
  })

  it('stores the invited email in lowercase', async () => {
    const host = await brokerage()
    const response = await host.client.post('/api/v1/invitations', {
      email: 'Artur@Exemplo.com',
      role: 'VIEWER',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().email).toBe('artur@exemplo.com')
    expect((await invitationsOf(host.organizationId))[0]?.email).toBe('artur@exemplo.com')

    const again = await host.client.post('/api/v1/invitations', {
      email: 'artur@exemplo.com',
      role: 'VIEWER',
    })
    expect(again.statusCode).toBe(409)
    expect(again.json().error.code).toBe('INVITATION_PENDING')
  })

  it('allows another invitation while a pending one does not consume a seat', async () => {
    const host = await brokerage()
    for (let i = 0; i < 3; i++) await addMember(host.organizationId)
    expect(await memberCount(host.organizationId)).toBe(4)
    expect(
      (await host.client.post('/api/v1/invitations', { email: uniqueEmail(), role: 'VIEWER' }))
        .statusCode,
    ).toBe(200)

    const response = await host.client.post('/api/v1/invitations', {
      email: uniqueEmail(),
      role: 'COMMERCIAL',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().status).toBe('PENDING')
  })

  it('records invitation.create without the email', async () => {
    const host = await brokerage()
    const email = uniqueEmail('trilha')

    const response = await host.client.post('/api/v1/invitations', { email, role: 'COMMERCIAL' })

    expect(response.statusCode).toBe(200)
    const rows = await auditOf(host.organizationId, 'invitation.create')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entityId: response.json().id,
      actorUserId: host.userId,
    })
    expect(rows[0]?.changes).toEqual({ role: 'COMMERCIAL' })
    expect(JSON.stringify(rows[0]).toLowerCase()).not.toContain(email.toLowerCase())
  })

  it('maps a duplicate caught by the unique index to INVITATION_PENDING', async () => {
    const host = await brokerage()
    const email = uniqueEmail('corrida')
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let inserted = () => {}
    const ready = new Promise<void>((resolve) => {
      inserted = resolve
    })
    // An uncommitted pending row: the request's pre-check cannot see it, and its insert waits on
    // the unique index until this transaction commits.
    const blocker = deps.db.withTenant({ organizationId: host.organizationId }, async (tx) => {
      await tx.invitation.create({
        data: {
          email,
          role: 'VIEWER',
          tokenHash: sha256(randomUUID()),
          status: 'PENDING',
          expiresAt: new Date(Date.now() + WEEK),
        },
      })
      inserted()
      await held
    })
    await ready

    const request = host.client.post('/api/v1/invitations', { email, role: 'MANAGER' })
    await waitForLockedInsert()
    release()
    await blocker
    const response = await request

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('INVITATION_PENDING')
    expect(await auditOf(host.organizationId, 'invitation.create')).toEqual([])
  })

  it('does not record a rejected duplicate invitation', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    const first = await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })

    const second = await host.client.post('/api/v1/invitations', { email, role: 'MANAGER' })

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(409)
    expect(second.json().error.code).toBe('INVITATION_PENDING')
    const rows = await auditOf(host.organizationId, 'invitation.create')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.entityId).toBe(first.json().id)
  })

  it('rolls back the invitation when enqueue fails', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    const original = deps.queue.enqueue
    deps.queue.enqueue = () => Promise.reject(new Error('enqueue failed'))
    try {
      const response = await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
      expect(await invitationsOf(host.organizationId)).toEqual([])
      expect(await emailJobsTo(deps, email, 'invitation')).toEqual([])
    } finally {
      deps.queue.enqueue = original
    }
  })
})

describe('GET and DELETE /api/v1/invitations', () => {
  it('lists pending invitations newest first', async () => {
    const host = await brokerage()
    expect((await host.client.get('/api/v1/invitations')).json()).toEqual({ items: [] })

    const older = uniqueEmail('older')
    const newer = uniqueEmail('newer')
    const first = await host.client.post('/api/v1/invitations', { email: older, role: 'VIEWER' })
    const second = await host.client.post('/api/v1/invitations', { email: newer, role: 'MANAGER' })
    await host.client.post('/api/v1/invitations', { email: uniqueEmail('revogado'), role: 'ADMIN' })
    const drop = (await invitationsOf(host.organizationId)).find((row) => row.role === 'ADMIN')
    expect(drop).toBeDefined()
    await host.client.delete(`/api/v1/invitations/${drop?.id}`)

    const listed = await host.client.get('/api/v1/invitations')
    expect(listed.statusCode).toBe(200)
    expect(listed.json().items).toEqual([
      {
        id: second.json().id,
        email: newer,
        role: 'MANAGER',
        expiresAt: second.json().expiresAt,
      },
      {
        id: first.json().id,
        email: older,
        role: 'VIEWER',
        expiresAt: first.json().expiresAt,
      },
    ])

    await setRole(host.organizationId, host.userId, 'ADMIN')
    const asAdmin = await host.client.get('/api/v1/invitations')
    expect(asAdmin.statusCode).toBe(200)
    expect(asAdmin.json().items).toHaveLength(2)
  })

  it('rejects listing and revoking without invitation:create', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    const created = await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })
    expect(created.statusCode).toBe(200)
    const id = created.json().id as string

    for (const role of ['MANAGER', 'COMMERCIAL', 'VIEWER'] as const) {
      await setRole(host.organizationId, host.userId, role)
      const listed = await host.client.get('/api/v1/invitations')
      const removed = await host.client.delete(`/api/v1/invitations/${id}`)
      expect(listed.statusCode, role).toBe(403)
      expect(listed.json().error.code).toBe('FORBIDDEN')
      expect(removed.statusCode, role).toBe(403)
      expect(removed.json().error.code).toBe('FORBIDDEN')
    }
    expect((await invitationsOf(host.organizationId))[0]?.status).toBe('PENDING')
  })

  it('revokes a pending invitation', async () => {
    const host = await brokerage()
    const open = await host.client.post('/api/v1/invitations', {
      email: uniqueEmail(),
      role: 'VIEWER',
    })
    const stale = await host.client.post('/api/v1/invitations', {
      email: uniqueEmail(),
      role: 'MANAGER',
    })
    await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.invitation.update({
        where: { id: stale.json().id as string },
        data: { expiresAt: new Date(Date.now() - 1000) },
      }),
    )

    const first = await host.client.delete(`/api/v1/invitations/${open.json().id}`)
    const second = await host.client.delete(`/api/v1/invitations/${stale.json().id}`)

    expect(first.statusCode).toBe(200)
    expect(first.json()).toEqual({ id: open.json().id, status: 'REVOKED' })
    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual({ id: stale.json().id, status: 'REVOKED' })
  })

  it('records invitation.revoke', async () => {
    const host = await brokerage()
    const created = await host.client.post('/api/v1/invitations', {
      email: uniqueEmail(),
      role: 'VIEWER',
    })
    const id = created.json().id as string

    const response = await host.client.delete(`/api/v1/invitations/${id}`)

    expect(response.statusCode).toBe(200)
    const rows = await auditOf(host.organizationId, 'invitation.revoke')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entityId: id,
      actorUserId: host.userId,
    })
    expect(rows[0]?.changes).toEqual({ status: ['PENDING', 'REVOKED'] })
  })

  it('hides an invitation from another tenant on revoke', async () => {
    const host = await brokerage()
    const other = await brokerage('Outra Casa')
    const created = await other.client.post('/api/v1/invitations', {
      email: uniqueEmail(),
      role: 'VIEWER',
    })
    const foreignId = created.json().id as string

    const missing = await host.client.delete(`/api/v1/invitations/${randomUUID()}`)
    const foreign = await host.client.delete(`/api/v1/invitations/${foreignId}`)

    expect(missing.statusCode).toBe(404)
    expect(missing.json().error.code).toBe('NOT_FOUND')
    expect(foreign.statusCode).toBe(404)
    expect(foreign.json().error.code).toBe('NOT_FOUND')
    expect((await invitationsOf(other.organizationId))[0]?.status).toBe('PENDING')
  })

  it('rejects revoking an invitation that is no longer pending', async () => {
    const host = await brokerage()
    const accepted = await host.client.post('/api/v1/invitations', {
      email: uniqueEmail(),
      role: 'VIEWER',
    })
    const revoked = await host.client.post('/api/v1/invitations', {
      email: uniqueEmail(),
      role: 'MANAGER',
    })
    await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.invitation.update({
        where: { id: accepted.json().id as string },
        data: { status: 'ACCEPTED' },
      }),
    )
    expect((await host.client.delete(`/api/v1/invitations/${revoked.json().id}`)).statusCode).toBe(
      200,
    )

    const againAccepted = await host.client.delete(`/api/v1/invitations/${accepted.json().id}`)
    const againRevoked = await host.client.delete(`/api/v1/invitations/${revoked.json().id}`)

    expect(againAccepted.statusCode).toBe(422)
    expect(againAccepted.json()).toEqual({
      error: { code: 'INVITATION_CLOSED', message: 'Este convite não está mais aberto.' },
    })
    expect(againRevoked.json()).toEqual({
      error: { code: 'INVITATION_CLOSED', message: 'Este convite não está mais aberto.' },
    })
    const rows = await invitationsOf(host.organizationId)
    expect(rows.find((row) => row.id === accepted.json().id)?.status).toBe('ACCEPTED')
    expect(rows.find((row) => row.id === revoked.json().id)?.status).toBe('REVOKED')
  })

  it('does not list the other tenant invitation', async () => {
    const host = await brokerage()
    const other = await brokerage('Vizinha')
    const own = await host.client.post('/api/v1/invitations', {
      email: uniqueEmail(),
      role: 'VIEWER',
    })
    const foreign = await other.client.post('/api/v1/invitations', {
      email: uniqueEmail(),
      role: 'ADMIN',
    })

    const listed = await host.client.get('/api/v1/invitations')

    expect(listed.statusCode).toBe(200)
    expect(listed.body).toContain(own.json().id as string)
    expect(listed.body).not.toContain(foreign.json().id as string)
  })
})

describe('invitation preview and accept', () => {
  it('previews a pending invitation without a session', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    const created = await host.client.post('/api/v1/invitations', { email, role: 'COMMERCIAL' })
    const token = await tokenFor(email)

    const response = await app.inject({
      method: 'GET',
      url: `/api/public/invitations/${token}`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      organizationName: host.name,
      email,
      role: 'COMMERCIAL',
      status: 'PENDING',
      expiresAt: created.json().expiresAt,
    })
  })

  it('hides an unknown invitation token', async () => {
    const token = Buffer.from(randomUUID()).toString('base64url')
    const response = await app.inject({
      method: 'GET',
      url: `/api/public/invitations/${token}`,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('NOT_FOUND')
  })

  it('previews an expired invitation as EXPIRED', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    const created = await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })
    await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.invitation.update({
        where: { id: created.json().id as string },
        data: { expiresAt: new Date(Date.now() - 1000) },
      }),
    )
    const token = await tokenFor(email)

    const response = await app.inject({
      method: 'GET',
      url: `/api/public/invitations/${token}`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().status).toBe('EXPIRED')
    expect((await invitationsOf(host.organizationId))[0]?.status).toBe('PENDING')
  })

  it('previews a revoked invitation', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    const created = await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })
    expect((await host.client.delete(`/api/v1/invitations/${created.json().id}`)).statusCode).toBe(
      200,
    )
    const token = await tokenFor(email)

    const response = await app.inject({
      method: 'GET',
      url: `/api/public/invitations/${token}`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().status).toBe('REVOKED')
  })

  it('previews an accepted invitation', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    const created = await host.client.post('/api/v1/invitations', { email, role: 'MANAGER' })
    await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.invitation.update({
        where: { id: created.json().id as string },
        data: { status: 'ACCEPTED' },
      }),
    )
    const token = await tokenFor(email)

    const response = await app.inject({
      method: 'GET',
      url: `/api/public/invitations/${token}`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().status).toBe('ACCEPTED')
  })

  it('accepts the invitation and switches the active organization', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    const created = await host.client.post('/api/v1/invitations', { email, role: 'COMMERCIAL' })
    const person = new TestClient(app)
    const user = await signedInUser(person, deps, email)

    const response = await person.post('/api/v1/invitations/accept', {
      token: await tokenFor(email),
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ organizationId: host.organizationId, role: 'COMMERCIAL' })
    expect(response.body).not.toContain('NO_ACTIVE_ORGANIZATION')
    const member = await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.member.findFirstOrThrow({ where: { userId: user.userId } }),
    )
    expect(member).toMatchObject({ role: 'COMMERCIAL', active: true, commissionSplitBp: 0 })
    expect((await invitationsOf(host.organizationId))[0]?.status).toBe('ACCEPTED')
    expect(await activeOrganizationId(user.userId)).toBe(host.organizationId)
    expect(created.statusCode).toBe(200)
  })

  it('records invitation.accept in the invited organization', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    const created = await host.client.post('/api/v1/invitations', { email, role: 'COMMERCIAL' })
    const person = new TestClient(app)
    const user = await signedInUser(person, deps, email)

    const response = await person.post('/api/v1/invitations/accept', {
      token: await tokenFor(email),
    })

    expect(response.statusCode).toBe(200)
    const member = await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.member.findFirstOrThrow({ where: { userId: user.userId } }),
    )
    const rows = await auditOf(host.organizationId, 'invitation.accept')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actorUserId: user.userId,
      entityId: member.id,
    })
    expect(rows[0]?.changes).toEqual({ role: 'COMMERCIAL', invitationId: created.json().id })
  })

  it('does not record an accept past the seat cap', async () => {
    const host = await brokerage()
    for (let i = 0; i < 4; i++) await addMember(host.organizationId)
    expect(await memberCount(host.organizationId)).toBe(5)
    const email = uniqueEmail()
    await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })
    const person = new TestClient(app)
    await signedInUser(person, deps, email)

    const response = await person.post('/api/v1/invitations/accept', {
      token: await tokenFor(email),
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('USER_QUOTA_REACHED')
    expect(await auditOf(host.organizationId, 'invitation.accept')).toEqual([])
  })

  it('rejects an accept body that is not the token', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })
    const person = new TestClient(app)
    const user = await signedInUser(person, deps, email)
    const token = await tokenFor(email)

    const extra = await person.post('/api/v1/invitations/accept', { token, extra: true })
    const missing = await person.post('/api/v1/invitations/accept', {})

    expect(extra.statusCode).toBe(400)
    expect(extra.json().error.code).toBe('VALIDATION_ERROR')
    expect(missing.statusCode).toBe(400)
    expect(missing.json().error.code).toBe('VALIDATION_ERROR')
    expect(await memberCount(host.organizationId, user.userId)).toBe(0)
    expect((await invitationsOf(host.organizationId))[0]?.status).toBe('PENDING')
  })

  it('rejects an accept from a different email', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })
    const other = new TestClient(app)
    const user = await signedInUser(other, deps)

    const response = await other.post('/api/v1/invitations/accept', {
      token: await tokenFor(email),
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: {
        code: 'INVITATION_EMAIL_MISMATCH',
        message: 'Este convite é para outro e-mail.',
      },
    })
    expect(await memberCount(host.organizationId, user.userId)).toBe(0)
  })

  it('rejects an expired invitation', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    const created = await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })
    await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.invitation.update({
        where: { id: created.json().id as string },
        data: { expiresAt: new Date(Date.now() - 1000) },
      }),
    )
    const person = new TestClient(app)
    const user = await signedInUser(person, deps, email)

    const response = await person.post('/api/v1/invitations/accept', {
      token: await tokenFor(email),
    })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({
      error: { code: 'INVITATION_EXPIRED', message: 'Este convite expirou.' },
    })
    expect(await memberCount(host.organizationId, user.userId)).toBe(0)
  })

  it('rejects an accept that is no longer open', async () => {
    const host = await brokerage()
    const revokedEmail = uniqueEmail('revogado')
    const acceptedEmail = uniqueEmail('aceito')
    const revoked = await host.client.post('/api/v1/invitations', {
      email: revokedEmail,
      role: 'VIEWER',
    })
    const accepted = await host.client.post('/api/v1/invitations', {
      email: acceptedEmail,
      role: 'MANAGER',
    })
    await host.client.delete(`/api/v1/invitations/${revoked.json().id}`)
    await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.invitation.update({
        where: { id: accepted.json().id as string },
        data: { status: 'ACCEPTED' },
      }),
    )
    const revokedUser = new TestClient(app)
    const acceptedUser = new TestClient(app)
    const revokedAccount = await signedInUser(revokedUser, deps, revokedEmail)
    const acceptedAccount = await signedInUser(acceptedUser, deps, acceptedEmail)

    const closedRevoked = await revokedUser.post('/api/v1/invitations/accept', {
      token: await tokenFor(revokedEmail),
    })
    const closedAccepted = await acceptedUser.post('/api/v1/invitations/accept', {
      token: await tokenFor(acceptedEmail),
    })

    expect(closedRevoked.statusCode).toBe(422)
    expect(closedRevoked.json().error.code).toBe('INVITATION_CLOSED')
    expect(closedAccepted.statusCode).toBe(422)
    expect(closedAccepted.json().error.code).toBe('INVITATION_CLOSED')
    expect(await memberCount(host.organizationId, revokedAccount.userId)).toBe(0)
    expect(await memberCount(host.organizationId, acceptedAccount.userId)).toBe(0)
  })

  it('rejects an accept when the plan has no seat left', async () => {
    const full = await brokerage('Lotada')
    for (let i = 0; i < 4; i++) await addMember(full.organizationId)
    const blockedEmail = uniqueEmail('sem-vaga')
    const blocked = await full.client.post('/api/v1/invitations', {
      email: blockedEmail,
      role: 'VIEWER',
    })
    const blockedUser = new TestClient(app)
    await signedInUser(blockedUser, deps, blockedEmail)

    const denied = await blockedUser.post('/api/v1/invitations/accept', {
      token: await tokenFor(blockedEmail),
    })

    expect(denied.statusCode).toBe(422)
    expect(denied.json()).toEqual({
      error: {
        code: 'USER_QUOTA_REACHED',
        message: 'O plano não tem vagas para outro usuário.',
      },
    })
    expect((await invitationsOf(full.organizationId))[0]?.status).toBe('PENDING')
    expect(blocked.statusCode).toBe(200)

    const room = await brokerage('Com Vaga')
    for (let i = 0; i < 3; i++) await addMember(room.organizationId)
    await addMember(room.organizationId, false)
    expect(await memberCount(room.organizationId)).toBe(4)
    const allowedEmail = uniqueEmail('com-vaga')
    await room.client.post('/api/v1/invitations', { email: allowedEmail, role: 'COMMERCIAL' })
    const allowedUser = new TestClient(app)
    await signedInUser(allowedUser, deps, allowedEmail)

    const accepted = await allowedUser.post('/api/v1/invitations/accept', {
      token: await tokenFor(allowedEmail),
    })

    expect(accepted.statusCode).toBe(200)
    expect(await memberCount(room.organizationId)).toBe(5)
  })

  it('rejects an accept past the organization limit', async () => {
    const person = new TestClient(app)
    const user = await signedInUser(person, deps)
    await acceptCurrentTerms(person)
    for (const name of ['Um', 'Dois', 'Tres']) {
      expect((await person.post('/api/v1/onboarding', { name })).statusCode).toBe(200)
    }
    const host = await brokerage()
    const created = await host.client.post('/api/v1/invitations', {
      email: user.email,
      role: 'VIEWER',
    })

    const response = await person.post('/api/v1/invitations/accept', {
      token: await tokenFor(user.email),
    })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({
      error: {
        code: 'ORG_LIMIT_REACHED',
        message: 'Você já participa do número máximo de organizações.',
      },
    })
    expect((await invitationsOf(host.organizationId))[0]?.id).toBe(created.json().id)
    expect((await invitationsOf(host.organizationId))[0]?.status).toBe('PENDING')
    expect(
      await deps.db.withUser(user.userId, (tx) =>
        tx.member.count({ where: { userId: user.userId } }),
      ),
    ).toBe(3)
  })

  it('rejects an accept when the email is already a member', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    await host.client.post('/api/v1/invitations', { email, role: 'MANAGER' })
    const person = new TestClient(app)
    const user = await signedInUser(person, deps, email)
    await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.member.create({ data: { userId: user.userId, role: 'VIEWER', active: true } }),
    )

    const response = await person.post('/api/v1/invitations/accept', {
      token: await tokenFor(email),
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('ALREADY_MEMBER')
    expect((await invitationsOf(host.organizationId))[0]?.status).toBe('PENDING')
  })

  it('keeps a single new member when two accepts race for the last seat', async () => {
    const host = await brokerage()
    for (let i = 0; i < 3; i++) await addMember(host.organizationId)
    const emails = [uniqueEmail('corrida-a'), uniqueEmail('corrida-b')]
    for (const email of emails) {
      expect(
        (await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })).statusCode,
      ).toBe(200)
    }
    const people = await Promise.all(
      emails.map(async (email) => {
        const client = new TestClient(app)
        await signedInUser(client, deps, email)
        return client
      }),
    )
    const tokens = await Promise.all(emails.map((email) => tokenFor(email)))

    const results = await Promise.all(
      people.map((client, index) =>
        client.post('/api/v1/invitations/accept', { token: tokens[index] }),
      ),
    )

    const codes = results.map((result) => result.statusCode).sort()
    expect(codes).toEqual([200, 422])
    expect(results.find((result) => result.statusCode === 422)?.json().error.code).toBe(
      'USER_QUOTA_REACHED',
    )
    expect(await memberCount(host.organizationId)).toBe(5)
    const statuses = (await invitationsOf(host.organizationId)).map((row) => row.status).sort()
    expect(statuses).toEqual(['ACCEPTED', 'PENDING'])
  })

  it('joins the invited organization even when another one is active', async () => {
    const person = new TestClient(app)
    const user = await signedInUser(person, deps)
    await acceptCurrentTerms(person)
    const home = await person.post('/api/v1/onboarding', { name: 'Casa A' })
    const host = await brokerage('Casa B')
    await host.client.post('/api/v1/invitations', { email: user.email, role: 'ADMIN' })

    const response = await person.post('/api/v1/invitations/accept', {
      token: await tokenFor(user.email),
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().organizationId).toBe(host.organizationId)
    expect(await activeOrganizationId(user.userId)).toBe(host.organizationId)
    expect(await memberCount(host.organizationId, user.userId)).toBe(1)
    expect(await memberCount(home.json().id as string, user.userId)).toBe(1)
  })

  it('rolls back the accept when the subscription is missing', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })
    const person = new TestClient(app)
    const user = await signedInUser(person, deps, email)
    await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.subscription.deleteMany(),
    )

    const response = await person.post('/api/v1/invitations/accept', {
      token: await tokenFor(email),
    })

    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    const session = await deps.db.session.findFirstOrThrow({ where: { userId: user.userId } })
    await expect(
      acceptInvitation(
        { db: deps.db, maxOrgsPerUser: deps.config.MAX_ORGS_PER_USER },
        { requestId: 'test', userId: user.userId, sessionId: session.id, isSuperAdmin: false },
        { token: await tokenFor(email) },
      ),
    ).rejects.toThrow(host.organizationId)
    expect(await memberCount(host.organizationId, user.userId)).toBe(0)
    expect((await invitationsOf(host.organizationId))[0]?.status).toBe('PENDING')
  })

  it('keeps the invitation when the mailer fails', async () => {
    const host = await brokerage()
    const email = uniqueEmail()
    expect(
      (await host.client.post('/api/v1/invitations', { email, role: 'VIEWER' })).statusCode,
    ).toBe(200)
    const [job] = await emailJobsTo(deps, email, 'invitation')
    const failing = await createTestDeps({ SMTP_URL: 'smtp://127.0.0.1:1' })
    try {
      await expect(sendEmail(failing.mailer, job)).rejects.toThrow()
    } finally {
      await closeDependencies(failing)
    }

    expect((await invitationsOf(host.organizationId))[0]?.status).toBe('PENDING')
  })
})

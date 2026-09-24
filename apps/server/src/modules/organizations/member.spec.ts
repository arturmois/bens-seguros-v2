import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { acceptCurrentTerms, signedInUser, TestClient, uniqueEmail } from '../../../test/auth.ts'
import { withTwoSalespeople, withTwoTenants } from '../../../test/factories.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'
import { permissionsFor, type Role } from '../../shared/permissions.ts'
import { updateMember } from './member.ts'
import { portfolioMoves } from './portfolio.ts'

let app: App
let deps: Deps
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp({ workers: true }))
  await app.ready()
})

afterAll(() => close())

async function brokerage() {
  const client = new TestClient(app)
  const user = await signedInUser(client, deps)
  await acceptCurrentTerms(client)
  const created = await client.post('/api/v1/onboarding', {
    name: `Corretora ${randomUUID().slice(0, 8)}`,
  })
  expect(created.statusCode).toBe(200)
  const owner = await deps.db.withTenant({ organizationId: created.json().id as string }, (tx) =>
    tx.member.findFirstOrThrow({ where: { userId: user.userId } }),
  )
  return {
    client,
    userId: user.userId,
    email: user.email,
    organizationId: created.json().id as string,
    memberId: owner.id,
  }
}

async function setRole(organizationId: string, userId: string, role: Role) {
  await deps.db.withTenant({ organizationId }, (tx) =>
    tx.member.updateMany({ where: { userId }, data: { role } }),
  )
}

async function addMember(organizationId: string, role: Role = 'COMMERCIAL', active = true) {
  const user = await deps.db.user.create({
    data: { name: 'Membro', email: uniqueEmail('membro') },
  })
  const member = await deps.db.withTenant({ organizationId }, (tx) =>
    tx.member.create({ data: { userId: user.id, role, active } }),
  )
  return { user, member }
}

async function colleague(organizationId: string, role: Role) {
  const client = new TestClient(app)
  const user = await signedInUser(client, deps)
  await acceptCurrentTerms(client)
  const member = await deps.db.withTenant({ organizationId }, (tx) =>
    tx.member.create({ data: { userId: user.userId, role, active: true } }),
  )
  await deps.db.session.updateMany({
    where: { userId: user.userId },
    data: { activeOrganizationId: organizationId },
  })
  return { client, userId: user.userId, email: user.email, memberId: member.id }
}

async function auditsOf(organizationId: string, entityId: string) {
  return deps.db.withTenant({ organizationId }, (tx) =>
    tx.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } }),
  )
}

async function memberOf(organizationId: string, id: string) {
  return deps.db.withTenant({ organizationId }, (tx) =>
    tx.member.findFirstOrThrow({ where: { id } }),
  )
}

describe('PATCH /api/v1/members/:id', () => {
  it('changes a member role and records the audit', async () => {
    const host = await brokerage()
    const admin = await colleague(host.organizationId, 'ADMIN')
    const target = await addMember(host.organizationId, 'COMMERCIAL')
    const roles = ['ADMIN', 'MANAGER', 'COMMERCIAL'] as const
    let previous: Role = 'COMMERCIAL'

    for (const caller of [host, admin]) {
      for (const role of roles) {
        const response = await caller.client.patch(`/api/v1/members/${target.member.id}`, { role })
        expect(response.statusCode, role).toBe(200)
        expect(response.json().role).toBe(role)
        expect(Object.keys(response.json()).sort()).toEqual([
          'active',
          'email',
          'id',
          'name',
          'role',
          'userId',
        ])
        const trail = await auditsOf(host.organizationId, target.member.id)
        expect(trail.at(-1)?.action).toBe('member.update')
        expect(trail.at(-1)?.changes).toMatchObject({ role: [previous, role] })
        previous = role
      }
    }
  })

  it('deactivates a member', async () => {
    const host = await brokerage()
    const target = await addMember(host.organizationId, 'COMMERCIAL')

    const response = await host.client.patch(`/api/v1/members/${target.member.id}`, {
      active: false,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().active).toBe(false)
    expect((await auditsOf(host.organizationId, target.member.id)).at(-1)?.changes).toMatchObject({
      active: [true, false],
    })
  })

  it('reactivates a member under the seat cap', async () => {
    const host = await brokerage()
    const target = await addMember(host.organizationId, 'COMMERCIAL', false)

    const response = await host.client.patch(`/api/v1/members/${target.member.id}`, {
      active: true,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().active).toBe(true)
    expect((await auditsOf(host.organizationId, target.member.id)).at(-1)?.changes).toMatchObject({
      active: [false, true],
    })
  })

  it('cites the organization when the subscription is missing on reactivation', async () => {
    const host = await brokerage()
    const target = await addMember(host.organizationId, 'COMMERCIAL', false)
    await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.subscription.deleteMany(),
    )
    const ctx = {
      requestId: 'test',
      userId: host.userId,
      sessionId: randomUUID(),
      isSuperAdmin: false,
      organizationId: host.organizationId,
      role: 'ADMIN' as const,
      permissions: permissionsFor('ADMIN'),
    }

    await expect(
      updateMember({ db: deps.db }, ctx, target.member.id, { active: true }),
    ).rejects.toThrow(host.organizationId)
    const stored = await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.member.findUniqueOrThrow({ where: { id: target.member.id } }),
    )
    expect(stored.active).toBe(false)
  })

  it('rejects a reactivation past the seat cap', async () => {
    const host = await brokerage()
    for (let i = 0; i < 4; i++) await addMember(host.organizationId)
    const target = await addMember(host.organizationId, 'COMMERCIAL', false)
    const before = await auditsOf(host.organizationId, target.member.id)

    const response = await host.client.patch(`/api/v1/members/${target.member.id}`, {
      role: 'ADMIN',
      active: true,
    })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({
      error: {
        code: 'USER_QUOTA_REACHED',
        message: 'O plano não tem vagas para outro usuário.',
      },
    })
    const member = await memberOf(host.organizationId, target.member.id)
    expect(member.active).toBe(false)
    expect(member.role).toBe('COMMERCIAL')
    expect(await auditsOf(host.organizationId, target.member.id)).toEqual(before)
  })

  it('keeps a single reactivation when two race for the last seat', async () => {
    const host = await brokerage()
    for (let i = 0; i < 3; i++) await addMember(host.organizationId)
    const first = await addMember(host.organizationId, 'COMMERCIAL', false)
    const second = await addMember(host.organizationId, 'COMMERCIAL', false)

    const results = await Promise.all(
      [first, second].map((target) =>
        host.client.patch(`/api/v1/members/${target.member.id}`, { active: true }),
      ),
    )

    const codes = results.map((result) => result.statusCode).sort()
    expect(codes).toEqual([200, 422])
    expect(results.find((result) => result.statusCode === 422)?.json().error.code).toBe(
      'USER_QUOTA_REACHED',
    )
    const active = await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.member.count({ where: { active: true } }),
    )
    expect(active).toBe(5)
  })

  it('rejects OWNER and VIEWER as a member role', async () => {
    const host = await brokerage()
    const target = await addMember(host.organizationId, 'COMMERCIAL')

    for (const role of ['OWNER', 'VIEWER']) {
      const response = await host.client.patch(`/api/v1/members/${target.member.id}`, { role })
      expect(response.statusCode, role).toBe(400)
    }

    expect((await memberOf(host.organizationId, target.member.id)).role).toBe('COMMERCIAL')
  })

  it('refuses to demote the last active admin', async () => {
    const host = await brokerage()
    await addMember(host.organizationId, 'MANAGER')
    const before = await auditsOf(host.organizationId, host.memberId)

    const response = await host.client.patch(`/api/v1/members/${host.memberId}`, {
      role: 'MANAGER',
    })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({
      error: {
        code: 'LAST_ADMIN',
        message: 'A corretora precisa de pelo menos um administrador ativo.',
      },
    })
    expect(await memberOf(host.organizationId, host.memberId)).toMatchObject({
      role: 'ADMIN',
      active: true,
    })
    expect(await auditsOf(host.organizationId, host.memberId)).toEqual(before)
  })

  it('refuses to deactivate the last active admin', async () => {
    const host = await brokerage()
    const before = await auditsOf(host.organizationId, host.memberId)

    const response = await host.client.patch(`/api/v1/members/${host.memberId}`, {
      active: false,
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('LAST_ADMIN')
    expect(await memberOf(host.organizationId, host.memberId)).toMatchObject({
      role: 'ADMIN',
      active: true,
    })
    expect(await auditsOf(host.organizationId, host.memberId)).toEqual(before)
  })

  it('demotes an admin while another admin is active', async () => {
    const host = await brokerage()
    const admin = await colleague(host.organizationId, 'ADMIN')

    const response = await host.client.patch(`/api/v1/members/${admin.memberId}`, {
      role: 'COMMERCIAL',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().role).toBe('COMMERCIAL')
    expect((await memberOf(host.organizationId, admin.memberId)).role).toBe('COMMERCIAL')
    const trail = await auditsOf(host.organizationId, admin.memberId)
    expect(trail.at(-1)?.action).toBe('member.update')
    expect(trail.at(-1)?.changes).toEqual({ role: ['ADMIN', 'COMMERCIAL'] })
  })

  it('only guards changes that remove the last active admin', async () => {
    const host = await brokerage()
    const inactiveAdmin = await addMember(host.organizationId, 'ADMIN', false)
    const manager = await addMember(host.organizationId, 'MANAGER')

    const demoted = await host.client.patch(`/api/v1/members/${inactiveAdmin.member.id}`, {
      role: 'COMMERCIAL',
    })
    const deactivated = await host.client.patch(`/api/v1/members/${manager.member.id}`, {
      active: false,
    })

    expect(demoted.statusCode).toBe(200)
    expect((await memberOf(host.organizationId, inactiveAdmin.member.id)).role).toBe('COMMERCIAL')
    expect(deactivated.statusCode).toBe(200)
    expect((await memberOf(host.organizationId, manager.member.id)).active).toBe(false)
  })

  it('counts only active admins when guarding the last one', async () => {
    const host = await brokerage()
    await addMember(host.organizationId, 'ADMIN', false)
    const before = await auditsOf(host.organizationId, host.memberId)

    const response = await host.client.patch(`/api/v1/members/${host.memberId}`, {
      role: 'COMMERCIAL',
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('LAST_ADMIN')
    expect((await memberOf(host.organizationId, host.memberId)).role).toBe('ADMIN')
    expect(await auditsOf(host.organizationId, host.memberId)).toEqual(before)
  })

  it('keeps one admin when two demotions race', async () => {
    for (let round = 0; round < 5; round++) {
      const host = await brokerage()
      const admin = await colleague(host.organizationId, 'ADMIN')

      const results = await Promise.all(
        [host.memberId, admin.memberId].map((id) =>
          host.client.patch(`/api/v1/members/${id}`, { role: 'COMMERCIAL' }),
        ),
      )

      // The loser gets 422 LAST_ADMIN, or 403 when the self-demotion committed before its
      // permission check ran: both keep the organization with one active ADMIN.
      const codes = results.map((result) => result.statusCode)
      expect(
        codes.filter((code) => code === 200),
        `round ${round}`,
      ).toHaveLength(1)
      const loser = results.find((result) => result.statusCode !== 200)
      expect([422, 403], `round ${round}`).toContain(loser?.statusCode)
      expect(loser?.json().error.code).toBe(loser?.statusCode === 422 ? 'LAST_ADMIN' : 'FORBIDDEN')
      const admins = await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
        tx.member.count({ where: { role: 'ADMIN', active: true } }),
      )
      expect(admins, `round ${round}`).toBe(1)
    }
  })

  it('lets exactly one of two racing demotions through the use case', async () => {
    for (let round = 0; round < 5; round++) {
      const host = await brokerage()
      const admin = await colleague(host.organizationId, 'ADMIN')
      const ctx = {
        requestId: 'test',
        userId: host.userId,
        sessionId: randomUUID(),
        isSuperAdmin: false,
        organizationId: host.organizationId,
        role: 'ADMIN' as const,
        permissions: permissionsFor('ADMIN'),
      }

      const results = await Promise.allSettled(
        [host.memberId, admin.memberId].map((id) =>
          updateMember({ db: deps.db }, ctx, id, { role: 'COMMERCIAL' }),
        ),
      )

      expect(
        results.filter((result) => result.status === 'fulfilled'),
        `round ${round}`,
      ).toHaveLength(1)
      const rejected = results.find((result) => result.status === 'rejected')
      expect(rejected?.status === 'rejected' && rejected.reason, `round ${round}`).toMatchObject({
        status: 422,
        code: 'LAST_ADMIN',
      })
      const admins = await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
        tx.member.count({ where: { role: 'ADMIN', active: true } }),
      )
      expect(admins, `round ${round}`).toBe(1)
    }
  })

  it('lets an admin demote themself while another admin is active', async () => {
    const host = await brokerage()
    await colleague(host.organizationId, 'ADMIN')

    const response = await host.client.patch(`/api/v1/members/${host.memberId}`, {
      role: 'MANAGER',
    })
    const me = await host.client.get('/api/v1/me')

    expect(response.statusCode).toBe(200)
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ role: 'MANAGER', permissions: ['organization:read'] })
  })

  it('rejects a member body that is not a role or an active flag', async () => {
    const host = await brokerage()
    const target = await addMember(host.organizationId, 'COMMERCIAL')
    const bodies = [{ role: 'OWNER' }, {}, { role: 'COMMERCIAL', extra: true }]

    for (const body of bodies) {
      const response = await host.client.patch(`/api/v1/members/${target.member.id}`, body)
      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('VALIDATION_ERROR')
    }

    expect((await memberOf(host.organizationId, target.member.id)).role).toBe('COMMERCIAL')
  })

  it('rejects a member change from a role without member:update', async () => {
    const host = await brokerage()
    const target = await addMember(host.organizationId, 'COMMERCIAL')

    for (const role of ['MANAGER', 'COMMERCIAL'] as const) {
      const caller = await colleague(host.organizationId, role)
      const response = await caller.client.patch(`/api/v1/members/${target.member.id}`, {
        role: 'ADMIN',
      })
      expect(response.statusCode, role).toBe(403)
      expect(response.json().error.code).toBe('FORBIDDEN')
    }

    expect((await memberOf(host.organizationId, target.member.id)).role).toBe('COMMERCIAL')
  })

  it('requires a session', async () => {
    const client = new TestClient(app)
    const id = randomUUID()
    const requests = [
      client.patch(`/api/v1/members/${id}`, { role: 'COMMERCIAL' }),
      client.get('/api/v1/members'),
      client.post(`/api/v1/members/${id}/transfer-portfolio`, { toMemberId: randomUUID() }),
    ]
    for (const pending of requests) {
      const response = await pending
      expect(response.statusCode).toBe(401)
      expect(response.json().error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('blocks a member change while terms are pending', async () => {
    const client = new TestClient(app)
    await signedInUser(client, deps)
    const onboarded = await client.post('/api/v1/onboarding', { name: 'Sem Termos' })
    expect(onboarded.statusCode).toBe(200)
    const organizationId = onboarded.json().id as string
    const target = await addMember(organizationId, 'COMMERCIAL')

    const response = await client.patch(`/api/v1/members/${target.member.id}`, { role: 'ADMIN' })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('TERMS_NOT_ACCEPTED')
    expect((await memberOf(organizationId, target.member.id)).role).toBe('COMMERCIAL')
  })

  it('returns not found for an unknown member', async () => {
    const host = await brokerage()

    const response = await host.client.patch(`/api/v1/members/${randomUUID()}`, { role: 'ADMIN' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Membro não encontrado.' },
    })
  })

  it('does not record an audit when the member is unchanged', async () => {
    const host = await brokerage()
    const target = await addMember(host.organizationId, 'COMMERCIAL')
    const before = await auditsOf(host.organizationId, target.member.id)

    const response = await host.client.patch(`/api/v1/members/${target.member.id}`, {
      role: 'COMMERCIAL',
      active: true,
    })

    expect(response.statusCode).toBe(200)
    expect(await auditsOf(host.organizationId, target.member.id)).toEqual(before)
  })

  it('deactivates the caller and the next organization read is not found', async () => {
    const host = await brokerage()
    const admin = await colleague(host.organizationId, 'ADMIN')

    const response = await admin.client.patch(`/api/v1/members/${admin.memberId}`, {
      active: false,
    })
    const organization = await admin.client.get('/api/v1/organization')

    expect(response.statusCode).toBe(200)
    expect(organization.statusCode).toBe(404)
    expect(organization.json().error.code).toBe('NOT_FOUND')
  })

  it('does not change the other tenant member', async () => {
    const host = await brokerage()
    const { tenantB } = await withTwoTenants(deps.db)
    const foreign = await addMember(tenantB.organizationId, 'COMMERCIAL')

    const response = await host.client.patch(`/api/v1/members/${foreign.member.id}`, {
      role: 'ADMIN',
    })

    expect(response.statusCode).toBe(404)
    expect((await memberOf(tenantB.organizationId, foreign.member.id)).role).toBe('COMMERCIAL')
  })
})

describe('GET /api/v1/members', () => {
  it('lists members newest first including inactive', async () => {
    const host = await brokerage()
    const older = await addMember(host.organizationId, 'COMMERCIAL')
    const newer = await addMember(host.organizationId, 'MANAGER')
    const deactivated = await host.client.patch(`/api/v1/members/${newer.member.id}`, {
      active: false,
    })
    expect(deactivated.statusCode).toBe(200)

    const listed = await host.client.get('/api/v1/members')
    expect(listed.statusCode).toBe(200)
    expect(listed.json().items.map((item: { id: string }) => item.id)).toEqual([
      newer.member.id,
      older.member.id,
      host.memberId,
    ])
    expect(listed.json().items[0]).toEqual({
      id: newer.member.id,
      userId: newer.user.id,
      role: 'MANAGER',
      active: false,
      email: newer.user.email,
      name: 'Membro',
    })
    for (const item of listed.json().items) {
      expect(Object.keys(item).sort()).toEqual(['active', 'email', 'id', 'name', 'role', 'userId'])
    }

    await setRole(host.organizationId, host.userId, 'ADMIN')
    const asAdmin = await host.client.get('/api/v1/members')
    expect(asAdmin.statusCode).toBe(200)
    expect(asAdmin.json().items).toHaveLength(3)
    for (const item of asAdmin.json().items) {
      expect(Object.keys(item).sort()).toEqual(['active', 'email', 'id', 'name', 'role', 'userId'])
    }
  })

  it('requires a session to list members', async () => {
    const response = await new TestClient(app).get('/api/v1/members')

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('UNAUTHENTICATED')
  })

  it('rejects listing members without member:update', async () => {
    const host = await brokerage()
    for (const role of ['MANAGER', 'COMMERCIAL'] as const) {
      const caller = await colleague(host.organizationId, role)
      const response = await caller.client.get('/api/v1/members')
      expect(response.statusCode, role).toBe(403)
      expect(response.json().error.code).toBe('FORBIDDEN')
    }
  })

  it('blocks listing members while terms are pending', async () => {
    const client = new TestClient(app)
    await signedInUser(client, deps)
    const onboarded = await client.post('/api/v1/onboarding', { name: 'Sem Termos Lista' })
    expect(onboarded.statusCode).toBe(200)

    const response = await client.get('/api/v1/members')

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('TERMS_NOT_ACCEPTED')
  })

  it('hides the other tenant from the member list', async () => {
    const host = await brokerage()
    const { tenantB } = await withTwoTenants(deps.db)
    const foreign = await addMember(tenantB.organizationId, 'COMMERCIAL')

    const listed = await host.client.get('/api/v1/members')

    expect(listed.statusCode).toBe(200)
    expect(listed.json().items.some((item: { id: string }) => item.id === foreign.member.id)).toBe(
      false,
    )
  })
})

describe('POST /api/v1/members/:id/transfer-portfolio', () => {
  it('transfers an empty portfolio and records the audit', async () => {
    const host = await brokerage()
    const admin = await colleague(host.organizationId, 'ADMIN')
    const target = await addMember(host.organizationId, 'COMMERCIAL')
    portfolioMoves.length = 0

    for (const caller of [host, admin]) {
      const response = await caller.client.post(
        `/api/v1/members/${caller.memberId}/transfer-portfolio`,
        { toMemberId: target.member.id },
      )
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ transferred: 0 })
      const trail = await auditsOf(host.organizationId, caller.memberId)
      expect(trail.at(-1)?.action).toBe('portfolio.transfer')
      expect(trail.at(-1)?.changes).toEqual({
        fromMemberId: caller.memberId,
        toMemberId: target.member.id,
        transferred: 0,
      })
    }
  })

  it('adds the rows a registered move reports', async () => {
    const host = await brokerage()
    const target = await addMember(host.organizationId, 'COMMERCIAL')
    portfolioMoves.length = 0
    portfolioMoves.push(async (tx, fromUserId) => {
      await tx.member.updateMany({ where: { userId: fromUserId }, data: { active: false } })
      return 2
    })

    try {
      const response = await host.client.post(
        `/api/v1/members/${host.memberId}/transfer-portfolio`,
        { toMemberId: target.member.id },
      )
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ transferred: 2 })
      expect((await memberOf(host.organizationId, host.memberId)).active).toBe(false)
      expect((await auditsOf(host.organizationId, host.memberId)).at(-1)?.changes).toMatchObject({
        transferred: 2,
      })
    } finally {
      portfolioMoves.length = 0
    }
  })

  it('rolls back the transfer when a move throws', async () => {
    const host = await brokerage()
    const target = await addMember(host.organizationId, 'COMMERCIAL')
    const before = await auditsOf(host.organizationId, host.memberId)
    portfolioMoves.length = 0
    portfolioMoves.push(async (tx, fromUserId) => {
      await tx.member.updateMany({ where: { userId: fromUserId }, data: { active: false } })
      return 1
    })
    portfolioMoves.push(() => Promise.reject(new Error('move failed')))

    try {
      const response = await host.client.post(
        `/api/v1/members/${host.memberId}/transfer-portfolio`,
        { toMemberId: target.member.id },
      )
      expect(response.statusCode).toBe(500)
      expect((await memberOf(host.organizationId, host.memberId)).active).toBe(true)
      expect(await auditsOf(host.organizationId, host.memberId)).toEqual(before)
    } finally {
      portfolioMoves.length = 0
    }
  })

  it('rejects a transfer to the same member', async () => {
    const host = await brokerage()
    const before = await auditsOf(host.organizationId, host.memberId)

    const response = await host.client.post(`/api/v1/members/${host.memberId}/transfer-portfolio`, {
      toMemberId: host.memberId,
    })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({
      error: {
        code: 'SAME_MEMBER',
        message: 'A carteira não pode ser transferida para o mesmo membro.',
      },
    })
    expect(await auditsOf(host.organizationId, host.memberId)).toEqual(before)
  })

  it('rejects a transfer to an inactive member', async () => {
    const host = await brokerage()
    const target = await addMember(host.organizationId, 'COMMERCIAL', false)
    const before = await auditsOf(host.organizationId, host.memberId)

    const response = await host.client.post(`/api/v1/members/${host.memberId}/transfer-portfolio`, {
      toMemberId: target.member.id,
    })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({
      error: {
        code: 'TARGET_INACTIVE',
        message: 'O destino da carteira precisa estar ativo.',
      },
    })
    expect(await auditsOf(host.organizationId, host.memberId)).toEqual(before)
  })

  it('returns not found when the transfer target is missing', async () => {
    const host = await brokerage()
    const target = await addMember(host.organizationId, 'COMMERCIAL')
    const { tenantB } = await withTwoTenants(deps.db)
    const foreign = await addMember(tenantB.organizationId, 'COMMERCIAL')

    const missingTarget = await host.client.post(
      `/api/v1/members/${host.memberId}/transfer-portfolio`,
      { toMemberId: randomUUID() },
    )
    const missingSource = await host.client.post(
      `/api/v1/members/${randomUUID()}/transfer-portfolio`,
      { toMemberId: target.member.id },
    )

    expect(missingTarget.statusCode).toBe(404)
    expect(missingTarget.json().error.code).toBe('NOT_FOUND')
    expect(missingSource.statusCode).toBe(404)
    expect((await memberOf(tenantB.organizationId, foreign.member.id)).role).toBe('COMMERCIAL')
  })

  it('rejects a transfer from a role without portfolio:transfer', async () => {
    const host = await brokerage()
    const target = await addMember(host.organizationId, 'COMMERCIAL')

    for (const role of ['MANAGER', 'COMMERCIAL'] as const) {
      const caller = await colleague(host.organizationId, role)
      const response = await caller.client.post(
        `/api/v1/members/${host.memberId}/transfer-portfolio`,
        { toMemberId: target.member.id },
      )
      expect(response.statusCode, role).toBe(403)
      expect(response.json().error.code).toBe('FORBIDDEN')
    }
  })

  it('blocks a transfer while terms are pending', async () => {
    const client = new TestClient(app)
    await signedInUser(client, deps)
    const onboarded = await client.post('/api/v1/onboarding', { name: 'Sem Termos Carteira' })
    expect(onboarded.statusCode).toBe(200)

    const response = await client.post(`/api/v1/members/${randomUUID()}/transfer-portfolio`, {
      toMemberId: randomUUID(),
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('TERMS_NOT_ACCEPTED')
  })

  it('rejects a transfer body that is not a member id', async () => {
    const host = await brokerage()
    const before = await auditsOf(host.organizationId, host.memberId)
    const bodies = [{}, { toMemberId: host.memberId, extra: true }]

    for (const body of bodies) {
      const response = await host.client.post(
        `/api/v1/members/${host.memberId}/transfer-portfolio`,
        body,
      )
      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('VALIDATION_ERROR')
    }

    expect(await auditsOf(host.organizationId, host.memberId)).toEqual(before)
  })

  it('does not transfer the other tenant member', async () => {
    const host = await brokerage()
    const { tenantB } = await withTwoTenants(deps.db)
    const foreign = await addMember(tenantB.organizationId, 'COMMERCIAL')

    const response = await host.client.post(
      `/api/v1/members/${foreign.member.id}/transfer-portfolio`,
      { toMemberId: host.memberId },
    )

    expect(response.statusCode).toBe(404)
    expect((await memberOf(tenantB.organizationId, foreign.member.id)).role).toBe('COMMERCIAL')
  })
})

describe('withTwoSalespeople', () => {
  it('builds two commercial contexts in one organization', async () => {
    const host = await brokerage()
    const { salespersonA, salespersonB } = await withTwoSalespeople(deps.db, host.organizationId)

    expect(salespersonA.organizationId).toBe(host.organizationId)
    expect(salespersonB.organizationId).toBe(host.organizationId)
    expect(salespersonA.userId).not.toBe(salespersonB.userId)
    expect(salespersonA.role).toBe('COMMERCIAL')
    expect(salespersonB.role).toBe('COMMERCIAL')
    const members = await deps.db.withTenant({ organizationId: host.organizationId }, (tx) =>
      tx.member.findMany({
        where: { userId: { in: [salespersonA.userId, salespersonB.userId] } },
      }),
    )
    expect(members).toHaveLength(2)
    expect(members.every((member) => member.active && member.role === 'COMMERCIAL')).toBe(true)
  })
})

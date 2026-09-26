import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { acceptCurrentTerms, signedInUser, TestClient } from '../../../test/auth.ts'
import { seedConversation } from '../../../test/conversations.ts'
import { withTwoTenants } from '../../../test/factories.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'
import type { Permission, Role } from '../../shared/permissions.ts'
import { ROLE_PERMISSIONS } from '../../shared/permissions.ts'

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
  return { client, userId: user.userId, organizationId: created.json().id as string }
}

async function colleague(organizationId: string, role: Role) {
  const client = new TestClient(app)
  const user = await signedInUser(client, deps)
  await acceptCurrentTerms(client)
  await deps.db.withTenant({ organizationId }, (tx) =>
    tx.member.create({ data: { userId: user.userId, role, active: true } }),
  )
  await deps.db.session.updateMany({
    where: { userId: user.userId },
    data: { activeOrganizationId: organizationId },
  })
  return { client, userId: user.userId }
}

const idsOf = (response: { json: () => { items: { id: string }[] } }) =>
  response.json().items.map((item) => item.id)

describe('inbox list', () => {
  it('lists the queue by lastMessageAt', async () => {
    const host = await brokerage()
    const older = await seedConversation(deps.db, host, { handler: 'QUEUE' })
    const newer = await seedConversation(deps.db, host, { handler: 'QUEUE' })
    const human = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: host.userId,
    })
    const closed = await seedConversation(deps.db, host, {
      handler: 'QUEUE',
      status: 'CLOSED',
      closedAt: new Date(),
    })
    // older activity first in time, then newer — insertion order alone must not satisfy the sort.
    await deps.db.withTenant(host, async (tx) => {
      await tx.conversation.update({
        where: { id: older.id },
        data: { lastMessageAt: new Date('2026-01-01T12:00:00.000Z') },
      })
      await tx.conversation.update({
        where: { id: newer.id },
        data: { lastMessageAt: new Date('2026-01-02T12:00:00.000Z') },
      })
    })

    const response = await host.client.get('/api/v1/conversations?view=queue')

    expect(response.statusCode).toBe(200)
    expect(idsOf(response)).toEqual([newer.id, older.id])
    expect(idsOf(response)).not.toContain(human.id)
    expect(idsOf(response)).not.toContain(closed.id)
  })

  it('lists mine by lastMessageAt', async () => {
    const host = await brokerage()
    const commercial = await colleague(host.organizationId, 'COMMERCIAL')
    const mineOlder = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: commercial.userId,
    })
    const mineNewer = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: commercial.userId,
    })
    const theirs = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: host.userId,
    })
    const queued = await seedConversation(deps.db, host, { handler: 'QUEUE' })
    await deps.db.withTenant(host, async (tx) => {
      await tx.conversation.update({
        where: { id: mineOlder.id },
        data: { lastMessageAt: new Date('2026-02-01T12:00:00.000Z') },
      })
      await tx.conversation.update({
        where: { id: mineNewer.id },
        data: { lastMessageAt: new Date('2026-02-02T12:00:00.000Z') },
      })
    })

    const response = await commercial.client.get('/api/v1/conversations?view=mine')

    expect(response.statusCode).toBe(200)
    expect(idsOf(response)).toEqual([mineNewer.id, mineOlder.id])
    expect(idsOf(response)).not.toContain(theirs.id)
    expect(idsOf(response)).not.toContain(queued.id)
  })

  it('paginates the inbox list by keyset', async () => {
    const host = await brokerage()
    const times = [
      new Date('2026-03-03T12:00:00.000Z'),
      new Date('2026-03-02T12:00:00.000Z'),
      new Date('2026-03-01T12:00:00.000Z'),
    ]
    const ids: string[] = []
    for (const lastMessageAt of times) {
      const seeded = await seedConversation(deps.db, host, { handler: 'QUEUE' })
      ids.push(seeded.id)
      await deps.db.withTenant(host, (tx) =>
        tx.conversation.update({ where: { id: seeded.id }, data: { lastMessageAt } }),
      )
    }

    const first = await host.client.get('/api/v1/conversations?view=queue&limit=2')
    expect(first.statusCode).toBe(200)
    expect(idsOf(first)).toEqual([ids[0], ids[1]])
    expect(first.json().nextCursor).toBe(ids[1])

    const second = await host.client.get(
      `/api/v1/conversations?view=queue&limit=2&cursor=${ids[1]}`,
    )
    expect(second.statusCode).toBe(200)
    expect(idsOf(second)).toEqual([ids[2]])
    expect(second.json().nextCursor).toBeNull()
  })

  it('scopes the inbox list by tenant and portfolio', async () => {
    const host = await brokerage()
    const commercialA = await colleague(host.organizationId, 'COMMERCIAL')
    const commercialB = await colleague(host.organizationId, 'COMMERCIAL')
    const queue = await seedConversation(deps.db, host, { handler: 'QUEUE' })
    const humanOfB = await seedConversation(
      deps.db,
      host,
      { handler: 'HUMAN', assigneeId: commercialB.userId },
      { ownerId: commercialB.userId },
    )
    const { tenantB } = await withTwoTenants(deps.db)
    const foreignQueue = await seedConversation(deps.db, tenantB, { handler: 'QUEUE' })

    const asA = await commercialA.client.get('/api/v1/conversations?view=queue')
    expect(asA.statusCode).toBe(200)
    expect(idsOf(asA)).toContain(queue.id)
    expect(idsOf(asA)).not.toContain(foreignQueue.id)

    const mineA = await commercialA.client.get('/api/v1/conversations?view=mine')
    expect(mineA.statusCode).toBe(200)
    expect(idsOf(mineA)).not.toContain(humanOfB.id)
  })

  it('rejects bad view auth and permission on the inbox list', async () => {
    const host = await brokerage()

    const badView = await host.client.get('/api/v1/conversations?view=all')
    expect(badView.statusCode).toBe(400)

    const anonymous = await new TestClient(app).get('/api/v1/conversations?view=queue')
    expect(anonymous.statusCode).toBe(401)

    const saved = [...ROLE_PERMISSIONS.COMMERCIAL]
    ;(ROLE_PERMISSIONS as Record<Role, Permission[]>).COMMERCIAL = ['organization:read']
    try {
      const commercial = await colleague(host.organizationId, 'COMMERCIAL')
      const forbidden = await commercial.client.get('/api/v1/conversations?view=queue')
      expect(forbidden.statusCode).toBe(403)
    } finally {
      ;(ROLE_PERMISSIONS as Record<Role, Permission[]>).COMMERCIAL = saved
    }

    const { tenantB } = await withTwoTenants(deps.db)
    await seedConversation(deps.db, tenantB, { handler: 'QUEUE' })
    const foreign = await host.client.get('/api/v1/conversations?view=queue')
    expect(foreign.statusCode).toBe(200)
    expect(idsOf(foreign)).toEqual([])
  })
})

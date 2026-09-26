import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { acceptCurrentTerms, signedInUser, TestClient } from '../../../test/auth.ts'
import { conversationOf, seedConversation } from '../../../test/conversations.ts'
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

describe('inbox take', () => {
  it('takes a conversation from the queue', async () => {
    const host = await brokerage()
    const commercial = await colleague(host.organizationId, 'COMMERCIAL')
    const seeded = await seedConversation(deps.db, host, { handler: 'QUEUE' })

    const response = await commercial.client.post(`/api/v1/conversations/${seeded.id}/take`, {})

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      id: seeded.id,
      handler: 'HUMAN',
      assigneeId: commercial.userId,
    })
    const conversation = await conversationOf(deps.db, host, seeded.id)
    expect(conversation).toMatchObject({ handler: 'HUMAN', assigneeId: commercial.userId })
  })

  it('claims the contact owner on take when unset', async () => {
    const host = await brokerage()
    const commercial = await colleague(host.organizationId, 'COMMERCIAL')
    const seeded = await seedConversation(deps.db, host, { handler: 'QUEUE' }, { ownerId: null })

    const response = await commercial.client.post(`/api/v1/conversations/${seeded.id}/take`, {})

    expect(response.statusCode).toBe(200)
    expect(response.json().contact.ownerId).toBe(commercial.userId)
    const contact = await deps.db.withTenant(host, (tx) =>
      tx.contact.findUniqueOrThrow({ where: { id: response.json().contact.id } }),
    )
    expect(contact.ownerId).toBe(commercial.userId)
  })

  it('conflicts when the conversation is already taken', async () => {
    const host = await brokerage()
    const commercial = await colleague(host.organizationId, 'COMMERCIAL')
    const seeded = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: host.userId,
    })

    const response = await commercial.client.post(`/api/v1/conversations/${seeded.id}/take`, {})

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('ALREADY_ASSIGNED')
  })

  it('hides take outside the tenant or portfolio', async () => {
    const host = await brokerage()
    const commercial = await colleague(host.organizationId, 'COMMERCIAL')
    const other = await colleague(host.organizationId, 'COMMERCIAL')
    const theirs = await seedConversation(
      deps.db,
      host,
      { handler: 'QUEUE' },
      { ownerId: other.userId },
    )
    // QUEUE is in portfolio for commercial; make HUMAN of other commercial with owned contact
    const humanOfOther = await seedConversation(
      deps.db,
      host,
      { handler: 'HUMAN', assigneeId: other.userId },
      { ownerId: other.userId },
    )
    const { tenantB } = await withTwoTenants(deps.db)
    const foreign = await seedConversation(deps.db, tenantB, { handler: 'QUEUE' })

    // take on HUMAN outside portfolio (commercial cannot read it)
    const hidden = await commercial.client.post(`/api/v1/conversations/${humanOfOther.id}/take`, {})
    expect(hidden.statusCode).toBe(404)
    expect(hidden.json().error.code).toBe('NOT_FOUND')

    const missing = await commercial.client.post(`/api/v1/conversations/${foreign.id}/take`, {})
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error).toEqual(hidden.json().error)

    // QUEUE with contact owned by other is still visible (scope includes QUEUE)
    const queueOk = await commercial.client.post(`/api/v1/conversations/${theirs.id}/take`, {})
    expect(queueOk.statusCode).toBe(200)
  })

  it('audits take without pii', async () => {
    const host = await brokerage()
    const seeded = await seedConversation(deps.db, host, { handler: 'QUEUE' })

    const response = await host.client.post(`/api/v1/conversations/${seeded.id}/take`, {})
    expect(response.statusCode).toBe(200)

    const logs = await deps.db.withTenant(host, (tx) =>
      tx.auditLog.findMany({ where: { entityId: seeded.id, action: 'conversation.take' } }),
    )
    expect(logs).toHaveLength(1)
    const changes = JSON.stringify(logs[0]?.changes)
    expect(changes).not.toMatch(/\+55/)
    expect(changes).not.toContain('phoneE164')
    expect(changes).not.toContain('"text"')
  })

  it('takes a conversation from ai', async () => {
    const host = await brokerage()
    const seeded = await seedConversation(deps.db, host, { handler: 'AI' })

    const response = await host.client.post(`/api/v1/conversations/${seeded.id}/take`, {})

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ handler: 'HUMAN', assigneeId: host.userId })
  })

  it('guards take auth permission and body', async () => {
    const host = await brokerage()
    const seeded = await seedConversation(deps.db, host, { handler: 'QUEUE' })

    const anonymous = await new TestClient(app).post(`/api/v1/conversations/${seeded.id}/take`, {})
    expect(anonymous.statusCode).toBe(401)

    const saved = [...ROLE_PERMISSIONS.COMMERCIAL]
    ;(ROLE_PERMISSIONS as Record<Role, Permission[]>).COMMERCIAL = [
      'organization:read',
      'conversation:read',
    ]
    try {
      const commercial = await colleague(host.organizationId, 'COMMERCIAL')
      const forbidden = await commercial.client.post(`/api/v1/conversations/${seeded.id}/take`, {})
      expect(forbidden.statusCode).toBe(403)
    } finally {
      ;(ROLE_PERMISSIONS as Record<Role, Permission[]>).COMMERCIAL = saved
    }

    const badBody = await host.client.post(`/api/v1/conversations/${seeded.id}/take`, {
      extra: true,
    })
    expect(badBody.statusCode).toBe(400)
  })
})

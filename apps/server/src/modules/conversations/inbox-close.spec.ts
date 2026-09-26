import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { acceptCurrentTerms, signedInUser, TestClient } from '../../../test/auth.ts'
import { conversationOf, seedConversation } from '../../../test/conversations.ts'
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

describe('inbox close', () => {
  it('closes an assigned conversation', async () => {
    const host = await brokerage()
    const commercial = await colleague(host.organizationId, 'COMMERCIAL')
    const seeded = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: commercial.userId,
    })

    const response = await commercial.client.post(`/api/v1/conversations/${seeded.id}/close`, {})

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ id: seeded.id, status: 'CLOSED' })
    expect(response.json().closedAt).toBeTruthy()
    const conversation = await conversationOf(deps.db, host, seeded.id)
    expect(conversation.status).toBe('CLOSED')
    expect(conversation.closedAt).not.toBeNull()
  })

  it('lets a manager close any readable conversation', async () => {
    const host = await brokerage()
    const commercial = await colleague(host.organizationId, 'COMMERCIAL')
    const manager = await colleague(host.organizationId, 'MANAGER')
    const seeded = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: commercial.userId,
    })

    const response = await manager.client.post(`/api/v1/conversations/${seeded.id}/close`, {})

    expect(response.statusCode).toBe(200)
    expect(response.json().status).toBe('CLOSED')
  })

  it('hides close from a commercial who is not the assignee', async () => {
    const host = await brokerage()
    const commercial = await colleague(host.organizationId, 'COMMERCIAL')
    const other = await colleague(host.organizationId, 'COMMERCIAL')
    const seeded = await seedConversation(
      deps.db,
      host,
      { handler: 'HUMAN', assigneeId: other.userId },
      { ownerId: other.userId },
    )

    const response = await commercial.client.post(`/api/v1/conversations/${seeded.id}/close`, {})

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('NOT_FOUND')
  })

  it('conflicts when the conversation is already closed', async () => {
    const host = await brokerage()
    const seeded = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: host.userId,
      status: 'CLOSED',
      closedAt: new Date(),
    })

    const response = await host.client.post(`/api/v1/conversations/${seeded.id}/close`, {})

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('CONVERSATION_CLOSED')
  })

  it('audits close without pii', async () => {
    const host = await brokerage()
    const seeded = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: host.userId,
    })

    const response = await host.client.post(`/api/v1/conversations/${seeded.id}/close`, {})
    expect(response.statusCode).toBe(200)

    const logs = await deps.db.withTenant(host, (tx) =>
      tx.auditLog.findMany({ where: { entityId: seeded.id, action: 'conversation.close' } }),
    )
    expect(logs).toHaveLength(1)
    const changes = JSON.stringify(logs[0]?.changes)
    expect(changes).not.toMatch(/\+55/)
    expect(changes).not.toContain('phoneE164')
    expect(changes).not.toContain('"text"')
  })

  it('guards close auth permission and body', async () => {
    const host = await brokerage()
    const seeded = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: host.userId,
    })

    const anonymous = await new TestClient(app).post(`/api/v1/conversations/${seeded.id}/close`, {})
    expect(anonymous.statusCode).toBe(401)

    const saved = [...ROLE_PERMISSIONS.COMMERCIAL]
    ;(ROLE_PERMISSIONS as Record<Role, Permission[]>).COMMERCIAL = [
      'organization:read',
      'conversation:read',
    ]
    try {
      const commercial = await colleague(host.organizationId, 'COMMERCIAL')
      const forbidden = await commercial.client.post(`/api/v1/conversations/${seeded.id}/close`, {})
      expect(forbidden.statusCode).toBe(403)
    } finally {
      ;(ROLE_PERMISSIONS as Record<Role, Permission[]>).COMMERCIAL = saved
    }

    const badBody = await host.client.post(`/api/v1/conversations/${seeded.id}/close`, {
      extra: true,
    })
    expect(badBody.statusCode).toBe(400)
  })
})

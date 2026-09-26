import { randomUUID } from 'node:crypto'
import type { RouteOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { acceptCurrentTerms, signedInUser, TestClient } from '../../../test/auth.ts'
import { conversationOf, inbound, seedConversation } from '../../../test/conversations.ts'
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

describe('conversation send', () => {
  it('sends an outbound message and takes from the queue', async () => {
    const host = await brokerage()
    const seeded = await seedConversation(deps.db, host, { handler: 'QUEUE' })
    await inbound(deps.db, host, {
      fromPhone: seeded.phoneE164,
      text: 'Cliente na fila',
      externalId: null,
    })

    const response = await host.client.post(`/api/v1/conversations/${seeded.id}/messages`, {
      text: 'Olá, sou da corretora.',
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().message).toMatchObject({
      direction: 'OUTBOUND',
      author: 'HUMAN',
      authorUserId: host.userId,
      kind: 'TEXT',
      text: 'Olá, sou da corretora.',
    })
    const conversation = await conversationOf(deps.db, host, seeded.id)
    expect(conversation).toMatchObject({ handler: 'HUMAN', assigneeId: host.userId })
  })

  it('refuses a message on a closed conversation', async () => {
    const host = await brokerage()
    const seeded = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: host.userId,
      status: 'CLOSED',
      closedAt: new Date(),
    })

    const response = await host.client.post(`/api/v1/conversations/${seeded.id}/messages`, {
      text: 'Tarde demais.',
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('CONVERSATION_CLOSED')
  })

  it('refuses a message outside the tenant or without permission', async () => {
    const host = await brokerage()
    const seeded = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: host.userId,
    })
    const { tenantB } = await withTwoTenants(deps.db)
    const foreign = await seedConversation(deps.db, tenantB)

    const anonymous = await new TestClient(app).post(
      `/api/v1/conversations/${seeded.id}/messages`,
      { text: 'Sem sessão.' },
    )
    expect(anonymous.statusCode).toBe(401)

    const saved = [...ROLE_PERMISSIONS.COMMERCIAL]
    ;(ROLE_PERMISSIONS as Record<Role, Permission[]>).COMMERCIAL = [
      'organization:read',
      'conversation:read',
    ]
    try {
      const commercial = await colleague(host.organizationId, 'COMMERCIAL')
      const forbidden = await commercial.client.post(
        `/api/v1/conversations/${seeded.id}/messages`,
        { text: 'Sem permissão.' },
      )
      expect(forbidden.statusCode).toBe(403)
      expect(forbidden.json().error.code).toBe('FORBIDDEN')
    } finally {
      ;(ROLE_PERMISSIONS as Record<Role, Permission[]>).COMMERCIAL = saved
    }

    const otherTenant = await brokerage()
    const missing = await otherTenant.client.post(`/api/v1/conversations/${seeded.id}/messages`, {
      text: 'Outro tenant.',
    })
    expect(missing.statusCode).toBe(404)

    const foreignReply = await host.client.post(`/api/v1/conversations/${foreign.id}/messages`, {
      text: 'Conversa alheia.',
    })
    expect(foreignReply.statusCode).toBe(404)

    const unknown = await host.client.post(`/api/v1/conversations/${randomUUID()}/messages`, {
      text: 'Id inexistente.',
    })
    expect(unknown.statusCode).toBe(404)
  })

  it('validates the outbound message body', async () => {
    const host = await brokerage()
    const seeded = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: host.userId,
    })
    const url = `/api/v1/conversations/${seeded.id}/messages`

    const unknownField = await host.client.post(url, { text: 'ok', extra: true })
    expect(unknownField.statusCode).toBe(400)

    const empty = await host.client.post(url, { text: '' })
    expect(empty.statusCode).toBe(400)
  })

  it('declares conversation:write on the send route', async () => {
    const built = await buildTestApp()
    const seen = new Map<string, { operationId: unknown; permissions: unknown[] }>()
    built.app.addHook('onRoute', (route: RouteOptions) => {
      if (route.url !== '/api/v1/conversations/:id/messages' || route.method !== 'POST') return
      const hooks = [route.preHandler].flat().filter((hook) => hook !== undefined)
      const schema = route.schema
      seen.set(`${String(route.method)} ${route.url}`, {
        operationId: schema !== undefined && 'operationId' in schema ? schema.operationId : null,
        permissions: hooks
          .map((hook) => Reflect.get(hook, Symbol.for('bens.requirePermission')))
          .filter((permission) => permission !== undefined),
      })
    })
    await built.app.ready()
    await built.close()

    expect(Object.fromEntries(seen)).toEqual({
      'POST /api/v1/conversations/:id/messages': {
        operationId: 'sendConversationMessage',
        permissions: ['conversation:write'],
      },
    })
  })
})

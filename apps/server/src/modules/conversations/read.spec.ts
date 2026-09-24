import { randomUUID } from 'node:crypto'
import type { RouteOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { acceptCurrentTerms, signedInUser, TestClient, uniqueEmail } from '../../../test/auth.ts'
import { inbound, randomPhone, seedConversation } from '../../../test/conversations.ts'
import { withTwoSalespeople, withTwoTenants } from '../../../test/factories.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'
import { uuidv7 } from '../../shared/id.ts'
import type { Role } from '../../shared/permissions.ts'
import { findReadableConversation, sendMessage } from './index.ts'

let app: App
let deps: Deps
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp({ workers: true }))
  await app.ready()
})

afterAll(() => close())

type Tenant = { organizationId: string }

// A signed-in ADMIN with terms accepted and a freshly onboarded organization (Web Chat included).
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

// A signed-in member of the organization, with it as the active organization.
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

// A member without a session (someone else's portfolio).
async function plainMember(organizationId: string, role: Role = 'COMMERCIAL') {
  const user = await deps.db.user.create({ data: { name: 'Membro', email: uniqueEmail('membro') } })
  await deps.db.withTenant({ organizationId }, (tx) =>
    tx.member.create({ data: { userId: user.id, role, active: true } }),
  )
  return user.id
}

// Ids generated first and sorted greatest first (uuidv7 in one millisecond is not monotonic), so
// the caller can insert them in an order other than the id order.
function idsDescending(count: number): string[] {
  return Array.from({ length: count }, () => uuidv7()).sort((x, y) => (x < y ? 1 : -1))
}

// Messages 1..count stored directly; the message with seq 1 gets the greatest id.
async function seedMessages(
  tenant: Tenant,
  conversation: { id: string; channelId: string },
  count: number,
) {
  const ids = idsDescending(count)
  return deps.db.withTenant(tenant, async (tx) => {
    const created: { id: string; seq: number }[] = []
    for (let seq = 1; seq <= count; seq++) {
      const id = ids[seq - 1] ?? uuidv7()
      await tx.message.create({
        data: {
          id,
          conversationId: conversation.id,
          channelId: conversation.channelId,
          seq,
          direction: 'INBOUND',
          author: 'CONTACT',
          kind: 'TEXT',
          text: `mensagem ${seq}`,
          sentAt: new Date(),
        },
      })
      created.push({ id, seq })
    }
    await tx.conversation.update({ where: { id: conversation.id }, data: { lastSeq: count } })
    return created
  })
}

const idsOf = (response: { json: () => { items: { id: string }[] } }) =>
  response.json().items.map((item) => item.id)

const routes = (id: string) => [
  '/api/v1/conversations',
  `/api/v1/conversations/${id}`,
  `/api/v1/conversations/${id}/messages`,
]

describe('GET /api/v1/conversations', () => {
  it('lists every conversation of the tenant for admin and manager', async () => {
    const host = await brokerage()
    const ids = idsDescending(3)
    const [newest, middle, oldest] = ids
    // Inserted middle, oldest, newest: neither insertion order nor its reverse is the id order.
    for (const index of [1, 2, 0]) {
      await seedConversation(deps.db, host, { id: ids[index] ?? uuidv7() })
    }
    const manager = await colleague(host.organizationId, 'MANAGER')

    const asAdmin = await host.client.get('/api/v1/conversations')
    const asManager = await manager.client.get('/api/v1/conversations')

    expect(asAdmin.statusCode).toBe(200)
    expect(idsOf(asAdmin)).toEqual([newest, middle, oldest])
    expect(asAdmin.json().nextCursor).toBeNull()
    expect(asManager.statusCode).toBe(200)
    expect(idsOf(asManager)).toEqual([newest, middle, oldest])
  })

  it('returns the conversation summary shape', async () => {
    const host = await brokerage()
    const assignee = await plainMember(host.organizationId)
    const seeded = await seedConversation(
      deps.db,
      host,
      { handler: 'HUMAN', assigneeId: assignee, status: 'WAITING', lastSeq: 0 },
      { ownerId: assignee },
    )
    const channel = await deps.db.withTenant(host, (tx) =>
      tx.channel.findUniqueOrThrow({ where: { id: seeded.channelId } }),
    )

    const response = await host.client.get('/api/v1/conversations')

    expect(response.statusCode).toBe(200)
    expect(response.json().items).toEqual([
      {
        id: seeded.id,
        status: 'WAITING',
        handler: 'HUMAN',
        assigneeId: assignee,
        contact: { id: seeded.contactId, phoneE164: seeded.phoneE164, ownerId: assignee },
        channel: { id: channel.id, kind: 'WEB_CHAT', name: channel.name },
        lastSeq: 0,
        lastMessageAt: null,
        closedAt: null,
        createdAt: seeded.createdAt.toISOString(),
      },
    ])

    const closedAt = new Date('2026-09-20T12:00:00.000Z')
    const lastMessageAt = new Date('2026-09-20T11:00:00.000Z')
    await deps.db.withTenant(host, (tx) =>
      tx.conversation.update({
        where: { id: seeded.id },
        data: { status: 'CLOSED', closedAt, lastMessageAt },
      }),
    )
    const closed = await host.client.get('/api/v1/conversations')
    expect(closed.json().items[0]).toMatchObject({
      status: 'CLOSED',
      closedAt: closedAt.toISOString(),
      lastMessageAt: lastMessageAt.toISOString(),
    })
  })

  it('lists only the portfolio of a commercial', async () => {
    const host = await brokerage()
    const a = await colleague(host.organizationId, 'COMMERCIAL')
    const b = await plainMember(host.organizationId)
    const seed = (data: Parameters<typeof seedConversation>[2], ownerId: string | null) =>
      seedConversation(deps.db, host, data, { ownerId })
    // Each visible one is admitted by a single rule of the filter (AD-014).
    const aiOfB = await seed({ handler: 'AI' }, b)
    const humanOfA = await seed({ handler: 'HUMAN', assigneeId: a.userId }, b)
    const humanOfBContactOfB = await seed({ handler: 'HUMAN', assigneeId: b }, b)
    const queueContactOfB = await seed({ handler: 'QUEUE' }, b)
    const humanOfBContactOfA = await seed({ handler: 'HUMAN', assigneeId: b }, a.userId)
    const aiOwnerless = await seed({ handler: 'AI' }, null)

    const response = await a.client.get('/api/v1/conversations')

    expect(response.statusCode).toBe(200)
    expect(new Set(idsOf(response))).toEqual(
      new Set([humanOfA.id, queueContactOfB.id, humanOfBContactOfA.id, aiOwnerless.id]),
    )
    expect(idsOf(response)).toHaveLength(4)
    expect(idsOf(response)).not.toContain(humanOfBContactOfB.id)
    expect(idsOf(response)).not.toContain(aiOfB.id)
  })

  it('hides the other tenant from the conversation list', async () => {
    const host = await brokerage()
    const own = await seedConversation(deps.db, host)
    const { tenantB } = await withTwoTenants(deps.db)
    const foreign = await seedConversation(deps.db, tenantB)

    const response = await host.client.get('/api/v1/conversations')

    expect(response.statusCode).toBe(200)
    expect(idsOf(response)).toEqual([own.id])
    expect(idsOf(response)).not.toContain(foreign.id)
  })

  it('pages the conversation list without repeating', async () => {
    const host = await brokerage()
    const ids = idsDescending(5)
    for (const id of [...ids].reverse()) await seedConversation(deps.db, host, { id })

    const seen: string[] = []
    const pages: number[] = []
    let url = '/api/v1/conversations?limit=2'
    for (;;) {
      const page = await host.client.get(url)
      expect(page.statusCode).toBe(200)
      seen.push(...idsOf(page))
      pages.push(page.json().items.length)
      const next: string | null = page.json().nextCursor
      if (next === null) break
      expect(next).toBe(seen.at(-1))
      url = `/api/v1/conversations?limit=2&cursor=${next}`
    }

    expect(pages).toEqual([2, 2, 1])
    expect(seen).toEqual(ids)
  })

  it('returns an empty conversation page', async () => {
    const host = await brokerage()

    const response = await host.client.get('/api/v1/conversations')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ items: [], nextCursor: null })
  })
})

describe('GET /api/v1/conversations/:id', () => {
  it('reads one conversation', async () => {
    const host = await brokerage()
    const seeded = await seedConversation(deps.db, host, { handler: 'AI' })
    await seedConversation(deps.db, host)

    const listed = await host.client.get('/api/v1/conversations')
    const response = await host.client.get(`/api/v1/conversations/${seeded.id}`)

    expect(response.statusCode).toBe(200)
    const item = listed.json().items.find((row: { id: string }) => row.id === seeded.id)
    expect(item).toMatchObject({ id: seeded.id, handler: 'AI' })
    expect(response.json()).toEqual(item)
  })

  it('reads a conversation of the commercial portfolio', async () => {
    const host = await brokerage()
    const a = await colleague(host.organizationId, 'COMMERCIAL')
    const b = await plainMember(host.organizationId)
    const humanOfBContactOfA = await seedConversation(
      deps.db,
      host,
      { handler: 'HUMAN', assigneeId: b },
      { ownerId: a.userId },
    )

    const response = await a.client.get(`/api/v1/conversations/${humanOfBContactOfA.id}`)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ id: humanOfBContactOfA.id, assigneeId: b })
  })

  it('answers not found outside the tenant or the portfolio', async () => {
    const host = await brokerage()
    const a = await colleague(host.organizationId, 'COMMERCIAL')
    const b = await plainMember(host.organizationId)
    const outside = await seedConversation(
      deps.db,
      host,
      { handler: 'HUMAN', assigneeId: b },
      { ownerId: b },
    )
    const { tenantB } = await withTwoTenants(deps.db)
    const foreign = await seedConversation(deps.db, tenantB)

    for (const suffix of ['', '/messages']) {
      const bodies = []
      for (const [client, id] of [
        [host.client, foreign.id],
        [a.client, outside.id],
        [a.client, randomUUID()],
      ] as const) {
        const response = await client.get(`/api/v1/conversations/${id}${suffix}`)
        expect(response.statusCode, `${id}${suffix}`).toBe(404)
        bodies.push(response.json())
      }
      expect(bodies[0]).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } })
      expect(bodies[1]).toEqual(bodies[0])
      expect(bodies[2]).toEqual(bodies[0])
    }
  })
})

describe('GET /api/v1/conversations/:id/messages', () => {
  it('orders messages by seq even when ids disagree', async () => {
    const host = await brokerage()
    const conversation = await seedConversation(deps.db, host)
    const messages = await seedMessages(host, conversation, 4)
    // Precondition: the id order is the reverse of the seq order.
    expect([...messages].sort((x, y) => (x.id < y.id ? -1 : 1)).map((m) => m.seq)).toEqual([
      4, 3, 2, 1,
    ])

    const response = await host.client.get(`/api/v1/conversations/${conversation.id}/messages`)

    expect(response.statusCode).toBe(200)
    expect(response.json().items.map((item: { seq: number }) => item.seq)).toEqual([4, 3, 2, 1])
  })

  it('pages messages by seq without repeating', async () => {
    const host = await brokerage()
    const conversation = await seedConversation(deps.db, host)
    await seedMessages(host, conversation, 5)

    const pages: number[][] = []
    let url = `/api/v1/conversations/${conversation.id}/messages?limit=2`
    for (;;) {
      const page = await host.client.get(url)
      expect(page.statusCode).toBe(200)
      const items: { id: string; seq: number }[] = page.json().items
      pages.push(items.map((item) => item.seq))
      const next: string | null = page.json().nextCursor
      if (next === null) break
      expect(next).toBe(items.at(-1)?.id)
      url = `/api/v1/conversations/${conversation.id}/messages?limit=2&cursor=${next}`
    }

    expect(pages).toEqual([[5, 4], [3, 2], [1]])
  })

  it('returns the message shape', async () => {
    const host = await brokerage()
    const phone = randomPhone()
    const text = await inbound(deps.db, host, { fromPhone: phone, text: 'Quero cotar.' })
    await inbound(deps.db, host, { fromPhone: phone, kind: 'UNSUPPORTED', text: null })
    await deps.db.withTenant(host, (tx) =>
      tx.conversation.update({
        where: { id: text.conversationId },
        data: { handler: 'HUMAN', assigneeId: host.userId },
      }),
    )
    const sent = await sendMessage({ db: deps.db }, host, {
      conversationId: text.conversationId,
      sender: { author: 'HUMAN', userId: host.userId },
      text: 'Claro, vamos lá.',
    })

    const response = await host.client.get(`/api/v1/conversations/${text.conversationId}/messages`)

    expect(response.statusCode).toBe(200)
    const [outbound, unsupported, inboundText] = response.json().items
    const keys = [
      'author',
      'authorUserId',
      'createdAt',
      'deliveryStatus',
      'direction',
      'id',
      'kind',
      'sentAt',
      'seq',
      'text',
    ]
    for (const item of response.json().items) expect(Object.keys(item).sort()).toEqual(keys)
    expect(outbound).toMatchObject({
      id: sent.messageId,
      seq: 3,
      direction: 'OUTBOUND',
      author: 'HUMAN',
      authorUserId: host.userId,
      kind: 'TEXT',
      text: 'Claro, vamos lá.',
      deliveryStatus: 'SENT',
    })
    expect(unsupported).toMatchObject({
      seq: 2,
      direction: 'INBOUND',
      author: 'CONTACT',
      authorUserId: null,
      kind: 'UNSUPPORTED',
      text: null,
      deliveryStatus: null,
    })
    expect(inboundText).toMatchObject({
      id: text.messageId,
      seq: 1,
      kind: 'TEXT',
      text: 'Quero cotar.',
      deliveryStatus: null,
    })
    expect(new Date(inboundText.sentAt).toISOString()).toBe(inboundText.sentAt)
  })

  it('hides the other tenant messages', async () => {
    const host = await brokerage()
    const own = await seedConversation(deps.db, host)
    const ownMessages = await seedMessages(host, own, 2)
    const { tenantB } = await withTwoTenants(deps.db)
    const foreign = await seedConversation(deps.db, tenantB)
    await seedMessages(tenantB, foreign, 2)

    const ownPage = await host.client.get(`/api/v1/conversations/${own.id}/messages`)
    const foreignPage = await host.client.get(`/api/v1/conversations/${foreign.id}/messages`)

    expect(new Set(idsOf(ownPage))).toEqual(new Set(ownMessages.map((m) => m.id)))
    expect(foreignPage.statusCode).toBe(404)
  })
})

describe('findReadableConversation', () => {
  it('finds a readable conversation for the portfolio only', async () => {
    const { tenantA } = await withTwoTenants(deps.db)
    const { salespersonA, salespersonB } = await withTwoSalespeople(deps.db, tenantA.organizationId)
    const mine = await seedConversation(
      deps.db,
      tenantA,
      { handler: 'HUMAN', assigneeId: salespersonA.userId },
      { ownerId: salespersonB.userId },
    )
    const theirs = await seedConversation(
      deps.db,
      tenantA,
      { handler: 'HUMAN', assigneeId: salespersonB.userId },
      { ownerId: salespersonB.userId },
    )

    const found = await findReadableConversation({ db: deps.db }, salespersonA, mine.id)

    expect(found.id).toBe(mine.id)
    await expect(
      findReadableConversation({ db: deps.db }, salespersonA, theirs.id),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })
})

describe('conversation route contract', () => {
  it('guards every conversation route with conversation:read', async () => {
    const built = await buildTestApp()
    const seen = new Map<string, { operationId: unknown; permissions: unknown[] }>()
    built.app.addHook('onRoute', (route: RouteOptions) => {
      if (!route.url.startsWith('/api/v1/conversations')) return
      const hooks = [route.preHandler].flat().filter((hook) => hook !== undefined)
      const schema = route.schema
      seen.set(route.url, {
        operationId: schema !== undefined && 'operationId' in schema ? schema.operationId : null,
        permissions: hooks
          .map((hook) => Reflect.get(hook, Symbol.for('bens.requirePermission')))
          .filter((permission) => permission !== undefined),
      })
    })
    await built.app.ready()
    await built.close()

    expect(Object.fromEntries(seen)).toEqual({
      '/api/v1/conversations': {
        operationId: 'listConversations',
        permissions: ['conversation:read'],
      },
      '/api/v1/conversations/:id': {
        operationId: 'getConversation',
        permissions: ['conversation:read'],
      },
      '/api/v1/conversations/:id/messages': {
        operationId: 'listConversationMessages',
        permissions: ['conversation:read'],
      },
    })
  })

  it('rejects unknown query fields', async () => {
    const host = await brokerage()
    const conversation = await seedConversation(deps.db, host)

    for (const url of routes(conversation.id)) {
      const response = await host.client.get(`${url}?foo=1`)
      expect(response.statusCode, url).toBe(400)
    }
  })

  it('rejects invalid paging and ids', async () => {
    const host = await brokerage()
    const conversation = await seedConversation(deps.db, host)
    const paged = ['/api/v1/conversations', `/api/v1/conversations/${conversation.id}/messages`]

    for (const url of paged) {
      for (const query of ['limit=0', 'limit=101', 'limit=abc', 'cursor=nao-uuid']) {
        const response = await host.client.get(`${url}?${query}`)
        expect(response.statusCode, `${url}?${query}`).toBe(400)
      }
    }
    for (const url of [
      '/api/v1/conversations/nao-uuid',
      '/api/v1/conversations/nao-uuid/messages',
    ]) {
      const response = await host.client.get(url)
      expect(response.statusCode, url).toBe(400)
    }
  })

  it('requires a session for conversation routes', async () => {
    const client = new TestClient(app)

    for (const url of routes(randomUUID())) {
      const response = await client.get(url)
      expect(response.statusCode, url).toBe(401)
      expect(response.json().error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('blocks conversation routes while terms are pending', async () => {
    const client = new TestClient(app)
    await signedInUser(client, deps)
    const onboarded = await client.post('/api/v1/onboarding', { name: 'Sem Termos Conversas' })
    expect(onboarded.statusCode).toBe(200)

    for (const url of routes(randomUUID())) {
      const response = await client.get(url)
      expect(response.statusCode, url).toBe(403)
      expect(response.json().error.code).toBe('TERMS_NOT_ACCEPTED')
    }
  })

  it('requires an active organization for conversation routes', async () => {
    const client = new TestClient(app)
    await signedInUser(client, deps)
    await acceptCurrentTerms(client)

    for (const url of routes(randomUUID())) {
      const response = await client.get(url)
      expect(response.statusCode, url).toBe(403)
      expect(response.json().error.code).toBe('NO_ACTIVE_ORGANIZATION')
    }
  })

  it('hides conversation routes from an inactive member', async () => {
    const host = await brokerage()
    const conversation = await seedConversation(deps.db, host)
    const member = await colleague(host.organizationId, 'COMMERCIAL')
    await deps.db.withTenant(host, (tx) =>
      tx.member.updateMany({ where: { userId: member.userId }, data: { active: false } }),
    )

    for (const url of routes(conversation.id)) {
      const response = await member.client.get(url)
      expect(response.statusCode, url).toBe(404)
      expect(response.json().error.code).toBe('NOT_FOUND')
    }
  })
})

import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { io as connect, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, TEST_APP_URL } from '../../../test/app.ts'
import { acceptCurrentTerms, signedInUser, TestClient } from '../../../test/auth.ts'
import { inbound, randomPhone, seedConversation } from '../../../test/conversations.ts'
import { createOrganization, withTwoSalespeople, withTwoTenants } from '../../../test/factories.ts'
import { withOwnerClient, workerSchema } from '../../../test/setup-db.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'
import { type AppEvent, eventChannel, notify } from '../../infrastructure/events.ts'
import type { Role } from '../../shared/permissions.ts'
import { sendMessage } from './index.ts'

let app: App
let deps: Deps
let close: () => Promise<void>
let baseUrl: string
const seen: AppEvent[] = []
const sockets: Socket[] = []

// No option: the listener starts through the same `buildApp` the server uses (C21).
beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp({ workers: true }))
  deps.events.on('message.created', async (event) => {
    seen.push(event)
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const { port } = app.server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  for (const socket of sockets) socket.disconnect()
  await close()
})

type Tenant = { organizationId: string }
type Pushed = { conversationId: string; message: { id: string } & Record<string, unknown> }

async function eventually<T>(read: () => Promise<T> | T, accept: (value: T) => boolean) {
  const deadline = Date.now() + 10_000
  for (;;) {
    const value = await read()
    if (accept(value)) return value
    if (Date.now() > deadline) throw new Error(`timed out; last value: ${JSON.stringify(value)}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

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

// A connected socket of the client's session, recording every `message.created` it receives.
async function socketOf(client: TestClient) {
  const socket = connect(baseUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    extraHeaders: { cookie: client.cookieHeader, origin: TEST_APP_URL },
    reconnection: false,
  })
  sockets.push(socket)
  const received: Pushed[] = []
  const resyncs: unknown[] = []
  socket.on('message.created', (payload: Pushed) => received.push(payload))
  socket.on('events:resync', (payload: unknown) => resyncs.push(payload))
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', reject)
  })
  return {
    socket,
    received,
    resyncs,
    join: (payload: unknown) => socket.emitWithAck('conversation:join', payload),
    leave: (payload: unknown) => socket.emitWithAck('conversation:leave', payload),
    // The messages received before the one with this id (which must arrive).
    async until(messageId: string) {
      await eventually(
        () => received.some((pushed) => pushed.message.id === messageId),
        (found) => found,
      )
      return received.slice(
        0,
        received.findIndex((pushed) => pushed.message.id === messageId),
      )
    },
  }
}

// Every event the listener delivered for these conversations, counted once a later sentinel
// arrived. By conversation, not by stored message id: an event of a rolled-back duplicate carries
// an id that was never stored.
async function eventsFor(conversationIds: string[]) {
  const sentinel: AppEvent = {
    type: 'message.created',
    organizationId: randomUUID(),
    conversationId: randomUUID(),
    messageId: randomUUID(),
  }
  await deps.db.withoutTenant((tx) => notify(tx, sentinel))
  await eventually(
    () => seen.some((event) => event.messageId === sentinel.messageId),
    (found) => found,
  )
  return seen.filter((event) => conversationIds.includes(event.conversationId))
}

// A conversation that exists through the real entry point, and the phone that reaches it again.
async function conversationWith(tenant: Tenant) {
  const fromPhone = randomPhone()
  const first = await inbound(deps.db, tenant, { fromPhone })
  return { id: first.conversationId, fromPhone, firstMessageId: first.messageId }
}

describe('message events', () => {
  it('emits one event per inbound message', async () => {
    const organization = await createOrganization(deps.db)
    const tenant = { organizationId: organization.id }
    const created = await inbound(deps.db, tenant)
    const closed = await seedConversation(deps.db, tenant, {
      status: 'CLOSED',
      closedAt: new Date(),
    })
    const reopened = await inbound(deps.db, tenant, { fromPhone: closed.phoneE164 })
    expect(reopened.conversationId).toBe(closed.id)

    const events = await eventsFor([created.conversationId, closed.id])

    expect(events).toEqual([
      {
        type: 'message.created',
        organizationId: organization.id,
        conversationId: created.conversationId,
        messageId: created.messageId,
      },
      {
        type: 'message.created',
        organizationId: organization.id,
        conversationId: closed.id,
        messageId: reopened.messageId,
      },
    ])
  })

  it('emits one event per outbound message', async () => {
    const host = await brokerage()
    const other = await colleague(host.organizationId, 'COMMERCIAL')
    const mine = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: host.userId,
    })
    const refused = await seedConversation(deps.db, host, {
      handler: 'HUMAN',
      assigneeId: host.userId,
    })

    const sent = await sendMessage({ db: deps.db }, host, {
      conversationId: mine.id,
      sender: { author: 'HUMAN', userId: host.userId },
      text: 'Bom dia!',
    })
    await expect(
      sendMessage({ db: deps.db }, host, {
        conversationId: refused.id,
        sender: { author: 'HUMAN', userId: other.userId },
        text: 'Não sou eu.',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'NOT_HANDLER' })

    await eventsFor([])
    const forMine = seen.filter((event) => event.conversationId === mine.id)
    const forRefused = seen.filter((event) => event.conversationId === refused.id)
    expect(forMine).toEqual([
      {
        type: 'message.created',
        organizationId: host.organizationId,
        conversationId: mine.id,
        messageId: sent.messageId,
      },
    ])
    expect(forRefused).toEqual([])
  })

  it('emits once for a duplicated external id', async () => {
    const organization = await createOrganization(deps.db)
    const tenant = { organizationId: organization.id }
    const fromPhone = randomPhone()
    const sequential = [
      await inbound(deps.db, tenant, { fromPhone, externalId: 'dup-seq' }),
      await inbound(deps.db, tenant, { fromPhone, externalId: 'dup-seq' }),
    ]
    const concurrent = await Promise.all(
      Array.from({ length: 10 }, () =>
        inbound(deps.db, tenant, { fromPhone, externalId: 'dup-par' }),
      ),
    )
    const messageIds = [...new Set([...sequential, ...concurrent].map((r) => r.messageId))]
    expect(messageIds).toHaveLength(2)

    const conversationIds = [
      ...new Set([...sequential, ...concurrent].map((r) => r.conversationId)),
    ]
    expect(conversationIds).toHaveLength(1)

    const events = await eventsFor(conversationIds)

    expect(events.filter((event) => event.messageId === sequential[0]?.messageId)).toHaveLength(1)
    expect(events.filter((event) => event.messageId === concurrent[0]?.messageId)).toHaveLength(1)
    expect(events).toHaveLength(2)
  })
})

describe('conversation room', () => {
  it('pushes the message to the room in under two seconds', async () => {
    const host = await brokerage()
    const conversation = await conversationWith(host)
    const panel = await socketOf(host.client)
    expect(await panel.join({ conversationId: conversation.id })).toEqual({ ok: true })

    const startedAt = Date.now()
    const result = await inbound(deps.db, host, {
      fromPhone: conversation.fromPhone,
      text: 'Chegou?',
    })
    await panel.until(result.messageId)
    const elapsed = Date.now() - startedAt

    expect(elapsed).toBeLessThan(2000)
    const pushed = panel.received.find((item) => item.message.id === result.messageId)
    const page = await host.client.get(`/api/v1/conversations/${conversation.id}/messages`)
    const item = page
      .json()
      .items.find((message: { id: string }) => message.id === result.messageId)
    expect(item.text).toBe('Chegou?')
    expect(pushed).toEqual({ conversationId: conversation.id, message: item })
  })

  it('lets a reader join the conversation room', async () => {
    const host = await brokerage()
    const own = await seedConversation(deps.db, host)
    const admin = await socketOf(host.client)
    expect(await admin.join({ conversationId: own.id })).toEqual({ ok: true })

    const { salespersonB } = await withTwoSalespeople(deps.db, host.organizationId)
    const commercial = await colleague(host.organizationId, 'COMMERCIAL')
    const queued = await seedConversation(
      deps.db,
      host,
      { handler: 'QUEUE' },
      { ownerId: salespersonB.userId },
    )
    const socket = await socketOf(commercial.client)
    expect(await socket.join({ conversationId: queued.id })).toEqual({ ok: true })
  })

  it('refuses the room outside the tenant or the portfolio', async () => {
    const host = await brokerage()
    const { tenantB } = await withTwoTenants(deps.db)
    const { salespersonB } = await withTwoSalespeople(deps.db, host.organizationId)
    const commercial = await colleague(host.organizationId, 'COMMERCIAL')
    const foreign = await seedConversation(deps.db, tenantB)
    const othersPortfolio = await seedConversation(
      deps.db,
      host,
      { handler: 'HUMAN', assigneeId: salespersonB.userId },
      { ownerId: salespersonB.userId },
    )
    const readable = await seedConversation(deps.db, host, { handler: 'QUEUE' })
    const socket = await socketOf(commercial.client)
    const notFound = { ok: false, status: 404, code: 'NOT_FOUND' }

    expect(await socket.join({ conversationId: foreign.id })).toEqual(notFound)
    expect(await socket.join({ conversationId: othersPortfolio.id })).toEqual(notFound)
    expect(await socket.join({ conversationId: randomUUID() })).toEqual(notFound)
    expect(await socket.join({ conversationId: readable.id })).toEqual({ ok: true })

    await inbound(deps.db, tenantB, { fromPhone: foreign.phoneE164 })
    await inbound(deps.db, host, { fromPhone: othersPortfolio.phoneE164 })
    const sentinel = await inbound(deps.db, host, { fromPhone: readable.phoneE164 })
    const before = await socket.until(sentinel.messageId)

    expect(before).toEqual([])
    expect(socket.received.map((pushed) => pushed.conversationId)).toEqual([readable.id])
  })

  it('refuses the room without a tenant context', async () => {
    const notFound = { ok: false, status: 404, code: 'NOT_FOUND' }
    const host = await brokerage()
    const conversation = await seedConversation(deps.db, host)

    const noOrganization = new TestClient(app)
    await signedInUser(noOrganization, deps)
    await acceptCurrentTerms(noOrganization)
    const withoutTenant = await socketOf(noOrganization)
    expect(await withoutTenant.join({ conversationId: conversation.id })).toEqual(notFound)

    const pendingTerms = new TestClient(app)
    await signedInUser(pendingTerms, deps)
    const onboarded = await pendingTerms.post('/api/v1/onboarding', { name: 'Sem Termos Sala' })
    expect(onboarded.statusCode).toBe(200)
    const ownConversation = await seedConversation(deps.db, {
      organizationId: onboarded.json().id as string,
    })
    const withPendingTerms = await socketOf(pendingTerms)
    expect(await withPendingTerms.join({ conversationId: ownConversation.id })).toEqual(notFound)

    const member = await colleague(host.organizationId, 'MANAGER')
    const later = await seedConversation(deps.db, host)
    const memberSocket = await socketOf(member.client)
    expect(await memberSocket.join({ conversationId: conversation.id })).toEqual({ ok: true })
    await deps.db.withTenant(host, (tx) =>
      tx.member.updateMany({ where: { userId: member.userId }, data: { active: false } }),
    )
    expect(await memberSocket.join({ conversationId: later.id })).toEqual(notFound)
  })

  it('rejects an invalid room payload', async () => {
    const host = await brokerage()
    const conversation = await seedConversation(deps.db, host)
    const socket = await socketOf(host.client)
    const invalid = { ok: false, status: 400, code: 'VALIDATION_ERROR' }

    expect(await socket.join({ conversationId: conversation.id, extra: 1 })).toEqual(invalid)
    expect(await socket.join({ conversationId: 'nao-uuid' })).toEqual(invalid)
    expect(await socket.join({})).toEqual(invalid)
    expect(await socket.leave({ conversationId: 'nao-uuid' })).toEqual(invalid)
  })

  it('delivers only to sockets in the room', async () => {
    const host = await brokerage()
    const first = await conversationWith(host)
    const second = await conversationWith(host)
    const control = await socketOf(host.client)
    const outsider = await socketOf(host.client)
    const leaver = await socketOf(host.client)
    for (const socket of [control, outsider, leaver]) {
      expect(await socket.join({ conversationId: second.id })).toEqual({ ok: true })
    }
    expect(await control.join({ conversationId: first.id })).toEqual({ ok: true })
    expect(await leaver.join({ conversationId: first.id })).toEqual({ ok: true })
    expect(await leaver.leave({ conversationId: first.id })).toEqual({ ok: true })

    const inFirst = await inbound(deps.db, host, { fromPhone: first.fromPhone })
    await control.until(inFirst.messageId)
    const inSecond = await inbound(deps.db, host, { fromPhone: second.fromPhone })

    for (const socket of [outsider, leaver]) {
      expect(await socket.until(inSecond.messageId)).toEqual([])
      expect(socket.received.map((pushed) => pushed.message.id)).toEqual([inSecond.messageId])
    }
  })

  it('asks every socket to resync after a drop', async () => {
    const host = await brokerage()
    const noOrganization = new TestClient(app)
    await signedInUser(noOrganization, deps)
    const withOrganization = await socketOf(host.client)
    const withoutOrganization = await socketOf(noOrganization)
    const listening = () =>
      withOwnerClient(async (client) => {
        const result = await client.query<{ pid: number }>(
          'SELECT pid FROM pg_stat_activity WHERE query = $1',
          [`LISTEN "${eventChannel(workerSchema())}"`],
        )
        return result.rows.map((row) => row.pid)
      })
    const [pid] = await eventually(listening, (pids) => pids.length === 1)

    await withOwnerClient((client) => client.query('SELECT pg_terminate_backend($1)', [pid]))

    for (const socket of [withOrganization, withoutOrganization]) {
      await eventually(
        () => socket.resyncs,
        (resyncs) => resyncs.length > 0,
      )
      expect(socket.resyncs).toEqual([{}])
    }
  })

  it('ignores an event whose message is not in the tenant', async () => {
    const host = await brokerage()
    const conversation = await conversationWith(host)
    const elsewhere = await createOrganization(deps.db)
    const socket = await socketOf(host.client)
    expect(await socket.join({ conversationId: conversation.id })).toEqual({ ok: true })

    await deps.db.withoutTenant(async (tx) => {
      await notify(tx, {
        type: 'message.created',
        organizationId: randomUUID(),
        conversationId: conversation.id,
        messageId: randomUUID(),
      })
      await notify(tx, {
        type: 'message.created',
        organizationId: elsewhere.id,
        conversationId: conversation.id,
        messageId: conversation.firstMessageId,
      })
    })
    const after = await inbound(deps.db, host, { fromPhone: conversation.fromPhone })

    expect(await socket.until(after.messageId)).toEqual([])
    expect(socket.received.map((pushed) => pushed.message.id)).toEqual([after.messageId])
  })
})

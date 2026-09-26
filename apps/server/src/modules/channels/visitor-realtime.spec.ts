import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { io as connect, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, TEST_APP_URL } from '../../../test/app.ts'
import { acceptCurrentTerms, randomIp, signedInUser, TestClient } from '../../../test/auth.ts'
import { inbound, randomPhone } from '../../../test/conversations.ts'
import { createOrganization } from '../../../test/factories.ts'
import { withOwnerClient, workerSchema } from '../../../test/setup-db.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'
import { eventChannel, notify } from '../../infrastructure/events.ts'
import { sendMessage } from '../conversations/index.ts'
import { WEB_CHAT_NOTICE_VERSION } from './index.ts'
import {
  readVisitorToken,
  signVisitorToken,
  VISITOR_TTL_SECONDS,
  visitorTokenKey,
} from './visitor-token.ts'

let app: App
let deps: Deps
let close: () => Promise<void>
let baseUrl: string
const sockets: Socket[] = []

beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp({ workers: true }))
  await app.listen({ host: '127.0.0.1', port: 0 })
  const { port } = app.server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  for (const socket of sockets) socket.disconnect()
  await close()
})

type Chat = { organizationId: string; key: string }
type Pushed = {
  conversationId: string
  message: { id: string; seq: number } & Record<string, unknown>
}

async function eventually<T>(read: () => Promise<T> | T, accept: (value: T) => boolean) {
  const deadline = Date.now() + 10_000
  for (;;) {
    const value = await read()
    if (accept(value)) return value
    if (Date.now() > deadline) throw new Error(`timed out; last value: ${JSON.stringify(value)}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function sessionOf(token: string) {
  const session = readVisitorToken(visitorTokenKey(deps.config.BETTER_AUTH_SECRET), token)
  expect(session).not.toBeNull()
  if (!session) throw new Error('expected visitor session')
  return session
}

async function chat(): Promise<Chat> {
  const organization = await createOrganization(deps.db)
  return { organizationId: organization.id, key: organization.publicChatKey }
}

function startBody(overrides: Record<string, unknown> = {}) {
  return {
    phone: randomPhone(),
    consent: true,
    noticeVersion: WEB_CHAT_NOTICE_VERSION,
    turnstileToken: 'token-do-widget',
    clientMessageId: randomUUID(),
    text: 'Olá, quero cotar um seguro.',
    ...overrides,
  }
}

async function startSession(target: Chat, overrides: Record<string, unknown> = {}) {
  const client = new TestClient(app, { ip: randomIp() })
  const body = startBody(overrides)
  const response = await client.post(`/api/public/chat/${target.key}/sessions`, body)
  expect(response.statusCode).toBe(201)
  return {
    client,
    body,
    token: response.json().token as string,
    message: response.json().message as { id: string; seq: number },
  }
}

async function visitorSocket(token: string, origin = TEST_APP_URL) {
  const socket = connect(`${baseUrl}/visitor`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token },
    extraHeaders: { origin },
    reconnection: false,
    forceNew: true,
  })
  sockets.push(socket)
  const received: Pushed[] = []
  const resyncs: unknown[] = []
  socket.on('message.created', (payload: Pushed) => received.push(payload))
  socket.on('events:resync', (payload: unknown) => resyncs.push(payload))
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', (error) => reject(error))
  })
  return {
    socket,
    received,
    resyncs,
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

function connectOutcome(auth: Record<string, unknown> | undefined) {
  const socket = connect(`${baseUrl}/visitor`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: auth ?? {},
    extraHeaders: { origin: TEST_APP_URL },
    reconnection: false,
    forceNew: true,
  })
  return new Promise<{ connected: true } | { error: string }>((resolve) => {
    socket.once('connect', () => {
      socket.disconnect()
      resolve({ connected: true })
    })
    socket.once('connect_error', (error) => {
      socket.disconnect()
      resolve({ error: error.message })
    })
  })
}

async function panelSocket(client: TestClient) {
  const socket = connect(baseUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    extraHeaders: { cookie: client.cookieHeader, origin: TEST_APP_URL },
    reconnection: false,
    forceNew: true,
  })
  sockets.push(socket)
  const received: Pushed[] = []
  socket.on('message.created', (payload: Pushed) => received.push(payload))
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', reject)
  })
  return {
    socket,
    received,
    join: (conversationId: string) => socket.emitWithAck('conversation:join', { conversationId }),
  }
}

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

describe('visitor realtime', () => {
  it('connects a visitor into the conversation room', async () => {
    const target = await chat()
    const { token, message } = await startSession(target)
    const session = sessionOf(token)

    const { socket } = await visitorSocket(token)
    const serverSide = (await app.realtime.visitor.fetchSockets()).find(
      (candidate) => candidate.id === socket.id,
    )

    expect(serverSide?.rooms.has(`conversation:${session.conversationId}`)).toBe(true)
    expect(message.seq).toBe(session.fromSeq)
    socket.disconnect()
  })

  it('refuses a missing, invalid or expired visitor token', async () => {
    const target = await chat()
    const { token } = await startSession(target)
    const session = sessionOf(token)
    const expired = signVisitorToken(
      visitorTokenKey(deps.config.BETTER_AUTH_SECRET),
      session,
      new Date(Date.now() - (VISITOR_TTL_SECONDS + 1) * 1000),
    )
    const otherKey = visitorTokenKey('another-secret-with-at-least-32-characters')
    const wrongSecret = signVisitorToken(otherKey, session)

    expect(await connectOutcome({})).toEqual({ error: 'UNAUTHENTICATED' })
    expect(await connectOutcome({ token: 'x' })).toEqual({ error: 'UNAUTHENTICATED' })
    expect(await connectOutcome({ token: wrongSecret })).toEqual({ error: 'UNAUTHENTICATED' })
    expect(await connectOutcome({ token: expired })).toEqual({ error: 'UNAUTHENTICATED' })
  })

  it('refuses an auth payload with extra fields', async () => {
    const target = await chat()
    const { token } = await startSession(target)

    expect(await connectOutcome({ token, extra: 1 })).toEqual({
      error: 'UNAUTHENTICATED',
    })
  })

  it('refuses a foreign origin on the visitor namespace', async () => {
    const target = await chat()
    const { token } = await startSession(target)
    const handshake = (origin: string) =>
      fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling`, {
        headers: { origin },
      })

    expect((await handshake('https://evil.example')).status).toBe(403)
    expect((await handshake(TEST_APP_URL)).status).toBe(200)

    const socket = connect(`${baseUrl}/visitor`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      extraHeaders: { origin: 'https://evil.example' },
      reconnection: false,
      forceNew: true,
    })
    const result = await new Promise<{ connected: true } | { error: string }>((resolve) => {
      socket.once('connect', () => resolve({ connected: true }))
      socket.once('connect_error', (error) => resolve({ error: error.message }))
    })
    socket.disconnect()

    expect(result).not.toEqual({ connected: true })
  })

  it('keeps the visitor namespace off the panel rooms', async () => {
    const host = await brokerage()
    const key = (
      await deps.db.withTenant(host, (tx) =>
        tx.organization.findUniqueOrThrow({
          where: { id: host.organizationId },
          select: { publicChatKey: true },
        }),
      )
    ).publicChatKey
    const target = { organizationId: host.organizationId, key }
    const { token } = await startSession(target)
    const session = sessionOf(token)
    const panel = await panelSocket(host.client)
    expect(await panel.join(session.conversationId)).toEqual({ ok: true })
    const visitor = await visitorSocket(token)

    const visitorServer = (await app.realtime.visitor.fetchSockets()).find(
      (candidate) => candidate.id === visitor.socket.id,
    )
    const panelRooms = [
      ...((await app.realtime.io.fetchSockets()).find(
        (candidate) => candidate.id === panel.socket.id,
      )?.rooms ?? []),
    ]
    const visitorOnly = {
      conversationId: session.conversationId,
      message: { id: 'only-visitor', seq: session.fromSeq },
    }
    app.realtime.visitor
      .to(`conversation:${session.conversationId}`)
      .emit('message.created', visitorOnly)

    await eventually(
      () => visitor.received.some((pushed) => pushed.message.id === 'only-visitor'),
      (found) => found,
    )
    expect([...(visitorServer?.rooms ?? [])].some((room) => room.startsWith('user:'))).toBe(false)
    expect([...(visitorServer?.rooms ?? [])].some((room) => room.startsWith('org:'))).toBe(false)
    expect(panelRooms).toContain(`conversation:${session.conversationId}`)
    expect(panel.received.map((pushed) => pushed.message.id)).not.toContain('only-visitor')
  })

  it('pushes PublicMessage to the visitor in under two seconds', async () => {
    const target = await chat()
    const phone = randomPhone()
    const { token, client } = await startSession(target, { phone })
    const session = sessionOf(token)
    const visitor = await visitorSocket(token)

    const started = Date.now()
    const second = await client.post(`/api/public/chat/${target.key}/messages`, {
      clientMessageId: randomUUID(),
      text: 'Segunda mensagem',
    })
    expect(second.statusCode).toBe(201)
    const beforeHuman = await visitor.until(second.json().message.id)
    expect(Date.now() - started).toBeLessThan(2000)
    expect(beforeHuman).toEqual([])

    const salesperson = await signedInUser(new TestClient(app), deps)
    await deps.db.withTenant(target, (tx) =>
      tx.member.create({
        data: { userId: salesperson.userId, role: 'COMMERCIAL', active: true },
      }),
    )
    await deps.db.withTenant(target, (tx) =>
      tx.conversation.update({
        where: { id: session.conversationId },
        data: { handler: 'HUMAN', assigneeId: salesperson.userId },
      }),
    )
    const humanStarted = Date.now()
    const human = await sendMessage(deps, target, {
      conversationId: session.conversationId,
      sender: { author: 'HUMAN', userId: salesperson.userId },
      text: 'Olá, posso ajudar!',
    })
    await visitor.until(human.messageId)
    expect(Date.now() - humanStarted).toBeLessThan(2000)

    for (const pushed of visitor.received) {
      expect(Object.keys(pushed.message).sort()).toEqual(
        ['author', 'direction', 'id', 'kind', 'sentAt', 'seq', 'text'].sort(),
      )
      expect(pushed.message).not.toHaveProperty('authorUserId')
      expect(pushed.message).not.toHaveProperty('deliveryStatus')
      expect(pushed.message).not.toHaveProperty('createdAt')
    }
  })

  it('never pushes a message below fromSeq', async () => {
    const target = await chat()
    const phone = randomPhone()
    await inbound(deps.db, target, { fromPhone: phone, text: 'hist-1' })
    await inbound(deps.db, target, { fromPhone: phone, text: 'hist-2' })
    await inbound(deps.db, target, { fromPhone: phone, text: 'hist-3' })
    const { token, message } = await startSession(target, { phone })
    expect(message.seq).toBe(4)
    const session = sessionOf(token)
    const visitor = await visitorSocket(token)
    const old = await deps.db.withTenant(target, (tx) =>
      tx.message.findFirstOrThrow({
        where: { conversationId: session.conversationId, seq: 2 },
        select: { id: true },
      }),
    )

    await deps.db.withoutTenant((tx) =>
      notify(tx, {
        type: 'message.created',
        organizationId: target.organizationId,
        conversationId: session.conversationId,
        messageId: old.id,
      }),
    )
    const later = await inbound(deps.db, target, { fromPhone: phone, text: 'nova' })

    expect(await visitor.until(later.messageId)).toEqual([])
    expect(visitor.received.every((pushed) => pushed.message.seq >= session.fromSeq)).toBe(true)
    expect(visitor.received.map((pushed) => pushed.message.seq)).not.toContain(2)
  })

  it('filters by each socket fromSeq', async () => {
    const target = await chat()
    const phone = randomPhone()
    let last = await inbound(deps.db, target, { fromPhone: phone })
    for (let seq = 2; seq <= 6; seq++) {
      last = await inbound(deps.db, target, { fromPhone: phone, text: `m${seq}` })
    }
    const contact = await deps.db.withTenant(target, (tx) =>
      tx.conversation.findUniqueOrThrow({
        where: { id: last.conversationId },
        select: { contactId: true },
      }),
    )
    const key = visitorTokenKey(deps.config.BETTER_AUTH_SECRET)
    const low = signVisitorToken(key, {
      organizationId: target.organizationId,
      contactId: contact.contactId,
      conversationId: last.conversationId,
      fromSeq: 5,
    })
    const high = signVisitorToken(key, {
      organizationId: target.organizationId,
      contactId: contact.contactId,
      conversationId: last.conversationId,
      fromSeq: 10,
    })
    const lowSocket = await visitorSocket(low)
    const highSocket = await visitorSocket(high)

    const mid = await inbound(deps.db, target, { fromPhone: phone, text: 'seq-7' })
    expect(mid.conversationId).toBe(last.conversationId)
    const midSeq = await deps.db.withTenant(target, (tx) =>
      tx.message.findUniqueOrThrow({ where: { id: mid.messageId }, select: { seq: true } }),
    )
    expect(midSeq.seq).toBe(7)
    await lowSocket.until(mid.messageId)
    expect(highSocket.received.map((pushed) => pushed.message.id)).not.toContain(mid.messageId)

    let both = mid
    for (let seq = midSeq.seq + 1; seq <= 11; seq++) {
      both = await inbound(deps.db, target, { fromPhone: phone, text: `m${seq}` })
    }
    await lowSocket.until(both.messageId)
    await highSocket.until(both.messageId)
    expect(lowSocket.received.map((pushed) => pushed.message.seq)).toContain(7)
    expect(highSocket.received.map((pushed) => pushed.message.seq)).not.toContain(7)
    expect(highSocket.received.map((pushed) => pushed.message.seq)).toContain(11)
  })

  it('delivers only to the visitor conversation', async () => {
    const a = await chat()
    const b = await chat()
    const startedA = await startSession(a)
    const startedB = await startSession(b)
    const visitorA = await visitorSocket(startedA.token)
    const visitorB = await visitorSocket(startedB.token)
    const sessionA = sessionOf(startedA.token)

    const otherSameOrg = await inbound(deps.db, a, { fromPhone: randomPhone() })
    const otherTenant = await inbound(deps.db, b, {
      fromPhone: startedB.body.phone as string,
      text: 'outra org',
    })
    const mine = await inbound(deps.db, a, {
      fromPhone: startedA.body.phone as string,
      text: 'minha',
    })

    expect(await visitorA.until(mine.messageId)).toEqual([])
    expect(visitorA.received.map((pushed) => pushed.message.id)).not.toContain(
      otherSameOrg.messageId,
    )
    expect(visitorA.received.map((pushed) => pushed.message.id)).not.toContain(
      otherTenant.messageId,
    )
    expect(visitorB.received.map((pushed) => pushed.message.id)).not.toContain(mine.messageId)
    expect(sessionA.conversationId).toBe(mine.conversationId)
  })

  it('gives Message to the panel and PublicMessage to the visitor', async () => {
    const host = await brokerage()
    const key = (
      await deps.db.withTenant(host, (tx) =>
        tx.organization.findUniqueOrThrow({
          where: { id: host.organizationId },
          select: { publicChatKey: true },
        }),
      )
    ).publicChatKey
    const target = { organizationId: host.organizationId, key }
    const { token, client } = await startSession(target)
    const session = sessionOf(token)
    const visitor = await visitorSocket(token)
    const panel = await panelSocket(host.client)
    expect(await panel.join(session.conversationId)).toEqual({ ok: true })

    const sent = await client.post(`/api/public/chat/${target.key}/messages`, {
      clientMessageId: randomUUID(),
      text: 'Comparar formatos',
    })
    const messageId = sent.json().message.id as string
    await visitor.until(messageId)
    await eventually(
      () => panel.received.some((pushed) => pushed.message.id === messageId),
      (found) => found,
    )

    const panelPayload = panel.received.find((pushed) => pushed.message.id === messageId)
    const visitorPayload = visitor.received.find((pushed) => pushed.message.id === messageId)
    expect(panelPayload).toBeDefined()
    expect(visitorPayload).toBeDefined()
    if (!panelPayload || !visitorPayload) throw new Error('expected payloads')
    expect(panelPayload.message).toHaveProperty('authorUserId')
    expect(visitorPayload.message).not.toHaveProperty('authorUserId')
    const listed = await client.get(`/api/public/chat/${target.key}/messages`)
    const fromApi = listed.json().items.find((item: { id: string }) => item.id === messageId)
    expect(visitorPayload.message).toEqual(fromApi)
  })

  it('asks the visitor namespace to resync after a drop', async () => {
    const target = await chat()
    const { token } = await startSession(target)
    const host = await brokerage()
    const visitor = await visitorSocket(token)
    const panel = await panelSocket(host.client)
    const panelResyncs: unknown[] = []
    panel.socket.on('events:resync', (payload: unknown) => panelResyncs.push(payload))
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

    await eventually(
      () => visitor.resyncs,
      (resyncs) => resyncs.length > 0,
    )
    await eventually(
      () => panelResyncs,
      (resyncs) => resyncs.length > 0,
    )
    expect(visitor.resyncs).toEqual([{}])
    expect(panelResyncs).toEqual([{}])
  })
})

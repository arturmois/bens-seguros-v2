import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { io as connect, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, TEST_APP_URL } from '../../test/app.ts'
import { acceptCurrentTerms, signedInUser, TestClient } from '../../test/auth.ts'
import { createRealtime } from './realtime.ts'

let testApp: Awaited<ReturnType<typeof buildTestApp>>
let baseUrl: string

beforeAll(async () => {
  testApp = await buildTestApp({ workers: true })
  await testApp.app.listen({ host: '127.0.0.1', port: 0 })
  const { port } = testApp.app.server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(() => testApp.close())

function open(headers: Record<string, string>) {
  return connect(baseUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    extraHeaders: headers,
    reconnection: false,
  })
}

function outcome(socket: Socket) {
  return new Promise<{ connected: true } | { error: string }>((resolve) => {
    socket.once('connect', () => resolve({ connected: true }))
    socket.once('connect_error', (error) => resolve({ error: error.message }))
  })
}

async function sessionCookie() {
  const client = new TestClient(testApp.app)
  const user = await signedInUser(client, testApp.deps)
  return { ...user, cookie: client.cookieHeader }
}

describe('realtime', () => {
  it('accepts a socket with a valid session', async () => {
    const { cookie, userId } = await sessionCookie()
    const socket = open({ cookie, origin: TEST_APP_URL })

    expect(await outcome(socket)).toEqual({ connected: true })
    const serverSockets = await testApp.app.realtime.io.fetchSockets()
    const serverSide = serverSockets.find((candidate) => candidate.id === socket.id)
    expect(serverSide?.data.user.userId).toBe(userId)
    socket.disconnect()
  })

  it('joins the user and org rooms when the tenant context exists', async () => {
    const client = new TestClient(testApp.app)
    const { userId, cookie } = await (async () => {
      const user = await signedInUser(client, testApp.deps)
      await acceptCurrentTerms(client)
      const created = await client.post('/api/v1/onboarding', { name: 'Sala' })
      return { ...user, cookie: client.cookieHeader, organizationId: created.json().id as string }
    })()
    const organizationId = (await client.get('/api/v1/me')).json().activeOrganizationId as string
    const socket = open({ cookie, origin: TEST_APP_URL })

    expect(await outcome(socket)).toEqual({ connected: true })
    const serverSockets = await testApp.app.realtime.io.fetchSockets()
    const serverSide = serverSockets.find((candidate) => candidate.id === socket.id)
    expect(serverSide?.rooms.has(`user:${userId}`)).toBe(true)
    expect(serverSide?.rooms.has(`org:${organizationId}`)).toBe(true)
    socket.disconnect()
  })

  it('joins only the user room without an active organization', async () => {
    const { cookie, userId } = await sessionCookie()
    const socket = open({ cookie, origin: TEST_APP_URL })

    expect(await outcome(socket)).toEqual({ connected: true })
    const serverSockets = await testApp.app.realtime.io.fetchSockets()
    const serverSide = serverSockets.find((candidate) => candidate.id === socket.id)
    const rooms = [...(serverSide?.rooms ?? [])]
    expect(rooms).toContain(`user:${userId}`)
    expect(rooms.some((room) => room.startsWith('org:'))).toBe(false)
    socket.disconnect()
  })

  it('rejects a socket without a valid session', async () => {
    const noCookie = open({ origin: TEST_APP_URL })
    expect(await outcome(noCookie)).toEqual({ error: 'UNAUTHENTICATED' })
    noCookie.disconnect()

    const { cookie, userId } = await sessionCookie()
    await testApp.deps.db.session.deleteMany({ where: { userId } })
    const revoked = open({ cookie, origin: TEST_APP_URL })
    expect(await outcome(revoked)).toEqual({ error: 'UNAUTHENTICATED' })
    revoked.disconnect()
  })

  it('rejects a socket with an expired session', async () => {
    const { cookie, userId } = await sessionCookie()
    await testApp.deps.db.session.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const socket = open({ cookie, origin: TEST_APP_URL })

    expect(await outcome(socket)).toEqual({ error: 'UNAUTHENTICATED' })
    socket.disconnect()
  })

  it('refuses the handshake from another origin with 403', async () => {
    const { cookie } = await sessionCookie()
    const handshake = (origin: string) =>
      fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling`, { headers: { cookie, origin } })

    const foreign = await handshake('https://evil.example')
    const own = await handshake(TEST_APP_URL)

    expect(foreign.status).toBe(403)
    expect(own.status).toBe(200)
  })

  it('rejects a socket from another origin', async () => {
    const { cookie } = await sessionCookie()
    const socket = open({ cookie, origin: 'https://evil.example' })

    const result = await outcome(socket)
    socket.disconnect()

    expect(result).not.toEqual({ connected: true })
  })

  it('keeps serving HTTP routes on the same server', async () => {
    const response = await fetch(`${baseUrl}/api/health`)

    expect(response.status).toBe(200)
  })

  it('answers an internal error when the room authorization fails', async () => {
    const httpServer = createServer()
    const realtime = createRealtime(httpServer, {
      allowedOrigin: TEST_APP_URL,
      authenticate: async () => ({
        userId: randomUUID(),
        sessionId: randomUUID(),
        isSuperAdmin: false,
        organizationId: randomUUID(),
      }),
      authorizeJoin: async () => {
        throw new Error('database down')
      },
    })
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const { port } = httpServer.address() as AddressInfo
    const socket = connect(`http://127.0.0.1:${port}`, {
      path: '/socket.io',
      transports: ['websocket'],
      extraHeaders: { origin: TEST_APP_URL },
      reconnection: false,
    })
    try {
      expect(await outcome(socket)).toEqual({ connected: true })

      const ack = await socket.emitWithAck('conversation:join', { conversationId: randomUUID() })

      expect(ack).toEqual({ ok: false, status: 500, code: 'INTERNAL_ERROR' })
    } finally {
      socket.disconnect()
      await realtime.close()
    }
  })
})

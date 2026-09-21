import type { AddressInfo } from 'node:net'
import { io as connect } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../test/app.ts'

let testApp: Awaited<ReturnType<typeof buildTestApp>>
let baseUrl: string

beforeAll(async () => {
  testApp = await buildTestApp()
  await testApp.app.listen({ host: '127.0.0.1', port: 0 })
  const { port } = testApp.app.server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(() => testApp.close())

describe('realtime', () => {
  it('accepts Socket.IO connections on the API server under /socket.io', async () => {
    const socket = connect(baseUrl, { path: '/socket.io', transports: ['websocket'] })

    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('connect_error', reject)
    })
    expect(socket.connected).toBe(true)

    socket.disconnect()
  })

  it('keeps serving HTTP routes on the same server', async () => {
    const response = await fetch(`${baseUrl}/api/health`)

    expect(response.status).toBe(200)
  })
})

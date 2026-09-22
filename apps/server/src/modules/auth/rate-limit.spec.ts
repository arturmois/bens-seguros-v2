import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { randomIp, signedInUser, TestClient, uniqueEmail } from '../../../test/auth.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'

let app: App
let deps: Deps
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp({ workers: true }))
  await app.ready()
})

afterAll(() => close())

const wrongSignIn = { email: 'ninguem@example.com', password: 'senha-errada-000' }

async function statuses(count: number, send: () => Promise<{ statusCode: number }>) {
  const result: number[] = []
  for (let i = 0; i < count; i++) result.push((await send()).statusCode)
  return result
}

describe('auth rate limit', () => {
  it('blocks the eleventh sign-in', async () => {
    const client = new TestClient(app)

    const result = await statuses(11, () => client.post('/api/auth/sign-in/email', wrongSignIn))

    expect(result.slice(0, 10)).not.toContain(429)
    expect(result[10]).toBe(429)
  })

  it('survives a restart', async () => {
    const ip = randomIp()
    const first = await buildTestApp()
    await first.app.ready()
    const before = await statuses(10, () =>
      new TestClient(first.app, { ip }).post('/api/auth/sign-in/email', wrongSignIn),
    )
    await first.close()
    expect(before).not.toContain(429)
    // In the database, not in the process: Better Auth's memory store is a module-level Map that
    // would also survive a second app in this same process.
    const row = await deps.db.rateLimit.findUniqueOrThrow({
      where: { key: `${ip}|/sign-in/email` },
    })
    expect(row.count).toBe(10)

    const second = await buildTestApp()
    await second.app.ready()
    const after = await new TestClient(second.app, { ip }).post(
      '/api/auth/sign-in/email',
      wrongSignIn,
    )
    await second.close()

    expect(after.statusCode).toBe(429)
  })

  it('ignores a client x-forwarded-for without a trusted proxy', async () => {
    const client = new TestClient(app)

    const result = await statuses(11, () =>
      client.post('/api/auth/sign-in/email', wrongSignIn, {
        headers: { 'x-forwarded-for': randomIp() },
      }),
    )

    expect(result.slice(0, 10)).not.toContain(429)
    expect(result[10]).toBe(429)
  })

  it('buckets by the proxy client ip when trusted', async () => {
    const proxied = await buildTestApp({ env: { TRUST_PROXY: 'true' } })
    await proxied.app.ready()
    // Every request comes from the same proxy address; the client is in X-Forwarded-For.
    const proxy = new TestClient(proxied.app, { ip: '172.18.0.2' })
    const [clientA, clientB] = [randomIp(), randomIp()]
    const from = (clientIp: string) => () =>
      proxy.post('/api/auth/sign-in/email', wrongSignIn, {
        headers: { 'x-forwarded-for': clientIp },
      })

    const a = await statuses(10, from(clientA))
    const b = await from(clientB)()
    const aAgain = await from(clientA)()
    await proxied.close()

    expect(a).not.toContain(429)
    expect(b.statusCode).not.toBe(429)
    expect(aAgain.statusCode).toBe(429)
  })

  it('applies each path limit', async () => {
    const { email } = await signedInUser(new TestClient(app), deps)
    const cases = [
      {
        path: '/api/auth/sign-up/email',
        limit: 5,
        body: () => ({ name: 'Robô', email: uniqueEmail('robo'), password: 'senha-segura-123' }),
      },
      { path: '/api/auth/request-password-reset', limit: 3, body: () => ({ email }) },
      { path: '/api/auth/send-verification-email', limit: 3, body: () => ({ email }) },
      { path: '/api/auth/two-factor/verify-totp', limit: 10, body: () => ({ code: '000000' }) },
    ]

    for (const { path, limit, body } of cases) {
      const client = new TestClient(app)
      const result = await statuses(limit + 1, () => client.post(path, body()))

      expect(result.slice(0, limit), path).not.toContain(429)
      expect(result[limit], path).toBe(429)
    }
  })

  it('each rule has the planned window', async () => {
    const rules = [
      { path: '/sign-in/email', window: 900, max: 10 },
      { path: '/sign-up/email', window: 3600, max: 5 },
      { path: '/request-password-reset', window: 3600, max: 3 },
      { path: '/send-verification-email', window: 3600, max: 3 },
      { path: '/two-factor/verify-totp', window: 900, max: 10 },
      // Any other path falls under the global rule.
      { path: '/get-session', window: 60, max: 100 },
    ]
    const send = (client: TestClient, path: string) =>
      path === '/get-session'
        ? client.get(`/api/auth${path}`)
        : client.post(`/api/auth${path}`, {
            name: 'Robô',
            email: uniqueEmail('janela'),
            password: 'senha-segura-123',
            code: '000000',
          })

    for (const { path, window, max } of rules) {
      const client = new TestClient(app)
      const key = `${client.ip}|${path}`
      const at = (secondsAgo: number) => BigInt(Date.now() - secondsAgo * 1000)
      await deps.db.rateLimit.create({ data: { key, count: max, lastRequest: at(window - 5) } })

      const inside = await send(client, path)

      await deps.db.rateLimit.update({ where: { key }, data: { lastRequest: at(window + 1) } })
      const after = await send(client, path)

      expect(inside.statusCode, `${path} inside the window`).toBe(429)
      expect(after.statusCode, `${path} after the window`).not.toBe(429)
    }
  })
})

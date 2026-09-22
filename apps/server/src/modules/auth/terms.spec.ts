import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { signedInUser, TestClient } from '../../../test/auth.ts'
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

const current = { termsVersion: '1.0', privacyVersion: '1.0' }

async function user(client = new TestClient(app)) {
  const signed = await signedInUser(client, deps)
  return { client, ...signed }
}

describe('terms acceptance', () => {
  it('reports pending terms before acceptance', async () => {
    const { client } = await user()
    const response = await client.get('/api/v1/me')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      terms: { pending: true, termsVersion: '1.0', privacyVersion: '1.0' },
    })
  })

  it('stores both documents with the client ip', async () => {
    const member = await user()
    const before = Date.now()
    const response = await member.client.post('/api/v1/me/terms-acceptance', current)
    const body = response.json()

    expect(response.statusCode).toBe(200)
    expect(body).toMatchObject(current)
    const rows = await deps.db.termsAcceptance.findMany({
      where: { userId: member.userId },
      orderBy: { document: 'asc' },
    })
    expect(rows.map((row) => row.document).sort()).toEqual(['PRIVACY', 'TERMS'])
    expect(rows.every((row) => row.version === '1.0')).toBe(true)
    expect(rows.every((row) => row.ipAddress === member.client.ip)).toBe(true)
    for (const row of rows) {
      expect(row.acceptedAt.getTime()).toBeGreaterThanOrEqual(before - 1000)
      expect(body.acceptedAt).toBe(row.acceptedAt.toISOString())
    }
  })

  it('reports pending false after both current versions', async () => {
    const member = await user()
    expect((await member.client.post('/api/v1/me/terms-acceptance', current)).statusCode).toBe(200)

    const response = await member.client.get('/api/v1/me')
    expect(response.json()).toMatchObject({ terms: { pending: false } })
  })

  it('pending stays true when only an older version exists', async () => {
    const member = await user()
    await deps.db.termsAcceptance.create({
      data: { userId: member.userId, document: 'TERMS', version: '0.9', ipAddress: '203.0.113.8' },
    })

    const response = await member.client.get('/api/v1/me')
    expect(response.json()).toMatchObject({
      terms: { pending: true, termsVersion: '1.0', privacyVersion: '1.0' },
    })
  })

  it('repeat acceptance keeps the first timestamp', async () => {
    const member = await user()
    const first = await member.client.post('/api/v1/me/terms-acceptance', current)
    const second = await member.client.post('/api/v1/me/terms-acceptance', current)

    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual(first.json())
    expect(await deps.db.termsAcceptance.count({ where: { userId: member.userId } })).toBe(2)
  })

  it('rejects a version that is not current', async () => {
    const member = await user()
    for (const body of [
      { termsVersion: '9.9', privacyVersion: '1.0' },
      { termsVersion: '1.0', privacyVersion: '9.9' },
    ]) {
      const response = await member.client.post('/api/v1/me/terms-acceptance', body)
      expect(response.statusCode, JSON.stringify(body)).toBe(409)
      expect(response.json(), JSON.stringify(body)).toEqual({
        error: {
          code: 'TERMS_VERSION_MISMATCH',
          message: 'Os termos foram atualizados. Recarregue a página para ver a versão atual.',
        },
      })
    }
    expect(await deps.db.termsAcceptance.count({ where: { userId: member.userId } })).toBe(0)
  })

  it('rejects a body that is not the two versions', async () => {
    const member = await user()
    const extra = await member.client.post('/api/v1/me/terms-acceptance', {
      ...current,
      extra: true,
    })
    const missing = await member.client.post('/api/v1/me/terms-acceptance', { termsVersion: '1.0' })

    expect(extra.statusCode).toBe(400)
    expect(extra.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    expect(missing.statusCode).toBe(400)
    expect(missing.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    expect(await deps.db.termsAcceptance.count({ where: { userId: member.userId } })).toBe(0)
  })

  it('requires a session', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/v1/me' })
    const accept = await app.inject({
      method: 'POST',
      url: '/api/v1/me/terms-acceptance',
      payload: current,
      headers: { origin: 'http://localhost:3000' },
    })

    expect(me.statusCode).toBe(401)
    expect(me.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
    expect(accept.statusCode).toBe(401)
    expect(accept.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
  })

  it('rejects a write from another origin', async () => {
    const member = await user()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/me/terms-acceptance',
      payload: current,
      headers: { cookie: member.client.cookieHeader },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ error: { code: 'ORIGIN_NOT_ALLOWED' } })
  })

  it('one user acceptance does not clear another', async () => {
    const first = await user()
    const second = await user()
    expect((await first.client.post('/api/v1/me/terms-acceptance', current)).statusCode).toBe(200)

    expect((await first.client.get('/api/v1/me')).json()).toMatchObject({
      terms: { pending: false },
    })
    expect((await second.client.get('/api/v1/me')).json()).toMatchObject({
      email: second.email,
      terms: { pending: true },
    })
  })
})

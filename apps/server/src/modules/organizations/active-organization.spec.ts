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

async function activeOrganizationId(userId: string) {
  const session = await deps.db.session.findFirstOrThrow({ where: { userId } })
  return session.activeOrganizationId
}

describe('POST /api/v1/me/active-organization', () => {
  it('switches to an active membership', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    const first = await client.post('/api/v1/onboarding', { name: 'Casa Um' })
    const second = await client.post('/api/v1/onboarding', { name: 'Casa Dois' })
    expect(await activeOrganizationId(userId)).toBe(second.json().id)

    const response = await client.post('/api/v1/me/active-organization', {
      organizationId: first.json().id,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ organizationId: first.json().id, role: 'OWNER' })
    expect(await activeOrganizationId(userId)).toBe(first.json().id)
  })

  it('hides an organization the user is not an active member of', async () => {
    const owner = new TestClient(app)
    const { userId } = await signedInUser(owner, deps)
    const own = await owner.post('/api/v1/onboarding', { name: 'Minha' })
    const ownId = own.json().id as string

    const stranger = new TestClient(app)
    await signedInUser(stranger, deps)
    const foreign = await stranger.post('/api/v1/onboarding', { name: 'Alheia' })

    const hidden = await owner.post('/api/v1/me/active-organization', {
      organizationId: foreign.json().id,
    })
    expect(hidden.statusCode).toBe(404)
    expect(hidden.json().error.code).toBe('NOT_FOUND')
    expect(await activeOrganizationId(userId)).toBe(ownId)

    await deps.db.withTenant({ organizationId: ownId }, (tx) =>
      tx.member.updateMany({ where: { userId }, data: { active: false } }),
    )
    const inactive = await owner.post('/api/v1/me/active-organization', { organizationId: ownId })
    expect(inactive.statusCode).toBe(404)
    expect(inactive.json().error.code).toBe('NOT_FOUND')
    expect(await activeOrganizationId(userId)).toBe(ownId)
  })

  it('rejects a body that is not the organization id', async () => {
    const client = new TestClient(app)
    await signedInUser(client, deps)
    const created = await client.post('/api/v1/onboarding', { name: 'Valida' })

    const extra = await client.post('/api/v1/me/active-organization', {
      organizationId: created.json().id,
      extra: true,
    })
    const missing = await client.post('/api/v1/me/active-organization', {})

    expect(extra.statusCode).toBe(400)
    expect(extra.json().error.code).toBe('VALIDATION_ERROR')
    expect(missing.statusCode).toBe(400)
    expect(missing.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('requires a session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/me/active-organization',
      headers: { origin: 'http://localhost:3000' },
      payload: { organizationId: '018f0000-0000-7000-8000-0000000000aa' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('UNAUTHENTICATED')
  })
})

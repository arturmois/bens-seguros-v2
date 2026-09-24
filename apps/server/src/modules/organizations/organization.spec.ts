import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { acceptCurrentTerms, signedInUser, TestClient } from '../../../test/auth.ts'
import { withTwoTenants } from '../../../test/factories.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'
import type { Role } from '../../shared/permissions.ts'

let app: App
let deps: Deps
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp({ workers: true }))
  await app.ready()
})

afterAll(() => close())

async function setRole(organizationId: string, userId: string, role: Role) {
  await deps.db.withTenant({ organizationId }, (tx) =>
    tx.member.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { role },
    }),
  )
}

describe('GET and PATCH /api/v1/organization', () => {
  it('blocks a tenant route while terms are pending', async () => {
    const client = new TestClient(app)
    await signedInUser(client, deps)
    const created = await client.post('/api/v1/onboarding', { name: 'Termos Pendentes' })
    expect(created.statusCode).toBe(200)

    const response = await client.get('/api/v1/organization')

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: {
        code: 'TERMS_NOT_ACCEPTED',
        message: 'Aceite os termos e a política de privacidade para continuar.',
      },
    })
    expect(response.body).not.toContain(created.json().name)
  })

  it('rejects a tenant route without an active organization', async () => {
    const client = new TestClient(app)
    await signedInUser(client, deps)
    await acceptCurrentTerms(client)

    const response = await client.get('/api/v1/organization')

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: { code: 'NO_ACTIVE_ORGANIZATION', message: 'Nenhuma organização ativa.' },
    })
  })

  it('rejects a tenant route whose membership is gone', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    await acceptCurrentTerms(client)
    const created = await client.post('/api/v1/onboarding', { name: 'Saiu' })
    const organizationId = created.json().id as string
    await deps.db.withTenant({ organizationId }, (tx) =>
      tx.member.updateMany({ where: { userId }, data: { active: false } }),
    )

    const read = await client.get('/api/v1/organization')
    const write = await client.patch('/api/v1/organization', { name: 'Novo Nome' })

    expect(read.statusCode).toBe(404)
    expect(read.json().error.code).toBe('NOT_FOUND')
    expect(write.statusCode).toBe(404)
    expect(write.json().error.code).toBe('NOT_FOUND')
  })

  it('returns the active organization for every role', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    await acceptCurrentTerms(client)
    const created = await client.post('/api/v1/onboarding', { name: 'Papéis' })
    const organizationId = created.json().id as string
    const roles: Role[] = ['ADMIN', 'MANAGER', 'COMMERCIAL']

    for (const role of roles) {
      await setRole(organizationId, userId, role)
      const response = await client.get('/api/v1/organization')
      expect(response.statusCode, role).toBe(200)
      expect(response.json(), role).toEqual({
        id: organizationId,
        name: 'Papéis',
        slug: created.json().slug,
        role,
      })
    }
  })

  it('requires a session', async () => {
    const read = await app.inject({ method: 'GET', url: '/api/v1/organization' })
    const write = await app.inject({
      method: 'PATCH',
      url: '/api/v1/organization',
      headers: { origin: 'http://localhost:3000' },
      payload: { name: 'Sem Sessao' },
    })

    expect(read.statusCode).toBe(401)
    expect(read.json().error.code).toBe('UNAUTHENTICATED')
    expect(write.statusCode).toBe(401)
    expect(write.json().error.code).toBe('UNAUTHENTICATED')
  })

  it('renames the organization without changing the slug', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    await acceptCurrentTerms(client)
    const created = await client.post('/api/v1/onboarding', { name: 'Nome Antigo' })
    const organizationId = created.json().id as string
    const slug = created.json().slug as string

    for (const role of ['ADMIN'] as const) {
      await setRole(organizationId, userId, role)
      const response = await client.patch('/api/v1/organization', { name: 'Outro Nome' })
      expect(response.statusCode, role).toBe(200)
      expect(response.json(), role).toEqual({ id: organizationId, name: 'Outro Nome', slug })
    }
  })

  it('records organization.update with the name redacted', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    await acceptCurrentTerms(client)
    const created = await client.post('/api/v1/onboarding', { name: 'Nome Antigo' })
    const organizationId = created.json().id as string

    const response = await client.patch('/api/v1/organization', { name: 'Nome Novo' })

    expect(response.statusCode).toBe(200)
    const rows = await deps.db.withTenant({ organizationId }, (tx) =>
      tx.auditLog.findMany({ where: { action: 'organization.update' } }),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actorUserId: userId,
      entityId: organizationId,
    })
    expect(rows[0]?.changes).toEqual({ name: '[alterado]' })
    expect(JSON.stringify(rows)).not.toContain('Nome Novo')
  })

  it('rejects a rename from a role without organization:update', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    await acceptCurrentTerms(client)
    const created = await client.post('/api/v1/onboarding', { name: 'Travada' })
    const organizationId = created.json().id as string

    for (const role of ['MANAGER', 'COMMERCIAL'] as const) {
      await setRole(organizationId, userId, role)
      const response = await client.patch('/api/v1/organization', { name: 'Outro Nome' })
      expect(response.statusCode, role).toBe(403)
      expect(response.json().error.code, role).toBe('FORBIDDEN')
      const stored = await deps.db.withTenant({ organizationId }, (tx) =>
        tx.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      )
      expect(stored.name, role).toBe('Travada')
    }
  })

  it('rejects a rename that is not a name of 2 to 80 characters', async () => {
    const client = new TestClient(app)
    await signedInUser(client, deps)
    await acceptCurrentTerms(client)
    await client.post('/api/v1/onboarding', { name: 'Editavel' })

    const rejected = [
      client.patch('/api/v1/organization', { name: 'Ok', extra: true }),
      client.patch('/api/v1/organization', {}),
      client.patch('/api/v1/organization', { name: 'a' }),
      client.patch('/api/v1/organization', { name: 'a'.repeat(81) }),
    ]
    for (const pending of rejected) {
      const response = await pending
      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('does not return the other tenant organization', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    await acceptCurrentTerms(client)
    const { tenantA, tenantB } = await withTwoTenants(deps.db)
    await deps.db.withTenant(tenantA, (tx) => tx.member.create({ data: { userId, role: 'ADMIN' } }))
    await deps.db.session.updateMany({
      where: { userId },
      data: { activeOrganizationId: tenantA.organizationId },
    })

    const response = await client.get('/api/v1/organization')

    expect(response.statusCode).toBe(200)
    expect(response.json().id).toBe(tenantA.organizationId)
    expect(response.body).not.toContain(tenantB.organizationId)
  })
})

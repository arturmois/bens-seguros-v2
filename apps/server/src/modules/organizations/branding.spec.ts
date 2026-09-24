import { randomUUID } from 'node:crypto'
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

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff, 0xe0]
const WEBP_SIGNATURE = [...Buffer.from('RIFF'), 0x24, 0x00, 0x00, 0x00, ...Buffer.from('WEBPVP8 ')]

// An image of `size` bytes: the signature, then bytes that differ per call.
function image(signature: number[], size = 64) {
  const bytes = Buffer.alloc(size)
  Buffer.from(signature).copy(bytes)
  Buffer.from(randomUUID()).copy(bytes, signature.length)
  return bytes
}

async function brokerage() {
  const client = new TestClient(app)
  const user = await signedInUser(client, deps)
  await acceptCurrentTerms(client)
  const created = await client.post('/api/v1/onboarding', {
    name: `Marca ${randomUUID().slice(0, 8)}`,
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
  return client
}

async function stored(organizationId: string) {
  return deps.db.withTenant({ organizationId }, (tx) =>
    tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        brandColor: true,
        greeting: true,
        logo: true,
        logoMimeType: true,
        logoUpdatedAt: true,
      },
    }),
  )
}

async function audits(organizationId: string) {
  return deps.db.withTenant({ organizationId }, (tx) =>
    tx.auditLog.findMany({
      where: { action: 'organization.update' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  )
}

describe('PATCH /api/v1/organization/branding', () => {
  it('saves the brand color and greeting', async () => {
    const host = await brokerage()

    const response = await host.client.patch('/api/v1/organization/branding', {
      brandColor: '#1a2b3c',
      greeting: 'Olá! Como podemos ajudar?',
    })
    const organization = await host.client.get('/api/v1/organization')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      brandColor: '#1a2b3c',
      greeting: 'Olá! Como podemos ajudar?',
    })
    expect(organization.json()).toMatchObject({
      brandColor: '#1a2b3c',
      greeting: 'Olá! Como podemos ajudar?',
    })
  })

  it('records organization.update for branding', async () => {
    const host = await brokerage()

    await host.client.patch('/api/v1/organization/branding', {
      brandColor: '#1a2b3c',
      greeting: 'Bem-vindo',
    })

    const trail = await audits(host.organizationId)
    expect(trail).toHaveLength(1)
    expect(trail[0]).toMatchObject({ actorUserId: host.userId, entityId: host.organizationId })
    expect(trail[0]?.changes).toEqual({
      brandColor: ['', '#1a2b3c'],
      greeting: ['', 'Bem-vindo'],
    })
  })

  it('lowercases the brand color', async () => {
    const host = await brokerage()

    const response = await host.client.patch('/api/v1/organization/branding', {
      brandColor: '#1A2B3C',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().brandColor).toBe('#1a2b3c')
    expect((await stored(host.organizationId)).brandColor).toBe('#1a2b3c')
  })

  it('rejects a brand color that is not #rrggbb', async () => {
    const host = await brokerage()
    await host.client.patch('/api/v1/organization/branding', { brandColor: '#000000' })

    for (const brandColor of ['1a2b3c', '#1a2b3', '#1a2b3cd', '#gggggg', 'red']) {
      const response = await host.client.patch('/api/v1/organization/branding', { brandColor })
      expect(response.statusCode, brandColor).toBe(400)
      expect(response.json().error.code).toBe('VALIDATION_ERROR')
    }

    expect((await stored(host.organizationId)).brandColor).toBe('#000000')
  })

  it('bounds the greeting at 500 characters', async () => {
    const host = await brokerage()
    const longest = `  ${'a'.repeat(500)}  `

    const accepted = await host.client.patch('/api/v1/organization/branding', {
      greeting: longest,
    })
    const rejected = await host.client.patch('/api/v1/organization/branding', {
      greeting: 'b'.repeat(501),
    })

    expect(accepted.statusCode).toBe(200)
    expect(accepted.json().greeting).toBe('a'.repeat(500))
    expect(rejected.statusCode).toBe(400)
    expect((await stored(host.organizationId)).greeting).toBe('a'.repeat(500))
  })

  it('clears a branding field sent as null', async () => {
    const host = await brokerage()
    await host.client.patch('/api/v1/organization/branding', {
      brandColor: '#123456',
      greeting: 'Oi',
    })

    const withoutColor = await host.client.patch('/api/v1/organization/branding', {
      brandColor: null,
    })
    expect(withoutColor.statusCode).toBe(200)
    expect(await stored(host.organizationId)).toMatchObject({ brandColor: null, greeting: 'Oi' })

    const withoutGreeting = await host.client.patch('/api/v1/organization/branding', {
      greeting: null,
    })
    expect(withoutGreeting.statusCode).toBe(200)
    expect(await stored(host.organizationId)).toMatchObject({ brandColor: null, greeting: null })
  })

  it('rejects branding writes from manager and commercial', async () => {
    const host = await brokerage()
    await host.client.put('/api/v1/organization/logo', {
      image: image(PNG_SIGNATURE).toString('base64'),
    })
    const before = await stored(host.organizationId)

    for (const role of ['MANAGER', 'COMMERCIAL'] as const) {
      const client = await colleague(host.organizationId, role)
      const attempts = {
        branding: await client.patch('/api/v1/organization/branding', { brandColor: '#ffffff' }),
        upload: await client.put('/api/v1/organization/logo', {
          image: image(JPEG_SIGNATURE).toString('base64'),
        }),
        remove: await client.delete('/api/v1/organization/logo'),
      }
      for (const [route, response] of Object.entries(attempts)) {
        expect(response.statusCode, `${role} ${route}`).toBe(403)
        expect(response.json().error.code).toBe('FORBIDDEN')
      }
    }

    expect(await stored(host.organizationId)).toEqual(before)
  })
})

describe('PUT, GET and DELETE /api/v1/organization/logo', () => {
  it('stores a png, jpeg or webp logo', async () => {
    const host = await brokerage()
    const cases = [
      ['image/png', image(PNG_SIGNATURE)],
      ['image/jpeg', image(JPEG_SIGNATURE)],
      ['image/webp', image(WEBP_SIGNATURE)],
    ] as const

    for (const [type, bytes] of cases) {
      const response = await host.client.put('/api/v1/organization/logo', {
        image: bytes.toString('base64'),
      })
      expect(response.statusCode, type).toBe(200)
      expect(response.json().logoUpdatedAt).toEqual(expect.any(String))

      const logo = await host.client.get('/api/v1/organization/logo')
      expect(logo.statusCode, type).toBe(200)
      expect(logo.headers['content-type'], type).toBe(type)
      expect(Buffer.compare(logo.rawPayload, bytes), type).toBe(0)
    }
  })

  it('records the logo change without its bytes', async () => {
    const host = await brokerage()
    const encoded = image(PNG_SIGNATURE, 256).toString('base64')

    await host.client.put('/api/v1/organization/logo', { image: encoded })

    const trail = await audits(host.organizationId)
    expect(trail).toHaveLength(1)
    expect(trail[0]?.changes).toEqual({ logo: [false, true] })
    const serialized = JSON.stringify(trail[0])
    expect(serialized).not.toContain(encoded.slice(0, 24))
    expect(serialized).not.toContain(encoded.slice(-24))
  })

  it('bounds the logo at 200 KB', async () => {
    const host = await brokerage()
    const largest = image(PNG_SIGNATURE, 204_800)
    const first = await host.client.put('/api/v1/organization/logo', {
      image: largest.toString('base64'),
    })
    expect(first.statusCode).toBe(200)

    const tooLarge = await host.client.put('/api/v1/organization/logo', {
      image: image(PNG_SIGNATURE, 204_801).toString('base64'),
    })

    expect(tooLarge.statusCode).toBe(422)
    expect(tooLarge.json().error.code).toBe('LOGO_TOO_LARGE')
    const logo = await stored(host.organizationId)
    expect(logo.logo && Buffer.compare(Buffer.from(logo.logo), largest)).toBe(0)
  })

  it('rejects a logo body above the route limit', async () => {
    const host = await brokerage()

    const response = await host.client.put('/api/v1/organization/logo', {
      image: image(PNG_SIGNATURE, 320_000).toString('base64'),
    })

    expect(response.statusCode).toBe(413)
    expect((await stored(host.organizationId)).logo).toBeNull()
  })

  it('rejects a logo that is not png, jpeg or webp', async () => {
    const host = await brokerage()
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
    const text = Buffer.from('apenas texto, não uma imagem')

    for (const bytes of [svg, text]) {
      const response = await host.client.put('/api/v1/organization/logo', {
        image: bytes.toString('base64'),
      })
      expect(response.statusCode).toBe(422)
      expect(response.json().error).toEqual({
        code: 'LOGO_UNSUPPORTED_TYPE',
        message: 'Envie uma imagem PNG, JPEG ou WebP.',
      })
    }

    expect(await stored(host.organizationId)).toMatchObject({ logo: null, logoMimeType: null })
  })

  it('rejects a logo that is not base64', async () => {
    const host = await brokerage()

    const response = await host.client.put('/api/v1/organization/logo', {
      image: 'isto não é base64!',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
    expect((await stored(host.organizationId)).logo).toBeNull()
  })

  it('answers 304 for the same logo etag', async () => {
    const host = await brokerage()
    await host.client.put('/api/v1/organization/logo', {
      image: image(PNG_SIGNATURE).toString('base64'),
    })

    const first = await host.client.get('/api/v1/organization/logo')
    const etag = first.headers.etag
    const second = await host.client.get('/api/v1/organization/logo', {
      headers: { 'if-none-match': String(etag) },
    })

    expect(first.statusCode).toBe(200)
    expect(etag).toEqual(expect.any(String))
    expect(first.headers['cache-control']).toBe('private, no-cache')
    expect(second.statusCode).toBe(304)
    expect(second.rawPayload.length).toBe(0)
  })

  it('returns 404 when the organization has no logo', async () => {
    const host = await brokerage()

    const response = await host.client.get('/api/v1/organization/logo')

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('NOT_FOUND')
  })

  it('never returns the other tenant logo', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    await acceptCurrentTerms(client)
    const { tenantA, tenantB } = await withTwoTenants(deps.db)
    await deps.db.withTenant(tenantA, (tx) =>
      tx.organization.update({
        where: { id: tenantA.organizationId },
        data: {
          logo: image(PNG_SIGNATURE),
          logoMimeType: 'image/png',
          logoUpdatedAt: new Date(),
        },
      }),
    )
    await deps.db.withTenant(tenantB, (tx) => tx.member.create({ data: { userId, role: 'ADMIN' } }))
    await deps.db.session.updateMany({
      where: { userId },
      data: { activeOrganizationId: tenantB.organizationId },
    })

    const response = await client.get('/api/v1/organization/logo')

    expect(response.statusCode).toBe(404)
  })

  it('removes the logo', async () => {
    const host = await brokerage()
    await host.client.put('/api/v1/organization/logo', {
      image: image(PNG_SIGNATURE).toString('base64'),
    })

    const removed = await host.client.delete('/api/v1/organization/logo')
    const logo = await host.client.get('/api/v1/organization/logo')
    const organization = await host.client.get('/api/v1/organization')

    expect(removed.statusCode).toBe(204)
    expect(removed.rawPayload.length).toBe(0)
    expect(logo.statusCode).toBe(404)
    expect(organization.json().logoUpdatedAt).toBeNull()
    expect(await stored(host.organizationId)).toMatchObject({
      logo: null,
      logoMimeType: null,
      logoUpdatedAt: null,
    })
  })
})

describe('branding routes', () => {
  it('requires a session and an active organization', async () => {
    const routes = [
      (client: TestClient) =>
        client.patch('/api/v1/organization/branding', { brandColor: '#ffffff' }),
      (client: TestClient) =>
        client.put('/api/v1/organization/logo', {
          image: image(PNG_SIGNATURE).toString('base64'),
        }),
      (client: TestClient) => client.delete('/api/v1/organization/logo'),
      (client: TestClient) => client.get('/api/v1/organization/logo'),
    ]
    const anonymous = new TestClient(app)
    const withoutOrganization = new TestClient(app)
    await signedInUser(withoutOrganization, deps)
    await acceptCurrentTerms(withoutOrganization)

    for (const route of routes) {
      const unauthenticated = await route(anonymous)
      expect(unauthenticated.statusCode).toBe(401)
      const noTenant = await route(withoutOrganization)
      expect(noTenant.statusCode).toBe(403)
      expect(noTenant.json().error.code).toBe('NO_ACTIVE_ORGANIZATION')
    }
  })
})

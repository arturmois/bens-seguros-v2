import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildTestApp, TEST_APP_URL } from '../test/app.ts'
import { contextFor, createOrganization } from '../test/factories.ts'
import type { App } from './app.ts'
import { AppError } from './shared/errors.ts'

let app: App
let close: () => Promise<void>
// Calls of the /api/test/write handler: a rejected request must never reach it.
let writes = 0

beforeAll(async () => {
  const testApp = await buildTestApp()
  app = testApp.app
  close = testApp.close
  const { db } = testApp.deps

  app.post(
    '/test/validated',
    { schema: { body: z.object({ name: z.string().min(2) }).strict() } },
    async () => ({ ok: true }),
  )
  app.get('/test/not-found', async () => {
    throw new AppError(404, 'NOT_FOUND', 'Proposta não encontrada.')
  })
  app.get('/test/business-rule', async () => {
    throw new AppError(422, 'PROPOSAL_INCOMPLETE', 'Preencha os detalhes do bem.', {
      missing: ['plate'],
    })
  })
  app.post('/test/duplicate', async () => {
    const organization = await createOrganization(db)
    await db.withTenant(contextFor(organization.id), async (tx) => {
      await tx.example.create({ data: { name: 'duplicado' } })
      await tx.example.create({ data: { name: 'duplicado' } })
    })
  })
  app.post('/test/row-security', async () => {
    const [own, other] = await Promise.all([createOrganization(db), createOrganization(db)])
    await db.withTenant(contextFor(own.id), (tx) =>
      tx.example.create({ data: { organizationId: other.id, name: 'intruso' } }),
    )
  })
  app.get('/test/crash', async () => {
    throw new Error('database password is hunter2')
  })
  app.route({
    method: ['POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/test/write',
    handler: async () => {
      writes++
      return { ok: true }
    },
  })

  await app.ready()
})

afterAll(() => close())

describe('GET /api/health', () => {
  it('returns ok with a request id header', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('is part of the OpenAPI document consumed by Orval', () => {
    expect(app.swagger().paths?.['/api/health']?.get?.operationId).toBe('getHealth')
  })
})

describe('error handler', () => {
  it('maps Zod validation failures to 400 with pt-BR issues', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/test/validated',
      payload: { name: 'a', extra: true },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toBe('Dados inválidos.')
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        { path: '/name', message: expect.stringContaining('Pequeno demais') },
        { path: '/', message: expect.stringContaining('"extra"') },
      ]),
    )
  })

  it('maps malformed JSON to 400 without leaking parser details', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/test/validated',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: { code: 'BAD_REQUEST', message: 'Requisição inválida.' } })
  })

  it('returns 404 in the error format for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } })
  })

  it('maps AppError to its status, code and message', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/not-found' })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Proposta não encontrada.' },
    })
  })

  it('keeps AppError details for business rule violations (422)', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/business-rule' })

    expect(res.statusCode).toBe(422)
    expect(res.json()).toEqual({
      error: {
        code: 'PROPOSAL_INCOMPLETE',
        message: 'Preencha os detalhes do bem.',
        details: { missing: ['plate'] },
      },
    })
  })

  it('maps a unique constraint violation (Prisma P2002) to 409', async () => {
    const res = await app.inject({ method: 'POST', url: '/test/duplicate' })

    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: { code: 'CONFLICT', message: 'Registro já existe.' } })
  })

  it('surfaces a row security violation as a generic 500', async () => {
    const res = await app.inject({ method: 'POST', url: '/test/row-security' })

    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor.',
        details: { requestId: res.headers['x-request-id'] },
      },
    })
    expect(res.body).not.toContain('organizationId')
  })

  it('hides unexpected errors behind a generic 500 that carries the request id', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/crash' })

    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor.',
        details: { requestId: res.headers['x-request-id'] },
      },
    })
    expect(res.body).not.toContain('hunter2')
  })
})

describe('origin check (CSRF)', () => {
  it('rejects mutating requests from another origin', async () => {
    const methods = ['POST', 'PUT', 'PATCH', 'DELETE'] as const
    const foreign = [{}, { origin: 'https://evil.example' }, { origin: 'http://localhost:3001' }]
    writes = 0

    for (const method of methods) {
      for (const headers of foreign) {
        const res = await app.inject({ method, url: '/api/test/write', headers })

        expect(res.statusCode, `${method} ${JSON.stringify(headers)}`).toBe(403)
        expect(res.json()).toEqual({
          error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origem da requisição não permitida.' },
        })
      }
    }
    expect(writes).toBe(0)

    for (const method of methods) {
      const res = await app.inject({
        method,
        url: '/api/test/write',
        headers: { origin: TEST_APP_URL },
      })
      expect(res.statusCode, method).toBe(200)
    }
    expect(writes).toBe(4)
  })

  it('accepts reads without an origin', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })

    expect(res.statusCode).toBe(200)
  })
})

describe('security headers and docs', () => {
  it('sends security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })

    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/)
  })

  it('serves api docs outside production only', async () => {
    const docs = await app.inject({ method: 'GET', url: '/api/docs' })
    expect(docs.statusCode).toBe(200)
    expect(docs.headers['content-type']).toContain('text/html')

    const production = await buildTestApp({ env: { NODE_ENV: 'production' } })
    await production.app.ready()
    const hidden = await production.app.inject({ method: 'GET', url: '/api/docs' })
    await production.close()

    expect(hidden.statusCode).toBe(404)
  })
})

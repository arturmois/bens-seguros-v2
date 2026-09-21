import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { type App, buildApp } from './app.ts'
import { createDependencies } from './dependencies.ts'
import { loadConfig } from './shared/config.ts'
import { AppError } from './shared/errors.ts'

let app: App

beforeAll(async () => {
  app = buildApp(createDependencies(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' })))

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
  app.get('/test/crash', async () => {
    throw new Error('database password is hunter2')
  })

  await app.ready()
})

afterAll(() => app.close())

describe('GET /api/health', () => {
  it('returns ok with a request id header', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
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

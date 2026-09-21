import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import type { App } from '../../app.ts'

let app: App
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, close } = await buildTestApp())
  await app.ready()
})

afterAll(() => close())

describe('GET /api/v1/examples/commission-preview', () => {
  it('returns the brokerage and salesperson amounts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/examples/commission-preview?premiumCents=123457&rateBp=1250&splitBp=3333',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ brokerageAmountCents: 15_432, salespersonAmountCents: 5_143 })
  })

  it('rejects unknown and out-of-range parameters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/examples/commission-preview?premiumCents=100&rateBp=10001&splitBp=0&x=1',
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('is described in the OpenAPI document with a stable operationId', () => {
    const document = app.swagger()
    const operation = document.paths?.['/api/v1/examples/commission-preview']?.get

    expect(operation?.operationId).toBe('previewExampleCommission')
    expect(
      operation?.parameters?.map((parameter) => 'name' in parameter && parameter.name),
    ).toEqual(['premiumCents', 'rateBp', 'splitBp'])
  })
})

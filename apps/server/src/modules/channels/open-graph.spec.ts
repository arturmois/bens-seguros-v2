import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { createOrganization } from '../../../test/factories.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'
import { PREVIEW_USER_AGENTS } from './open-graph.ts'

let app: App
let deps: Deps
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp())
  await app.ready()
})

afterAll(() => close())

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

async function brokerage(name = 'Corretora OG') {
  const organization = await createOrganization(deps.db)
  await deps.db.withTenant({ organizationId: organization.id }, (tx) =>
    tx.organization.update({
      where: { id: organization.id },
      data: {
        name,
        greeting: 'Olá! Como podemos ajudar?',
        logo: PNG,
        logoMimeType: 'image/png',
        logoUpdatedAt: new Date(),
      },
    }),
  )
  return organization
}

describe('open graph', () => {
  it('serves Open Graph html for a preview agent', async () => {
    const organization = await brokerage('Corretora Preview')

    const response = await app.inject({
      method: 'GET',
      url: `/c/${organization.publicChatKey}`,
      headers: { 'user-agent': 'WhatsApp/2.0' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toMatch(/text\/html/)
    expect(response.body).toContain('property="og:title" content="Corretora Preview"')
    expect(response.body).toMatch(
      new RegExp(
        `property="og:image" content="https?://[^"]+/api/public/chat/${organization.publicChatKey}/logo"`,
      ),
    )
  })

  it('rejects a bad or unknown key for Open Graph', async () => {
    const unknown = await app.inject({
      method: 'GET',
      url: `/c/${'a'.repeat(32)}`,
      headers: { 'user-agent': 'WhatsApp/2.0' },
    })
    expect(unknown.statusCode).toBe(404)

    const malformed = await app.inject({
      method: 'GET',
      url: '/c/not-a-valid-key!!',
      headers: { 'user-agent': 'WhatsApp/2.0' },
    })
    expect(malformed.statusCode).toBe(400)
  })

  it('leaves the browser to the spa', async () => {
    const organization = await brokerage()

    const response = await app.inject({
      method: 'GET',
      url: `/c/${organization.publicChatKey}`,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type'] ?? '').not.toMatch(/text\/html/)
    expect(response.body).not.toContain('og:title')
  })

  it('recognizes each preview user agent', async () => {
    const organization = await brokerage('UA Matrix')

    for (const token of PREVIEW_USER_AGENTS) {
      const response = await app.inject({
        method: 'GET',
        url: `/c/${organization.publicChatKey}`,
        headers: { 'user-agent': `Something/${token}/1.0` },
      })
      expect(response.statusCode, token).toBe(200)
      expect(response.body, token).toContain('og:title')
    }
  })
})

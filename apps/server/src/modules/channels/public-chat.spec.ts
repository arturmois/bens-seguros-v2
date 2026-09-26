import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, TEST_APP_URL } from '../../../test/app.ts'
import { acceptCurrentTerms, randomIp, signedInUser, TestClient } from '../../../test/auth.ts'
import { inbound, randomPhone } from '../../../test/conversations.ts'
import { createOrganization, withTwoSalespeople } from '../../../test/factories.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'
import type { AppEvent } from '../../infrastructure/events.ts'
import { normalizePhone } from '../../shared/phone.ts'
import { sendMessage } from '../conversations/index.ts'
import { WEB_CHAT_NOTICE_VERSION } from './index.ts'
import { signVisitorToken, VISITOR_TTL_SECONDS, visitorTokenKey } from './visitor-token.ts'

let app: App
let deps: Deps
let close: () => Promise<void>
const seen: AppEvent[] = []

beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp())
  deps.events.on('message.created', async (event) => {
    seen.push(event)
  })
  await app.ready()
})

afterAll(() => close())

type Tenant = { organizationId: string }
type Chat = Tenant & { key: string }

// A 1x1 PNG: the logo column only takes an image the magic bytes confirm.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

async function chat(): Promise<Chat> {
  const organization = await createOrganization(deps.db)
  return { organizationId: organization.id, key: organization.publicChatKey }
}

function startBody(overrides: Record<string, unknown> = {}) {
  return {
    phone: randomPhone(),
    consent: true,
    noticeVersion: WEB_CHAT_NOTICE_VERSION,
    turnstileToken: 'token-do-widget',
    clientMessageId: randomUUID(),
    text: 'Olá, quero cotar um seguro.',
    ...overrides,
  }
}

// A browser on its own address, so the per-IP limit only fires where a test asks for it.
function visitor(target: App = app, ip = randomIp()) {
  return new TestClient(target, { ip })
}

async function start(target: Chat, overrides: Record<string, unknown> = {}, client = visitor()) {
  const body = startBody(overrides)
  const response = await client.post(`/api/public/chat/${target.key}/sessions`, body)
  return { response, client, body }
}

function send(client: TestClient, target: Chat, text = 'Mais uma coisa', id = randomUUID()) {
  return client.post(`/api/public/chat/${target.key}/messages`, { clientMessageId: id, text })
}

function read(client: TestClient, target: Chat, query = '') {
  return client.get(`/api/public/chat/${target.key}/messages${query}`)
}

function rowsOf(tenant: Tenant) {
  return deps.db.withTenant(tenant, async (tx) => ({
    contacts: await tx.contact.count(),
    conversations: await tx.conversation.count(),
    messages: await tx.message.count(),
    consents: await tx.consentRecord.count(),
  }))
}

const empty = { contacts: 0, conversations: 0, messages: 0, consents: 0 }

async function conversationOfPhone(tenant: Tenant, phone: string) {
  return deps.db.withTenant(tenant, (tx) =>
    tx.conversation.findFirstOrThrow({
      where: { contact: { phoneE164: normalizePhone(phone) ?? '' } },
      include: { contact: true, channel: true },
    }),
  )
}

// The conversation handed to a salesperson, who replies through the F2 use case.
async function humanReply(tenant: Tenant, conversationId: string, text = 'Posso ajudar!') {
  const { salespersonA } = await withTwoSalespeople(deps.db, tenant.organizationId)
  await deps.db.withTenant(tenant, (tx) =>
    tx.conversation.update({
      where: { id: conversationId },
      data: { handler: 'HUMAN', assigneeId: salespersonA.userId },
    }),
  )
  return sendMessage(deps, tenant, {
    conversationId,
    sender: { author: 'HUMAN', userId: salespersonA.userId },
    text,
  })
}

async function eventually<T>(readValue: () => T, accept: (value: T) => boolean) {
  const deadline = Date.now() + 10_000
  for (;;) {
    const value = readValue()
    if (accept(value)) return value
    if (Date.now() > deadline) throw new Error(`timed out; last value: ${JSON.stringify(value)}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const seqs = (response: { json: () => { items: { seq: number }[] } }) =>
  response.json().items.map((item) => item.seq)

type VerifyCall = { secret: string | null; response: string | null }

// A local Cloudflare siteverify: form-encoded in, `{ success }` out.
function listenVerify(success: boolean) {
  const calls: VerifyCall[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const form = new URLSearchParams(Buffer.concat(chunks).toString())
      calls.push({ secret: form.get('secret'), response: form.get('response') })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ success }))
    })
  })
  return new Promise<{ url: string; calls: VerifyCall[]; close: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address === null || typeof address === 'string') throw new Error('no port')
        resolve({
          url: `http://127.0.0.1:${address.port}/`,
          calls,
          close: () =>
            new Promise((done, fail) => {
              server.close((error) => (error ? fail(error) : done()))
            }),
        })
      })
    },
  )
}

describe('public chat link', () => {
  it('describes the web chat of the key', async () => {
    const a = await chat()
    const b = await chat()
    await deps.db.withTenant(a, (tx) =>
      tx.organization.update({
        where: { id: a.organizationId },
        data: { name: 'Corretora Alfa', brandColor: '#0055aa', greeting: 'Bem-vindo à Alfa!' },
      }),
    )
    await deps.db.withTenant(b, (tx) =>
      tx.organization.update({
        where: { id: b.organizationId },
        data: { name: 'Corretora Beta', brandColor: '#aa0000', greeting: 'Oi da Beta' },
      }),
    )

    const before = await visitor().get(`/api/public/chat/${a.key}`)
    await deps.db.withTenant(a, (tx) =>
      tx.organization.update({
        where: { id: a.organizationId },
        data: { logo: PNG, logoMimeType: 'image/png', logoUpdatedAt: new Date() },
      }),
    )
    const after = await visitor().get(`/api/public/chat/${a.key}`)

    expect(before.statusCode).toBe(200)
    expect(before.json()).toEqual({
      name: 'Corretora Alfa',
      brandColor: '#0055aa',
      greeting: 'Bem-vindo à Alfa!',
      hasLogo: false,
      noticeVersion: '2026-09-25',
      turnstileSiteKey: null,
    })
    expect(WEB_CHAT_NOTICE_VERSION).toBe('2026-09-25')
    expect(after.json()).toEqual({ ...before.json(), hasLogo: true })

    const withSiteKey = await buildTestApp({ env: { TURNSTILE_SITE_KEY: 'site-key-public' } })
    try {
      const described = await visitor(withSiteKey.app).get(`/api/public/chat/${b.key}`)
      expect(described.json()).toEqual({
        name: 'Corretora Beta',
        brandColor: '#aa0000',
        greeting: 'Oi da Beta',
        hasLogo: false,
        noticeVersion: '2026-09-25',
        turnstileSiteKey: 'site-key-public',
      })
    } finally {
      await withSiteKey.close()
    }
  })

  it('answers not found for an unknown key', async () => {
    const known = await chat()
    const { client } = await start(known)
    const unknown = { key: 'f'.repeat(32) }
    const cookie = { cookie: client.cookieHeader }

    const responses = [
      await visitor().get(`/api/public/chat/${unknown.key}`),
      await visitor().get(`/api/public/chat/${unknown.key}/logo`),
      await visitor().post(`/api/public/chat/${unknown.key}/sessions`, startBody()),
      await visitor().post(
        `/api/public/chat/${unknown.key}/messages`,
        { clientMessageId: randomUUID(), text: 'Oi' },
        { headers: cookie },
      ),
      await visitor().get(`/api/public/chat/${unknown.key}/messages`, { headers: cookie }),
    ]

    for (const response of responses) {
      expect(response.statusCode, response.body).toBe(404)
      expect(response.json().error.code).toBe('NOT_FOUND')
    }
  })

  it('serves the logo of the key', async () => {
    const a = await chat()
    const b = await chat()
    const otherPng = Buffer.concat([PNG, Buffer.from([0])])
    await deps.db.withTenant(a, (tx) =>
      tx.organization.update({
        where: { id: a.organizationId },
        data: { logo: PNG, logoMimeType: 'image/png', logoUpdatedAt: new Date() },
      }),
    )

    const withoutLogo = await visitor().get(`/api/public/chat/${b.key}/logo`)
    await deps.db.withTenant(b, (tx) =>
      tx.organization.update({
        where: { id: b.organizationId },
        data: { logo: otherPng, logoMimeType: 'image/webp', logoUpdatedAt: new Date() },
      }),
    )
    const logoA = await visitor().get(`/api/public/chat/${a.key}/logo`)
    const logoB = await visitor().get(`/api/public/chat/${b.key}/logo`)

    expect(withoutLogo.statusCode).toBe(404)
    expect(withoutLogo.json().error.code).toBe('NOT_FOUND')
    expect(logoA.statusCode).toBe(200)
    expect(logoA.headers['content-type']).toBe('image/png')
    expect(logoA.rawPayload.equals(PNG)).toBe(true)
    expect(logoB.headers['content-type']).toBe('image/webp')
    expect(logoB.rawPayload.equals(otherPng)).toBe(true)
  })

  it('caches the public logo by its etag', async () => {
    const target = await chat()
    await deps.db.withTenant(target, (tx) =>
      tx.organization.update({
        where: { id: target.organizationId },
        data: { logo: PNG, logoMimeType: 'image/png', logoUpdatedAt: new Date() },
      }),
    )
    const client = visitor()

    const first = await client.get(`/api/public/chat/${target.key}/logo`)
    const etag = String(first.headers.etag)
    const again = await client.get(`/api/public/chat/${target.key}/logo`, {
      headers: { 'if-none-match': etag },
    })
    const stale = await client.get(`/api/public/chat/${target.key}/logo`, {
      headers: { 'if-none-match': '"outro"' },
    })

    expect(first.headers['cache-control']).toBe('public, no-cache')
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/)
    expect(again.statusCode).toBe(304)
    expect(again.rawPayload).toHaveLength(0)
    expect(stale.statusCode).toBe(200)
    expect(stale.rawPayload.equals(PNG)).toBe(true)
  })
})

describe('session start', () => {
  it('starts a session with the first message', async () => {
    const target = await chat()
    const phone = randomPhone()

    const { response, body } = await start(target, { phone })

    expect(response.statusCode).toBe(201)
    const conversation = await conversationOfPhone(target, phone)
    const [stored] = await deps.db.withTenant(target, (tx) =>
      tx.message.findMany({ where: { conversationId: conversation.id } }),
    )
    expect(conversation.contact.phoneE164).toBe(normalizePhone(phone))
    expect(conversation.channel.kind).toBe('WEB_CHAT')
    expect(stored).toMatchObject({
      direction: 'INBOUND',
      author: 'CONTACT',
      kind: 'TEXT',
      text: body.text,
      channelId: conversation.channelId,
      seq: 1,
    })
    expect(response.json()).toEqual({
      message: {
        id: stored?.id,
        seq: 1,
        direction: 'INBOUND',
        author: 'CONTACT',
        kind: 'TEXT',
        text: body.text,
        sentAt: stored?.sentAt.toISOString(),
      },
      token: expect.stringMatching(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
    })
  })

  it('returns the visitor token beside the first message', async () => {
    const target = await chat()

    const { response } = await start(target)

    expect(response.statusCode).toBe(201)
    const body = response.json() as { message: { id: string }; token: string }
    expect(body.token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(body.message.id).toEqual(expect.any(String))
    const cookie = String(response.headers['set-cookie'])
    expect(cookie).toContain(`bens_visitor=${body.token}`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain(`Path=/api/public/chat/${target.key}`)
    expect(cookie).toContain('Max-Age=2592000')
  })

  it('opens the new conversation in the queue', async () => {
    const target = await chat()
    const phone = randomPhone()

    await start(target, { phone })

    const conversation = await conversationOfPhone(target, phone)
    expect(conversation.status).toBe('OPEN')
    expect(conversation.handler).toBe('QUEUE')
  })

  it('records the consent of every session start', async () => {
    const target = await chat()
    const phone = randomPhone()

    const first = await start(target, { phone })
    const conversation = await conversationOfPhone(target, phone)
    const afterFirst = await deps.db.withTenant(target, (tx) => tx.consentRecord.findMany())
    const second = await start(target, { phone })
    const afterSecond = await deps.db.withTenant(target, (tx) => tx.consentRecord.findMany())

    expect(first.response.statusCode).toBe(201)
    expect(second.response.statusCode).toBe(201)
    expect(afterFirst).toHaveLength(1)
    expect(afterFirst[0]).toMatchObject({
      contactId: conversation.contactId,
      conversationId: conversation.id,
      channelId: conversation.channelId,
      noticeVersion: '2026-09-25',
    })
    expect(afterSecond).toHaveLength(2)
  })

  it('answers a repeated start with the same session', async () => {
    const target = await chat()
    const body = startBody()
    const client = visitor()

    const first = await client.post(`/api/public/chat/${target.key}/sessions`, body)
    const repeated = await client.post(`/api/public/chat/${target.key}/sessions`, body)
    const otherPhone = await visitor().post(`/api/public/chat/${target.key}/sessions`, {
      ...body,
      phone: randomPhone(),
    })

    expect(first.statusCode).toBe(201)
    expect(repeated.statusCode).toBe(201)
    expect(repeated.json().message).toEqual(first.json().message)
    expect(repeated.json().token).toMatch(/^v1\./)
    expect(otherPhone.statusCode).toBe(409)
    expect(otherPhone.body).not.toContain(first.json().message.id)
    expect(otherPhone.body).not.toContain(body.text)
    expect(await rowsOf(target)).toEqual({
      contacts: 1,
      conversations: 1,
      messages: 1,
      consents: 1,
    })
  })

  it('sets the visitor cookie on the link path', async () => {
    const target = await chat()

    const { response } = await start(target)

    const cookie = String(response.headers['set-cookie'])
    const attributes = cookie.split('; ')
    expect(attributes[0]).toMatch(/^bens_visitor=v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(attributes.slice(1).sort()).toEqual(
      ['HttpOnly', 'Max-Age=2592000', `Path=/api/public/chat/${target.key}`, 'SameSite=Lax'].sort(),
    )
  })

  it('notifies the panel of the visitor message', async () => {
    const target = await chat()

    const { response } = await start(target)

    const messageId = response.json().message.id
    const events = await eventually(
      () => seen.filter((event) => event.messageId === messageId),
      (found) => found.length > 0,
    )
    const conversation = await deps.db.withTenant(target, (tx) =>
      tx.message.findUniqueOrThrow({ where: { id: messageId }, select: { conversationId: true } }),
    )
    expect(events).toEqual([
      {
        type: 'message.created',
        organizationId: target.organizationId,
        conversationId: conversation.conversationId,
        messageId,
      },
    ])
  })

  it('writes only in the organization of the key', async () => {
    const a = await chat()
    const b = await chat()
    const phone = randomPhone()

    const throughA = await start(a, { phone })
    const bAfterA = await rowsOf(b)
    const conversationA = await conversationOfPhone(a, phone)
    const throughB = await start(b, { phone })

    expect(throughA.response.statusCode).toBe(201)
    expect(throughB.response.statusCode).toBe(201)
    expect(await rowsOf(a)).toEqual({ contacts: 1, conversations: 1, messages: 1, consents: 1 })
    expect(bAfterA).toEqual(empty)
    expect(await rowsOf(b)).toEqual({ contacts: 1, conversations: 1, messages: 1, consents: 1 })
    const conversationB = await conversationOfPhone(b, phone)
    expect(conversationB.id).not.toBe(conversationA.id)
    expect((await conversationOfPhone(a, phone)).lastSeq).toBe(1)
  })
})

describe('refused session start', () => {
  it('refuses a start without consent', async () => {
    const target = await chat()
    const { consent: _consent, ...withoutConsent } = startBody()

    const refused = await start(target, { consent: false })
    const missing = await visitor().post(`/api/public/chat/${target.key}/sessions`, withoutConsent)

    expect(refused.response.statusCode).toBe(400)
    expect(missing.statusCode).toBe(400)
    expect(await rowsOf(target)).toEqual(empty)
  })

  it('refuses an outdated notice', async () => {
    const target = await chat()

    const { response } = await start(target, { noticeVersion: '2020-01-01' })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('NOTICE_OUTDATED')
    expect(await rowsOf(target)).toEqual(empty)
  })

  it('refuses an invalid phone', async () => {
    const target = await chat()

    const { response } = await start(target, { phone: '123' })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('INVALID_PHONE')
    expect(await rowsOf(target)).toEqual(empty)
  })

  it('refuses a public write from another origin', async () => {
    const target = await chat()
    const client = new TestClient(app, { ip: randomIp(), origin: 'https://evil.example.com' })

    const { response } = await start(target, {}, client)

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('ORIGIN_NOT_ALLOWED')
    expect(await rowsOf(target)).toEqual(empty)
  })

  it('validates the public chat inputs', async () => {
    const target = await chat()
    const { client } = await start(target)
    const base = `/api/public/chat/${target.key}`
    const badBodies = [
      { extra: 'x' },
      { text: '' },
      { text: 'a'.repeat(4001) },
      { clientMessageId: 'x' },
    ]

    for (const bad of badBodies) {
      const started = await start(target, bad)
      const { extra, ...sendBad } = bad as Record<string, unknown>
      const sent = await client.post(`${base}/messages`, {
        clientMessageId: randomUUID(),
        text: 'Oi',
        ...sendBad,
        ...(extra !== undefined && { extra }),
      })
      expect(started.response.statusCode, `start ${JSON.stringify(bad).slice(0, 40)}`).toBe(400)
      expect(sent.statusCode, `send ${JSON.stringify(bad).slice(0, 40)}`).toBe(400)
    }
    const longest = await send(client, target, 'a'.repeat(4000))
    expect(longest.statusCode).toBe(201)
    const longestStart = await start(target, { text: 'b'.repeat(4000) })
    expect(longestStart.response.statusCode).toBe(201)

    const badKey = 'NAO-HEX'
    const keyResponses = [
      await visitor().get(`/api/public/chat/${badKey}`),
      await visitor().get(`/api/public/chat/${badKey}/logo`),
      await visitor().post(`/api/public/chat/${badKey}/sessions`, startBody()),
      await client.post(`/api/public/chat/${badKey}/messages`, {
        clientMessageId: randomUUID(),
        text: 'Oi',
      }),
      await client.get(`/api/public/chat/${badKey}/messages`),
    ]
    for (const response of keyResponses) {
      expect(response.statusCode, response.body).toBe(400)
    }

    expect((await read(client, target, '?foo=1')).statusCode).toBe(400)
    expect((await read(client, target, '?after=-1')).statusCode).toBe(400)
  })
})

describe('captcha', () => {
  it('refuses a start the captcha rejects', async () => {
    const verify = await listenVerify(false)
    const env = { TURNSTILE_SECRET_KEY: 'turnstile-secret', TURNSTILE_SITEVERIFY_URL: verify.url }
    const withCaptcha = await buildTestApp({ env })
    try {
      const target = await chat()
      const { response } = await start(target, {}, visitor(withCaptcha.app))

      expect(response.statusCode).toBe(403)
      expect(response.json().error.code).toBe('TURNSTILE_FAILED')
      expect(await rowsOf(target)).toEqual(empty)
    } finally {
      await withCaptcha.close()
      await verify.close()
    }
  })

  it('verifies the captcha token with the secret', async () => {
    const verify = await listenVerify(true)
    const env = { TURNSTILE_SECRET_KEY: 'turnstile-secret', TURNSTILE_SITEVERIFY_URL: verify.url }
    const withCaptcha = await buildTestApp({ env })
    try {
      const target = await chat()
      const { response } = await start(
        target,
        { turnstileToken: 'widget-token-123' },
        visitor(withCaptcha.app),
      )

      expect(response.statusCode).toBe(201)
      expect(verify.calls).toEqual([{ secret: 'turnstile-secret', response: 'widget-token-123' }])
    } finally {
      await withCaptcha.close()
      await verify.close()
    }
  })

  it('fails closed when the captcha is unreachable', async () => {
    const verify = await listenVerify(true)
    const url = verify.url
    await verify.close()
    const env = { TURNSTILE_SECRET_KEY: 'turnstile-secret', TURNSTILE_SITEVERIFY_URL: url }
    const withCaptcha = await buildTestApp({ env })
    try {
      const target = await chat()
      const { response } = await start(target, {}, visitor(withCaptcha.app))

      expect(response.statusCode).toBe(403)
      expect(response.json().error.code).toBe('TURNSTILE_FAILED')
      expect(await rowsOf(target)).toEqual(empty)
    } finally {
      await withCaptcha.close()
    }
  })
})

describe('messages within the session', () => {
  it('sends a message within the session', async () => {
    const target = await chat()
    const phone = randomPhone()
    const { client } = await start(target, { phone })

    const response = await send(client, target, 'Tenho um carro 2020')

    const conversation = await conversationOfPhone(target, phone)
    const stored = await deps.db.withTenant(target, (tx) =>
      tx.message.findMany({ where: { conversationId: conversation.id }, orderBy: { seq: 'asc' } }),
    )
    expect(response.statusCode).toBe(201)
    expect(stored.map((message) => [message.seq, message.text])).toEqual([
      [1, 'Olá, quero cotar um seguro.'],
      [2, 'Tenho um carro 2020'],
    ])
    expect(response.json().message).toMatchObject({ id: stored[1]?.id, seq: 2, author: 'CONTACT' })
    expect(await rowsOf(target)).toMatchObject({ contacts: 1, conversations: 1 })
  })

  it('answers a repeated message with the original', async () => {
    const target = await chat()
    const { client } = await start(target)
    const id = randomUUID()

    const first = await send(client, target, 'Uma vez só', id)
    const repeated = await send(client, target, 'Uma vez só', id)

    expect(first.statusCode).toBe(201)
    expect(repeated.statusCode).toBe(200)
    expect(repeated.json().message.id).toBe(first.json().message.id)
    expect((await rowsOf(target)).messages).toBe(2)
  })

  it('refuses a message id of another conversation', async () => {
    const target = await chat()
    const one = await start(target)
    const other = await start(target)
    const id = randomUUID()
    const original = await send(one.client, target, 'Segredo do primeiro', id)

    const stolen = await send(other.client, target, 'Outra coisa', id)

    expect(original.statusCode).toBe(201)
    expect(stolen.statusCode).toBe(409)
    expect(stolen.json().error.code).toBe('CONFLICT')
    expect(stolen.body).not.toContain(original.json().message.id)
    expect(stolen.body).not.toContain('Segredo do primeiro')
  })

  it('reopens the closed conversation of the session', async () => {
    const target = await chat()
    const phone = randomPhone()
    const { client } = await start(target, { phone })
    const conversation = await conversationOfPhone(target, phone)
    await deps.db.withTenant(target, (tx) =>
      tx.conversation.update({
        where: { id: conversation.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      }),
    )

    const response = await send(client, target, 'Voltei')
    const listed = await read(client, target)

    expect(response.statusCode).toBe(201)
    const reopened = await conversationOfPhone(target, phone)
    expect(reopened.id).toBe(conversation.id)
    expect(reopened.status).toBe('OPEN')
    expect(listed.statusCode).toBe(200)
    expect(seqs(listed)).toEqual([1, 2])
  })

  it('requires a valid visitor session', async () => {
    const a = await chat()
    const b = await chat()
    const { client } = await start(a)
    const cookieA = client.cookies.get('bens_visitor') ?? ''
    const conversation = await deps.db.withTenant(a, (tx) =>
      tx.conversation.findFirstOrThrow({ select: { id: true, contactId: true } }),
    )
    const expired = signVisitorToken(
      visitorTokenKey(deps.config.BETTER_AUTH_SECRET),
      {
        organizationId: a.organizationId,
        contactId: conversation.contactId,
        conversationId: conversation.id,
        fromSeq: 1,
      },
      new Date(Date.now() - (VISITOR_TTL_SECONDS + 1) * 1000),
    )
    const last = cookieA.slice(-1)
    const tampered = `${cookieA.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`
    const cases: [string, Chat, string | null][] = [
      ['no cookie', a, null],
      ['tampered', a, tampered],
      ['expired', a, expired],
      ['other organization', b, cookieA],
    ]

    for (const [name, target, token] of cases) {
      const headers = token === null ? {} : { cookie: `bens_visitor=${token}` }
      const anonymous = visitor()
      const sent = await anonymous.post(
        `/api/public/chat/${target.key}/messages`,
        { clientMessageId: randomUUID(), text: 'Oi' },
        { headers },
      )
      const listed = await anonymous.get(`/api/public/chat/${target.key}/messages`, { headers })
      for (const response of [sent, listed]) {
        expect(response.statusCode, name).toBe(401)
        expect(response.json().error.code, name).toBe('VISITOR_SESSION_REQUIRED')
      }
    }
    expect((await rowsOf(b)).messages).toBe(0)
    expect((await rowsOf(a)).messages).toBe(1)
  })

  it('returns the token from the visitor cookie', async () => {
    const target = await chat()
    const { response, client } = await start(target)
    const cookieToken = client.cookies.get('bens_visitor')

    const session = await client.get(`/api/public/chat/${target.key}/session`)

    expect(response.statusCode).toBe(201)
    expect(session.statusCode).toBe(200)
    expect(session.json()).toEqual({ token: cookieToken })
    expect(session.json().token).toBe(response.json().token)
  })

  it('requires a valid visitor session for GET session', async () => {
    const a = await chat()
    const b = await chat()
    const { client } = await start(a)
    const cookieA = client.cookies.get('bens_visitor') ?? ''
    const conversation = await deps.db.withTenant(a, (tx) =>
      tx.conversation.findFirstOrThrow({ select: { id: true, contactId: true } }),
    )
    const expired = signVisitorToken(
      visitorTokenKey(deps.config.BETTER_AUTH_SECRET),
      {
        organizationId: a.organizationId,
        contactId: conversation.contactId,
        conversationId: conversation.id,
        fromSeq: 1,
      },
      new Date(Date.now() - (VISITOR_TTL_SECONDS + 1) * 1000),
    )
    const last = cookieA.slice(-1)
    const tampered = `${cookieA.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`
    const cases: [string, Chat, string | null][] = [
      ['no cookie', a, null],
      ['tampered', a, tampered],
      ['expired', a, expired],
      ['other organization', b, cookieA],
    ]

    for (const [name, target, token] of cases) {
      const headers = token === null ? {} : { cookie: `bens_visitor=${token}` }
      const response = await visitor().get(`/api/public/chat/${target.key}/session`, { headers })
      expect(response.statusCode, name).toBe(401)
      expect(response.json().error.code, name).toBe('VISITOR_SESSION_REQUIRED')
    }
  })

  it('rejects a bad key on GET session', async () => {
    const unknown = { key: 'a'.repeat(32) }
    const badKey = 'not-a-valid-public-chat-key!!'

    const missing = await visitor().get(`/api/public/chat/${unknown.key}/session`)
    const invalid = await visitor().get(`/api/public/chat/${badKey}/session`)

    expect(missing.statusCode).toBe(404)
    expect(missing.json().error.code).toBe('NOT_FOUND')
    expect(invalid.statusCode).toBe(400)
  })
})

describe('reading the session', () => {
  it('lists the session messages in seq order', async () => {
    const target = await chat()
    const phone = randomPhone()
    const { client } = await start(target, { phone })
    await send(client, target, 'Segunda')
    const conversation = await conversationOfPhone(target, phone)
    await humanReply(target, conversation.id, 'Resposta do corretor')

    const response = await read(client, target)

    expect(response.statusCode).toBe(200)
    const items = response.json().items as Record<string, unknown>[]
    expect(items.map((item) => item.seq)).toEqual([1, 2, 3])
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(
        ['author', 'direction', 'id', 'kind', 'sentAt', 'seq', 'text'].sort(),
      )
    }
    expect(items.map((item) => item.text)).toEqual([
      'Olá, quero cotar um seguro.',
      'Segunda',
      'Resposta do corretor',
    ])
  })

  it('orders the session by seq, not by insertion', async () => {
    const target = await chat()
    const phone = randomPhone()
    const { client } = await start(target, { phone })
    const conversation = await conversationOfPhone(target, phone)
    // Seq 4, 2, 3 inserted in that order (a precondition, not the behaviour under test).
    await deps.db.withTenant(target, async (tx) => {
      for (const seq of [4, 2, 3]) {
        await tx.message.create({
          data: {
            conversationId: conversation.id,
            channelId: conversation.channelId,
            seq,
            direction: 'INBOUND',
            author: 'CONTACT',
            kind: 'TEXT',
            text: `seq ${seq}`,
            sentAt: new Date(),
          },
        })
      }
      await tx.conversation.update({ where: { id: conversation.id }, data: { lastSeq: 4 } })
    })

    const response = await read(client, target)

    expect(seqs(response)).toEqual([1, 2, 3, 4])
  })

  it('hides every message before the session start', async () => {
    const target = await chat()
    const phone = randomPhone()
    const earlier = await start(target, { phone, text: 'Antes 1' })
    const conversation = await conversationOfPhone(target, phone)
    await humanReply(target, conversation.id, 'Antes 2 (resposta)')
    await send(earlier.client, target, 'Antes 3')

    const { response, client } = await start(target, { phone })
    const afterStart = await read(client, target)
    const fromEarlier = await send(earlier.client, target, 'Da outra sessão')
    const later = await read(client, target)

    expect(fromEarlier.statusCode).toBe(201)
    expect(response.json().message.seq).toBe(4)
    expect(seqs(afterStart)).toEqual([4])
    expect(seqs(later)).toEqual([4, 5])
    expect(later.body).not.toContain('Antes')
    expect(seqs(await read(earlier.client, target))).toEqual([1, 2, 3, 4, 5])
  })

  it('reads the session after a seq, a hundred at a time', async () => {
    const target = await chat()
    const phone = randomPhone()
    await inbound(deps.db, target, { fromPhone: phone })
    await inbound(deps.db, target, { fromPhone: phone })
    const { client } = await start(target, { phone })
    for (let index = 0; index < 4; index++) await send(client, target, `Mensagem ${index}`)

    const belowStart = await read(client, target, '?after=1')
    const afterTwo = await read(client, target, '?after=2')
    const afterFour = await read(client, target, '?after=4')
    for (let index = 0; index < 98; index++) {
      await inbound(deps.db, target, { fromPhone: phone })
    }
    const firstPage = await read(client, target)
    const pastEnd = await read(client, target, '?after=105')

    expect(seqs(belowStart)).toEqual([3, 4, 5, 6, 7])
    expect(seqs(afterTwo)).toEqual([3, 4, 5, 6, 7])
    expect(seqs(afterFour)).toEqual([5, 6, 7])
    expect(seqs(firstPage)).toEqual(Array.from({ length: 100 }, (_, index) => index + 3))
    expect(pastEnd.json()).toEqual({ items: [] })
  })

  it('shows a human reply to the visitor', async () => {
    const target = await chat()
    const phone = randomPhone()
    const { client } = await start(target, { phone })
    const conversation = await conversationOfPhone(target, phone)
    await humanReply(target, conversation.id, 'Olá, sou o corretor')

    const response = await read(client, target, '?after=1')

    expect(response.json().items).toHaveLength(1)
    const [reply] = response.json().items as Record<string, unknown>[]
    expect(reply).toMatchObject({
      seq: 2,
      author: 'HUMAN',
      direction: 'OUTBOUND',
      text: 'Olá, sou o corretor',
    })
    expect(reply).not.toHaveProperty('authorUserId')
  })
})

describe('rate limits', () => {
  // A fresh app per test: the counters are in memory and per instance.
  let limited: Awaited<ReturnType<typeof buildTestApp>>

  beforeAll(async () => {
    limited = await buildTestApp({ workers: true })
  })

  afterAll(() => limited.close())

  it('limits session starts per ip', async () => {
    const target = await chat()
    const client = visitor(limited.app)

    const statuses: number[] = []
    for (let index = 0; index < 5; index++) {
      statuses.push((await start(target, {}, client)).response.statusCode)
    }
    const sixth = await start(target, {}, client)

    expect(statuses).toEqual([201, 201, 201, 201, 201])
    expect(sixth.response.statusCode).toBe(429)
    expect(sixth.response.json().error.code).toBe('RATE_LIMITED')
    expect((await rowsOf(target)).messages).toBe(5)
  })

  it('limits session starts per key', async () => {
    const target = await chat()
    const other = await chat()

    const statuses: number[] = []
    for (let index = 0; index < 60; index++) {
      statuses.push((await start(target, {}, visitor(limited.app))).response.statusCode)
    }
    const sixtyFirst = await start(target, {}, visitor(limited.app))
    const otherKey = await start(other, {}, visitor(limited.app))

    expect(statuses.every((status) => status === 201)).toBe(true)
    expect(sixtyFirst.response.statusCode).toBe(429)
    expect(sixtyFirst.response.json().error.code).toBe('RATE_LIMITED')
    expect(otherKey.response.statusCode).toBe(201)
  })

  it('limits messages per visitor', async () => {
    const target = await chat()
    const ip = randomIp()
    const one = await start(target, {}, visitor(limited.app, ip))
    const two = await start(target, {}, visitor(limited.app, ip))

    const statuses: number[] = []
    for (let index = 0; index < 20; index++) {
      statuses.push((await send(one.client, target, `n${index}`)).statusCode)
    }
    const twentyFirst = await send(one.client, target, 'demais')
    const otherToken = await send(two.client, target, 'outra sessão')

    expect(statuses.every((status) => status === 201)).toBe(true)
    expect(twentyFirst.statusCode).toBe(429)
    expect(twentyFirst.json().error.code).toBe('RATE_LIMITED')
    expect(otherToken.statusCode).toBe(201)
  })

  it('limits public reads per ip', async () => {
    const target = await chat()
    const routes = ['', '/logo', '/messages', '/session']

    for (const route of routes) {
      // Its own address per route: each one is limited, whatever it answers under the limit.
      const client = visitor(limited.app)
      const url = `/api/public/chat/${target.key}${route}`
      const statuses: number[] = []
      for (let index = 0; index < 120; index++) statuses.push((await client.get(url)).statusCode)
      const next = await client.get(url)

      expect(statuses.includes(429), route).toBe(false)
      expect(next.statusCode, route).toBe(429)
      expect(next.json().error.code, route).toBe('RATE_LIMITED')
    }
  })

  it('limits GET session with the other public GETs', async () => {
    const target = await chat()
    const client = visitor(limited.app)
    const statuses: number[] = []
    for (let index = 0; index < 60; index++) {
      statuses.push((await client.get(`/api/public/chat/${target.key}`)).statusCode)
      statuses.push((await client.get(`/api/public/chat/${target.key}/session`)).statusCode)
    }
    const next = await client.get(`/api/public/chat/${target.key}/session`)

    expect(statuses.includes(429)).toBe(false)
    expect(statuses).toHaveLength(120)
    expect(next.statusCode).toBe(429)
    expect(next.json().error.code).toBe('RATE_LIMITED')
  })

  it('limits only the public chat routes', async () => {
    const target = await chat()
    const client = visitor(limited.app)
    for (let index = 0; index < 121; index++) await client.get(`/api/public/chat/${target.key}`)
    for (let index = 0; index < 6; index++) await start(target, {}, client)
    const panel = new TestClient(limited.app, { ip: client.ip })
    await signedInUser(panel, limited.deps)
    await acceptCurrentTerms(panel)

    const health = await client.get('/api/health')
    const me = await panel.get('/api/v1/me')
    const publicRead = await client.get(`/api/public/chat/${target.key}`)

    expect(publicRead.statusCode).toBe(429)
    expect(health.statusCode).toBe(200)
    expect(me.statusCode).toBe(200)
    expect(TEST_APP_URL).toBe(client.origin)
  })
})

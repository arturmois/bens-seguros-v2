import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps } from '../../../test/app.ts'
import {
  conversationOf,
  inbound,
  messagesOf,
  randomPhone,
  seedConversation,
  webChatOf,
} from '../../../test/conversations.ts'
import { withTwoSalespeople, withTwoTenants } from '../../../test/factories.ts'
import type { Deps } from '../../dependencies.ts'
import { normalizePhone } from '../../shared/phone.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { sendMessage } from './index.ts'

let deps: Deps
let tenantA: RequestContext
let tenantB: RequestContext

beforeAll(async () => {
  deps = await createTestDeps()
  ;({ tenantA, tenantB } = await withTwoTenants(deps.db))
})

afterAll(() => deps.db.$disconnect())

function rowsOf(tenant: RequestContext) {
  return deps.db.withTenant(tenant, async (tx) => ({
    contacts: await tx.contact.count(),
    conversations: await tx.conversation.count(),
    messages: await tx.message.count(),
  }))
}

async function reopenAudits(tenant: RequestContext, conversationId: string) {
  return deps.db.withTenant(tenant, (tx) =>
    tx.auditLog.findMany({ where: { entityId: conversationId, action: 'conversation.reopen' } }),
  )
}

// A tenant of its own, so row counts are not shared with other tests of this file.
async function freshTenant() {
  const { tenantA: tenant } = await withTwoTenants(deps.db)
  return tenant
}

const seqs = (messages: { seq: number }[]) => messages.map((message) => message.seq)
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index)

describe('receiveInbound', () => {
  it('refuses an invalid phone', async () => {
    const tenant = await freshTenant()

    await expect(inbound(deps.db, tenant, { fromPhone: 'abc' })).rejects.toMatchObject({
      status: 422,
      code: 'INVALID_PHONE',
    })
    expect(await rowsOf(tenant)).toEqual({ contacts: 0, conversations: 0, messages: 0 })
  })

  it('uses one contact for the same phone in two formats', async () => {
    const tenant = await freshTenant()

    const first = await inbound(deps.db, tenant, { fromPhone: '(11) 98765-4321' })
    const second = await inbound(deps.db, tenant, { fromPhone: '+55 11 98765-4321' })

    expect(second.conversationId).toBe(first.conversationId)
    const contacts = await deps.db.withTenant(tenant, (tx) => tx.contact.findMany())
    expect(contacts.map((contact) => contact.phoneE164)).toEqual(['+5511987654321'])
    expect(await rowsOf(tenant)).toEqual({ contacts: 1, conversations: 1, messages: 2 })
  })

  it('keeps the same phone apart in two organizations', async () => {
    const phone = randomPhone()
    const e164 = normalizePhone(phone)

    await inbound(deps.db, tenantA, { fromPhone: phone })
    await inbound(deps.db, tenantB, { fromPhone: phone })

    for (const tenant of [tenantA, tenantB]) {
      const found = await deps.db.withTenant(tenant, (tx) =>
        tx.contact.findMany({ where: { phoneE164: e164 ?? '' } }),
      )
      expect(found).toHaveLength(1)
      expect(found[0]?.organizationId).toBe(tenant.organizationId)
    }
  })

  it('opens a queued conversation for a new phone', async () => {
    const tenant = await freshTenant()
    const sentAt = new Date('2026-09-24T12:00:00.000Z')

    const result = await inbound(deps.db, tenant, { text: 'Primeira', sentAt })

    expect(result.created).toBe(true)
    const conversation = await conversationOf(deps.db, tenant, result.conversationId)
    expect(conversation).toMatchObject({
      status: 'OPEN',
      handler: 'QUEUE',
      assigneeId: null,
      lastSeq: 1,
      closedAt: null,
    })
    const contact = await deps.db.withTenant(tenant, (tx) =>
      tx.contact.findUniqueOrThrow({ where: { id: conversation.contactId } }),
    )
    expect(contact.ownerId).toBeNull()
    const [message] = await messagesOf(deps.db, tenant, result.conversationId)
    expect(message).toMatchObject({
      id: result.messageId,
      direction: 'INBOUND',
      author: 'CONTACT',
      authorUserId: null,
      seq: 1,
      deliveryStatus: null,
      kind: 'TEXT',
      text: 'Primeira',
      sentAt,
    })
  })

  it('appends the next seq to the open conversation', async () => {
    const tenant = await freshTenant()
    const old = new Date('2026-01-01T00:00:00.000Z')
    const seeded = await seedConversation(deps.db, tenant, { lastSeq: 7, lastMessageAt: old })

    const result = await inbound(deps.db, tenant, { fromPhone: seeded.phoneE164 })

    expect(result.conversationId).toBe(seeded.id)
    const conversation = await conversationOf(deps.db, tenant, seeded.id)
    expect(conversation.lastSeq).toBe(8)
    expect(conversation.lastMessageAt?.getTime()).toBeGreaterThan(old.getTime())
    expect(seqs(await messagesOf(deps.db, tenant, seeded.id))).toEqual([8])
    // An open conversation takes the message without an audit row.
    expect(await reopenAudits(tenant, seeded.id)).toEqual([])
  })

  it('moves a waiting conversation back to open', async () => {
    const tenant = await freshTenant()
    const { salespersonA } = await withTwoSalespeople(deps.db, tenant.organizationId)
    const seeded = await seedConversation(deps.db, tenant, {
      status: 'WAITING',
      handler: 'HUMAN',
      assigneeId: salespersonA.userId,
    })

    await inbound(deps.db, tenant, { fromPhone: seeded.phoneE164 })

    expect(await conversationOf(deps.db, tenant, seeded.id)).toMatchObject({
      status: 'OPEN',
      handler: 'HUMAN',
      assigneeId: salespersonA.userId,
    })
  })

  it('ignores a repeated external id', async () => {
    const tenant = await freshTenant()
    const phone = randomPhone()
    const original = await inbound(deps.db, tenant, { fromPhone: phone, externalId: 'wa-1' })
    await sendMessage({ db: deps.db }, tenant, {
      conversationId: original.conversationId,
      sender: { author: 'SYSTEM' },
      text: 'Recebemos sua mensagem.',
    })
    const before = await conversationOf(deps.db, tenant, original.conversationId)

    const repeated = await inbound(deps.db, tenant, { fromPhone: phone, externalId: 'wa-1' })

    expect(repeated).toEqual({
      conversationId: original.conversationId,
      messageId: original.messageId,
      created: false,
    })
    const after = await conversationOf(deps.db, tenant, original.conversationId)
    expect(after.status).toBe('WAITING')
    expect(after).toMatchObject({
      lastSeq: before.lastSeq,
      lastMessageAt: before.lastMessageAt,
      handler: before.handler,
    })
    expect(await messagesOf(deps.db, tenant, original.conversationId)).toHaveLength(2)
  })

  it('rolls back a repeated external id from a new phone', async () => {
    const tenant = await freshTenant()
    const original = await inbound(deps.db, tenant, { externalId: 'wa-2' })

    const repeated = await inbound(deps.db, tenant, { externalId: 'wa-2' })

    expect(repeated).toEqual({
      conversationId: original.conversationId,
      messageId: original.messageId,
      created: false,
    })
    expect(await rowsOf(tenant)).toEqual({ contacts: 1, conversations: 1, messages: 1 })
  })

  it('stores one message for concurrent duplicates', async () => {
    const tenant = await freshTenant()
    const phone = randomPhone()

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        inbound(deps.db, tenant, { fromPhone: phone, externalId: 'wa-dup' }),
      ),
    )

    expect(results.filter((result) => result.created)).toHaveLength(1)
    expect(new Set(results.map((result) => result.messageId)).size).toBe(1)
    expect(await rowsOf(tenant)).toMatchObject({ messages: 1 })
  })

  it('numbers fifty concurrent messages without gaps', async () => {
    const tenant = await freshTenant()
    const seeded = await seedConversation(deps.db, tenant)

    await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        inbound(deps.db, tenant, { fromPhone: seeded.phoneE164, externalId: `wa-${index}` }),
      ),
    )

    expect(seqs(await messagesOf(deps.db, tenant, seeded.id))).toEqual(range(1, 50))
    expect((await conversationOf(deps.db, tenant, seeded.id)).lastSeq).toBe(50)
  })

  it('does not make another conversation wait for a locked one', async () => {
    const tenant = await freshTenant()
    const locked = await seedConversation(deps.db, tenant)
    const free = await seedConversation(deps.db, tenant)
    let release = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let lockTaken = () => {}
    const taken = new Promise<void>((resolve) => {
      lockTaken = resolve
    })
    const holder = deps.db.withTenant(tenant, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Conversation" WHERE "id" = ${locked.id}::uuid FOR UPDATE`
      lockTaken()
      await released
    })
    await taken

    let waitingDone = false
    const waiting = inbound(deps.db, tenant, { fromPhone: locked.phoneE164 }).then((result) => {
      waitingDone = true
      return result
    })
    const started = Date.now()
    await inbound(deps.db, tenant, { fromPhone: free.phoneE164 })
    const elapsed = Date.now() - started
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(elapsed).toBeLessThan(2000)
    expect(waitingDone).toBe(false)
    release()
    await holder
    const result = await waiting
    expect(result.conversationId).toBe(locked.id)
    expect(waitingDone).toBe(true)
  })

  it('creates one contact and conversation for a concurrent first contact', async () => {
    const tenant = await freshTenant()
    const phone = randomPhone()

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        inbound(deps.db, tenant, { fromPhone: phone, externalId: `first-${index}` }),
      ),
    )

    expect(new Set(results.map((result) => result.conversationId)).size).toBe(1)
    expect(await rowsOf(tenant)).toEqual({ contacts: 1, conversations: 1, messages: 10 })
    const conversationId = results[0]?.conversationId ?? ''
    expect(seqs(await messagesOf(deps.db, tenant, conversationId))).toEqual(range(1, 10))
  })

  it('stores an unsupported message without content', async () => {
    const tenant = await freshTenant()

    const result = await inbound(deps.db, tenant, { kind: 'UNSUPPORTED', text: 'foto.jpg' })

    const [message] = await messagesOf(deps.db, tenant, result.conversationId)
    expect(message).toMatchObject({ kind: 'UNSUPPORTED', text: null })
  })

  it('bounds the inbound text', async () => {
    const tenant = await freshTenant()

    for (const text of [null, '   ', 'a'.repeat(65_537)]) {
      await expect(inbound(deps.db, tenant, { text }), String(text?.length)).rejects.toMatchObject({
        status: 422,
        code: 'INVALID_MESSAGE',
      })
    }
    expect(await rowsOf(tenant)).toEqual({ contacts: 0, conversations: 0, messages: 0 })

    const longest = await inbound(deps.db, tenant, { text: 'a'.repeat(65_536) })
    const [message] = await messagesOf(deps.db, tenant, longest.conversationId)
    expect(message?.text).toHaveLength(65_536)
  })

  it('refuses a channel outside the tenant', async () => {
    const tenant = await freshTenant()
    const foreignChannel = await webChatOf(deps.db, tenantB)

    for (const channelId of [foreignChannel, randomUUID()]) {
      await expect(inbound(deps.db, tenant, { channelId })).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      })
    }
    expect(await rowsOf(tenant)).toEqual({ contacts: 0, conversations: 0, messages: 0 })
  })

  it('stores messages without an external id every time', async () => {
    const tenant = await freshTenant()
    const phone = randomPhone()

    const first = await inbound(deps.db, tenant, { fromPhone: phone, externalId: null })
    await inbound(deps.db, tenant, { fromPhone: phone, externalId: null })

    const messages = await messagesOf(deps.db, tenant, first.conversationId)
    expect(messages.map((message) => [message.seq, message.externalId])).toEqual([
      [1, null],
      [2, null],
    ])
  })
})

describe('reopening', () => {
  async function closedHumanConversation(tenant: RequestContext, messages: number) {
    const { salespersonA } = await withTwoSalespeople(deps.db, tenant.organizationId)
    const seeded = await seedConversation(deps.db, tenant)
    for (let index = 0; index < messages; index++) {
      await inbound(deps.db, tenant, { fromPhone: seeded.phoneE164, text: `Antiga ${index}` })
    }
    await deps.db.withTenant(tenant, (tx) =>
      tx.conversation.update({
        where: { id: seeded.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          handler: 'HUMAN',
          assigneeId: salespersonA.userId,
        },
      }),
    )
    return { ...seeded, assigneeId: salespersonA.userId }
  }

  it('reopens a closed conversation and keeps its history', async () => {
    const tenant = await freshTenant()
    const closed = await closedHumanConversation(tenant, 3)
    const history = await messagesOf(deps.db, tenant, closed.id)

    const result = await inbound(deps.db, tenant, { fromPhone: closed.phoneE164, text: 'Voltei' })

    expect(result.conversationId).toBe(closed.id)
    expect(await conversationOf(deps.db, tenant, closed.id)).toMatchObject({
      status: 'OPEN',
      closedAt: null,
      handler: 'QUEUE',
      assigneeId: null,
      lastSeq: 4,
    })
    const messages = await messagesOf(deps.db, tenant, closed.id)
    expect(messages.slice(0, 3).map((message) => [message.id, message.text])).toEqual(
      history.map((message) => [message.id, message.text]),
    )
    expect(messages[3]).toMatchObject({ seq: 4, text: 'Voltei' })
    expect(await rowsOf(tenant)).toMatchObject({ conversations: 1 })
  })

  it('records the reopen as a system action', async () => {
    const tenant = await freshTenant()
    const closed = await closedHumanConversation(tenant, 1)
    const queued = await seedConversation(deps.db, tenant, {
      status: 'CLOSED',
      closedAt: new Date(),
    })

    await inbound(deps.db, tenant, { fromPhone: closed.phoneE164 })
    await inbound(deps.db, tenant, { fromPhone: queued.phoneE164 })

    const [fromHuman] = await reopenAudits(tenant, closed.id)
    expect(fromHuman).toMatchObject({ actorType: 'SYSTEM', actorUserId: null })
    expect(fromHuman?.changes).toEqual({
      status: ['CLOSED', 'OPEN'],
      handler: ['HUMAN', 'QUEUE'],
      previousAssigneeId: closed.assigneeId,
    })
    const [fromQueue] = await reopenAudits(tenant, queued.id)
    expect(fromQueue?.changes).toEqual({
      status: ['CLOSED', 'OPEN'],
      handler: ['QUEUE', 'QUEUE'],
    })
  })

  it('reopens once under concurrent messages', async () => {
    const tenant = await freshTenant()
    const closed = await closedHumanConversation(tenant, 2)

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        inbound(deps.db, tenant, { fromPhone: closed.phoneE164, externalId: `re-${index}` }),
      ),
    )

    const open = await deps.db.withTenant(tenant, (tx) =>
      tx.conversation.findMany({ where: { status: { not: 'CLOSED' } }, select: { id: true } }),
    )
    expect(open).toEqual([{ id: closed.id }])
    expect(await reopenAudits(tenant, closed.id)).toHaveLength(1)
    expect(seqs(await messagesOf(deps.db, tenant, closed.id))).toEqual(range(1, 7))
  })
})

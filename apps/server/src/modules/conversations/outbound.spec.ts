import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps } from '../../../test/app.ts'
import {
  conversationOf,
  inbound,
  messagesOf,
  seedConversation,
} from '../../../test/conversations.ts'
import { withTwoSalespeople, withTwoTenants } from '../../../test/factories.ts'
import type { Deps } from '../../dependencies.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { type OutboundSender, sendMessage } from './index.ts'

let deps: Deps
let tenant: RequestContext
let tenantB: RequestContext
let userX: string
let userY: string

beforeAll(async () => {
  deps = await createTestDeps()
  ;({ tenantA: tenant, tenantB } = await withTwoTenants(deps.db))
  const { salespersonA, salespersonB } = await withTwoSalespeople(deps.db, tenant.organizationId)
  userX = salespersonA.userId
  userY = salespersonB.userId
})

afterAll(() => deps.db.$disconnect())

function send(conversationId: string, sender: OutboundSender, text = 'Olá, como posso ajudar?') {
  return sendMessage({ db: deps.db }, tenant, { conversationId, sender, text })
}

async function unchanged(conversationId: string, run: () => Promise<unknown>) {
  const before = await conversationOf(deps.db, tenant, conversationId)
  const messagesBefore = await messagesOf(deps.db, tenant, conversationId)
  await run()
  const after = await conversationOf(deps.db, tenant, conversationId)
  expect(after.lastSeq).toBe(before.lastSeq)
  expect(after.status).toBe(before.status)
  expect(await messagesOf(deps.db, tenant, conversationId)).toEqual(messagesBefore)
}

describe('sendMessage', () => {
  it('sends as the assigned human', async () => {
    const conversation = await seedConversation(deps.db, tenant, {
      handler: 'HUMAN',
      assigneeId: userX,
      lastSeq: 4,
    })

    const result = await send(conversation.id, { author: 'HUMAN', userId: userX })

    expect(result.seq).toBe(5)
    const [message] = await messagesOf(deps.db, tenant, conversation.id)
    expect(message).toMatchObject({
      id: result.messageId,
      direction: 'OUTBOUND',
      author: 'HUMAN',
      authorUserId: userX,
      seq: 5,
      deliveryStatus: 'SENT',
      externalId: null,
      kind: 'TEXT',
      text: 'Olá, como posso ajudar?',
    })
    expect(await conversationOf(deps.db, tenant, conversation.id)).toMatchObject({
      status: 'WAITING',
      lastSeq: 5,
    })
  })

  it('refuses a human who does not handle the conversation', async () => {
    const human = await seedConversation(deps.db, tenant, { handler: 'HUMAN', assigneeId: userX })
    const queued = await seedConversation(deps.db, tenant, { handler: 'QUEUE' })

    for (const [conversationId, userId] of [
      [human.id, userY],
      [queued.id, userX],
    ] as const) {
      await unchanged(conversationId, () =>
        expect(send(conversationId, { author: 'HUMAN', userId })).rejects.toMatchObject({
          status: 409,
          code: 'NOT_HANDLER',
        }),
      )
    }
  })

  it('lets the ai send only while it handles the conversation', async () => {
    const queued = await seedConversation(deps.db, tenant, { handler: 'QUEUE' })
    const human = await seedConversation(deps.db, tenant, { handler: 'HUMAN', assigneeId: userX })
    const ai = await seedConversation(deps.db, tenant, { handler: 'AI' })

    for (const conversation of [queued, human]) {
      await unchanged(conversation.id, () =>
        expect(send(conversation.id, { author: 'AI' })).rejects.toMatchObject({
          status: 409,
          code: 'NOT_HANDLER',
        }),
      )
    }
    await send(ai.id, { author: 'AI' })
    const [message] = await messagesOf(deps.db, tenant, ai.id)
    expect(message).toMatchObject({ author: 'AI', authorUserId: null })
  })

  it('lets the system send with any handler', async () => {
    const conversations = [
      await seedConversation(deps.db, tenant, { handler: 'AI' }),
      await seedConversation(deps.db, tenant, { handler: 'QUEUE' }),
      await seedConversation(deps.db, tenant, { handler: 'HUMAN', assigneeId: userX }),
    ]

    for (const conversation of conversations) {
      await send(conversation.id, { author: 'SYSTEM' })
      const [message] = await messagesOf(deps.db, tenant, conversation.id)
      expect(message, conversation.handler).toMatchObject({ author: 'SYSTEM', seq: 1 })
      expect((await conversationOf(deps.db, tenant, conversation.id)).status).toBe('WAITING')
    }
  })

  it('refuses to send on a closed conversation', async () => {
    const closed = await seedConversation(deps.db, tenant, {
      status: 'CLOSED',
      closedAt: new Date(),
      handler: 'HUMAN',
      assigneeId: userX,
      lastSeq: 3,
    })
    const closedAi = await seedConversation(deps.db, tenant, {
      status: 'CLOSED',
      closedAt: new Date(),
      handler: 'AI',
    })

    for (const [conversationId, sender] of [
      [closed.id, { author: 'HUMAN', userId: userX }],
      [closedAi.id, { author: 'AI' }],
      [closed.id, { author: 'SYSTEM' }],
    ] as const) {
      await unchanged(conversationId, () =>
        expect(send(conversationId, sender)).rejects.toMatchObject({
          status: 409,
          code: 'CONVERSATION_CLOSED',
        }),
      )
    }
  })

  it('does not send outside the tenant', async () => {
    const foreign = await seedConversation(deps.db, tenantB)

    for (const conversationId of [foreign.id, randomUUID()]) {
      await expect(send(conversationId, { author: 'SYSTEM' })).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      })
    }
    expect(await messagesOf(deps.db, tenantB, foreign.id)).toEqual([])
  })

  it('bounds the outbound text', async () => {
    const conversation = await seedConversation(deps.db, tenant)

    for (const text of ['  ', 'a'.repeat(65_537)]) {
      await unchanged(conversation.id, () =>
        expect(send(conversation.id, { author: 'SYSTEM' }, text)).rejects.toMatchObject({
          status: 422,
          code: 'INVALID_MESSAGE',
        }),
      )
    }
    await send(conversation.id, { author: 'SYSTEM' }, 'a'.repeat(65_536))
    const [message] = await messagesOf(deps.db, tenant, conversation.id)
    expect(message?.text).toHaveLength(65_536)
  })

  it('keeps seq contiguous across concurrent inbound and outbound', async () => {
    const conversation = await seedConversation(deps.db, tenant)

    await Promise.all([
      ...Array.from({ length: 20 }, (_, index) =>
        inbound(deps.db, tenant, { fromPhone: conversation.phoneE164, externalId: `mix-${index}` }),
      ),
      ...Array.from({ length: 20 }, () => send(conversation.id, { author: 'SYSTEM' })),
    ])

    const messages = await messagesOf(deps.db, tenant, conversation.id)
    expect(messages.map((message) => message.seq)).toEqual(
      Array.from({ length: 40 }, (_, index) => index + 1),
    )
    expect(messages.filter((message) => message.direction === 'OUTBOUND')).toHaveLength(20)
  })
})

import type { Database, Transaction } from '../../infrastructure/database.ts'
import { notify } from '../../infrastructure/events.ts'
import { AppError } from '../../shared/errors.ts'
import { uuidv7 } from '../../shared/id.ts'
import { normalizePhone } from '../../shared/phone.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { record, SYSTEM_ACTOR } from '../audit/index.ts'
import { findOrCreateContact } from '../contacts/index.ts'
import {
  aiAvailable,
  type Handler,
  onInbound,
  reopenHandler,
  type Status,
} from './conversation-state.ts'
import { checkedText } from './message-text.ts'

const invalidPhone = new AppError(422, 'INVALID_PHONE', 'Telefone inválido.')
const channelNotFound = new AppError(404, 'NOT_FOUND', 'Canal não encontrado.')

// What every channel adapter hands to the conversation domain (ADR-013). `fromPhone` is raw: it is
// normalized to E.164 here, the single entry of every channel.
export type InboundMessage = {
  channelId: string
  externalId?: string | null
  fromPhone: string
  kind: 'TEXT' | 'UNSUPPORTED'
  text?: string | null
  sentAt: Date
}

export type InboundResult = { conversationId: string; messageId: string; created: boolean }

type LockedConversation = {
  id: string
  status: Status
  handler: Handler
  assigneeId: string | null
  lastSeq: number
}

// The insert met a message with the same channel and external id: the whole transaction rolls back
// (contact, reopening, seq), and the caller answers with the stored message.
class DuplicateInbound extends Error {}

export async function receiveInbound(
  deps: { db: Database },
  ctx: Pick<RequestContext, 'organizationId'>,
  input: InboundMessage,
): Promise<InboundResult> {
  const phoneE164 = normalizePhone(input.fromPhone)
  if (!phoneE164) throw invalidPhone
  const text = input.kind === 'TEXT' ? checkedText(input.text) : null
  const externalId = input.externalId ?? null

  try {
    return await deps.db.withTenant(ctx, async (tx) => {
      const channel = await tx.channel.findUnique({
        where: { id: input.channelId },
        select: { id: true },
      })
      if (!channel) throw channelNotFound
      const contact = await findOrCreateContact(tx, phoneE164)
      const conversation = await lockConversation(tx, contact.id, channel.id)

      // The row lock orders every message of this conversation; other conversations run in parallel.
      const seq = conversation.lastSeq + 1
      const messageId = uuidv7()
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "Message"
          ("id", "conversationId", "channelId", "seq", "direction", "author", "kind", "text",
           "externalId", "sentAt")
        VALUES (${messageId}::uuid, ${conversation.id}::uuid, ${channel.id}::uuid, ${seq},
                'INBOUND', 'CONTACT', ${input.kind}::"MessageKind", ${text}, ${externalId},
                ${input.sentAt})
        ON CONFLICT ("organizationId", "channelId", "externalId") WHERE "externalId" IS NOT NULL
        DO NOTHING
        RETURNING "id"`
      if (inserted.length === 0) throw new DuplicateInbound()

      const reopened = conversation.status === 'CLOSED'
      const handler = reopened
        ? reopenHandler({ aiAvailable: aiAvailable() })
        : conversation.handler
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          status: onInbound(conversation.status),
          lastSeq: seq,
          lastMessageAt: new Date(),
          // Never straight back to the previous human (ADR-013).
          ...(reopened && { handler, assigneeId: null, closedAt: null }),
        },
      })
      if (reopened) {
        await record(tx, SYSTEM_ACTOR, {
          action: 'conversation.reopen',
          entityId: conversation.id,
          changes: {
            status: ['CLOSED', 'OPEN'],
            handler: [conversation.handler, handler],
            ...(conversation.assigneeId !== null && {
              previousAssigneeId: conversation.assigneeId,
            }),
          },
        })
      }
      await notify(tx, {
        type: 'message.created',
        organizationId: ctx.organizationId,
        conversationId: conversation.id,
        messageId,
      })
      return { conversationId: conversation.id, messageId, created: true }
    })
  } catch (error) {
    if (!(error instanceof DuplicateInbound)) throw error
    const stored = await deps.db.withTenant(ctx, (tx) =>
      tx.message.findFirstOrThrow({
        where: { channelId: input.channelId, externalId },
        select: { id: true, conversationId: true },
      }),
    )
    return { conversationId: stored.conversationId, messageId: stored.id, created: false }
  }
}

// The conversation of this contact on this channel, locked: the one that is not closed, else the
// last closed one (reopened in place, §17), else a new one. `ON CONFLICT DO NOTHING` on
// `Conversation_one_open` makes two first messages share one conversation.
async function lockConversation(
  tx: Transaction,
  contactId: string,
  channelId: string,
): Promise<LockedConversation> {
  const where = { contactId, channelId }
  let target =
    (await tx.conversation.findFirst({
      where: { ...where, status: { not: 'CLOSED' } },
      select: { id: true },
    })) ??
    (await tx.conversation.findFirst({
      where: { ...where, status: 'CLOSED' },
      orderBy: { closedAt: 'desc' },
      select: { id: true },
    }))
  if (!target) {
    await tx.conversation.createMany({
      data: [
        {
          ...where,
          status: 'OPEN',
          handler: reopenHandler({ aiAvailable: aiAvailable() }),
        },
      ],
      skipDuplicates: true,
    })
    target = await tx.conversation.findFirstOrThrow({
      where: { ...where, status: { not: 'CLOSED' } },
      select: { id: true },
    })
  }
  const [locked] = await tx.$queryRaw<LockedConversation[]>`
    SELECT "id", "status", "handler", "assigneeId", "lastSeq"
      FROM "Conversation" WHERE "id" = ${target.id}::uuid FOR UPDATE`
  if (!locked) throw new Error(`Conversation ${target.id} vanished while locking`)
  return locked
}

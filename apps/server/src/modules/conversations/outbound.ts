import type { ChannelKind, DeliveryStatus } from '../../generated/prisma/client.ts'
import type { Database } from '../../infrastructure/database.ts'
import { notify } from '../../infrastructure/events.ts'
import { AppError, isRecordNotFound } from '../../shared/errors.ts'
import { uuidv7 } from '../../shared/id.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { canSend, type Handler, onOutbound, type Sender } from './conversation-state.ts'
import { checkedText } from './message-text.ts'

const conversationNotFound = new AppError(404, 'NOT_FOUND', 'Conversa não encontrada.')
const conversationClosed = new AppError(409, 'CONVERSATION_CLOSED', 'A conversa está encerrada.')
const notHandler = new AppError(
  409,
  'NOT_HANDLER',
  'A conversa não está com quem tentou responder.',
)

// Web Chat delivers inside the sending transaction; WhatsApp (F9) will leave it PENDING with a job.
const DELIVERY_ON_SEND: Record<ChannelKind, DeliveryStatus> = { WEB_CHAT: 'SENT' }

export type OutboundSender = Exclude<Sender, { author: 'CONTACT' }>

export type OutboundMessage = { conversationId: string; sender: OutboundSender; text: string }

// The `canSend` rule as the condition of the update that reserves the seq, so a handler change
// between reading and writing cannot slip through (ADR-013: 0 rows -> 409).
function sendableBy(sender: OutboundSender): { handler?: Handler; assigneeId?: string } {
  switch (sender.author) {
    case 'AI':
      return { handler: 'AI' }
    case 'HUMAN':
      return { handler: 'HUMAN', assigneeId: sender.userId }
    case 'SYSTEM':
      return {}
  }
}

export async function sendMessage(
  deps: { db: Database },
  ctx: Pick<RequestContext, 'organizationId'>,
  input: OutboundMessage,
) {
  const text = checkedText(input.text)
  return deps.db.withTenant(ctx, async (tx) => {
    const now = new Date()
    const conversation = await tx.conversation
      .update({
        where: {
          id: input.conversationId,
          status: { not: 'CLOSED' },
          ...sendableBy(input.sender),
        },
        // Every open status goes to WAITING: the last message is ours.
        data: { lastSeq: { increment: 1 }, status: 'WAITING', lastMessageAt: now },
        select: { id: true, channelId: true, lastSeq: true, channel: { select: { kind: true } } },
      })
      .catch(async (error: unknown) => {
        if (!isRecordNotFound(error)) throw error
        const current = await tx.conversation.findUnique({
          where: { id: input.conversationId },
          select: { status: true, handler: true, assigneeId: true },
        })
        if (!current) throw conversationNotFound
        if (onOutbound(current.status) !== 'WAITING') throw conversationClosed
        if (!canSend(current, input.sender)) throw notHandler
        throw error
      })

    const message = await tx.message.create({
      data: {
        id: uuidv7(),
        conversationId: conversation.id,
        channelId: conversation.channelId,
        seq: conversation.lastSeq,
        direction: 'OUTBOUND',
        author: input.sender.author,
        authorUserId: input.sender.author === 'HUMAN' ? input.sender.userId : null,
        kind: 'TEXT',
        text,
        deliveryStatus: DELIVERY_ON_SEND[conversation.channel.kind],
        sentAt: now,
      },
      select: { id: true, seq: true },
    })
    await notify(tx, {
      type: 'message.created',
      organizationId: ctx.organizationId,
      conversationId: conversation.id,
      messageId: message.id,
    })
    return { conversationId: conversation.id, messageId: message.id, seq: message.seq }
  })
}

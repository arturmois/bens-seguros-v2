import { z } from 'zod'
import type { Database } from '../../infrastructure/database.ts'
import { AppError, isRecordNotFound } from '../../shared/errors.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { messageOutput } from './conversation.schema.ts'
import { sendMessage } from './outbound.ts'
import { findReadableConversation } from './read.ts'

const notFound = new AppError(404, 'NOT_FOUND', 'Conversa não encontrada.')

export const sendConversationMessageInput = z.object({ text: z.string().min(1).max(4000) }).strict()

export type SendConversationMessageInput = z.infer<typeof sendConversationMessageInput>

export const sendConversationMessageOutput = z.object({ message: messageOutput }).strict()

const messageSelect = {
  id: true,
  seq: true,
  direction: true,
  author: true,
  authorUserId: true,
  kind: true,
  text: true,
  deliveryStatus: true,
  sentAt: true,
  createdAt: true,
} as const

// Panel reply: take from the queue in the same flow when needed (door 3 of web-chat-ui).
export async function sendConversationMessage(
  deps: { db: Database },
  ctx: RequestContext,
  conversationId: string,
  input: SendConversationMessageInput,
) {
  await findReadableConversation(deps, ctx, conversationId)

  await deps.db.withTenant(ctx, async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { id: conversationId },
      select: { handler: true },
    })
    if (!conversation) throw notFound
    if (conversation.handler !== 'QUEUE') return

    await tx.conversation.updateMany({
      where: { id: conversationId, handler: 'QUEUE' },
      data: { handler: 'HUMAN', assigneeId: ctx.userId },
    })
  })

  try {
    const sent = await sendMessage(deps, ctx, {
      conversationId,
      sender: { author: 'HUMAN', userId: ctx.userId },
      text: input.text,
    })
    const message = await deps.db.withTenant(ctx, (tx) =>
      tx.message.findUniqueOrThrow({ where: { id: sent.messageId }, select: messageSelect }),
    )
    return {
      message: {
        ...message,
        sentAt: message.sentAt.toISOString(),
        createdAt: message.createdAt.toISOString(),
      },
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    if (isRecordNotFound(error)) throw notFound
    throw error
  }
}

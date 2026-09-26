import type { Database } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { record } from '../audit/index.ts'
import { claimContactOwnerIfUnset } from '../contacts/index.ts'
import { findReadableConversation } from './read.ts'

const notFound = new AppError(404, 'NOT_FOUND', 'Conversa não encontrada.')
const alreadyAssigned = new AppError(
  409,
  'ALREADY_ASSIGNED',
  'A conversa já foi assumida por outra pessoa.',
)

export async function takeConversation(
  deps: { db: Database },
  ctx: RequestContext,
  conversationId: string,
) {
  await findReadableConversation(deps, ctx, conversationId)

  await deps.db.withTenant(ctx, async (tx) => {
    const before = await tx.conversation.findUnique({
      where: { id: conversationId },
      select: { handler: true, contactId: true },
    })
    if (!before) throw notFound

    const updated = await tx.conversation.updateMany({
      where: { id: conversationId, handler: { in: ['AI', 'QUEUE'] } },
      data: { handler: 'HUMAN', assigneeId: ctx.userId },
    })
    if (updated.count === 0) throw alreadyAssigned

    await claimContactOwnerIfUnset(tx, before.contactId, ctx.userId)

    await record(tx, ctx, {
      action: 'conversation.take',
      entityId: conversationId,
      changes: {
        handler: [before.handler, 'HUMAN'],
        assigneeId: ctx.userId,
      },
    })
  })

  return findReadableConversation(deps, ctx, conversationId)
}

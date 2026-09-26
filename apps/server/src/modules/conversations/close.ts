import type { Database } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { record } from '../audit/index.ts'
import { close, FORBIDDEN_TRANSITION } from './conversation-state.ts'
import { findReadableConversation } from './read.ts'

const notFound = new AppError(404, 'NOT_FOUND', 'Conversa não encontrada.')
const alreadyClosed = new AppError(409, 'CONVERSATION_CLOSED', 'A conversa já está encerrada.')

export async function closeConversation(
  deps: { db: Database },
  ctx: RequestContext,
  conversationId: string,
) {
  const summary = await findReadableConversation(deps, ctx, conversationId)

  // ADR-016: COMMERCIAL closes only when they are the assignee; MANAGER/ADMIN any readable.
  if (ctx.role === 'COMMERCIAL' && summary.assigneeId !== ctx.userId) throw notFound

  await deps.db.withTenant(ctx, async (tx) => {
    const current = await tx.conversation.findUnique({
      where: { id: conversationId },
      select: { status: true },
    })
    if (!current) throw notFound
    if (close(current.status) === FORBIDDEN_TRANSITION) throw alreadyClosed

    const updated = await tx.conversation.updateMany({
      where: { id: conversationId, status: { not: 'CLOSED' } },
      data: { status: 'CLOSED', closedAt: new Date() },
    })
    if (updated.count === 0) throw alreadyClosed

    await record(tx, ctx, {
      action: 'conversation.close',
      entityId: conversationId,
      changes: { status: [current.status, 'CLOSED'] },
    })
  })

  return findReadableConversation(deps, ctx, conversationId)
}

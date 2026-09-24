import type { Database, Transaction } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'
import { type PageQuery, pageArgs, toPage } from '../../shared/pagination.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { scopeFor } from '../../shared/scope.ts'

const conversationNotFound = new AppError(404, 'NOT_FOUND', 'Conversa não encontrada.')

type Reader = Pick<RequestContext, 'organizationId' | 'role' | 'userId'>

const summarySelect = {
  id: true,
  status: true,
  handler: true,
  assigneeId: true,
  contact: { select: { id: true, phoneE164: true, ownerId: true } },
  channel: { select: { id: true, kind: true, name: true } },
  lastSeq: true,
  lastMessageAt: true,
  closedAt: true,
  createdAt: true,
} as const

type SummaryRow = {
  lastMessageAt: Date | null
  closedAt: Date | null
  createdAt: Date
}

function toSummary<T extends SummaryRow>(row: T) {
  return {
    ...row,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

// The one read rule of a conversation (ADR-016): in the tenant and in the caller's portfolio, else
// 404 as if it did not exist. The realtime room of a conversation is authorized by this too.
async function readable(tx: Transaction, ctx: Reader, id: string) {
  const row = await tx.conversation.findFirst({
    where: { AND: [{ id }, scopeFor(ctx).conversation] },
    select: summarySelect,
  })
  if (!row) throw conversationNotFound
  return row
}

export async function listConversations(deps: { db: Database }, ctx: Reader, query: PageQuery) {
  const rows = await deps.db.withTenant(ctx, (tx) =>
    tx.conversation.findMany({
      where: scopeFor(ctx).conversation,
      select: summarySelect,
      ...pageArgs(query),
    }),
  )
  const page = toPage(rows, query)
  return { items: page.items.map(toSummary), nextCursor: page.nextCursor }
}

export async function findReadableConversation(deps: { db: Database }, ctx: Reader, id: string) {
  const row = await deps.db.withTenant(ctx, (tx) => readable(tx, ctx, id))
  return toSummary(row)
}

// Newest first by seq, not by id: the id is generated before the conversation lock, so two
// concurrent messages may have ids and seqs in different orders (plan door 2).
export async function listConversationMessages(
  deps: { db: Database },
  ctx: Reader,
  id: string,
  query: PageQuery,
) {
  const rows = await deps.db.withTenant(ctx, async (tx) => {
    await readable(tx, ctx, id)
    return tx.message.findMany({
      where: { conversationId: id },
      select: {
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
      },
      ...pageArgs(query, { seq: 'desc' }),
    })
  })
  const page = toPage(rows, query)
  return {
    items: page.items.map((row) => ({
      ...row,
      sentAt: row.sentAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: page.nextCursor,
  }
}

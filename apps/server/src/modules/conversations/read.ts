import type { Prisma } from '../../generated/prisma/client.ts'
import type { Database, Transaction } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'
import { type PageQuery, pageArgs, toPage } from '../../shared/pagination.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { scopeFor } from '../../shared/scope.ts'
import type { ConversationListQuery } from './conversation.schema.ts'

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

export function toConversationSummary<T extends SummaryRow>(row: T) {
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

function viewWhere(view: 'queue' | 'mine', userId: string): Prisma.ConversationWhereInput {
  if (view === 'queue') return { handler: 'QUEUE', status: { not: 'CLOSED' } }
  return { assigneeId: userId, status: { not: 'CLOSED' } }
}

// Keyset after (lastMessageAt DESC NULLS LAST, id DESC).
function afterCursor(cursor: {
  id: string
  lastMessageAt: Date | null
}): Prisma.ConversationWhereInput {
  if (cursor.lastMessageAt === null) {
    return { lastMessageAt: null, id: { lt: cursor.id } }
  }
  return {
    OR: [
      { lastMessageAt: { lt: cursor.lastMessageAt } },
      { AND: [{ lastMessageAt: cursor.lastMessageAt }, { id: { lt: cursor.id } }] },
      { lastMessageAt: null },
    ],
  }
}

export async function listConversations(
  deps: { db: Database },
  ctx: Reader,
  query: ConversationListQuery,
) {
  if (query.view === undefined) {
    const pageQuery: PageQuery = { cursor: query.cursor, limit: query.limit }
    const rows = await deps.db.withTenant(ctx, (tx) =>
      tx.conversation.findMany({
        where: scopeFor(ctx).conversation,
        select: summarySelect,
        ...pageArgs(pageQuery),
      }),
    )
    const page = toPage(rows, pageQuery)
    return { items: page.items.map(toConversationSummary), nextCursor: page.nextCursor }
  }

  const filter = viewWhere(query.view, ctx.userId)
  const rows = await deps.db.withTenant(ctx, async (tx) => {
    const scope = scopeFor(ctx).conversation
    let cursorFilter: Prisma.ConversationWhereInput = {}
    if (query.cursor !== undefined) {
      const cursorRow = await tx.conversation.findFirst({
        where: { AND: [{ id: query.cursor }, scope] },
        select: { id: true, lastMessageAt: true },
      })
      if (cursorRow) cursorFilter = afterCursor(cursorRow)
      else cursorFilter = { id: { in: [] } }
    }
    return tx.conversation.findMany({
      where: { AND: [scope, filter, cursorFilter] },
      select: summarySelect,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: query.limit + 1,
    })
  })
  const page = toPage(rows, query)
  return { items: page.items.map(toConversationSummary), nextCursor: page.nextCursor }
}

export async function findReadableConversation(deps: { db: Database }, ctx: Reader, id: string) {
  const row = await deps.db.withTenant(ctx, (tx) => readable(tx, ctx, id))
  return toConversationSummary(row)
}

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

function toMessage<T extends { sentAt: Date; createdAt: Date }>(row: T) {
  return { ...row, sentAt: row.sentAt.toISOString(), createdAt: row.createdAt.toISOString() }
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
      select: messageSelect,
      ...pageArgs(query, { seq: 'desc' }),
    })
  })
  const page = toPage(rows, query)
  return { items: page.items.map(toMessage), nextCursor: page.nextCursor }
}

// The message an event names, re-read in the event's tenant; null when it is not there (a stale or
// foreign event). No portfolio filter: only sockets authorized for the room receive it.
export async function findMessage(
  deps: { db: Database },
  tenant: Pick<RequestContext, 'organizationId'>,
  ids: { conversationId: string; messageId: string },
) {
  const row = await deps.db.withTenant(tenant, (tx) =>
    tx.message.findFirst({
      where: { id: ids.messageId, conversationId: ids.conversationId },
      select: messageSelect,
    }),
  )
  return row && toMessage(row)
}

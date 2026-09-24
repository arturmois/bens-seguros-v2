import type { Prisma } from '../generated/prisma/client.ts'
import type { RequestContext } from './request-context.ts'

export type PortfolioScope = {
  contact: Prisma.ContactWhereInput
  conversation: Prisma.ConversationWhereInput
}

// Portfolio filter per entity (AD-014, ADR-016). COMMERCIAL sees their own contacts and the lead
// queue (no owner), and the conversations they handle, the queue, and those of their own or
// ownerless contacts. Every other role sees the tenant. Repositories apply this and answer 404 when
// a row falls outside it. RLS does not.
export function scopeFor(ctx: Pick<RequestContext, 'role' | 'userId'>): PortfolioScope {
  if (ctx.role !== 'COMMERCIAL') return { contact: {}, conversation: {} }
  return {
    contact: { OR: [{ ownerId: ctx.userId }, { ownerId: null }] },
    conversation: {
      OR: [
        { assigneeId: ctx.userId },
        { handler: 'QUEUE' },
        { contact: { ownerId: ctx.userId } },
        { contact: { ownerId: null } },
      ],
    },
  }
}

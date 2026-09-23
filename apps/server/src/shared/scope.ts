import type { RequestContext } from './request-context.ts'

// Portfolio filter (AD-009, ADR-010). COMMERCIAL sees their own rows; every other role sees the
// tenant. Repositories apply this and answer 404 when a row falls outside it. RLS does not.
export function scopeFor(ctx: Pick<RequestContext, 'role' | 'userId'>): { salespersonId?: string } {
  if (ctx.role === 'COMMERCIAL') return { salespersonId: ctx.userId }
  return {}
}

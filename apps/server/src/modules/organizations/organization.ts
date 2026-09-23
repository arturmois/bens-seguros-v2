import type { Database } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { record } from '../audit/index.ts'

const hidden = new AppError(404, 'NOT_FOUND', 'Organização não encontrada.')

export async function getOrganization(deps: { db: Database }, ctx: RequestContext) {
  const organization = await deps.db.withTenant(ctx, (tx) =>
    tx.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { id: true, name: true, slug: true },
    }),
  )
  if (!organization) throw hidden
  return { ...organization, role: ctx.role }
}

export async function renameOrganization(
  deps: { db: Database },
  ctx: RequestContext,
  name: string,
) {
  return deps.db.withTenant(ctx, async (tx) => {
    const organization = await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { name },
      select: { id: true, name: true, slug: true },
    })
    // `name` is on the AD-008 denylist, so the trail says it changed, not what it became.
    await record(tx, ctx, {
      action: 'organization.update',
      entityId: organization.id,
      changes: { name },
    })
    return organization
  })
}

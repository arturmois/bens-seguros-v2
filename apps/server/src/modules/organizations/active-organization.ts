import type { Database } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'
import type { UserContext } from '../../shared/request-context.ts'
import { assignActiveOrganization } from '../auth/index.ts'
import { findActiveMember } from './membership.ts'

const hidden = new AppError(404, 'NOT_FOUND', 'Organização não encontrada.')

export async function setActiveOrganization(
  deps: { db: Database },
  user: UserContext,
  organizationId: string,
) {
  const member = await findActiveMember(deps.db, user.userId, organizationId)
  if (!member) throw hidden
  await deps.db.withTenant({ organizationId }, (tx) =>
    assignActiveOrganization(tx, user.sessionId, organizationId),
  )
  return { organizationId, role: member.role }
}

import type { Database } from '../../infrastructure/database.ts'
import type { UserContext } from '../../shared/request-context.ts'
import type { MeOutput } from './me.schema.ts'
import { unauthenticated } from './session-context.ts'

// Identity tables are user-level (no tenant), so they are read outside `withTenant`.
export async function getMe(deps: { db: Database }, user: UserContext): Promise<MeOutput> {
  const session = await deps.db.session.findUnique({
    where: { id: user.sessionId },
    select: {
      activeOrganizationId: true,
      user: {
        select: { id: true, name: true, email: true, emailVerified: true, twoFactorEnabled: true },
      },
    },
  })
  // Revoked between the preHandler and here.
  if (!session) throw unauthenticated()
  return {
    ...session.user,
    isSuperAdmin: user.isSuperAdmin,
    activeOrganizationId: session.activeOrganizationId,
  }
}

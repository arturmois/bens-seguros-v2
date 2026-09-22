import type { Database } from '../../infrastructure/database.ts'
import { permissionsFor } from '../../shared/permissions.ts'
import type { UserContext } from '../../shared/request-context.ts'
import type { MeOutput } from './me.schema.ts'
import { unauthenticated } from './session-context.ts'
import { termsState } from './terms.ts'

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
  const organizationId = session.activeOrganizationId
  const membership = organizationId
    ? await deps.db.withUser(user.userId, (tx) =>
        tx.member.findFirst({
          where: { userId: user.userId, organizationId, active: true },
          select: { role: true },
        }),
      )
    : null
  return {
    ...session.user,
    isSuperAdmin: user.isSuperAdmin,
    activeOrganizationId: session.activeOrganizationId,
    role: membership?.role ?? null,
    permissions: membership ? [...permissionsFor(membership.role)] : [],
    terms: await termsState(deps, session.user.id),
  }
}

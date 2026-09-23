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
  const memberships = await deps.db.withUser(user.userId, (tx) =>
    tx.member.findMany({
      where: { userId: user.userId, active: true },
      select: { role: true, organization: { select: { id: true, name: true } } },
    }),
  )
  const organizations = memberships
    .map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      role: membership.role,
    }))
    .sort((left, right) => {
      if (left.name < right.name) return -1
      if (left.name > right.name) return 1
      if (left.id < right.id) return -1
      if (left.id > right.id) return 1
      return 0
    })
  const active = organizations.find((organization) => organization.id === organizationId)
  return {
    ...session.user,
    isSuperAdmin: user.isSuperAdmin,
    activeOrganizationId: session.activeOrganizationId,
    role: active?.role ?? null,
    permissions: active ? [...permissionsFor(active.role)] : [],
    organizations,
    terms: await termsState(deps, session.user.id),
  }
}

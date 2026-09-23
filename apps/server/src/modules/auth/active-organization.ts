import type { Database, Transaction } from '../../infrastructure/database.ts'

// Session belongs to auth. Organizations calls this inside its transaction. The user row keeps the
// choice for the next session, since signing out deletes this one (org-web door 4).
export async function assignActiveOrganization(
  tx: Transaction,
  sessionId: string,
  organizationId: string,
) {
  const session = await tx.session.update({
    where: { id: sessionId },
    data: { activeOrganizationId: organizationId },
    select: { userId: true },
  })
  await tx.user.update({
    where: { id: session.userId },
    data: { lastActiveOrganizationId: organizationId },
  })
}

// Where a new session starts: the last active organization while the membership is active, else the
// only active one, else none (the web asks the user to choose or to create one).
export async function initialOrganization(db: Database, userId: string) {
  return db.withUser(userId, async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { lastActiveOrganizationId: true },
    })
    const memberships = await tx.member.findMany({
      where: { userId, active: true },
      select: { organizationId: true },
    })
    const last = user?.lastActiveOrganizationId
    if (last && memberships.some((membership) => membership.organizationId === last)) return last
    const [only] = memberships
    return memberships.length === 1 && only ? only.organizationId : null
  })
}

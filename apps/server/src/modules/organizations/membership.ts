import type { Database, Transaction } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'

const orgLimitReached = new AppError(
  422,
  'ORG_LIMIT_REACHED',
  'Você já participa do número máximo de organizações.',
)

export async function findActiveMember(db: Database, userId: string, organizationId: string) {
  return db.withUser(userId, (tx) =>
    tx.member.findFirst({
      where: { userId, organizationId, active: true },
      select: { role: true, organizationId: true },
    }),
  )
}

export async function countMemberships(tx: Transaction, userId: string) {
  return tx.member.count({ where: { userId } })
}

// A user joins at most `maxOrgsPerUser` organizations, by onboarding or by invitation.
export async function assertOrgLimit(db: Database, userId: string, maxOrgsPerUser: number) {
  const held = await db.withUser(userId, (tx) => countMemberships(tx, userId))
  if (held >= maxOrgsPerUser) throw orgLimitReached
}

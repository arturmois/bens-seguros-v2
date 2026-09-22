import type { Database, Transaction } from '../../infrastructure/database.ts'

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

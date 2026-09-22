import type { Transaction } from '../../infrastructure/database.ts'

// Session belongs to auth. Organizations calls this inside its transaction.
export async function assignActiveOrganization(
  tx: Transaction,
  sessionId: string,
  organizationId: string,
) {
  await tx.session.update({
    where: { id: sessionId },
    data: { activeOrganizationId: organizationId },
  })
}

import type { Transaction } from '../../infrastructure/database.ts'

// The contact of a phone (E.164, already normalized), created on its first message with no owner:
// a lead in the queue (ADR-016). `ON CONFLICT DO NOTHING` on (organizationId, phoneE164) makes two
// first messages from the same phone share one contact.
export async function findOrCreateContact(tx: Transaction, phoneE164: string) {
  await tx.contact.createMany({ data: [{ phoneE164 }], skipDuplicates: true })
  return tx.contact.findFirstOrThrow({
    where: { phoneE164 },
    select: { id: true, ownerId: true },
  })
}

// Portfolio transfer (AD-014): the contacts a user owns in this tenant move to another member.
export async function moveContactOwner(tx: Transaction, fromUserId: string, toUserId: string) {
  const { count } = await tx.contact.updateMany({
    where: { ownerId: fromUserId },
    data: { ownerId: toUserId },
  })
  return count
}

import type { Transaction } from '../../infrastructure/database.ts'

export type Consent = {
  contactId: string
  conversationId: string
  channelId: string
  noticeVersion: string
}

// The customer accepted the channel notice (ADR-014, LGPD §41). Runs in the transaction of the
// message it precedes, so neither exists without the other.
export async function recordConsent(tx: Transaction, consent: Consent) {
  await tx.consentRecord.create({ data: consent, select: { id: true } })
}

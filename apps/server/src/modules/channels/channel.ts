import type { Transaction } from '../../infrastructure/database.ts'

export const DEFAULT_WEB_CHAT_NAME = 'Web Chat'

// Every organization has exactly one Web Chat (`Channel_one_web_chat`). Runs inside the onboarding
// transaction; the migration created it for the organizations that already existed.
export async function createDefaultChannel(tx: Transaction) {
  await tx.channel.create({ data: { kind: 'WEB_CHAT', name: DEFAULT_WEB_CHAT_NAME } })
}

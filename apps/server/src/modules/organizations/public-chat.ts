import type { Database } from '../../infrastructure/database.ts'

// The organization behind a Web Chat link (AD-018), or `null`. The key is the only input: the
// organization id comes back from the row, and everything after it runs in `withTenant`.
export async function findPublicChat(deps: { db: Database }, publicChatKey: string) {
  const row = await deps.db.withPublicChatKey(publicChatKey, (tx) =>
    tx.organization.findFirst({
      where: { publicChatKey },
      select: { id: true, name: true, brandColor: true, greeting: true, logoUpdatedAt: true },
    }),
  )
  if (!row) return null
  return {
    organizationId: row.id,
    name: row.name,
    brandColor: row.brandColor,
    greeting: row.greeting,
    hasLogo: row.logoUpdatedAt !== null,
  }
}

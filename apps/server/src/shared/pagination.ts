import { z } from 'zod'

export const MAX_PAGE_SIZE = 100

// Query string of every list endpoint. The cursor is the last id of the previous page (UUID v7 ids
// sort by creation time).
export const pageQuery = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
})

export type PageQuery = z.infer<typeof pageQuery>

export function pageOutput<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.uuid().nullable() })
}

// Prisma arguments for a page ordered by id, newest first, unless another unique order is given
// (messages go by seq). The cursor is always the id. Merge `where` with the tenant filter.
export function pageArgs<O extends Record<string, 'asc' | 'desc'> = { id: 'desc' }>(
  query: PageQuery,
  orderBy?: O,
) {
  return {
    take: query.limit + 1,
    orderBy: orderBy ?? { id: 'desc' as const },
    ...(query.cursor !== undefined && { cursor: { id: query.cursor }, skip: 1 }),
  }
}

// Rows fetched with `pageArgs` (one extra row tells whether there is a next page).
export function toPage<T extends { id: string }>(rows: T[], query: PageQuery) {
  const items = rows.slice(0, query.limit)
  const last = items.at(-1)
  return { items, nextCursor: rows.length > query.limit && last ? last.id : null }
}

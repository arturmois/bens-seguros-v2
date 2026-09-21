import { describe, expect, it } from 'vitest'
import { pageArgs, pageQuery, toPage } from './pagination.ts'

const ids = ['01a0c4ee-0000-7000-8000-000000000003', '01a0c4ee-0000-7000-8000-000000000002']

describe('pagination', () => {
  it('parses the query with a default limit and caps it at 100', () => {
    expect(pageQuery.parse({})).toEqual({ limit: 50 })
    expect(pageQuery.parse({ limit: '20', cursor: ids[0] })).toEqual({ limit: 20, cursor: ids[0] })
    expect(pageQuery.safeParse({ limit: '101' }).success).toBe(false)
    expect(pageQuery.safeParse({ cursor: 'not-a-uuid' }).success).toBe(false)
  })

  it('fetches one extra row and skips the cursor row', () => {
    expect(pageArgs({ limit: 2 })).toEqual({ take: 3, orderBy: { id: 'desc' } })
    expect(pageArgs({ limit: 2, cursor: ids[0] })).toEqual({
      take: 3,
      orderBy: { id: 'desc' },
      cursor: { id: ids[0] },
      skip: 1,
    })
  })

  it('returns the last id as the next cursor only when there are more rows', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

    expect(toPage(rows, { limit: 2 })).toEqual({
      items: [{ id: 'a' }, { id: 'b' }],
      nextCursor: 'b',
    })
    expect(toPage(rows, { limit: 3 })).toEqual({ items: rows, nextCursor: null })
    expect(toPage([], { limit: 3 })).toEqual({ items: [], nextCursor: null })
  })
})

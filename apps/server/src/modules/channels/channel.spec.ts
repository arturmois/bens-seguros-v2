import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps } from '../../../test/app.ts'
import { webChatOf } from '../../../test/conversations.ts'
import { withTwoTenants } from '../../../test/factories.ts'
import type { Deps } from '../../dependencies.ts'

let deps: Deps

beforeAll(async () => {
  deps = await createTestDeps()
})

afterAll(() => deps.db.$disconnect())

describe('Channel', () => {
  it('hides the channel from the other tenant', async () => {
    const { tenantA, tenantB } = await withTwoTenants(deps.db)
    const channelA = await webChatOf(deps.db, tenantA)

    const seenByB = await deps.db.withTenant(tenantB, (tx) =>
      tx.channel.findMany({ select: { id: true } }),
    )
    const renamedByB = await deps.db.withTenant(tenantB, (tx) =>
      tx.channel.updateMany({ where: { id: channelA }, data: { name: 'Invadido' } }),
    )

    expect(seenByB.map((channel) => channel.id)).not.toContain(channelA)
    expect(seenByB).toHaveLength(1)
    expect(renamedByB.count).toBe(0)
    const own = await deps.db.withTenant(tenantA, (tx) =>
      tx.channel.findUniqueOrThrow({ where: { id: channelA } }),
    )
    expect(own.name).toBe('Web Chat')
  })
})

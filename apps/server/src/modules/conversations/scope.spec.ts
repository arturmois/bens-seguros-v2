import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps } from '../../../test/app.ts'
import { seedConversation } from '../../../test/conversations.ts'
import { withTwoSalespeople, withTwoTenants } from '../../../test/factories.ts'
import type { Deps } from '../../dependencies.ts'
import { permissionsFor } from '../../shared/permissions.ts'
import { scopeFor } from '../../shared/scope.ts'

let deps: Deps

beforeAll(async () => {
  deps = await createTestDeps()
})

afterAll(() => deps.db.$disconnect())

describe('portfolio scope', () => {
  it('filters contacts and conversations by portfolio', async () => {
    const { tenantA: tenant } = await withTwoTenants(deps.db)
    const { salespersonA: a, salespersonB: b } = await withTwoSalespeople(
      deps.db,
      tenant.organizationId,
    )
    const seed = (data: Parameters<typeof seedConversation>[2], ownerId: string | null) =>
      seedConversation(deps.db, tenant, data, { ownerId })
    // Seeded in an order unrelated to the expected sets.
    const aiOfB = await seed({ handler: 'AI' }, b.userId)
    const humanOfA = await seed({ handler: 'HUMAN', assigneeId: a.userId }, null)
    const humanOfBContactOfB = await seed({ handler: 'HUMAN', assigneeId: b.userId }, b.userId)
    const queueContactOfB = await seed({ handler: 'QUEUE' }, b.userId)
    const humanOfBContactOfA = await seed({ handler: 'HUMAN', assigneeId: b.userId }, a.userId)
    const aiOwnerless = await seed({ handler: 'AI' }, null)

    const visible = (ctx: typeof a) =>
      deps.db.withTenant(ctx, async (tx) => {
        const scope = scopeFor(ctx)
        const conversations = await tx.conversation.findMany({
          where: scope.conversation,
          select: { id: true },
        })
        const contacts = await tx.contact.findMany({
          where: scope.contact,
          select: { ownerId: true },
        })
        return {
          conversations: new Set(conversations.map((row) => row.id)),
          contactOwners: contacts.map((row) => row.ownerId),
        }
      })

    const commercial = await visible(a)
    expect(commercial.conversations).toEqual(
      new Set([humanOfA.id, queueContactOfB.id, aiOwnerless.id, humanOfBContactOfA.id]),
    )
    expect(new Set(commercial.contactOwners)).toEqual(new Set([a.userId, null]))
    expect(commercial.contactOwners).toHaveLength(3)

    const manager = await visible({ ...a, role: 'MANAGER', permissions: permissionsFor('MANAGER') })
    expect(manager.conversations).toEqual(
      new Set([
        aiOfB.id,
        humanOfA.id,
        humanOfBContactOfB.id,
        queueContactOfB.id,
        humanOfBContactOfA.id,
        aiOwnerless.id,
      ]),
    )
    expect(manager.contactOwners).toHaveLength(6)
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps } from '../../test/app.ts'
import { withTwoTenants } from '../../test/factories.ts'
import type { Deps } from '../dependencies.ts'
import { Prisma } from '../generated/prisma/client.ts'
import type { RequestContext } from '../shared/request-context.ts'
import { createTenantGuard, TenantGuardError } from './database.ts'

let deps: Deps
let tenantA: RequestContext
let tenantB: RequestContext

beforeAll(async () => {
  deps = await createTestDeps()
  ;({ tenantA, tenantB } = await withTwoTenants(deps.db))
})

afterAll(() => deps.db.$disconnect())

function createExample(ctx: RequestContext, name: string, parentId?: string) {
  return deps.db.example.create({
    data: { organizationId: ctx.organizationId, name, ...(parentId && { parentId }) },
  })
}

describe('tenant guard on the database client', () => {
  it('rejects reads, writes and counts on a tenant-scoped model without organizationId', async () => {
    const example = await createExample(tenantA, 'guarded')

    await expect(deps.db.example.findMany()).rejects.toThrow(TenantGuardError)
    await expect(deps.db.example.findMany({ where: { name: 'guarded' } })).rejects.toThrow(
      /findMany without where.organizationId/,
    )
    await expect(deps.db.example.findUnique({ where: { id: example.id } })).rejects.toThrow(
      TenantGuardError,
    )
    await expect(
      deps.db.example.update({ where: { id: example.id }, data: { name: 'x' } }),
    ).rejects.toThrow(TenantGuardError)
    await expect(deps.db.example.deleteMany({ where: {} })).rejects.toThrow(TenantGuardError)
    await expect(deps.db.example.count()).rejects.toThrow(TenantGuardError)
    await expect(
      deps.db.example.create({
        data: { name: 'no tenant', organization: { connect: { id: tenantA.organizationId } } },
      }),
    ).rejects.toThrow(/create without data.organizationId/)
  })

  it('returns only the tenant rows when organizationId is present', async () => {
    const example = await createExample(tenantA, 'visible-to-a')

    const fromB = await deps.db.example.findFirst({
      where: { id: example.id, organizationId: tenantB.organizationId },
    })
    const fromA = await deps.db.example.findUnique({
      where: { id_organizationId: { id: example.id, organizationId: tenantA.organizationId } },
    })

    expect(fromB).toBeNull()
    expect(fromA?.id).toBe(example.id)
  })

  it('allows include of relations under a tenant filter and still guards the root', async () => {
    const parent = await createExample(tenantA, 'parent-with-children')
    await createExample(tenantA, 'child-1', parent.id)

    const loaded = await deps.db.example.findFirst({
      where: { id: parent.id, organizationId: tenantA.organizationId },
      include: { children: true, organization: true },
    })

    expect(loaded?.children.map((child) => child.name)).toEqual(['child-1'])
    expect(loaded?.organization.id).toBe(tenantA.organizationId)
    await expect(
      deps.db.example.findFirst({ where: { id: parent.id }, include: { children: true } }),
    ).rejects.toThrow(TenantGuardError)
  })

  it('rejects a nested connect to a tenant-scoped row without organizationId', async () => {
    const child = await createExample(tenantA, 'child-1b')
    const foreignParent = await createExample(tenantB, 'foreign-parent')

    await expect(
      deps.db.example.update({
        where: { id: child.id, organizationId: tenantA.organizationId },
        data: { parent: { connect: { id: foreignParent.id } } },
      }),
    ).rejects.toThrow(/data.parent.connect on Example without organizationId/)
  })

  it('does not find a foreign row through a tenant-filtered connect', async () => {
    const child = await createExample(tenantA, 'child-2b')
    const foreignParent = await createExample(tenantB, 'foreign-parent-2')

    const error = await deps.db.example
      .update({
        where: { id: child.id, organizationId: tenantA.organizationId },
        data: {
          parent: { connect: { id: foreignParent.id, organizationId: tenantA.organizationId } },
        },
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect(error).toMatchObject({ code: 'P2025' })
  })

  it('lets the composite foreign key reject a parent id from another tenant', async () => {
    const foreignParent = await createExample(tenantB, 'foreign-parent-3')

    const error = await createExample(tenantA, 'child-of-foreign-3', foreignParent.id).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect(error).toMatchObject({ code: 'P2003' })
  })

  it('guards the transaction client too', async () => {
    await expect(
      deps.db.$transaction(async (tx) => tx.example.findMany({ where: { name: 'x' } })),
    ).rejects.toThrow(TenantGuardError)

    const found = await deps.db.$transaction(async (tx) =>
      tx.example.findMany({ where: { organizationId: tenantA.organizationId } }),
    )
    expect(found.length).toBeGreaterThan(0)
  })

  it('leaves models without organizationId alone', async () => {
    await expect(deps.db.organization.findMany({ take: 1 })).resolves.toBeInstanceOf(Array)
  })
})

describe('createTenantGuard (nested write shapes)', () => {
  // Invoice → Item (both tenant-scoped); Item → Product (tenant-scoped); Invoice → Organization.
  const guard = createTenantGuard(
    new Map([
      [
        'Invoice',
        {
          tenantScoped: true,
          relations: new Map([
            ['items', 'Item'],
            ['organization', 'Organization'],
          ]),
        },
      ],
      ['Item', { tenantScoped: true, relations: new Map([['product', 'Product']]) }],
      ['Product', { tenantScoped: true, relations: new Map() }],
      ['Organization', { tenantScoped: false, relations: new Map() }],
    ]),
  )
  const org = 'org-1'

  it('checks connects inside nested creates, connectOrCreate and set', () => {
    const create = (items: unknown) =>
      guard('Invoice', 'create', { data: { organizationId: org, items } })

    expect(() => create({ create: { product: { connect: { id: 'p' } } } })).toThrow(
      /items.create.product.connect on Product/,
    )
    expect(() =>
      create({ create: [{ product: { connect: { id: 'p', organizationId: org } } }] }),
    ).not.toThrow()
    expect(() => create({ connectOrCreate: { where: { id: 'i' }, create: {} } })).toThrow(
      /items.connectOrCreate on Item/,
    )
    expect(() => create({ createMany: { data: [{ product: { connect: { id: 'p' } } }] } })).toThrow(
      TenantGuardError,
    )
  })

  it('checks connects inside nested updates and upserts of an update', () => {
    const update = (data: unknown) =>
      guard('Invoice', 'update', { where: { id: 'i', organizationId: org }, data })

    expect(() => update({ items: { set: [{ id: 'i1' }] } })).toThrow(/items.set on Item/)
    expect(() =>
      update({
        items: { update: { where: { id: 'i1' }, data: { product: { connect: { id: 'p' } } } } },
      }),
    ).toThrow(/items.update.product.connect/)
    expect(() =>
      update({
        items: { upsert: { where: { id: 'i1' }, create: { product: { connect: { id: 'p' } } } } },
      }),
    ).toThrow(/items.upsert.product.connect/)
  })

  it('allows connecting non-scoped models such as Organization', () => {
    expect(() =>
      guard('Invoice', 'update', {
        where: { id: 'i', organizationId: org },
        data: { organization: { connect: { id: org } } },
      }),
    ).not.toThrow()
  })

  it('requires the tenant on both sides of an upsert', () => {
    expect(() =>
      guard('Invoice', 'upsert', { where: { id: 'i', organizationId: org }, create: {} }),
    ).toThrow(/upsert without create.organizationId/)
  })
})

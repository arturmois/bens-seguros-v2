import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps } from '../../test/app.ts'
import { withTwoTenants } from '../../test/factories.ts'
import type { Deps } from '../dependencies.ts'
import { Prisma } from '../generated/prisma/client.ts'
import type { RequestContext } from '../shared/request-context.ts'
import { createTenantGuard, readModels, TenantGuardError } from './database.ts'

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

function examplesOf(ctx: RequestContext) {
  return deps.db.example.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { name: 'asc' },
  })
}

const WHERE_OPERATIONS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
] as const

describe('tenant guard on the database client', () => {
  it('rejects every where-operation on the client and changes no rows', async () => {
    const example = await createExample(tenantA, 'untouchable')
    const before = await examplesOf(tenantA)
    const byId = { id: example.id }
    const byName = { name: 'untouchable' }
    const calls: Record<(typeof WHERE_OPERATIONS)[number], () => Promise<unknown>> = {
      findUnique: () => deps.db.example.findUnique({ where: byId }),
      findUniqueOrThrow: () => deps.db.example.findUniqueOrThrow({ where: byId }),
      findFirst: () => deps.db.example.findFirst({ where: byName }),
      findFirstOrThrow: () => deps.db.example.findFirstOrThrow({ where: byName }),
      findMany: () => deps.db.example.findMany({ where: byName }),
      update: () => deps.db.example.update({ where: byId, data: { name: 'changed' } }),
      updateMany: () => deps.db.example.updateMany({ where: byName, data: { name: 'changed' } }),
      updateManyAndReturn: () =>
        deps.db.example.updateManyAndReturn({ where: byName, data: { name: 'changed' } }),
      delete: () => deps.db.example.delete({ where: byId }),
      deleteMany: () => deps.db.example.deleteMany({ where: byName }),
      count: () => deps.db.example.count({ where: byName }),
      aggregate: () => deps.db.example.aggregate({ where: byName, _count: true }),
      groupBy: () => deps.db.example.groupBy({ by: ['name'], where: byName }),
    }

    for (const operation of WHERE_OPERATIONS) {
      await expect(calls[operation](), operation).rejects.toThrow(TenantGuardError)
    }

    const after = await examplesOf(tenantA)
    expect(after).toHaveLength(before.length)
    expect(after.map((row) => row.name)).toEqual(before.map((row) => row.name))
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

  it('rejects moving rows between tenants on the client', async () => {
    await createExample(tenantA, 'stays-in-a')
    const before = await examplesOf(tenantA)

    await expect(
      deps.db.example.updateMany({
        where: { organizationId: tenantA.organizationId },
        data: { organizationId: tenantB.organizationId },
      }),
    ).rejects.toThrow(TenantGuardError)

    const after = await examplesOf(tenantA)
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id))
    expect(after.every((row) => row.organizationId === tenantA.organizationId)).toBe(true)
  })

  it('allows include of relations under a tenant filter and still guards the root', async () => {
    const parent = await createExample(tenantA, 'parent-with-children')
    await createExample(tenantA, 'child-1', parent.id)

    const loaded = await deps.db.example.findFirst({
      where: { id: parent.id, organizationId: tenantA.organizationId },
      include: { children: true, organization: true },
    })

    expect(loaded?.children.map((child) => child.name)).toEqual(['child-1'])
    expect(loaded?.children.every((child) => child.organizationId === tenantA.organizationId)).toBe(
      true,
    )
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
    const reloaded = await deps.db.example.findUnique({
      where: { id: child.id, organizationId: tenantA.organizationId },
    })
    expect(reloaded?.parentId).toBeNull()
  })

  it('lets the composite foreign key reject a parent id from another tenant', async () => {
    const foreignParent = await createExample(tenantB, 'foreign-parent-3')

    const error = await createExample(tenantA, 'child-of-foreign-3', foreignParent.id).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect(error).toMatchObject({ code: 'P2003' })
    const created = await deps.db.example.findFirst({
      where: { organizationId: tenantA.organizationId, name: 'child-of-foreign-3' },
    })
    expect(created).toBeNull()
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

  it('reads the model classification from the Prisma runtime and fails closed', () => {
    expect(() => readModels({})).toThrow()
    expect(() => readModels({ _runtimeDataModel: { models: 'unexpected' } })).toThrow()

    const models = readModels(deps.db)
    expect(models.get('Example')?.tenantScoped).toBe(true)
    expect(models.get('Organization')?.tenantScoped).toBe(false)
    expect(models.get('Example')?.relations.get('parent')).toBe('Example')
  })
})

describe('createTenantGuard (decision table)', () => {
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
  const other = 'org-2'

  it('rejects every where-operation without organizationId', () => {
    for (const operation of WHERE_OPERATIONS) {
      expect(() => guard('Invoice', operation, { where: { id: 'i' } }), operation).toThrow(
        TenantGuardError,
      )
      expect(() => guard('Invoice', operation, {}), operation).toThrow(TenantGuardError)
      expect(
        () => guard('Invoice', operation, { where: { id: 'i', organizationId: org } }),
        operation,
      ).not.toThrow()
    }
  })

  it('accepts only a literal organizationId filter', () => {
    const rejected = {
      equals: { organizationId: { equals: org } },
      in: { organizationId: { in: [org] } },
      undefined: { organizationId: undefined },
      AND: { AND: [{ organizationId: org }] },
      OR: { OR: [{ organizationId: org }] },
      NOT: { NOT: { organizationId: org } },
    }
    for (const [shape, where] of Object.entries(rejected)) {
      expect(() => guard('Invoice', 'findMany', { where }), shape).toThrow(TenantGuardError)
    }

    expect(() => guard('Invoice', 'findMany', { where: { organizationId: org } })).not.toThrow()
    expect(() =>
      guard('Invoice', 'findUnique', {
        where: { id_organizationId: { id: 'i', organizationId: org } },
      }),
    ).not.toThrow()
  })

  it('rejects every create operation with a row missing organizationId', () => {
    for (const operation of ['create', 'createMany', 'createManyAndReturn']) {
      const single = operation === 'create'
      const bad = single ? { name: 'x' } : [{ organizationId: org }, { name: 'x' }]
      const good = single ? { organizationId: org } : [{ organizationId: org }]

      expect(() => guard('Invoice', operation, { data: bad }), operation).toThrow(TenantGuardError)
      expect(() => guard('Invoice', operation, { data: good }), operation).not.toThrow()
    }
  })

  it('requires the tenant on both sides of an upsert', () => {
    expect(() =>
      guard('Invoice', 'upsert', { where: { id: 'i' }, create: { organizationId: org } }),
    ).toThrow(TenantGuardError)
    expect(() =>
      guard('Invoice', 'upsert', { where: { id: 'i', organizationId: org }, create: {} }),
    ).toThrow(/upsert without create.organizationId/)
    expect(() =>
      guard('Invoice', 'upsert', {
        where: { id: 'i', organizationId: org },
        create: { organizationId: org },
        update: {},
      }),
    ).not.toThrow()
  })

  it('fails closed on an unknown operation', () => {
    for (const operation of ['findRaw', 'aggregateRaw', 'somethingPrismaAddsLater']) {
      expect(
        () => guard('Invoice', operation, { where: { organizationId: org } }),
        operation,
      ).toThrow(/is not supported/)
    }
  })

  it('never moves a row to another tenant', () => {
    const where = { id: 'i', organizationId: org }
    for (const operation of ['update', 'updateMany', 'updateManyAndReturn']) {
      expect(
        () => guard('Invoice', operation, { where, data: { organizationId: other } }),
        operation,
      ).toThrow(TenantGuardError)
    }
    expect(() =>
      guard('Invoice', 'upsert', {
        where,
        create: { organizationId: org },
        update: { organizationId: other },
      }),
    ).toThrow(TenantGuardError)
  })

  it('checks connect and set at every nested position', () => {
    const positions: Record<string, (product: unknown) => unknown> = {
      create: (product) => ({ create: { product } }),
      'createMany.data': (product) => ({ createMany: { data: [{ product }] } }),
      update: (product) => ({ update: { where: { id: 'i1' }, data: { product } } }),
      'upsert.create': (product) => ({
        upsert: { where: { id: 'i1' }, create: { product }, update: {} },
      }),
      'upsert.update': (product) => ({
        upsert: { where: { id: 'i1' }, create: {}, update: { product } },
      }),
      'connectOrCreate.create': (product) => ({
        connectOrCreate: { where: { id: 'i1', organizationId: org }, create: { product } },
      }),
    }
    const unscoped = { connect: { connect: { id: 'p' } }, set: { set: [{ id: 'p' }] } }
    const scoped = {
      connect: { connect: { id: 'p', organizationId: org } },
      set: { set: [{ id: 'p', organizationId: org }] },
    }
    const update = (items: unknown) =>
      guard('Invoice', 'update', { where: { id: 'i', organizationId: org }, data: { items } })

    for (const [position, wrap] of Object.entries(positions)) {
      for (const operation of ['connect', 'set'] as const) {
        const label = `${position} ${operation}`
        expect(() => update(wrap(unscoped[operation])), label).toThrow(TenantGuardError)
        expect(() => update(wrap(scoped[operation])), label).not.toThrow()
      }
    }
  })

  it('checks connects inside nested creates, connectOrCreate and set', () => {
    const create = (items: unknown) =>
      guard('Invoice', 'create', { data: { organizationId: org, items } })

    expect(() => create({ connectOrCreate: { where: { id: 'i' }, create: {} } })).toThrow(
      /items.connectOrCreate on Item/,
    )
    expect(() =>
      create({ connectOrCreate: { where: { id: 'i', organizationId: org }, create: {} } }),
    ).not.toThrow()
  })

  it('allows connecting non-scoped models such as Organization', () => {
    expect(() =>
      guard('Invoice', 'update', {
        where: { id: 'i', organizationId: org },
        data: { organization: { connect: { id: org } } },
      }),
    ).not.toThrow()
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps } from '../../test/app.ts'
import { withTwoTenants } from '../../test/factories.ts'
import type { Deps } from '../dependencies.ts'
import { Prisma } from '../generated/prisma/client.ts'
import type { RequestContext } from '../shared/request-context.ts'
import {
  createDatabase,
  createTenantGuard,
  type Database,
  readModels,
  TenantGuardError,
} from './database.ts'

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

// The 13 where-operations, each without organizationId.
function whereOperationCalls(
  db: Database,
  id: string,
  name: string,
): Record<(typeof WHERE_OPERATIONS)[number], () => Promise<unknown>> {
  const byId = { id }
  const byName = { name }
  return {
    findUnique: () => db.example.findUnique({ where: byId }),
    findUniqueOrThrow: () => db.example.findUniqueOrThrow({ where: byId }),
    findFirst: () => db.example.findFirst({ where: byName }),
    findFirstOrThrow: () => db.example.findFirstOrThrow({ where: byName }),
    findMany: () => db.example.findMany({ where: byName }),
    update: () => db.example.update({ where: byId, data: { name: 'changed' } }),
    updateMany: () => db.example.updateMany({ where: byName, data: { name: 'changed' } }),
    updateManyAndReturn: () =>
      db.example.updateManyAndReturn({ where: byName, data: { name: 'changed' } }),
    delete: () => db.example.delete({ where: byId }),
    deleteMany: () => db.example.deleteMany({ where: byName }),
    count: () => db.example.count({ where: byName }),
    aggregate: () => db.example.aggregate({ where: byName, _count: true }),
    groupBy: () => db.example.groupBy({ by: ['name'], where: byName }),
  }
}

describe('tenant guard on the database client', () => {
  it('rejects before sending any SQL', async () => {
    // Nothing listens on port 1: any query that reached the driver would fail to connect instead.
    const unreachable = createDatabase('postgresql://guard:guard@127.0.0.1:1/unreachable')
    const calls = whereOperationCalls(unreachable, '01a0c4ee-0000-7000-8000-000000000001', 'x')

    for (const operation of WHERE_OPERATIONS) {
      const error = await calls[operation]().catch((caught: unknown) => caught)
      expect(error, operation).toBeInstanceOf(TenantGuardError)
    }
    await unreachable.$disconnect()
  })

  it('rejects every where-operation on the client and changes no rows', async () => {
    const example = await createExample(tenantA, 'untouchable')
    const before = await examplesOf(tenantA)
    const calls = whereOperationCalls(deps.db, example.id, 'untouchable')

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

  it('rejects moving a row through the organization relation', async () => {
    const example = await createExample(tenantA, 'stays-in-a-2')
    const where = { id: example.id, organizationId: tenantA.organizationId }
    const toB = { organization: { connect: { id: tenantB.organizationId } } }

    await expect(deps.db.example.update({ where, data: toB })).rejects.toThrow(TenantGuardError)
    await expect(
      deps.db.example.upsert({
        where,
        create: { organizationId: tenantA.organizationId, name: 'stays-in-a-2' },
        update: toB,
      }),
    ).rejects.toThrow(TenantGuardError)

    const reloaded = await deps.db.example.findUnique({ where })
    expect(reloaded?.organizationId).toBe(tenantA.organizationId)
  })

  it('rejects moving rows into an organization through its relation', async () => {
    const rowOfB = await createExample(tenantB, 'stays-in-b')

    await expect(
      deps.db.organization.update({
        where: { id: tenantA.organizationId },
        data: { examples: { connect: { id: rowOfB.id } } },
      }),
    ).rejects.toThrow(TenantGuardError)

    const reloaded = await deps.db.example.findUnique({
      where: { id: rowOfB.id, organizationId: tenantB.organizationId },
    })
    expect(reloaded?.organizationId).toBe(tenantB.organizationId)
  })

  it('allows select of relations under a tenant filter', async () => {
    const parent = await createExample(tenantA, 'parent-with-selected-child')
    await createExample(tenantA, 'child-s', parent.id)

    const loaded = await deps.db.example.findFirst({
      where: { id: parent.id, organizationId: tenantA.organizationId },
      select: { children: { select: { name: true, organizationId: true } } },
    })

    expect(loaded?.children).toEqual([{ name: 'child-s', organizationId: tenantA.organizationId }])
    await expect(
      deps.db.example.findFirst({
        where: { id: parent.id },
        select: { children: { select: { name: true } } },
      }),
    ).rejects.toThrow(TenantGuardError)
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
  // Invoice → Item → Product (tenant-scoped); Invoice and Item → Organization; Organization → Invoice.
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
      [
        'Item',
        {
          tenantScoped: true,
          relations: new Map([
            ['product', 'Product'],
            ['organization', 'Organization'],
          ]),
        },
      ],
      ['Product', { tenantScoped: true, relations: new Map() }],
      ['Organization', { tenantScoped: false, relations: new Map([['invoices', 'Invoice']]) }],
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

  it('never writes the tenant relation', () => {
    const where = { id: 'i', organizationId: org }
    const relationOperations = {
      connect: { connect: { id: other } },
      connectOrCreate: { connectOrCreate: { where: { id: other }, create: { name: 'x' } } },
      create: { create: { name: 'x' } },
      update: { update: { name: 'x' } },
      upsert: { upsert: { create: { name: 'x' }, update: { name: 'x' } } },
      disconnect: { disconnect: true },
    }

    for (const [operation, organization] of Object.entries(relationOperations)) {
      for (const path of ['update', 'updateMany', 'updateManyAndReturn']) {
        expect(
          () => guard('Invoice', path, { where, data: { organization } }),
          `${path} ${operation}`,
        ).toThrow(TenantGuardError)
      }
      expect(
        () =>
          guard('Invoice', 'upsert', {
            where,
            create: { organizationId: org },
            update: { organization },
          }),
        `upsert.update ${operation}`,
      ).toThrow(TenantGuardError)
      expect(
        () =>
          guard('Invoice', 'update', {
            where,
            data: { items: { update: { where: { id: 'i1' }, data: { organization } } } },
          }),
        `nested update ${operation}`,
      ).toThrow(TenantGuardError)
    }
  })

  it('rejects nested writes into tenant-scoped relations from unguarded models', () => {
    const nestedOperations = [
      'connect',
      'connectOrCreate',
      'create',
      'createMany',
      'set',
      'update',
      'updateMany',
      'upsert',
      'delete',
      'deleteMany',
      'disconnect',
    ]
    for (const operation of nestedOperations) {
      const invoices = { [operation]: { id: 'i', organizationId: org } }
      expect(
        () => guard('Organization', 'create', { data: { name: 'x', invoices } }),
        `create ${operation}`,
      ).toThrow(TenantGuardError)
      expect(
        () => guard('Organization', 'update', { where: { id: org }, data: { invoices } }),
        `update ${operation}`,
      ).toThrow(TenantGuardError)
      expect(
        () =>
          guard('Organization', 'upsert', {
            where: { id: org },
            create: { name: 'x' },
            update: { invoices },
          }),
        `upsert ${operation}`,
      ).toThrow(TenantGuardError)
    }

    expect(() =>
      guard('Organization', 'update', { where: { id: org }, data: { name: 'Nova' } }),
    ).not.toThrow()
  })

  it('checks connectOrCreate at every nested position', () => {
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
    const update = (items: unknown) =>
      guard('Invoice', 'update', { where: { id: 'i', organizationId: org }, data: { items } })
    const unscoped = { connectOrCreate: { where: { id: 'p' }, create: { organizationId: org } } }
    const scoped = {
      connectOrCreate: { where: { id: 'p', organizationId: org }, create: { organizationId: org } },
    }

    for (const [position, wrap] of Object.entries(positions)) {
      expect(() => update(wrap(unscoped)), position).toThrow(TenantGuardError)
      expect(() => update(wrap(scoped)), position).not.toThrow()
    }
  })
})

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

  it('rejects the round 2 cross-tenant paths and moves no row', async () => {
    const rowA = await createExample(tenantA, 'r3-row-a')
    const rowB = await createExample(tenantB, 'r3-row-b')
    const beforeA = (await examplesOf(tenantA)).map((row) => row.id)
    const beforeB = (await examplesOf(tenantB)).map((row) => row.id)
    const whereA = { id: rowA.id, organizationId: tenantA.organizationId }
    const toB = { id: rowB.id, organizationId: tenantB.organizationId }
    const B = tenantB.organizationId
    const A = tenantA.organizationId

    const paths: Record<string, () => Promise<unknown>> = {
      'parent.connect': () =>
        deps.db.example.update({ where: whereA, data: { parent: { connect: toB } } }),
      'parent.connectOrCreate': () =>
        deps.db.example.update({
          where: whereA,
          data: {
            parent: { connectOrCreate: { where: toB, create: { name: 'n4', organizationId: B } } },
          },
        }),
      'parent.create': () =>
        deps.db.example.update({
          where: whereA,
          data: { parent: { create: { name: 'n3', organizationId: B } } },
        }),
      'parent.upsert': () =>
        deps.db.example.update({
          where: whereA,
          data: {
            parent: {
              upsert: { create: { name: 'n5', organizationId: B }, update: { organizationId: B } },
            },
          },
        }),
      'parent.update': () =>
        deps.db.example.update({
          where: whereA,
          data: { parent: { update: { organizationId: B } } },
        }),
      'children.connect': () =>
        deps.db.example.update({ where: whereA, data: { children: { connect: toB } } }),
      'children.set': () =>
        deps.db.example.update({ where: whereA, data: { children: { set: [toB] } } }),
      'children.connectOrCreate': () =>
        deps.db.example.update({
          where: whereA,
          data: { children: { connectOrCreate: { where: toB, create: { name: 'n16' } } } },
        }),
      'create children.connect': () =>
        deps.db.example.create({
          data: { name: 'n17', organizationId: A, children: { connect: toB } },
        }),
      'upsert.create children.connect': () =>
        deps.db.example.upsert({
          where: { id: '01a0c4ee-0000-7000-8000-00000000abcd', organizationId: A },
          create: { name: 'n23', organizationId: A, children: { connect: toB } },
          update: {},
        }),
    }

    for (const [path, call] of Object.entries(paths)) {
      await expect(call(), path).rejects.toThrow(TenantGuardError)
    }

    expect((await examplesOf(tenantA)).map((row) => row.id)).toEqual(beforeA)
    expect((await examplesOf(tenantB)).map((row) => row.id)).toEqual(beforeB)
  })

  it('links rows only through the scalar foreign key', async () => {
    const parentA = await createExample(tenantA, 'r3-parent-a')
    const child = await createExample(tenantA, 'r3-child')
    const rowB = await createExample(tenantB, 'r3-parent-b')
    const where = { id: child.id, organizationId: tenantA.organizationId }

    const linked = await deps.db.example.update({ where, data: { parentId: parentA.id } })
    expect(linked.parentId).toBe(parentA.id)

    const error = await deps.db.example
      .update({ where, data: { parentId: rowB.id } })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect(error).toMatchObject({ code: 'P2003' })
    expect((await deps.db.example.findUnique({ where }))?.parentId).toBe(parentA.id)
  })

  it('rejects cross-tenant reads through Organization on the client', async () => {
    await expect(deps.db.organization.findMany({ include: { examples: true } })).rejects.toThrow(
      TenantGuardError,
    )
    await expect(
      deps.db.organization.findMany({ where: { examples: { some: { name: 'r3-row-b' } } } }),
    ).rejects.toThrow(TenantGuardError)
    await expect(
      deps.db.example.findFirst({
        where: { organizationId: tenantA.organizationId },
        include: { organization: { include: { examples: true } } },
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
  // Invoice → Item → Product (tenant-scoped); Invoice and Item → Organization; Invoice → User.
  // Organization and User have no organizationId and relate back to Invoice.
  const guard = createTenantGuard(
    new Map([
      [
        'Invoice',
        {
          tenantScoped: true,
          relations: new Map([
            ['items', 'Item'],
            ['organization', 'Organization'],
            ['owner', 'User'],
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
      ['User', { tenantScoped: false, relations: new Map([['invoices', 'Invoice']]) }],
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

  it('rejects every nested write into a tenant-scoped relation', () => {
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
    const where = { id: 'i', organizationId: org }
    // Each position receives `{ items: … }` or `{ invoices: … }` and returns the guard call.
    const positions: Record<string, (write: unknown) => () => void> = {
      'tenant create.data': (items) => () =>
        guard('Invoice', 'create', { data: { organizationId: org, items } }),
      'tenant update.data': (items) => () => guard('Invoice', 'update', { where, data: { items } }),
      'tenant upsert.create': (items) => () =>
        guard('Invoice', 'upsert', { where, create: { organizationId: org, items }, update: {} }),
      'tenant upsert.update': (items) => () =>
        guard('Invoice', 'upsert', { where, create: { organizationId: org }, update: { items } }),
      'unguarded create.data': (invoices) => () =>
        guard('User', 'create', { data: { name: 'x', invoices } }),
      'unguarded upsert.create': (invoices) => () =>
        guard('User', 'upsert', { where: { id: 'u' }, create: { invoices }, update: {} }),
      'under an unguarded node': (invoices) => () =>
        guard('Invoice', 'update', { where, data: { owner: { update: { invoices } } } }),
    }

    for (const operation of nestedOperations) {
      // Carrying the query's own tenant does not make a nested write acceptable.
      const write = { [operation]: { id: 'x', organizationId: org } }
      for (const [position, call] of Object.entries(positions)) {
        expect(call(write), `${position} ${operation}`).toThrow(TenantGuardError)
      }
    }
  })

  it('rejects reading tenant-scoped relations through unguarded models', () => {
    const rejected: Record<string, [string, string, unknown]> = {
      include: ['User', 'findMany', { include: { invoices: true } }],
      select: ['User', 'findMany', { select: { invoices: { select: { id: true } } } }],
      _count: ['User', 'findMany', { select: { _count: { select: { invoices: true } } } }],
      'where relation': ['User', 'findMany', { where: { invoices: { some: { number: '1' } } } }],
      'where AND': ['User', 'findMany', { where: { AND: [{ invoices: { none: {} } }] } }],
      'where OR': ['User', 'findMany', { where: { OR: [{ invoices: { every: {} } }] } }],
      'where NOT': ['User', 'findMany', { where: { NOT: { invoices: { some: {} } } } }],
      orderBy: ['User', 'findMany', { orderBy: { invoices: { _count: 'desc' } } }],
      'via an unguarded node': [
        'Invoice',
        'findFirst',
        { where: { organizationId: org }, include: { owner: { include: { invoices: true } } } },
      ],
      'via an unguarded node (select)': [
        'Invoice',
        'findFirst',
        {
          where: { organizationId: org },
          select: { organization: { select: { invoices: true } } },
        },
      ],
    }
    for (const [label, [model, operation, args]] of Object.entries(rejected)) {
      expect(() => guard(model, operation, args), label).toThrow(TenantGuardError)
    }

    expect(() =>
      guard('Invoice', 'findFirst', {
        where: { organizationId: org },
        include: { items: { include: { product: true } }, owner: true },
      }),
    ).not.toThrow()
    expect(() =>
      guard('Organization', 'findMany', { where: { name: 'x' }, select: { id: true } }),
    ).not.toThrow()
  })

  it('fails closed on an unknown model', () => {
    expect(() => guard('Ghost', 'findMany', { where: { organizationId: org } })).toThrow(
      /Unknown model/,
    )
  })
})

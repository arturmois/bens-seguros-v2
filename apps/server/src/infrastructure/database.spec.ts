import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps } from '../../test/app.ts'
import { withTwoTenants } from '../../test/factories.ts'
import { ownerDatabaseUrl, withOwnerClient } from '../../test/setup-db.ts'
import type { Deps } from '../dependencies.ts'
import { Prisma } from '../generated/prisma/client.ts'
import type { RequestContext } from '../shared/request-context.ts'
import { createDatabase, RowSecurityBypassError } from './database.ts'

let deps: Deps
let tenantA: RequestContext
let tenantB: RequestContext

beforeAll(async () => {
  deps = await createTestDeps()
  ;({ tenantA, tenantB } = await withTwoTenants(deps.db))
})

afterAll(() => deps.db.$disconnect())

function createExample(ctx: RequestContext, name: string, parentId?: string) {
  return deps.db.withTenant(ctx, (tx) =>
    tx.example.create({ data: { name, parentId: parentId ?? null } }),
  )
}

// Every row of a tenant, read as that tenant: [id, organizationId, parentId].
async function snapshot(ctx: RequestContext) {
  const rows = await deps.db.withTenant(ctx, (tx) =>
    tx.example.findMany({ orderBy: { id: 'asc' } }),
  )
  return rows.map((row) => [row.id, row.organizationId, row.parentId])
}

async function errorOf(run: () => Promise<unknown>) {
  return run().then(
    () => undefined,
    (error: unknown) => error,
  )
}

function prismaCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined
}

describe('row level security', () => {
  it('reads only the tenant rows in every read shape', async () => {
    const rowA = await createExample(tenantA, 'read-a')
    const rowB = await createExample(tenantB, 'read-b')
    const reads = await deps.db.withTenant(tenantA, async (tx) => ({
      findMany: await tx.example.findMany(),
      findUnique: await tx.example.findUnique({ where: { id: rowB.id } }),
      count: await tx.example.count({ where: { id: rowB.id } }),
      aggregate: await tx.example.aggregate({ where: { id: rowB.id }, _count: true }),
      groupBy: await tx.example.groupBy({ by: ['organizationId'] }),
      include: await tx.organization.findMany({
        where: { id: { in: [tenantA.organizationId, tenantB.organizationId] } },
        include: { examples: true },
      }),
      countRelation: await tx.organization.findMany({
        where: { id: tenantB.organizationId },
        include: { _count: true },
      }),
      raw: await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Example"`,
    }))

    expect(reads.findMany.map((row) => row.organizationId)).not.toContain(tenantB.organizationId)
    expect(reads.findMany.map((row) => row.id)).toContain(rowA.id)
    expect(reads.findUnique).toBeNull()
    expect(reads.count).toBe(0)
    expect(reads.aggregate._count).toBe(0)
    expect(reads.groupBy.map((group) => group.organizationId)).toEqual([tenantA.organizationId])
    expect(
      reads.include.flatMap((org) => org.examples.map((row) => row.organizationId)),
    ).not.toContain(tenantB.organizationId)
    expect(reads.countRelation[0]?._count.examples).toBe(0)
    expect(reads.raw.map((row) => row.id)).not.toContain(rowB.id)
    expect(reads.raw.map((row) => row.id)).toContain(rowA.id)
  })

  it('rejects every write into another tenant', async () => {
    const rowA = await createExample(tenantA, 'write-a')
    const parentA = await createExample(tenantA, 'write-parent-a')
    const before = [await snapshot(tenantA), await snapshot(tenantB)]
    const B = tenantB.organizationId
    const writes: Record<string, () => Promise<unknown>> = {
      create: () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.example.create({ data: { organizationId: B, name: 'w1' } }),
        ),
      'update scalar': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.example.update({ where: { id: rowA.id }, data: { organizationId: B } }),
        ),
      'updateMany scalar': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.example.updateMany({ where: { id: rowA.id }, data: { organizationId: B } }),
        ),
      'organization.connect': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.example.update({
            where: { id: rowA.id },
            data: { organization: { connect: { id: B } } },
          }),
        ),
      'upsert create': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.example.upsert({
            where: { id: '01a0c4ee-0000-7000-8000-00000000abcd' },
            create: { organizationId: B, name: 'w4' },
            update: {},
          }),
        ),
      'children.create': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.example.update({
            where: { id: parentA.id },
            data: { children: { create: { name: 'w5', organization: { connect: { id: B } } } } },
          }),
        ),
    }

    // Prisma absorbs these: the nested child inherits the parent's tenant through the composite FK.
    const landsInA = new Set(['children.create'])
    for (const [write, run] of Object.entries(writes)) {
      const error = await errorOf(run)
      if (landsInA.has(write)) expect(error, write).toBeUndefined()
      else expect(prismaCode(error), write).toBe('P2039')
    }
    const [afterA, afterB] = [await snapshot(tenantA), await snapshot(tenantB)]
    expect(afterB).toEqual(before[1])
    expect(afterA.every(([, organizationId]) => organizationId === tenantA.organizationId)).toBe(
      true,
    )
    expect(afterA.filter(([id]) => !before[0]?.some(([seen]) => seen === id))).toHaveLength(1)
  })

  it("cannot link or move another tenant's row", async () => {
    const rowA = await createExample(tenantA, 'link-a')
    const rowB = await createExample(tenantB, 'link-b')
    const before = [await snapshot(tenantA), await snapshot(tenantB)]
    const byB = { id: rowB.id, organizationId: tenantB.organizationId }
    const references: Record<string, () => Promise<unknown>> = {
      'parent.connect': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.example.update({ where: { id: rowA.id }, data: { parent: { connect: byB } } }),
        ),
      'children.connect': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.example.update({ where: { id: rowA.id }, data: { children: { connect: byB } } }),
        ),
      'children.set': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.example.update({ where: { id: rowA.id }, data: { children: { set: [byB] } } }),
        ),
      'children.connectOrCreate': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.example.update({
            where: { id: rowA.id },
            data: { children: { connectOrCreate: { where: byB, create: { name: 'link-c' } } } },
          }),
        ),
      'organization examples.set': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.organization.update({
            where: { id: tenantA.organizationId },
            data: { examples: { set: [{ id: rowB.id }] } },
          }),
        ),
      'organization examples.connectOrCreate': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.organization.update({
            where: { id: tenantA.organizationId },
            data: {
              examples: { connectOrCreate: { where: { id: rowB.id }, create: { name: 'link-o' } } },
            },
          }),
        ),
      'organization examples.connect': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.organization.update({
            where: { id: tenantA.organizationId },
            data: { examples: { connect: { id: rowB.id } } },
          }),
        ),
    }

    // What PostgreSQL + Prisma answer for each shape. `undefined`: the row of B is invisible, so
    // `set` ends with no children and `connectOrCreate` creates a new row in A — neither touches B.
    const expected: Record<string, string | undefined> = {
      'parent.connect': 'P2025',
      'children.connect': 'P2018',
      'children.set': undefined,
      'children.connectOrCreate': undefined,
      'organization examples.set': 'P2014',
      'organization examples.connectOrCreate': undefined,
      'organization examples.connect': 'P2018',
    }
    expect(Object.keys(references).sort()).toEqual(Object.keys(expected).sort())
    for (const [reference, run] of Object.entries(references)) {
      const error = await errorOf(run)
      const code = expected[reference]
      if (code === undefined) expect(error, reference).toBeUndefined()
      else expect(prismaCode(error), reference).toBe(code)
    }
    const [afterA, afterB] = [await snapshot(tenantA), await snapshot(tenantB)]
    expect(afterB).toEqual(before[1])
    expect(afterA.every(([, organizationId]) => organizationId === tenantA.organizationId)).toBe(
      true,
    )
    // Existing rows of A kept their tenant and parent; only the connectOrCreate rows are new.
    expect(afterA.filter(([id]) => before[0]?.some(([seen]) => seen === id))).toEqual(before[0])
  })

  it('fails outside withTenant', async () => {
    await createExample(tenantA, 'outside-a')
    const before = await snapshot(tenantA)

    await expect(deps.db.example.findMany()).rejects.toThrow()
    await expect(deps.db.example.count()).rejects.toThrow()
    await expect(
      deps.db.example.create({ data: { organizationId: tenantA.organizationId, name: 'outside' } }),
    ).rejects.toThrow()

    expect(await snapshot(tenantA)).toEqual(before)
  })

  it('fills organizationId from the tenant', async () => {
    const created = await createExample(tenantA, 'default-tenant')

    expect(created.organizationId).toBe(tenantA.organizationId)
  })

  it('links rows only within the tenant', async () => {
    const parentA = await createExample(tenantA, 'scalar-parent-a')
    const child = await createExample(tenantA, 'scalar-child')
    const rowB = await createExample(tenantB, 'scalar-parent-b')

    const linked = await deps.db.withTenant(tenantA, (tx) =>
      tx.example.update({ where: { id: child.id }, data: { parentId: parentA.id } }),
    )
    expect(linked.parentId).toBe(parentA.id)

    const error = await errorOf(() =>
      deps.db.withTenant(tenantA, (tx) =>
        tx.example.update({ where: { id: child.id }, data: { parentId: rowB.id } }),
      ),
    )
    expect(prismaCode(error)).toBe('P2003')
    const reloaded = await deps.db.withTenant(tenantA, (tx) =>
      tx.example.findUnique({ where: { id: child.id } }),
    )
    expect(reloaded?.parentId).toBe(parentA.id)
  })

  it('does not leak the tenant to the next transaction', async () => {
    await createExample(tenantB, 'leak-b')
    for (let i = 0; i < 5; i++) {
      await deps.db.withTenant(tenantA, (tx) => tx.example.count())
      await errorOf(() =>
        deps.db.withTenant(tenantA, async () => {
          throw new Error('rollback')
        }),
      )
    }

    for (let i = 0; i < 10; i++) {
      await expect(deps.db.example.count(), `outside #${i}`).rejects.toThrow()
    }
    const asB = await deps.db.withTenant(tenantB, (tx) => tx.example.findMany())
    expect(asB.length).toBeGreaterThan(0)
    expect(asB.every((row) => row.organizationId === tenantB.organizationId)).toBe(true)
  })

  it('connects as the application role', async () => {
    const [role] = await deps.db.$queryRaw<
      { name: string; superuser: boolean; bypassRls: boolean }[]
    >`SELECT rolname AS name, rolsuper AS superuser, rolbypassrls AS "bypassRls"
      FROM pg_roles WHERE rolname = current_user`
    expect(role).toEqual({ name: 'bens_app', superuser: false, bypassRls: false })
    await expect(deps.db.assertRowSecurityApplies()).resolves.toBeUndefined()

    await deps.queue.start()
    const bossSchema = `${new URL(deps.config.DATABASE_URL).searchParams.get('schema')}_pgboss`
    const [schema] = await deps.db.$queryRaw<{ owner: string }[]>`
      SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = ${bossSchema}`
    expect(schema?.owner).toBe('bens_app')
    await deps.queue.stop()

    const prismaConfig = readFileSync(new URL('../../prisma.config.ts', import.meta.url), 'utf8')
    expect(prismaConfig).toContain('process.env.MIGRATION_DATABASE_URL')
  })

  it('does not reach tenant rows through Organization', async () => {
    await createExample(tenantB, 'cascade-b')
    const before = await snapshot(tenantB)
    const attempts: Record<string, () => Promise<unknown>> = {
      'delete in tenant A': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.organization.delete({ where: { id: tenantB.organizationId } }),
        ),
      'change id in tenant A': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.organization.update({
            where: { id: tenantB.organizationId },
            data: { id: '01a0c4ee-0000-7000-8000-00000000beef' },
          }),
        ),
      'delete outside withTenant': () =>
        deps.db.organization.delete({ where: { id: tenantB.organizationId } }),
      'change id outside withTenant': () =>
        deps.db.organization.update({
          where: { id: tenantB.organizationId },
          data: { id: '01a0c4ee-0000-7000-8000-00000000cafe' },
        }),
    }

    for (const [attempt, run] of Object.entries(attempts)) {
      expect(prismaCode(await errorOf(run)), attempt).toBe('P2003')
    }
    expect(await snapshot(tenantB)).toEqual(before)
  })

  it('refuses every role that bypasses row security', async () => {
    const probe = 'bens_bypass_probe'
    const probeUrl = new URL(ownerDatabaseUrl())
    probeUrl.username = probe
    probeUrl.password = probe
    await withOwnerClient(async (client) => {
      await client.query(`DROP ROLE IF EXISTS ${probe}`)
      await client.query(`CREATE ROLE ${probe} LOGIN PASSWORD '${probe}' BYPASSRLS NOSUPERUSER`)
    })
    const bypass = createDatabase(probeUrl.toString())
    const owner = createDatabase(ownerDatabaseUrl())
    try {
      await expect(bypass.assertRowSecurityApplies()).rejects.toThrow(RowSecurityBypassError)
      await expect(owner.assertRowSecurityApplies()).rejects.toThrow(RowSecurityBypassError)
      await expect(deps.db.assertRowSecurityApplies()).resolves.toBeUndefined()
    } finally {
      await Promise.all([bypass.$disconnect(), owner.$disconnect()])
      await withOwnerClient((client) => client.query(`DROP ROLE ${probe}`))
    }
  })
})

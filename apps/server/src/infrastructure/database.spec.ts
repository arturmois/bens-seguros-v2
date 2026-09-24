import { randomUUID } from 'node:crypto'
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

function createUser() {
  return deps.db.user.create({
    data: { name: 'Membro', email: `${randomUUID()}@example.com` },
  })
}

function createMember(ctx: RequestContext, userId: string) {
  return deps.db.withTenant(ctx, (tx) => tx.member.create({ data: { userId, role: 'COMMERCIAL' } }))
}

async function snapshot(ctx: RequestContext) {
  const rows = await deps.db.withTenant(ctx, (tx) => tx.member.findMany({ orderBy: { id: 'asc' } }))
  return rows.map((row) => [row.id, row.organizationId, row.userId])
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
    const userA = await createUser()
    const userB = await createUser()
    const rowA = await createMember(tenantA, userA.id)
    const rowB = await createMember(tenantB, userB.id)
    const reads = await deps.db.withTenant(tenantA, async (tx) => ({
      findMany: await tx.member.findMany(),
      findUnique: await tx.member.findUnique({ where: { id: rowB.id } }),
      count: await tx.member.count({ where: { id: rowB.id } }),
      aggregate: await tx.member.aggregate({ where: { id: rowB.id }, _count: true }),
      groupBy: await tx.member.groupBy({ by: ['organizationId'] }),
      include: await tx.organization.findMany({
        where: { id: { in: [tenantA.organizationId, tenantB.organizationId] } },
        include: { members: true },
      }),
      raw: await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Member"`,
    }))

    expect(reads.findMany.map((row) => row.organizationId)).not.toContain(tenantB.organizationId)
    expect(reads.findMany.map((row) => row.id)).toContain(rowA.id)
    expect(reads.findUnique).toBeNull()
    expect(reads.count).toBe(0)
    expect(reads.aggregate._count).toBe(0)
    expect(reads.groupBy.map((group) => group.organizationId)).toEqual([tenantA.organizationId])
    expect(
      reads.include.flatMap((org) => org.members.map((row) => row.organizationId)),
    ).not.toContain(tenantB.organizationId)
    expect(reads.raw.map((row) => row.id)).not.toContain(rowB.id)
    expect(reads.raw.map((row) => row.id)).toContain(rowA.id)
  })

  it('hides the other tenant member and fails with no tenant set', async () => {
    const userA = await createUser()
    const userB = await createUser()
    const rowA = await createMember(tenantA, userA.id)
    const rowB = await createMember(tenantB, userB.id)

    const visible = await deps.db.withTenant(tenantA, (tx) => tx.member.findMany())
    expect(visible.map((row) => row.id)).toContain(rowA.id)
    expect(visible.map((row) => row.id)).not.toContain(rowB.id)

    await expect(deps.db.member.findMany()).rejects.toThrow()
    await expect(deps.db.withoutTenant((tx) => tx.member.findMany())).rejects.toThrow()
  })

  it('reads an invitation by token hash and hides the other tenant', async () => {
    const hashA = `${randomUUID()}${randomUUID()}`.replaceAll('-', '')
    const hashB = `${randomUUID()}${randomUUID()}`.replaceAll('-', '')
    const expiresAt = new Date(Date.now() + 86_400_000)
    const rowA = await deps.db.withTenant(tenantA, (tx) =>
      tx.invitation.create({
        data: {
          email: `${randomUUID()}@example.com`,
          role: 'COMMERCIAL',
          tokenHash: hashA,
          expiresAt,
        },
      }),
    )
    await deps.db.withTenant(tenantB, (tx) =>
      tx.invitation.create({
        data: {
          email: `${randomUUID()}@example.com`,
          role: 'COMMERCIAL',
          tokenHash: hashB,
          expiresAt,
        },
      }),
    )

    const byToken = await deps.db.withInvitation(hashA, (tx) =>
      tx.invitation.findFirst({ where: { tokenHash: hashA } }),
    )
    const otherHash = await deps.db.withInvitation(hashA, (tx) =>
      tx.invitation.findFirst({ where: { tokenHash: hashB } }),
    )
    const fromA = await deps.db.withTenant(tenantA, (tx) => tx.invitation.findMany())

    expect(byToken?.id).toBe(rowA.id)
    expect(otherHash).toBeNull()
    expect(fromA.map((row) => row.id)).toContain(rowA.id)
    expect(fromA.map((row) => row.tokenHash)).not.toContain(hashB)
    await expect(deps.db.invitation.findMany()).rejects.toThrow()
    await expect(deps.db.withoutTenant((tx) => tx.invitation.findMany())).rejects.toThrow()
    await expect(
      deps.db.withInvitation(hashA, (tx) =>
        tx.invitation.create({
          data: {
            email: `${randomUUID()}@example.com`,
            role: 'COMMERCIAL',
            tokenHash: `${randomUUID()}${randomUUID()}`.replaceAll('-', ''),
            expiresAt,
          },
        }),
      ),
    ).rejects.toThrow()
  })

  it('lists only the caller organizations', async () => {
    const user = await createUser()
    await createMember(tenantA, user.id)
    const other = await deps.db.withTenant(tenantB, (tx) =>
      tx.organization.findUniqueOrThrow({ where: { id: tenantB.organizationId } }),
    )

    const listed = await deps.db.withUser(user.id, (tx) => tx.organization.findMany())

    expect(listed.map((org) => org.id)).toContain(tenantA.organizationId)
    expect(listed.map((org) => org.id)).not.toContain(tenantB.organizationId)
    expect(listed.map((org) => org.name)).not.toContain(other.name)
  })

  it('rejects a cross-tenant member write', async () => {
    const user = await createUser()
    const rowA = await createMember(tenantA, user.id)
    const before = [await snapshot(tenantA), await snapshot(tenantB)]
    const B = tenantB.organizationId
    const writes: Record<string, () => Promise<unknown>> = {
      create: () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.member.create({ data: { organizationId: B, userId: user.id, role: 'COMMERCIAL' } }),
        ),
      'update scalar': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.member.update({ where: { id: rowA.id }, data: { organizationId: B } }),
        ),
      'updateMany scalar': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.member.updateMany({ where: { id: rowA.id }, data: { organizationId: B } }),
        ),
      'organization.connect': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.member.update({
            where: { id: rowA.id },
            data: { organization: { connect: { id: B } } },
          }),
        ),
      'upsert create': () =>
        deps.db.withTenant(tenantA, (tx) =>
          tx.member.upsert({
            where: { id: '01a0c4ee-0000-7000-8000-00000000abcd' },
            create: { organizationId: B, userId: user.id, role: 'COMMERCIAL' },
            update: {},
          }),
        ),
    }

    const expected: Record<string, string> = {
      create: 'P2039',
      'update scalar': 'P2039',
      'updateMany scalar': 'P2039',
      'organization.connect': 'P2025',
      'upsert create': 'P2039',
    }
    for (const [write, run] of Object.entries(writes)) {
      expect(prismaCode(await errorOf(run)), write).toBe(expected[write])
    }
    const [afterA, afterB] = [await snapshot(tenantA), await snapshot(tenantB)]
    expect(afterB).toEqual(before[1])
    expect(afterA).toEqual(before[0])
  })

  it('fails outside withTenant', async () => {
    const user = await createUser()
    await createMember(tenantA, user.id)
    const before = await snapshot(tenantA)

    await expect(deps.db.member.findMany()).rejects.toThrow()
    await expect(deps.db.member.count()).rejects.toThrow()
    await expect(
      deps.db.member.create({
        data: { organizationId: tenantA.organizationId, userId: user.id, role: 'ADMIN' },
      }),
    ).rejects.toThrow()

    expect(await snapshot(tenantA)).toEqual(before)
  })

  it('fills organizationId from the tenant', async () => {
    const user = await createUser()
    const created = await createMember(tenantA, user.id)

    expect(created.organizationId).toBe(tenantA.organizationId)
  })

  it('does not leak the tenant to the next transaction', async () => {
    const user = await createUser()
    await createMember(tenantB, user.id)
    for (let i = 0; i < 5; i++) {
      await deps.db.withTenant(tenantA, (tx) => tx.member.count())
      await errorOf(() =>
        deps.db.withTenant(tenantA, async () => {
          throw new Error('rollback')
        }),
      )
    }

    for (let i = 0; i < 10; i++) {
      await expect(deps.db.member.count(), `outside #${i}`).rejects.toThrow()
    }
    const asB = await deps.db.withTenant(tenantB, (tx) => tx.member.findMany())
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
    const user = await createUser()
    await createMember(tenantB, user.id)
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
      expect(await errorOf(run), attempt).toBeInstanceOf(Error)
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

describe('withoutTenant', () => {
  it('withoutTenant reaches user tables but no tenant table', async () => {
    const before = await snapshot(tenantA)

    const read = await errorOf(() => deps.db.withoutTenant((tx) => tx.member.findMany()))
    const write = await errorOf(() =>
      deps.db.withoutTenant((tx) =>
        tx.member.create({
          data: {
            organizationId: tenantA.organizationId,
            userId: '01a0c4ee-0000-7000-8000-00000000abcd',
            role: 'COMMERCIAL',
          },
        }),
      ),
    )
    const users = await deps.db.withoutTenant((tx) => tx.user.count())

    expect(read).toBeInstanceOf(Error)
    expect(write).toBeInstanceOf(Error)
    expect(await snapshot(tenantA)).toEqual(before)
    expect(users).toBeGreaterThanOrEqual(0)
  })
})

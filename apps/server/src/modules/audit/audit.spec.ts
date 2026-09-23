import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps } from '../../../test/app.ts'
import { withTwoTenants } from '../../../test/factories.ts'
import type { Deps } from '../../dependencies.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { record } from './index.ts'

let deps: Deps
let tenantA: RequestContext
let tenantB: RequestContext

beforeAll(async () => {
  deps = await createTestDeps()
  ;({ tenantA, tenantB } = await withTwoTenants(deps.db))
})

afterAll(() => deps.db.$disconnect())

async function actor() {
  const email = `${randomUUID()}@example.com`
  const user = await deps.db.user.create({ data: { name: 'Ator', email } })
  return { ...tenantA, userId: user.id, email }
}

describe('audit.record', () => {
  it('redacts personal fields and keeps the role', async () => {
    const ctx = await actor()
    await deps.db.withTenant(ctx, (tx) =>
      record(tx, ctx, {
        action: 'member.update',
        entityId: ctx.userId,
        changes: {
          email: ['a@x.com', 'b@y.com'],
          name: 'Maria',
          phone: '11999999999',
          document: '123',
          documentEncrypted: 'cipher',
          token: 'raw',
          password: 'secret',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
          role: ['VIEWER', 'ADMIN'],
          contact: { email: 'nested@x.com', name: 'N', role: 'ADMIN' },
        },
      }),
    )

    const row = await deps.db.withTenant(ctx, (tx) =>
      tx.auditLog.findFirstOrThrow({ where: { actorUserId: ctx.userId } }),
    )
    expect(row.changes).toEqual({
      email: '[alterado]',
      name: '[alterado]',
      phone: '[alterado]',
      document: '[alterado]',
      documentEncrypted: '[alterado]',
      token: '[alterado]',
      password: '[alterado]',
      ipAddress: '[alterado]',
      userAgent: '[alterado]',
      role: ['VIEWER', 'ADMIN'],
      contact: { email: '[alterado]', name: '[alterado]', role: 'ADMIN' },
    })
  })

  it('stores the actor user id and not the email', async () => {
    const ctx = await actor()
    await deps.db.withTenant(ctx, (tx) =>
      record(tx, ctx, {
        action: 'member.update',
        entityId: ctx.userId,
        changes: { role: ['VIEWER', 'ADMIN'] },
      }),
    )

    const row = await deps.db.withTenant(ctx, (tx) =>
      tx.auditLog.findFirstOrThrow({ where: { actorUserId: ctx.userId } }),
    )
    expect(row.actorUserId).toBe(ctx.userId)
    expect(JSON.stringify(row)).not.toContain(ctx.email)
  })

  it('names the key path of an unsupported change', async () => {
    const ctx = await actor()

    await expect(
      deps.db.withTenant(ctx, (tx) =>
        record(tx, ctx, {
          action: 'member.update',
          entityId: ctx.userId,
          changes: { role: ['VIEWER', 'ADMIN'], nested: { value: null } },
        }),
      ),
    ).rejects.toThrow('changes.nested.value')
    await expect(
      deps.db.withTenant(ctx, (tx) =>
        record(tx, ctx, {
          action: 'member.update',
          entityId: ctx.userId,
          changes: { list: [undefined] },
        }),
      ),
    ).rejects.toThrow('changes.list[0]')
    await expect(
      deps.db.withTenant(ctx, (tx) =>
        record(tx, ctx, {
          action: 'member.update',
          entityId: ctx.userId,
          changes: { at: () => 1 },
        }),
      ),
    ).rejects.toThrow('changes.at has unsupported type function')
    const rows = await deps.db.withTenant(ctx, (tx) =>
      tx.auditLog.findMany({ where: { actorUserId: ctx.userId } }),
    )
    expect(rows).toEqual([])
  })

  it('hides an audit log from the other tenant', async () => {
    const ctx = await actor()
    await deps.db.withTenant(ctx, (tx) =>
      record(tx, ctx, {
        action: 'member.update',
        entityId: ctx.userId,
        changes: { role: ['VIEWER', 'ADMIN'] },
      }),
    )

    const hidden = await deps.db.withTenant(tenantB, (tx) => tx.auditLog.findMany())
    const visible = await deps.db.withTenant(ctx, (tx) =>
      tx.auditLog.findMany({ where: { actorUserId: ctx.userId } }),
    )

    expect(hidden).toEqual([])
    expect(visible).toHaveLength(1)
    await expect(deps.db.auditLog.findMany()).rejects.toThrow()
  })
})

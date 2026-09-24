import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps } from '../../../test/app.ts'
import { withTwoTenants } from '../../../test/factories.ts'
import type { Deps } from '../../dependencies.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { AI_ACTOR, record, SYSTEM_ACTOR } from './index.ts'

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
          role: ['COMMERCIAL', 'ADMIN'],
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
      role: ['COMMERCIAL', 'ADMIN'],
      contact: { email: '[alterado]', name: '[alterado]', role: 'ADMIN' },
    })
  })

  it('stores the actor user id and not the email', async () => {
    const ctx = await actor()
    await deps.db.withTenant(ctx, (tx) =>
      record(tx, ctx, {
        action: 'member.update',
        entityId: ctx.userId,
        changes: { role: ['COMMERCIAL', 'ADMIN'] },
      }),
    )

    const row = await deps.db.withTenant(ctx, (tx) =>
      tx.auditLog.findFirstOrThrow({ where: { actorUserId: ctx.userId } }),
    )
    expect(row.actorUserId).toBe(ctx.userId)
    expect(JSON.stringify(row)).not.toContain(ctx.email)
  })

  it('records a user actor', async () => {
    const ctx = await actor()
    const entityId = randomUUID()
    await deps.db.withTenant(ctx, (tx) =>
      record(tx, ctx, { action: 'member.update', entityId, changes: { active: [true, false] } }),
    )

    const row = await deps.db.withTenant(ctx, (tx) =>
      tx.auditLog.findFirstOrThrow({ where: { entityId } }),
    )
    expect(row).toMatchObject({ actorType: 'USER', actorUserId: ctx.userId })
  })

  it('records the system actor without a user', async () => {
    const entityId = randomUUID()
    await deps.db.withTenant(tenantA, (tx) =>
      record(tx, SYSTEM_ACTOR, {
        action: 'conversation.reopen',
        entityId,
        changes: { status: ['CLOSED', 'OPEN'] },
      }),
    )

    const row = await deps.db.withTenant(tenantA, (tx) =>
      tx.auditLog.findFirstOrThrow({ where: { entityId } }),
    )
    expect(row).toMatchObject({ actorType: 'SYSTEM', actorUserId: null })
  })

  it('records the ai actor without a user', async () => {
    const entityId = randomUUID()
    await deps.db.withTenant(tenantA, (tx) =>
      record(tx, AI_ACTOR, {
        action: 'conversation.reopen',
        entityId,
        changes: { handler: ['AI', 'QUEUE'] },
      }),
    )

    const row = await deps.db.withTenant(tenantA, (tx) =>
      tx.auditLog.findFirstOrThrow({ where: { entityId } }),
    )
    expect(row).toMatchObject({ actorType: 'AI', actorUserId: null })
  })

  it('redacts message text and phone for any actor', async () => {
    const entityId = randomUUID()
    await deps.db.withTenant(tenantA, (tx) =>
      record(tx, SYSTEM_ACTOR, {
        action: 'conversation.reopen',
        entityId,
        changes: {
          text: 'olá',
          phoneE164: '+5511987654321',
          nested: { text: 'x', phoneE164: '+5511987654321', status: ['CLOSED', 'OPEN'] },
        },
      }),
    )

    const row = await deps.db.withTenant(tenantA, (tx) =>
      tx.auditLog.findFirstOrThrow({ where: { entityId } }),
    )
    expect(row.changes).toEqual({
      text: '[alterado]',
      phoneE164: '[alterado]',
      nested: { text: '[alterado]', phoneE164: '[alterado]', status: ['CLOSED', 'OPEN'] },
    })
  })

  it('names the key path of an unsupported change', async () => {
    const ctx = await actor()

    await expect(
      deps.db.withTenant(ctx, (tx) =>
        record(tx, ctx, {
          action: 'member.update',
          entityId: ctx.userId,
          changes: { role: ['COMMERCIAL', 'ADMIN'], nested: { value: null } },
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
        changes: { role: ['COMMERCIAL', 'ADMIN'] },
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

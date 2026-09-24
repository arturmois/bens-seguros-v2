import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../../test/app.ts'
import { signedInUser, TestClient } from '../../../test/auth.ts'
import { withOwnerClient, workerSchema } from '../../../test/setup-db.ts'
import type { App } from '../../app.ts'
import type { Deps } from '../../dependencies.ts'
import { createDefaultChannel } from '../channels/index.ts'
import { onboard } from './onboarding.ts'

const DAY = 24 * 60 * 60 * 1000

let app: App
let deps: Deps
let close: () => Promise<void>

beforeAll(async () => {
  ;({ app, deps, close } = await buildTestApp({ workers: true }))
  await app.ready()
})

afterAll(() => close())

async function membershipCount(userId: string) {
  return deps.db.withUser(userId, (tx) => tx.member.count({ where: { userId } }))
}

async function activeOrganizationId(userId: string) {
  const session = await deps.db.session.findFirstOrThrow({ where: { userId } })
  return session.activeOrganizationId
}

describe('POST /api/v1/onboarding', () => {
  it('creates the organization, the admin and the trial', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    const before = Date.now()

    const response = await client.post('/api/v1/onboarding', { name: 'Corretora Azul' })
    const after = Date.now()

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.role).toBe('ADMIN')
    const organizationId = body.id as string
    const stored = await deps.db.withTenant({ organizationId }, async (tx) => ({
      member: await tx.member.findFirstOrThrow({ where: { userId } }),
      subscription: await tx.subscription.findUniqueOrThrow({
        where: { organizationId },
        include: { plan: true },
      }),
    }))
    expect(stored.member).toMatchObject({ role: 'ADMIN', active: true })
    expect(stored.subscription.status).toBe('TRIALING')
    expect(stored.subscription.plan).toMatchObject({ code: 'trial', maxUsers: 5 })
    expect(stored.subscription.trialEndsAt.getTime()).toBeGreaterThanOrEqual(before + 14 * DAY)
    expect(stored.subscription.trialEndsAt.getTime()).toBeLessThanOrEqual(after + 14 * DAY + 1000)
    expect(await activeOrganizationId(userId)).toBe(organizationId)
  })

  it('makes the creator an admin with a public chat key', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)

    const response = await client.post('/api/v1/onboarding', { name: 'Corretora Chave' })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.role).toBe('ADMIN')
    expect(body.publicChatKey).toMatch(/^[0-9a-f]{32}$/)
    const organizationId = body.id as string
    const stored = await deps.db.withTenant({ organizationId }, async (tx) => ({
      member: await tx.member.findFirstOrThrow({ where: { userId } }),
      organization: await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { publicChatKey: true },
      }),
    }))
    expect(stored.member).toMatchObject({ role: 'ADMIN', active: true })
    expect(stored.organization.publicChatKey).toBe(body.publicChatKey)
  })

  it('gives each organization its own public chat key', async () => {
    const client = new TestClient(app)
    await signedInUser(client, deps)
    const keys: string[] = []

    for (const name of ['Chave Um', 'Chave Dois', 'Chave Três']) {
      const response = await client.post('/api/v1/onboarding', { name })
      expect(response.statusCode, name).toBe(200)
      keys.push(response.json().publicChatKey as string)
    }

    expect(new Set(keys).size).toBe(3)
  })

  it('records organization.create', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)

    const response = await client.post('/api/v1/onboarding', { name: 'Corretora Trilha' })

    expect(response.statusCode).toBe(200)
    const organizationId = response.json().id as string
    const rows = await deps.db.withTenant({ organizationId }, (tx) => tx.auditLog.findMany())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: 'organization.create',
      actorType: 'USER',
      actorUserId: userId,
      entityId: organizationId,
    })
    expect(rows[0]?.changes).toEqual({ role: 'ADMIN' })
  })

  it('suffixes a slug that is taken', async () => {
    const first = new TestClient(app)
    await signedInUser(first, deps)
    const second = new TestClient(app)
    await signedInUser(second, deps)

    const taken = await first.post('/api/v1/onboarding', { name: 'Slug Tomado' })
    const next = await second.post('/api/v1/onboarding', { name: 'Slug Tomado' })

    expect(taken.statusCode).toBe(200)
    expect(next.statusCode).toBe(200)
    expect(next.json().slug).toBe(`${taken.json().slug}-2`)
  })

  it('builds the slug from the name', async () => {
    const names = ['Ação', 'Foo Bar!', '!!!', 'a'.repeat(60)]
    const slugs: string[] = []
    for (const name of names) {
      const client = new TestClient(app)
      await signedInUser(client, deps)
      const response = await client.post('/api/v1/onboarding', { name })
      expect(response.statusCode, name).toBe(200)
      slugs.push(response.json().slug)
    }

    expect(slugs).toEqual(['acao', 'foo-bar', 'org', 'a'.repeat(48)])
  })

  it('a later onboarding becomes the active organization', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)

    const first = await client.post('/api/v1/onboarding', { name: 'Primeira Casa' })
    expect(first.statusCode).toBe(200)
    expect(await membershipCount(userId)).toBe(1)
    expect(await activeOrganizationId(userId)).toBe(first.json().id)

    const second = await client.post('/api/v1/onboarding', { name: 'Segunda Casa' })
    expect(second.statusCode).toBe(200)
    expect(await membershipCount(userId)).toBe(2)
    expect(await activeOrganizationId(userId)).toBe(second.json().id)

    const third = await client.post('/api/v1/onboarding', { name: 'Terceira Casa' })
    expect(third.statusCode).toBe(200)
    expect(await membershipCount(userId)).toBe(3)
    expect(await activeOrganizationId(userId)).toBe(third.json().id)
  })

  it('rejects the fourth organization', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    for (const name of ['Um', 'Dois', 'Tres']) {
      expect((await client.post('/api/v1/onboarding', { name })).statusCode).toBe(200)
    }

    const response = await client.post('/api/v1/onboarding', { name: 'Quatro' })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({
      error: {
        code: 'ORG_LIMIT_REACHED',
        message: 'Você já participa do número máximo de organizações.',
      },
    })
    expect(await membershipCount(userId)).toBe(3)
  })

  it('rejects a body that is not a name of 2 to 80 characters', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    const before = await membershipCount(userId)

    for (const name of ['ab', 'a'.repeat(80)]) {
      const response = await client.post('/api/v1/onboarding', { name })
      expect(response.statusCode, name).toBe(200)
    }
    const afterValid = await membershipCount(userId)

    const rejected = [
      client.post('/api/v1/onboarding', { name: 'Ok', extra: true }),
      client.post('/api/v1/onboarding', {}),
      client.post('/api/v1/onboarding', { name: 'a' }),
      client.post('/api/v1/onboarding', { name: 'a'.repeat(81) }),
    ]
    for (const pending of rejected) {
      const response = await pending
      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('VALIDATION_ERROR')
    }
    expect(await membershipCount(userId)).toBe(afterValid)
    expect(afterValid).toBe(before + 2)
  })

  it('requires a session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding',
      headers: { origin: 'http://localhost:3000' },
      payload: { name: 'Sem Sessao' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('UNAUTHENTICATED')
  })

  it('creates the default web chat channel', async () => {
    const client = new TestClient(app)
    await signedInUser(client, deps)

    const response = await client.post('/api/v1/onboarding', { name: 'Corretora Canal' })

    expect(response.statusCode).toBe(200)
    const organizationId = response.json().id as string
    const channels = await deps.db.withTenant({ organizationId }, (tx) =>
      tx.channel.findMany({ select: { kind: true, name: true, organizationId: true } }),
    )
    expect(channels).toEqual([{ kind: 'WEB_CHAT', name: 'Web Chat', organizationId }])
  })

  it('rolls the default channel back with the organization', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    const session = await deps.db.session.findFirstOrThrow({ where: { userId } })
    const channelCount = () =>
      withOwnerClient(async (owner) => {
        const { rows } = await owner.query<{ count: string }>(
          `SELECT count(*) FROM "${workerSchema()}"."Channel"`,
        )
        return Number(rows[0]?.count)
      })
    const before = await channelCount()
    let channelStepRan = false

    await expect(
      onboard(
        {
          db: deps.db,
          maxOrgsPerUser: 3,
          setupOrganization: [
            async (tx) => {
              await createDefaultChannel(tx)
              channelStepRan = true
            },
            () => Promise.reject(new Error('setup failed')),
          ],
        },
        { requestId: 'r', userId, sessionId: session.id, isSuperAdmin: false },
        { name: 'Corretora Desfeita' },
      ),
    ).rejects.toThrow('setup failed')

    expect(channelStepRan).toBe(true)
    expect(await channelCount()).toBe(before)
    expect(await membershipCount(userId)).toBe(0)
    const leftover = await withOwnerClient((owner) =>
      owner.query(
        `SELECT id FROM "${workerSchema()}"."Organization" WHERE name = 'Corretora Desfeita'`,
      ),
    )
    expect(leftover.rowCount).toBe(0)
  })

  it('rolls back when the subscription insert fails', async () => {
    const client = new TestClient(app)
    const { userId } = await signedInUser(client, deps)
    const schema = workerSchema()
    await withOwnerClient(async (client) => {
      await client.query(`SET search_path TO "${schema}"`)
      await client.query('DELETE FROM "Subscription"')
      await client.query(`DELETE FROM "Plan" WHERE code = 'trial'`)
    })
    try {
      const response = await client.post('/api/v1/onboarding', { name: 'Sem Plano' })
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
      expect(await membershipCount(userId)).toBe(0)
      expect(await activeOrganizationId(userId)).toBeNull()
      const leftover = await withOwnerClient(async (owner) => {
        await owner.query(`SET search_path TO "${schema}"`)
        const orgs = await owner.query(`SELECT id FROM "Organization" WHERE name = 'Sem Plano'`)
        return orgs.rowCount
      })
      expect(leftover).toBe(0)
    } finally {
      await withOwnerClient(async (owner) => {
        await owner.query(`SET search_path TO "${schema}"`)
        await owner.query(
          `INSERT INTO "Plan" (id, code, name, "maxUsers", "createdAt")
           VALUES ('018f0000-0000-7000-8000-0000000000aa', 'trial', 'Trial', 5, now())
           ON CONFLICT (code) DO NOTHING`,
        )
      })
    }
  })

  it('honors MAX_ORGS_PER_USER', async () => {
    const limited = await buildTestApp({ env: { MAX_ORGS_PER_USER: '1' }, workers: true })
    try {
      await limited.app.ready()
      const client = new TestClient(limited.app)
      await signedInUser(client, limited.deps)
      expect((await client.post('/api/v1/onboarding', { name: 'Unica' })).statusCode).toBe(200)

      const response = await client.post('/api/v1/onboarding', { name: 'Outra' })

      expect(response.statusCode).toBe(422)
      expect(response.json().error.code).toBe('ORG_LIMIT_REACHED')
    } finally {
      await limited.close()
    }
  })
})

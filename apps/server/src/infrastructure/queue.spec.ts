import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps } from '../../test/app.ts'
import { contextFor, createOrganization } from '../../test/factories.ts'
import { closeDependencies, type Deps } from '../dependencies.ts'
import type { RequestContext } from '../shared/request-context.ts'

let deps: Deps
// Jobs are always enqueued inside a tenant transaction (ADR-004, ADR-006).
let tenant: RequestContext

beforeAll(async () => {
  deps = await createTestDeps()
  tenant = contextFor((await createOrganization(deps.db)).id)
  await deps.queue.start()
})

afterAll(() => closeDependencies(deps))

// pg-boss keeps its tables in `<schema>_pgboss`, next to the worker schema.
const bossSchema = () => `${new URL(deps.config.DATABASE_URL).searchParams.get('schema')}_pgboss`

async function jobsIn(queue: string) {
  return deps.db.$queryRawUnsafe<{ singleton_key: string | null; data: { n: number } }[]>(
    `SELECT singleton_key, data FROM "${bossSchema()}".job WHERE name = $1 ORDER BY created_on`,
    queue,
  )
}

function uniqueQueue(label: string) {
  return `test.${label}.${randomUUID().slice(0, 8)}`
}

class Rollback extends Error {}

describe('queue', () => {
  it('enqueues inside a tenant transaction', async () => {
    const name = uniqueQueue('transactional')
    const processed: number[] = []
    const done = Promise.withResolvers<void>()
    await deps.queue.registerWorker<{ n: number }>(name, async (payload) => {
      processed.push(payload.n)
      done.resolve()
    })

    await deps.db
      .withTenant(tenant, async (tx) => {
        await deps.queue.enqueue(tx, name, { n: 1 })
        throw new Rollback()
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error
      })
    expect(await jobsIn(name)).toEqual([])

    await deps.db.withTenant(tenant, async (tx) => {
      await deps.queue.enqueue(tx, name, { n: 2 })
    })
    await done.promise

    expect(processed).toEqual([2])
  })

  it('deduplicates queued jobs by singletonKey on a dedupe queue', async () => {
    const name = uniqueQueue('dedupe')
    await deps.queue.registerWorker(name, async () => {}, { dedupe: true })
    // Keep the jobs queued: the worker would otherwise consume them before we look.
    await deps.db.withTenant(tenant, async (tx) => {
      await deps.queue.enqueue(tx, name, { n: 1 }, { singletonKey: 'a', delaySeconds: 3600 })
      await deps.queue.enqueue(tx, name, { n: 2 }, { singletonKey: 'a', delaySeconds: 3600 })
    })
    await deps.db.withTenant(tenant, async (tx) => {
      await deps.queue.enqueue(tx, name, { n: 3 }, { singletonKey: 'a', delaySeconds: 3600 })
      await deps.queue.enqueue(tx, name, { n: 4 }, { singletonKey: 'b', delaySeconds: 3600 })
    })

    const jobs = await jobsIn(name)
    expect(jobs.map((job) => [job.singleton_key, job.data.n])).toEqual([
      ['a', 1],
      ['b', 4],
    ])
  })

  it('refuses a singletonKey mismatch instead of silently dropping or duplicating jobs', async () => {
    const plain = uniqueQueue('plain')
    const dedupe = uniqueQueue('dedupe-strict')
    await deps.queue.registerWorker(plain, async () => {})
    await deps.queue.registerWorker(dedupe, async () => {}, { dedupe: true })

    await deps.db.withTenant(tenant, async (tx) => {
      await expect(deps.queue.enqueue(tx, plain, {}, { singletonKey: 'k' })).rejects.toThrow(
        /does not deduplicate/,
      )
      await expect(deps.queue.enqueue(tx, dedupe, {})).rejects.toThrow(/requires a singletonKey/)
      await expect(deps.queue.enqueue(tx, uniqueQueue('unknown'), {})).rejects.toThrow(
        /has no registered worker/,
      )
    })
  })

  it('schedules crons in São Paulo time unless told otherwise', async () => {
    const daily = uniqueQueue('cron')
    const utc = uniqueQueue('cron-utc')
    await deps.queue.registerWorker(daily, async () => {})
    await deps.queue.registerWorker(utc, async () => {})

    await deps.queue.schedule(daily, '0 8 * * *')
    await deps.queue.schedule(utc, '0 8 * * *', { tz: 'UTC' })

    const schedules = await deps.db.$queryRawUnsafe<{ name: string; timezone: string }[]>(
      `SELECT name, timezone FROM "${bossSchema()}".schedule WHERE name = ANY($1)`,
      [daily, utc],
    )
    expect(schedules).toHaveLength(2)
    expect(schedules).toEqual(
      expect.arrayContaining([
        { name: daily, timezone: 'America/Sao_Paulo' },
        { name: utc, timezone: 'UTC' },
      ]),
    )
  })
})

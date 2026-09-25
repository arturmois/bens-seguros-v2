import { randomUUID } from 'node:crypto'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps } from '../../test/app.ts'
import { randomPhone } from '../../test/conversations.ts'
import { createOrganization } from '../../test/factories.ts'
import { testDatabaseUrl, withOwnerClient, workerSchema } from '../../test/setup-db.ts'
import type { Deps } from '../dependencies.ts'
import { normalizePhone } from '../shared/phone.ts'
import { parseDatabaseUrl } from './database.ts'
import {
  type AppEvent,
  createEventListener,
  eventChannel,
  nextRetryDelay,
  notify,
} from './events.ts'

let deps: Deps

beforeAll(async () => {
  deps = await createTestDeps()
})

afterAll(async () => {
  await deps.db.$disconnect()
  deps.mailer.close()
})

const LISTEN_QUERY = `LISTEN "${eventChannel(workerSchema())}"`

function newEvent(): AppEvent {
  return {
    type: 'message.created',
    organizationId: randomUUID(),
    conversationId: randomUUID(),
    messageId: randomUUID(),
  }
}

async function eventually<T>(read: () => Promise<T> | T, accept: (value: T) => boolean) {
  const deadline = Date.now() + 15_000
  for (;;) {
    const value = await read()
    if (accept(value)) return value
    if (Date.now() > deadline) throw new Error(`timed out; last value: ${JSON.stringify(value)}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

// A started listener on this worker's channel, recording every event and every log line.
async function listening(databaseUrl = testDatabaseUrl()) {
  const lines: { level: number; msg: string; time: number; raw: string }[] = []
  const logger = pino(
    { level: 'debug' },
    {
      write(raw: string) {
        const parsed: { level: number; msg: string; time: number } = JSON.parse(raw)
        lines.push({ level: parsed.level, msg: parsed.msg, time: parsed.time, raw })
      },
    },
  )
  const { connectionString, schema } = parseDatabaseUrl(databaseUrl)
  const listener = createEventListener({ connectionString, schema, logger })
  const seen: AppEvent[] = []
  listener.on('message.created', async (event) => {
    seen.push(event)
  })
  await listener.start()
  return {
    listener,
    seen,
    lines,
    ids: () => seen.map((event) => event.messageId),
    // Resolves with the events seen before the one with this message id.
    async until(messageId: string) {
      await eventually(
        () => seen.some((event) => event.messageId === messageId),
        (found) => found,
      )
      return seen.slice(
        0,
        seen.findIndex((event) => event.messageId === messageId),
      )
    },
  }
}

async function commitEvent(event: AppEvent = newEvent()) {
  await deps.db.withoutTenant((tx) => notify(tx, event))
  return event
}

async function listenerPids() {
  return withOwnerClient(async (client) => {
    const result = await client.query<{ pid: number }>(
      'SELECT pid FROM pg_stat_activity WHERE query = $1',
      [LISTEN_QUERY],
    )
    return result.rows.map((row) => row.pid)
  })
}

async function dropListener() {
  const [pid] = await eventually(listenerPids, (pids) => pids.length === 1)
  await withOwnerClient((client) => client.query('SELECT pg_terminate_backend($1)', [pid]))
  // Reconnected: a different backend is listening again.
  await eventually(listenerPids, (pids) => pids.length === 1 && pids[0] !== pid)
}

describe('events', () => {
  it('delivers a committed event with its ids', async () => {
    const events = await listening()
    try {
      const sent = await commitEvent()

      await events.until(sent.messageId)

      expect(events.seen).toEqual([sent])
    } finally {
      await events.listener.stop()
    }
  })

  it('delivers nothing before the commit', async () => {
    const events = await listening()
    try {
      const held = newEvent()
      let release = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let notified = () => {}
      const inside = new Promise<void>((resolve) => {
        notified = resolve
      })
      const transaction = deps.db.withoutTenant(async (tx) => {
        await notify(tx, held)
        notified()
        await gate
      })
      await inside

      const sentinel = await commitEvent()
      const before = await events.until(sentinel.messageId)
      expect(before.map((event) => event.messageId)).not.toContain(held.messageId)
      expect(events.ids()).not.toContain(held.messageId)

      release()
      await transaction
      await events.until(held.messageId)
      expect(events.seen.find((event) => event.messageId === held.messageId)).toEqual(held)
    } finally {
      await events.listener.stop()
    }
  })

  it('never delivers a rolled back event', async () => {
    const events = await listening()
    try {
      const rolledBack = newEvent()
      await expect(
        deps.db.withoutTenant(async (tx) => {
          await notify(tx, rolledBack)
          throw new Error('rollback')
        }),
      ).rejects.toThrow('rollback')

      const sentinel = await commitEvent()
      await events.until(sentinel.messageId)

      expect(events.ids()).not.toContain(rolledBack.messageId)
    } finally {
      await events.listener.stop()
    }
  })

  it('refuses an event outside the schema', async () => {
    const events = await listening()
    try {
      const organization = await createOrganization(deps.db)
      const tenant = { organizationId: organization.id }
      const invalid = [
        { ...newEvent(), text: 'Olá' },
        { ...newEvent(), messageId: 'nao-uuid' },
        { ...newEvent(), type: 'message.deleted' },
      ]

      for (const event of invalid) {
        const phoneE164 = normalizePhone(randomPhone()) ?? ''
        await expect(
          deps.db.withTenant(tenant, async (tx) => {
            await tx.contact.create({ data: { phoneE164 } })
            // The cast is the point: a caller outside the type system.
            await notify(tx, event as AppEvent)
          }),
        ).rejects.toThrow()
        const stored = await deps.db.withTenant(tenant, (tx) =>
          tx.contact.findMany({ where: { phoneE164 } }),
        )
        expect(stored).toEqual([])
      }

      const sentinel = await commitEvent()
      const before = await events.until(sentinel.messageId)
      const invalidIds = invalid.map((event) => event.messageId)
      expect(before.filter((event) => invalidIds.includes(event.messageId))).toEqual([])
      expect(before).toEqual([])
    } finally {
      await events.listener.stop()
    }
  })

  it('listens only on the channel of its schema', async () => {
    const events = await listening()
    try {
      const foreign = newEvent()
      await withOwnerClient((client) =>
        client.query('SELECT pg_notify($1, $2)', ['app_events_other', JSON.stringify(foreign)]),
      )
      const own = await commitEvent()

      const before = await events.until(own.messageId)

      expect(before).toEqual([])
      expect(events.ids()).not.toContain(foreign.messageId)
    } finally {
      await events.listener.stop()
    }
  })

  it('names the channel after the schema', async () => {
    expect(eventChannel('public')).toBe('app_events')
    expect(eventChannel(workerSchema())).toBe(`app_events_${workerSchema()}`)

    // `notify` from a transaction on the public schema lands on `app_events`.
    await withOwnerClient(async (client) => {
      const received: string[] = []
      client.on('notification', (message) => {
        if (message.channel === 'app_events' && message.payload) received.push(message.payload)
      })
      await client.query('LISTEN app_events')
      const event = newEvent()
      await deps.db.withoutTenant(async (tx) => {
        await tx.$executeRaw`SET LOCAL search_path TO public`
        await notify(tx, event)
      })
      const payloads = await eventually(
        () => received,
        (all) => all.some((payload) => payload.includes(event.messageId)),
      )
      expect(payloads.map((payload) => JSON.parse(payload))).toContainEqual(event)
    })
  })

  it('reconnects after the listen connection drops', async () => {
    const events = await listening()
    try {
      await dropListener()

      const after = await commitEvent()
      await events.until(after.messageId)

      expect(events.seen).toContainEqual(after)
    } finally {
      await events.listener.stop()
    }
  })

  it('warns once per drop without event data', async () => {
    const events = await listening()
    try {
      const delivered = await commitEvent()
      await events.until(delivered.messageId)

      await dropListener()
      const after = await commitEvent()
      await events.until(after.messageId)

      const warnings = events.lines.filter((line) => line.level === 40)
      expect(warnings).toHaveLength(1)
      for (const line of events.lines) {
        expect(line.raw).not.toContain(delivered.conversationId)
        expect(line.raw).not.toContain(delivered.messageId)
      }
    } finally {
      await events.listener.stop()
    }
  })

  it('stops without reconnecting', async () => {
    const events = await listening()
    await eventually(listenerPids, (pids) => pids.length === 1)

    await events.listener.stop()

    await eventually(listenerPids, (pids) => pids.length === 0)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    expect(await listenerPids()).toEqual([])
  })

  it('retries a failed reconnection with a doubled wait', async () => {
    // A login role of this worker only: refusing its logins cannot disturb another worker.
    const role = `events_probe_${workerSchema()}`
    await withOwnerClient(async (client) => {
      await client.query(`DROP ROLE IF EXISTS ${role}`)
      await client.query(`CREATE ROLE ${role} LOGIN PASSWORD '${role}'`)
    })
    const url = new URL(testDatabaseUrl())
    url.username = role
    url.password = role
    const events = await listening(url.toString())
    try {
      const [pid] = await eventually(listenerPids, (pids) => pids.length === 1)
      await withOwnerClient(async (client) => {
        await client.query(`ALTER ROLE ${role} NOLOGIN`)
        await client.query('SELECT pg_terminate_backend($1)', [pid])
      })
      const failed = await eventually(
        () => events.lines.filter((line) => line.msg === 'events listener reconnection failed'),
        (lines) => lines.length === 1,
      )
      await withOwnerClient((client) => client.query(`ALTER ROLE ${role} LOGIN`))
      // Events sent while it is down are lost by design (ADR-012): wait for the new backend.
      await eventually(listenerPids, (pids) => pids.length === 1 && pids[0] !== pid)

      const after = await commitEvent()
      await events.until(after.messageId)

      const reconnected = events.lines.find((line) => line.msg === 'events listener reconnected')
      // 1 s before the failed attempt, then 2 s (not 1 s again) before the one that worked.
      expect((reconnected?.time ?? 0) - (failed[0]?.time ?? 0)).toBeGreaterThanOrEqual(1900)
      expect(events.seen).toContainEqual(after)
    } finally {
      await events.listener.stop()
      await withOwnerClient((client) => client.query(`DROP ROLE IF EXISTS ${role}`))
    }
  })

  it('ignores a payload outside the schema on its channel', async () => {
    const events = await listening()
    try {
      const channel = eventChannel(workerSchema())
      await withOwnerClient(async (client) => {
        await client.query('SELECT pg_notify($1, $2)', [channel, 'nao-json'])
        await client.query('SELECT pg_notify($1, $2)', [
          channel,
          JSON.stringify({ ...newEvent(), text: 'Olá' }),
        ])
      })
      const sentinel = await commitEvent()

      expect(await events.until(sentinel.messageId)).toEqual([])
      expect(events.seen).toEqual([sentinel])
    } finally {
      await events.listener.stop()
    }
  })

  it('doubles the retry wait up to thirty seconds', () => {
    const waits = [1000]
    for (let attempt = 0; attempt < 6; attempt++) {
      waits.push(nextRetryDelay(waits.at(-1) ?? 0))
    }

    expect(waits).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000])
  })
})

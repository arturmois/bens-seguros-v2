import pg from 'pg'
import type { Logger } from 'pino'
import { z } from 'zod'
import type { Transaction } from './database.ts'

// Only ids (ADR-012): no PII in NOTIFY, far below its 8000-byte limit. Listeners re-read the rows.
export const appEvent = z
  .object({
    type: z.literal('message.created'),
    organizationId: z.uuid(),
    conversationId: z.uuid(),
    messageId: z.uuid(),
  })
  .strict()

export type AppEvent = z.infer<typeof appEvent>
export type AppEventType = AppEvent['type']
export type AppEventHandler = (event: AppEvent) => Promise<void>

const FIRST_RETRY_MS = 1000
const MAX_RETRY_MS = 30_000

// The wait before the next reconnection attempt: doubles after each failure, capped at 30 s.
export function nextRetryDelay(delayMs: number) {
  return Math.min(delayMs * 2, MAX_RETRY_MS)
}

// Next to the app tables, like the queue: `test_w1` listens on `app_events_test_w1`.
export function eventChannel(schema: string) {
  return schema === 'public' ? 'app_events' : `app_events_${schema}`
}

// PostgreSQL delivers the NOTIFY only when `tx` commits, and never after a rollback. The channel
// comes from the transaction's own schema (the connection's search_path), so the use cases need no
// dependency beyond the transaction; `eventChannel` is the same rule on the listening side.
export async function notify(tx: Transaction, event: AppEvent) {
  const payload = JSON.stringify(appEvent.parse(event))
  await tx.$executeRaw`
    SELECT pg_notify(
      CASE WHEN current_schema() = 'public' THEN 'app_events'
           ELSE 'app_events_' || current_schema() END,
      ${payload})`
}

export type EventListener = ReturnType<typeof createEventListener>

// A dedicated connection outside the Prisma pool (the pool hands connections back after each
// query and never receives notifications). Events lost while it is down are not replayed: after a
// reconnection `onReconnect` runs, and the clients reload from the database (ADR-012).
export function createEventListener(options: {
  connectionString: string
  schema: string
  logger: Logger
}) {
  const channel = eventChannel(options.schema)
  const log = options.logger.child({ component: 'events', channel })
  const handlers = new Map<AppEventType, AppEventHandler[]>()
  const reconnectHandlers: (() => void)[] = []
  let client: pg.Client | null = null
  let stopped = true
  let retryTimer: NodeJS.Timeout | undefined
  // Handlers run one at a time, in delivery (commit) order.
  let delivery = Promise.resolve()

  function parse(raw: string | undefined) {
    try {
      return appEvent.safeParse(JSON.parse(raw ?? 'null'))
    } catch {
      return appEvent.safeParse(null)
    }
  }

  function dispatch(raw: string | undefined) {
    const parsed = parse(raw)
    if (!parsed.success) {
      log.warn('ignored an event outside the schema')
      return
    }
    const event = parsed.data
    for (const handler of handlers.get(event.type) ?? []) {
      delivery = delivery.then(() =>
        handler(event).catch((error: unknown) => {
          log.error({ err: error, type: event.type }, 'event handler failed')
        }),
      )
    }
  }

  async function connect() {
    const next = new pg.Client({ connectionString: options.connectionString })
    // Registered before connecting: an unhandled `error` would crash the process.
    next.on('error', () => dropped(next))
    next.on('end', () => dropped(next))
    next.on('notification', (message) => {
      if (message.channel === channel) dispatch(message.payload)
    })
    try {
      await next.connect()
      await next.query(`LISTEN ${next.escapeIdentifier(channel)}`)
    } catch (error) {
      await next.end().catch(() => {})
      throw error
    }
    client = next
  }

  function dropped(which: pg.Client) {
    if (client !== which) return
    client = null
    if (stopped) return
    log.warn('events listener disconnected')
    retry(FIRST_RETRY_MS)
  }

  function retry(delayMs: number) {
    retryTimer = setTimeout(() => {
      connect().then(
        () => {
          if (stopped) return void client?.end()
          log.info('events listener reconnected')
          for (const handler of reconnectHandlers) handler()
        },
        (error: unknown) => {
          if (stopped) return
          log.debug({ err: error }, 'events listener reconnection failed')
          retry(nextRetryDelay(delayMs))
        },
      )
    }, delayMs)
  }

  return {
    channel,

    on(type: AppEventType, handler: AppEventHandler) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler])
    },

    onReconnect(handler: () => void) {
      reconnectHandlers.push(handler)
    },

    async start() {
      if (!stopped) return
      stopped = false
      await connect()
    },

    async stop() {
      stopped = true
      clearTimeout(retryTimer)
      const current = client
      client = null
      await current?.end()
      await delivery
    },
  }
}

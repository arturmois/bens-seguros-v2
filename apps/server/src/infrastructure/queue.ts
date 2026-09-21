import { PgBoss } from 'pg-boss'
import type { Logger } from 'pino'
import type { Transaction } from './database.ts'

export type JobPayload = Record<string, unknown>

export type EnqueueOptions = {
  // Deduplicates while a job with the same key is still queued. Only on queues declared with `dedupe`.
  singletonKey?: string
  delaySeconds?: number
}

export type WorkerOptions = {
  concurrency?: number
  // Attempts after the first failure.
  retries?: number
  // Exponential backoff starting at `retryDelaySeconds` (default 1s); fixed delay when false.
  backoff?: boolean
  retryDelaySeconds?: number
  // Declares the queue with pg-boss policy `short`: `singletonKey` becomes mandatory and deduplicates.
  dedupe?: boolean
}

export type JobHandler<P extends JobPayload> = (payload: P, job: { id: string }) => Promise<void>

export type Queue = ReturnType<typeof createQueue>

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

// The only file that knows pg-boss (ADR-006). The interface keeps to what BullMQ also offers, so a
// future swap stays inside this file.
export function createQueue(options: { connectionString: string; schema: string; logger: Logger }) {
  const boss = new PgBoss({ connectionString: options.connectionString, schema: options.schema })
  const declared = new Map<string, { dedupe: boolean }>()

  boss.on('error', (error) => options.logger.error({ err: error }, 'queue error'))

  function queueOf(name: string) {
    const queue = declared.get(name)
    if (!queue) throw new Error(`Queue "${name}" has no registered worker`)
    return queue
  }

  return {
    async start() {
      await boss.start()
    },

    async stop() {
      await boss.stop({ graceful: true, timeout: 10_000 })
    },

    // Writes the job inside `tx`: it only exists if the transaction commits.
    async enqueue(tx: Transaction, name: string, payload: JobPayload, opts: EnqueueOptions = {}) {
      const { dedupe } = queueOf(name)
      if (dedupe && opts.singletonKey === undefined) {
        // A `short` queue without a key keeps a single queued job and silently drops the rest.
        throw new Error(`Queue "${name}" deduplicates: enqueue requires a singletonKey`)
      }
      if (!dedupe && opts.singletonKey !== undefined) {
        throw new Error(`Queue "${name}" does not deduplicate: declare it with { dedupe: true }`)
      }

      return boss.send(name, payload, {
        ...(opts.singletonKey !== undefined && { singletonKey: opts.singletonKey }),
        ...(opts.delaySeconds !== undefined && { startAfter: opts.delaySeconds }),
        db: {
          executeSql: async (text: string, values: unknown[] = []) => ({
            rows: await tx.$queryRawUnsafe<unknown[]>(text, ...values),
          }),
        },
      })
    },

    // Declares the queue (idempotent) and starts polling it. Handlers must be idempotent: a job may
    // run more than once after a crash or timeout.
    async registerWorker<P extends JobPayload>(
      name: string,
      handler: JobHandler<P>,
      opts: WorkerOptions = {},
    ) {
      const dedupe = opts.dedupe ?? false
      const queueOptions = {
        policy: dedupe ? 'short' : 'standard',
        retryLimit: opts.retries ?? 2,
        retryBackoff: opts.backoff ?? true,
        retryDelay: opts.retryDelaySeconds ?? 1,
      }
      await boss.createQueue(name, queueOptions)
      // createQueue keeps an existing queue as is; retries may have changed since.
      await boss.updateQueue(name, {
        retryLimit: queueOptions.retryLimit,
        retryBackoff: queueOptions.retryBackoff,
        retryDelay: queueOptions.retryDelay,
      })
      declared.set(name, { dedupe })

      await boss.work<P>(name, { localConcurrency: opts.concurrency ?? 1 }, async ([job]) => {
        if (!job) return
        const log = options.logger.child({ job: name, jobId: job.id })
        try {
          await handler(job.data, { id: job.id })
        } catch (error) {
          log.warn({ err: error }, 'job failed')
          throw error
        }
      })
    },

    // Cron in São Paulo time by default. The queue must have a worker: register it first.
    async schedule(name: string, cron: string, opts: { tz?: string } = {}) {
      queueOf(name)
      await boss.schedule(name, cron, null, { tz: opts.tz ?? DEFAULT_TIMEZONE })
    },
  }
}

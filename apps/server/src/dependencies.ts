import { pino } from 'pino'
import { createDatabase, parseDatabaseUrl } from './infrastructure/database.ts'
import { createMailer } from './infrastructure/email.ts'
import { createQueue } from './infrastructure/queue.ts'
import { createAuth } from './modules/auth/index.ts'
import type { Config } from './shared/config.ts'
import { loggerOptions } from './shared/logger.ts'

// Explicit composition root: everything a use case may need, built once at boot.
// Nothing here connects yet: the database pool opens on the first query, and the queue on `start()`.
export function createDependencies(config: Config) {
  const logger = pino(loggerOptions(config))
  const { connectionString, schema } = parseDatabaseUrl(config.DATABASE_URL)

  const db = createDatabase(config.DATABASE_URL)
  const queue = createQueue({
    connectionString,
    // Next to the app tables; `test_w1` gets `test_w1_pgboss`.
    schema: schema === 'public' ? 'pgboss' : `${schema}_pgboss`,
    logger,
  })

  return {
    config,
    logger,
    db,
    queue,
    mailer: createMailer(config),
    auth: createAuth({ config, db, queue }),
  }
}

export type Deps = ReturnType<typeof createDependencies>

export async function closeDependencies(deps: Deps) {
  await deps.queue.stop()
  await deps.db.$disconnect()
  deps.mailer.close()
}

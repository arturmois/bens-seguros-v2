import { buildApp } from './app.ts'
import { closeDependencies, createDependencies } from './dependencies.ts'
import { RowSecurityBypassError } from './infrastructure/database.ts'
import { ConfigError, loadConfig } from './shared/config.ts'
import { registerWorkers } from './workers.ts'

function loadConfigOrExit() {
  try {
    return loadConfig(process.env)
  } catch (error) {
    if (error instanceof ConfigError) {
      // No logger exists yet: its level comes from the config that just failed.
      process.stderr.write(`${error.message}\n`)
      process.exit(1)
    }
    throw error
  }
}

const config = loadConfigOrExit()
const deps = createDependencies(config)
const app = buildApp(deps)

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  await closeDependencies(deps)
  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

try {
  await deps.db.assertRowSecurityApplies()
  if (config.NODE_ENV !== 'production') await deps.storage.ensureBucket()
  await deps.queue.start()
  await registerWorkers(deps)
  await app.listen({ host: config.HOST, port: config.PORT })
} catch (error) {
  if (error instanceof RowSecurityBypassError) {
    // Plain stderr, like a config error: this is the environment, not the code.
    process.stderr.write(`${error.message}\n`)
  } else {
    app.log.fatal({ err: error }, 'failed to start')
  }
  process.exit(1)
}

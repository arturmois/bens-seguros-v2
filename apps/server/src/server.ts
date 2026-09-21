import { buildApp } from './app.ts'
import { createDependencies } from './dependencies.ts'
import { ConfigError, loadConfig } from './shared/config.ts'

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
const app = buildApp(createDependencies(config))

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

try {
  await app.listen({ host: config.HOST, port: config.PORT })
} catch (error) {
  app.log.fatal({ err: error }, 'failed to start')
  process.exit(1)
}

import { buildApp } from '../src/app.ts'
import { closeDependencies, createDependencies } from '../src/dependencies.ts'
import { loadConfig } from '../src/shared/config.ts'
import { registerWorkers } from '../src/workers.ts'
import { prepareTestDatabase, testDatabaseUrl } from './setup-db.ts'

export const TEST_APP_URL = 'http://localhost:3000'

// Defaults match docker-compose.yml, so `pnpm test` and CI need no .env. `overrides` replaces a variable.
export function testConfig(overrides: Record<string, string> = {}) {
  const env = process.env
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: testDatabaseUrl(),
    S3_ENDPOINT: env.S3_ENDPOINT ?? 'http://localhost:9000',
    S3_REGION: env.S3_REGION ?? 'us-east-1',
    S3_BUCKET: 'bens-test',
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID ?? 'bens',
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY ?? 'bens-minio',
    S3_FORCE_PATH_STYLE: 'true',
    SMTP_URL: env.SMTP_URL ?? 'smtp://localhost:1025',
    EMAIL_FROM: 'Bens Seguros <teste@bensseguros.local>',
    APP_URL: TEST_APP_URL,
    BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
    ...overrides,
  })
}

// Real dependencies against this worker's schema. Register extra routes before `app.ready()`.
export async function createTestDeps(env: Record<string, string> = {}) {
  await prepareTestDatabase()
  return createDependencies(testConfig(env))
}

export type TestAppOptions = {
  env?: Record<string, string>
  // Starts the queue with every worker, as the server does (needed by anything that sends e-mail).
  workers?: boolean
}

export async function buildTestApp(options: TestAppOptions = {}) {
  const deps = await createTestDeps(options.env)
  if (options.workers) {
    await deps.queue.start()
    await registerWorkers(deps)
  }
  const app = buildApp(deps)
  return {
    app,
    deps,
    async close() {
      await app.close()
      await closeDependencies(deps)
    },
  }
}

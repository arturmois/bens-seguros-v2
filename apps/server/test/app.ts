import { buildApp } from '../src/app.ts'
import { closeDependencies, createDependencies } from '../src/dependencies.ts'
import { loadConfig } from '../src/shared/config.ts'
import { prepareTestDatabase, testDatabaseUrl } from './setup-db.ts'

// Defaults match docker-compose.yml, so `pnpm test` and CI need no .env.
export function testConfig() {
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
  })
}

// Real dependencies against this worker's schema. Register extra routes before `app.ready()`.
export async function createTestDeps() {
  await prepareTestDatabase()
  return createDependencies(testConfig())
}

export async function buildTestApp() {
  const deps = await createTestDeps()
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

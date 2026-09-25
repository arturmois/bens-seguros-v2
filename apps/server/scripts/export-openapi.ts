import { writeFile } from 'node:fs/promises'
import { buildApp } from '../src/app.ts'
import { createDependencies } from '../src/dependencies.ts'
import { loadConfig } from '../src/shared/config.ts'

// Writes the OpenAPI document that Orval reads (`pnpm api:generate`). Builds the app without
// listening: nothing connects, so the placeholder config below never reaches a real service.
const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://openapi@localhost:5432/openapi',
  SMTP_URL: 'smtp://localhost:25',
  EMAIL_FROM: 'openapi@localhost',
  APP_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'openapi-placeholder-secret-32-chars',
})
const deps = createDependencies(config)
// `onReady` starts the events listener (ADR-012), which would dial the placeholder database.
const app = buildApp({ ...deps, events: { ...deps.events, start: async () => {} } })
await app.ready()

const output = new URL('../openapi.json', import.meta.url)
await writeFile(output, `${JSON.stringify(app.swagger(), null, 2)}\n`)
await app.close()

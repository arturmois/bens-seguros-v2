import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Prisma CLI only (migrate, studio), as the table owner. The app connects as the application role
// through DATABASE_URL in src/shared/config.ts (ADR-004).
const envFile = new URL('../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.MIGRATION_DATABASE_URL ?? '' },
})

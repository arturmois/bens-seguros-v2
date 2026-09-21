import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Prisma CLI only (migrate, studio). The app reads DATABASE_URL through src/shared/config.ts.
const envFile = new URL('../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
})

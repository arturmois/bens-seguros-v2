import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

// One schema per Vitest worker (`test_w1`, `test_w2`, …) in the docker compose database, so test files
// run in parallel without sharing rows. Each test creates its own organizations; nothing is truncated.

const SCHEMA_PREFIX = 'test_w'
const migrationsDir = fileURLToPath(new URL('../prisma/migrations', import.meta.url))

export function baseDatabaseUrl() {
  return process.env.DATABASE_URL ?? 'postgresql://bens:bens@localhost:5432/bens'
}

export function workerSchema() {
  return `${SCHEMA_PREFIX}${process.env.VITEST_POOL_ID ?? '0'}`
}

export function testDatabaseUrl() {
  const url = new URL(baseDatabaseUrl())
  url.searchParams.set('schema', workerSchema())
  return url.toString()
}

async function withClient<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: baseDatabaseUrl() })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

let prepared: Promise<void> | undefined

// Applies pending migrations to this worker's schema (the SQL files `prisma migrate deploy` would run).
// Idempotent across the test files a worker runs.
export function prepareTestDatabase(): Promise<void> {
  prepared ??= withClient(async (client) => {
    const schema = workerSchema()
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`)
    await client.query(`SET search_path TO "${schema}"`)
    await client.query('CREATE TABLE IF NOT EXISTS _test_migrations (name text PRIMARY KEY)')
    const applied = new Set(
      (await client.query<{ name: string }>('SELECT name FROM _test_migrations')).rows.map(
        (row) => row.name,
      ),
    )

    const pending = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !applied.has(entry.name))
      .map((entry) => entry.name)
      .sort()
    for (const name of pending) {
      await client.query('BEGIN')
      await client.query(readFileSync(`${migrationsDir}/${name}/migration.sql`, 'utf8'))
      await client.query('INSERT INTO _test_migrations (name) VALUES ($1)', [name])
      await client.query('COMMIT')
    }
  })
  return prepared
}

// Vitest globalSetup: start every run from empty worker schemas (migrations may have changed).
export default async function dropWorkerSchemas() {
  await withClient(async (client) => {
    const { rows } = await client.query<{ name: string }>(
      'SELECT nspname AS name FROM pg_namespace WHERE starts_with(nspname, $1)',
      [SCHEMA_PREFIX],
    )
    for (const { name } of rows) await client.query(`DROP SCHEMA "${name}" CASCADE`)
  })
}

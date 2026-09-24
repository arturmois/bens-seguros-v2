import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

// One schema per Vitest worker (`test_w1`, `test_w2`, …) in the docker compose database, so test files
// run in parallel without sharing rows. Each test creates its own organizations; nothing is truncated.
// Like production (ADR-004): the owner applies the migrations, the tests run as the application role.

const SCHEMA_PREFIX = 'test_w'
const migrationsDir = fileURLToPath(new URL('../prisma/migrations', import.meta.url))

const APP_ROLE = 'bens_app'

// Table owner: migrations, grants and the cleanup between runs.
export function ownerDatabaseUrl() {
  return process.env.MIGRATION_DATABASE_URL ?? 'postgresql://bens:bens@localhost:5432/bens'
}

// Application role (docker/postgres/init/01-app-role.sh): what the app and the tests use.
export function appDatabaseUrl() {
  return process.env.DATABASE_URL ?? `postgresql://${APP_ROLE}:${APP_ROLE}@localhost:5432/bens`
}

export function workerSchema() {
  return `${SCHEMA_PREFIX}${process.env.VITEST_POOL_ID ?? '0'}`
}

export function testDatabaseUrl() {
  const url = new URL(appDatabaseUrl())
  url.searchParams.set('schema', workerSchema())
  return url.toString()
}

export async function withOwnerClient<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: ownerDatabaseUrl() })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

// Every migration directory name, in the order `prisma migrate deploy` applies them.
export function migrationNames(): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

// Runs one migration's SQL on a client whose search_path is the target schema, in a transaction.
export async function applyMigration(client: pg.Client, name: string) {
  await client.query('BEGIN')
  try {
    await client.query(readFileSync(`${migrationsDir}/${name}/migration.sql`, 'utf8'))
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

let prepared: Promise<void> | undefined

// Applies pending migrations to this worker's schema (the SQL files `prisma migrate deploy` would run).
// Idempotent across the test files a worker runs.
export function prepareTestDatabase(): Promise<void> {
  prepared ??= withOwnerClient(async (client) => {
    const schema = workerSchema()
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`)
    await client.query(`SET search_path TO "${schema}"`)
    await client.query('CREATE TABLE IF NOT EXISTS _test_migrations (name text PRIMARY KEY)')
    const applied = new Set(
      (await client.query<{ name: string }>('SELECT name FROM _test_migrations')).rows.map(
        (row) => row.name,
      ),
    )

    for (const name of migrationNames().filter((candidate) => !applied.has(candidate))) {
      await applyMigration(client, name)
      await client.query('INSERT INTO _test_migrations (name) VALUES ($1)', [name])
    }
    // Default privileges only cover `public`; the worker schema gets its grants here.
    await client.query(`GRANT USAGE ON SCHEMA "${schema}" TO ${APP_ROLE}`)
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO ${APP_ROLE}`,
    )
  })
  return prepared
}

// A throwaway schema built by the migrations that come before `migration`, so a test can seed the
// data that existed before it and then apply it (backfills). Dropped afterwards.
// With `owner`, a role that is neither superuser nor BYPASSRLS owns the schema and runs every
// migration, as a managed database would: FORCE ROW LEVEL SECURITY then applies to it (a superuser
// ignores row security altogether).
export async function withSchemaBefore<T>(
  label: string,
  migration: string,
  run: (client: pg.Client, apply: () => Promise<void>, schema: string) => Promise<T>,
  options: { owner?: string } = {},
): Promise<T> {
  const names = migrationNames()
  if (!names.includes(migration)) throw new Error(`Unknown migration ${migration}`)
  const schema = `${workerSchema()}_${label}_before`
  return withOwnerClient(async (client) => {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await client.query(`CREATE SCHEMA "${schema}"`)
    if (options.owner) {
      await client.query(
        `DO $$ BEGIN
           IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${options.owner}') THEN
             CREATE ROLE "${options.owner}" NOLOGIN NOSUPERUSER NOBYPASSRLS;
           END IF;
         END $$`,
      )
      await client.query(`ALTER SCHEMA "${schema}" OWNER TO "${options.owner}"`)
      await client.query(`SET ROLE "${options.owner}"`)
    }
    await client.query(`SET search_path TO "${schema}"`)
    try {
      for (const name of names.filter((candidate) => candidate < migration)) {
        await applyMigration(client, name)
      }
      return await run(client, () => applyMigration(client, migration), schema)
    } finally {
      await client.query('RESET ROLE')
      await client.query(`DROP SCHEMA "${schema}" CASCADE`)
    }
  })
}

// Vitest globalSetup: start every run from empty worker schemas (migrations may have changed).
export default async function dropWorkerSchemas() {
  await withOwnerClient(async (client) => {
    const { rows } = await client.query<{ name: string }>(
      'SELECT nspname AS name FROM pg_namespace WHERE starts_with(nspname, $1)',
      [SCHEMA_PREFIX],
    )
    for (const { name } of rows) await client.query(`DROP SCHEMA "${name}" CASCADE`)
  })
}

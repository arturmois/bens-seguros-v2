import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.ts'
import type { RequestContext } from '../shared/request-context.ts'

// `?schema=` follows the Prisma convention. The tests use it to give each Vitest worker its own schema.
export function parseDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl)
  const schema = url.searchParams.get('schema') ?? 'public'
  url.searchParams.delete('schema')
  return { connectionString: url.toString(), schema }
}

// The client inside a transaction. Repositories receive it from `db.withTenant`.
export type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

// Tenant isolation is PostgreSQL row level security (ADR-004): every tenant-scoped table only shows
// and accepts rows of `app.tenant_id`, which `withTenant` sets for one transaction. The connection
// uses the application role, which RLS always applies to; outside `withTenant` those tables fail.
export function createDatabase(databaseUrl: string) {
  const { connectionString, schema } = parseDatabaseUrl(databaseUrl)
  // search_path also covers raw SQL (pg-boss, $queryRaw), which the adapter's `schema` does not qualify.
  const adapter = new PrismaPg(
    { connectionString, options: `-c search_path="${schema}"` },
    { schema },
  )
  const client = new PrismaClient({ adapter })

  return client.$extends({
    name: 'tenant',
    client: {
      // `set_config(…, true)` is transaction-local: the tenant never outlives the transaction on a
      // pooled connection.
      withTenant<T>(
        ctx: Pick<RequestContext, 'organizationId'>,
        run: (tx: Transaction) => Promise<T>,
      ): Promise<T> {
        return client.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.organizationId}, true)`
          return run(tx)
        })
      },

      // Membership lookup before a tenant is chosen (AD-006). Transaction-local, same as the tenant.
      withUser<T>(userId: string, run: (tx: Transaction) => Promise<T>): Promise<T> {
        return client.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`
          return run(tx)
        })
      },

      // Invite lookup before the caller is a member (AD-007). The hash is the capability; the
      // organization id comes back from the row. Writes still need `withTenant`.
      withInvitation<T>(tokenHash: string, run: (tx: Transaction) => Promise<T>): Promise<T> {
        return client.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.invitation_token', ${tokenHash}, true)`
          return run(tx)
        })
      },

      // A transaction with no tenant, for user-level tables (identity) and the queue: every
      // tenant-scoped table fails inside it, as outside `withTenant`.
      withoutTenant<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
        return client.$transaction(run)
      },

      // Boot check: a superuser or BYPASSRLS role would silently skip every policy.
      async assertRowSecurityApplies() {
        const [role] = await client.$queryRaw<
          { name: string; superuser: boolean; bypassRls: boolean }[]
        >`SELECT rolname AS name, rolsuper AS superuser, rolbypassrls AS "bypassRls"
          FROM pg_roles WHERE rolname = current_user`
        if (!role || role.superuser || role.bypassRls) {
          throw new RowSecurityBypassError(role?.name ?? 'unknown')
        }
      },
    },
  })
}

export class RowSecurityBypassError extends Error {
  override name = 'RowSecurityBypassError'
  readonly role: string

  constructor(role: string) {
    super(
      `Database role "${role}" bypasses row level security; connect as the application role (ADR-004)`,
    )
    this.role = role
  }
}

export type Database = ReturnType<typeof createDatabase>

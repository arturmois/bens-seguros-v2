import { randomUUID } from 'node:crypto'
import type { DbClient } from '../src/infrastructure/database.ts'
import type { RequestContext } from '../src/shared/request-context.ts'

export async function createOrganization(db: DbClient, name = `Corretora ${randomUUID()}`) {
  return db.organization.create({ data: { name } })
}

export function contextFor(organizationId: string): RequestContext {
  return { requestId: randomUUID(), userId: randomUUID(), organizationId }
}

// Two isolated tenants: every endpoint test proves that B never sees or changes A's rows (ADR-004).
export async function withTwoTenants(db: DbClient) {
  const [a, b] = await Promise.all([createOrganization(db), createOrganization(db)])
  return { tenantA: contextFor(a.id), tenantB: contextFor(b.id) }
}

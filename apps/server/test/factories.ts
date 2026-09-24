import { randomUUID } from 'node:crypto'
import type { Database } from '../src/infrastructure/database.ts'
import { createDefaultChannel } from '../src/modules/channels/index.ts'
import { newPublicChatKey } from '../src/modules/organizations/public-chat-key.ts'
import { uuidv7 } from '../src/shared/id.ts'
import { permissionsFor } from '../src/shared/permissions.ts'
import type { RequestContext } from '../src/shared/request-context.ts'
import { uniqueEmail } from './auth.ts'

// Like the onboarding: the organization and its default Web Chat channel.
export async function createOrganization(db: Database, name = `Corretora ${randomUUID()}`) {
  const id = uuidv7()
  return db.withTenant({ organizationId: id }, async (tx) => {
    const organization = await tx.organization.create({
      data: { id, name, slug: id, publicChatKey: newPublicChatKey() },
    })
    await createDefaultChannel(tx)
    return organization
  })
}

export function contextFor(organizationId: string): RequestContext {
  return {
    requestId: randomUUID(),
    userId: randomUUID(),
    sessionId: randomUUID(),
    isSuperAdmin: false,
    organizationId,
    role: 'ADMIN',
    permissions: permissionsFor('ADMIN'),
  }
}

// Two isolated tenants: every endpoint test proves that B never sees or changes A's rows (ADR-004).
export async function withTwoTenants(db: Database) {
  const [a, b] = await Promise.all([createOrganization(db), createOrganization(db)])
  return { tenantA: contextFor(a.id), tenantB: contextFor(b.id) }
}

// Two COMMERCIAL members of one organization (ADR-010). Later portfolio tests read A and miss B.
export async function withTwoSalespeople(db: Database, organizationId: string) {
  const [salespersonA, salespersonB] = await Promise.all([
    createSalesperson(db, organizationId),
    createSalesperson(db, organizationId),
  ])
  return { salespersonA, salespersonB }
}

async function createSalesperson(db: Database, organizationId: string): Promise<RequestContext> {
  const user = await db.user.create({
    data: { name: 'Vendedor', email: uniqueEmail('vendedor') },
  })
  await db.withTenant({ organizationId }, (tx) =>
    tx.member.create({ data: { userId: user.id, role: 'COMMERCIAL', active: true } }),
  )
  return {
    requestId: randomUUID(),
    userId: user.id,
    sessionId: randomUUID(),
    isSuperAdmin: false,
    organizationId,
    role: 'COMMERCIAL',
    permissions: permissionsFor('COMMERCIAL'),
  }
}

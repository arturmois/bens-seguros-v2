import type { Prisma } from '../../generated/prisma/client.ts'
import type { Transaction } from '../../infrastructure/database.ts'
import type { RequestContext } from '../../shared/request-context.ts'

// AD-013 lists the audited actions; a new one enters the AD before the code. The denylist is the
// mechanism: a caller that puts a personal key in `changes` still stores "[alterado]". Message text
// and the contact's phone are personal data too.
const REDACTED = '[alterado]'
const REDACTED_KEYS = new Set([
  'email',
  'name',
  'phone',
  'document',
  'documentEncrypted',
  'token',
  'password',
  'ipAddress',
  'userAgent',
  'phoneE164',
  'text',
])

function redact(value: unknown, path: string): Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    throw new Error(
      `Audit ${path} is ${value}; expected a string, number, boolean, array or object`,
    )
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) return value.map((item, index) => redact(item, `${path}[${index}]`))
  if (typeof value === 'object') {
    const out: { [key: string]: Prisma.InputJsonValue } = {}
    for (const [key, child] of Object.entries(value)) {
      out[key] = REDACTED_KEYS.has(key) ? REDACTED : redact(child, `${path}.${key}`)
    }
    return out
  }
  throw new Error(`Audit ${path} has unsupported type ${typeof value}`)
}

// Actors that are not a user (ADR-013): the system itself (a conversation reopened by the
// customer's message) and the AI (F4). They never carry a user id.
export const SYSTEM_ACTOR = { actorType: 'SYSTEM' } as const
export const AI_ACTOR = { actorType: 'AI' } as const

export type AuditActor = Pick<RequestContext, 'userId'> | typeof SYSTEM_ACTOR | typeof AI_ACTOR

// The actor is enough: the organization comes from the transaction's tenant (column default), so
// flows that only hold a `UserContext` (accepting an invitation, onboarding) record too.
export async function record(
  tx: Transaction,
  actor: AuditActor,
  input: { action: string; entityId: string; changes: unknown },
) {
  await tx.auditLog.create({
    data: {
      ...('userId' in actor
        ? { actorType: 'USER' as const, actorUserId: actor.userId }
        : { actorType: actor.actorType }),
      action: input.action,
      entityId: input.entityId,
      changes: redact(input.changes, 'changes'),
    },
  })
}

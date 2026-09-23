import type { Prisma } from '../../generated/prisma/client.ts'
import type { Transaction } from '../../infrastructure/database.ts'
import type { RequestContext } from '../../shared/request-context.ts'

// AD-008 lists the audited actions; a new one enters the AD before the code. The denylist is the
// mechanism: a caller that puts a personal key in `changes` still stores "[alterado]".
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

// The actor is enough: the organization comes from the transaction's tenant (column default), so
// flows that only hold a `UserContext` (accepting an invitation, onboarding) record too.
export async function record(
  tx: Transaction,
  ctx: Pick<RequestContext, 'userId'>,
  input: { action: string; entityId: string; changes: unknown },
) {
  await tx.auditLog.create({
    data: {
      actorUserId: ctx.userId,
      action: input.action,
      entityId: input.entityId,
      changes: redact(input.changes, 'changes'),
    },
  })
}

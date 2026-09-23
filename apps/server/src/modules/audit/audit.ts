import type { Prisma } from '../../generated/prisma/client.ts'
import type { Transaction } from '../../infrastructure/database.ts'
import type { RequestContext } from '../../shared/request-context.ts'

// AD-008. Later sensitive actions copy this call. The denylist is the mechanism: a caller that
// puts a personal key in `changes` still stores "[alterado]".
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

function redact(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) throw new Error('unexpected audit change')
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) return value.map((item) => redact(item))
  if (typeof value === 'object') {
    const out: { [key: string]: Prisma.InputJsonValue } = {}
    for (const [key, child] of Object.entries(value)) {
      out[key] = REDACTED_KEYS.has(key) ? REDACTED : redact(child)
    }
    return out
  }
  throw new Error('unexpected audit change')
}

export async function record(
  tx: Transaction,
  ctx: RequestContext,
  input: { action: string; entityId: string; changes: unknown },
) {
  await tx.auditLog.create({
    data: {
      actorUserId: ctx.userId,
      action: input.action,
      entityId: input.entityId,
      changes: redact(input.changes),
    },
  })
}

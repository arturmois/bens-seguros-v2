import { describe, expect, it } from 'vitest'
import type { Role } from './permissions.ts'
import type { RequestContext } from './request-context.ts'
import { scopeFor } from './scope.ts'

function context(role: Role): Pick<RequestContext, 'role' | 'userId'> {
  return { role, userId: 'u1' }
}

describe('scopeFor', () => {
  it('scopes contacts and conversations of the commercial role', () => {
    expect(scopeFor(context('COMMERCIAL'))).toEqual({
      contact: { OR: [{ ownerId: 'u1' }, { ownerId: null }] },
      conversation: {
        OR: [
          { assigneeId: 'u1' },
          { handler: 'QUEUE' },
          { contact: { ownerId: 'u1' } },
          { contact: { ownerId: null } },
        ],
      },
    })
    for (const role of ['ADMIN', 'MANAGER'] as const) {
      expect(scopeFor(context(role)), role).toEqual({ contact: {}, conversation: {} })
    }
  })
})

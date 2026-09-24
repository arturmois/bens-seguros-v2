import { describe, expect, it } from 'vitest'
import type { Role } from './permissions.ts'
import type { RequestContext } from './request-context.ts'
import { scopeFor } from './scope.ts'

function context(role: Role): Pick<RequestContext, 'role' | 'userId'> {
  return { role, userId: 'user-1' }
}

describe('scopeFor', () => {
  it('scopes only the commercial role to their user', () => {
    expect(scopeFor(context('COMMERCIAL'))).toEqual({ salespersonId: 'user-1' })
    for (const role of ['ADMIN', 'MANAGER'] as const) {
      expect(scopeFor(context(role)), role).toEqual({})
    }
  })
})

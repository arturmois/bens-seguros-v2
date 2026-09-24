import { describe, expect, it } from 'vitest'
import { ROLE_PERMISSIONS } from './permissions.ts'

describe('role permissions', () => {
  it('matches the role permission snapshot', () => {
    expect(ROLE_PERMISSIONS).toEqual({
      ADMIN: [
        'organization:read',
        'organization:update',
        'invitation:create',
        'member:update',
        'portfolio:transfer',
      ],
      MANAGER: ['organization:read'],
      COMMERCIAL: ['organization:read'],
    })
  })
})

import { describe, expect, it } from 'vitest'
import { ROLE_PERMISSIONS } from './permissions.ts'

describe('role permissions', () => {
  it('matches the role permission snapshot', () => {
    expect(ROLE_PERMISSIONS).toEqual({
      OWNER: ['organization:read', 'organization:update', 'invitation:create'],
      ADMIN: ['organization:read', 'organization:update', 'invitation:create'],
      MANAGER: ['organization:read'],
      COMMERCIAL: ['organization:read'],
      VIEWER: ['organization:read'],
    })
  })
})

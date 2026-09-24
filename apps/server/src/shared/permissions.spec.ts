import { describe, expect, it } from 'vitest'
import { PERMISSIONS, ROLE_PERMISSIONS } from './permissions.ts'

describe('role permissions', () => {
  it('matches the role permission snapshot', () => {
    expect(ROLE_PERMISSIONS).toEqual({
      ADMIN: [
        'organization:read',
        'organization:update',
        'invitation:create',
        'member:update',
        'portfolio:transfer',
        'conversation:read',
      ],
      MANAGER: ['organization:read', 'conversation:read'],
      COMMERCIAL: ['organization:read', 'conversation:read'],
    })
    expect(PERMISSIONS).toContain('conversation:read')
  })
})

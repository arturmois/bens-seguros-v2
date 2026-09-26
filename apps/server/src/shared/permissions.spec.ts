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
        'conversation:write',
      ],
      MANAGER: ['organization:read', 'conversation:read', 'conversation:write'],
      COMMERCIAL: ['organization:read', 'conversation:read', 'conversation:write'],
    })
    expect(PERMISSIONS).toContain('conversation:read')
    expect(PERMISSIONS).toContain('conversation:write')
  })

  it('grants conversation write to admin manager and commercial', () => {
    for (const role of ['ADMIN', 'MANAGER', 'COMMERCIAL'] as const) {
      expect(ROLE_PERMISSIONS[role]).toContain('conversation:write')
    }
  })
})

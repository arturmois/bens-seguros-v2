// ADR-016: the MVP roles. The creator of an organization is an ADMIN, and at least one ADMIN stays active.
export const ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL'] as const

export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  'organization:read',
  'organization:update',
  'invitation:create',
  'member:update',
  'portfolio:transfer',
  'conversation:read',
  'conversation:write',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
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
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role]
}

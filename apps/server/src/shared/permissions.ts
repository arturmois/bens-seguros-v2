// ADR-016: the MVP roles. The creator of an organization is an ADMIN, and at least one ADMIN stays active.
export const ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL'] as const

export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  'organization:read',
  'organization:update',
  'invitation:create',
  'member:update',
  'portfolio:transfer',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: [
    'organization:read',
    'organization:update',
    'invitation:create',
    'member:update',
    'portfolio:transfer',
  ],
  MANAGER: ['organization:read'],
  COMMERCIAL: ['organization:read'],
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role]
}

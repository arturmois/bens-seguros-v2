export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'COMMERCIAL', 'VIEWER'] as const

export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  'organization:read',
  'organization:update',
  'invitation:create',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: ['organization:read', 'organization:update', 'invitation:create'],
  ADMIN: ['organization:read', 'organization:update', 'invitation:create'],
  MANAGER: ['organization:read'],
  COMMERCIAL: ['organization:read'],
  VIEWER: ['organization:read'],
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role]
}

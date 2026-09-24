const ROLE_LABEL = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  COMMERCIAL: 'Comercial',
} as const

export type RoleName = keyof typeof ROLE_LABEL

export function roleLabel(role: RoleName) {
  return ROLE_LABEL[role]
}

export const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL'] as const

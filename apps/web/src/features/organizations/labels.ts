const ROLE_LABEL = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  COMMERCIAL: 'Comercial',
  VIEWER: 'Visualizador',
} as const

export type RoleName = keyof typeof ROLE_LABEL

export function roleLabel(role: RoleName) {
  return ROLE_LABEL[role]
}

export const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL', 'VIEWER'] as const

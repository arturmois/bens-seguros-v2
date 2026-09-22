import type { Permission, Role } from './permissions.ts'

// Who is performing an operation, without a tenant (AD-001). Built from the validated session by
// `requireSession` (`request.user`); routes that need no organization (`/me`, terms, 2FA) take it.
// `isSuperAdmin` is true only for an effective super-admin: the user flag and 2FA on.
export type UserContext = {
  requestId: string
  userId: string
  sessionId: string
  isSuperAdmin: boolean
}

// Who is performing an operation inside a tenant. Every tenant use case, repository and job receives
// it; the tenant never comes from the request. Built from the session's active organization checked
// against `Member` (`requireTenant`, `request.ctx`) or explicitly by jobs.
export type RequestContext = UserContext & {
  organizationId: string
  role: Role
  permissions: readonly Permission[]
}

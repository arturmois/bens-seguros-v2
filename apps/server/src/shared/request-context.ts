// Identity of whoever is performing an operation. Every use case and repository receives it.
// Built from the validated session (Phase 3) or explicitly by jobs; the tenant never comes from the request.
// Role, permissions and entitlements are added with tenancy (Phase 4).
export type RequestContext = {
  requestId: string
  userId: string
  organizationId: string
}

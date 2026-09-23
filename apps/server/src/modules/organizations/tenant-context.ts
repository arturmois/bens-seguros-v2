import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify'

import type { Database } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'
import { type Permission, permissionsFor } from '../../shared/permissions.ts'
import type { RequestContext, UserContext } from '../../shared/request-context.ts'
import { termsArePending } from '../auth/index.ts'
import { findActiveMember } from './membership.ts'

const termsPending = new AppError(
  403,
  'TERMS_NOT_ACCEPTED',
  'Aceite os termos e a política de privacidade para continuar.',
)
const noOrganization = new AppError(403, 'NO_ACTIVE_ORGANIZATION', 'Nenhuma organização ativa.')
const hidden = new AppError(404, 'NOT_FOUND', 'Organização não encontrada.')
const forbidden = new AppError(403, 'FORBIDDEN', 'Você não tem permissão para esta ação.')

export const REQUIRE_PERMISSION = Symbol.for('bens.requirePermission')

const SESSION_ONLY = new Set([
  'getMe',
  'acceptTerms',
  'onboardOrganization',
  'setActiveOrganization',
  'acceptInvitation',
])

type TenantDeps = { db: Database }

export async function loadTenant(
  deps: TenantDeps,
  user: UserContext,
): Promise<RequestContext | AppError> {
  if (await termsArePending(deps.db, user.userId)) return termsPending
  const session = await deps.db.session.findUnique({
    where: { id: user.sessionId },
    select: { activeOrganizationId: true },
  })
  if (!session?.activeOrganizationId) return noOrganization
  const member = await findActiveMember(deps.db, user.userId, session.activeOrganizationId)
  if (!member) return hidden
  return {
    ...user,
    organizationId: session.activeOrganizationId,
    role: member.role,
    permissions: permissionsFor(member.role),
  }
}

export function requireTenant(deps: TenantDeps) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = request.user
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.')
    const ctx = await loadTenant(deps, user)
    if (ctx instanceof AppError) throw ctx
    request.ctx = ctx
  }
}

// The tenant of a route behind `requireTenant`.
export function currentTenant(request: FastifyRequest): RequestContext {
  if (!request.ctx) {
    throw new Error(`requireTenant did not run before ${request.method} ${request.url}`)
  }
  return request.ctx
}

export function requirePermission(permission: Permission) {
  const hook = async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.ctx?.permissions.includes(permission)) throw forbidden
  }
  Object.assign(hook, { [REQUIRE_PERMISSION]: permission })
  return hook
}

export function assertRouteDeclaresPermission(route: RouteOptions) {
  if (!route.url.startsWith('/api/v1')) return
  const schema = route.schema
  const operationId =
    schema !== undefined && 'operationId' in schema && typeof schema.operationId === 'string'
      ? schema.operationId
      : undefined
  if (operationId !== undefined && SESSION_ONLY.has(operationId)) return
  const hooks = [route.preHandler].flat().filter((hook) => hook !== undefined)
  const guarded = hooks.some((hook) => typeof hook === 'function' && REQUIRE_PERMISSION in hook)
  if (!guarded) {
    throw new Error(`Route ${route.url} is missing requirePermission`)
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext | null
  }
}

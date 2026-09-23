import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Database } from '../../infrastructure/database.ts'
import type { Auth } from '../auth/index.ts'
import { requireSession } from '../auth/index.ts'
import {
  memberIdParams,
  memberListOutput,
  memberOutput,
  transferPortfolioInput,
  transferPortfolioOutput,
  updateMemberInput,
} from './member.schema.ts'
import { listMembers, transferPortfolio, updateMember } from './member.ts'
import { requirePermission, requireTenant } from './tenant-context.ts'

export type MemberRoutesDeps = { auth: Auth; db: Database }

export function memberRoutes(deps: MemberRoutesDeps): FastifyPluginAsyncZod {
  const session = requireSession(deps.auth)
  const tenant = requireTenant(deps)
  const canUpdate = [session, tenant, requirePermission('member:update')]
  return async (app) => {
    app.get(
      '/api/v1/members',
      {
        schema: {
          response: { 200: memberListOutput },
          tags: ['Members'],
          operationId: 'listMembers',
        },
        preHandler: canUpdate,
      },
      (request) => {
        const ctx = request.ctx
        if (!ctx) throw new Error('tenant context missing')
        return listMembers({ db: deps.db }, ctx)
      },
    )

    app.patch(
      '/api/v1/members/:id',
      {
        schema: {
          params: memberIdParams,
          body: updateMemberInput,
          response: { 200: memberOutput },
          tags: ['Members'],
          operationId: 'updateMember',
        },
        preHandler: canUpdate,
      },
      (request) => {
        const ctx = request.ctx
        if (!ctx) throw new Error('tenant context missing')
        return updateMember({ db: deps.db }, ctx, request.params.id, request.body)
      },
    )

    app.post(
      '/api/v1/members/:id/transfer-portfolio',
      {
        schema: {
          params: memberIdParams,
          body: transferPortfolioInput,
          response: { 200: transferPortfolioOutput },
          tags: ['Members'],
          operationId: 'transferPortfolio',
        },
        preHandler: [session, tenant, requirePermission('portfolio:transfer')],
      },
      (request) => {
        const ctx = request.ctx
        if (!ctx) throw new Error('tenant context missing')
        return transferPortfolio({ db: deps.db }, ctx, request.params.id, request.body)
      },
    )
  }
}

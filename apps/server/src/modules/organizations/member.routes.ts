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
import { currentTenant, requirePermission, requireTenant } from './tenant-context.ts'

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
      (request) => listMembers({ db: deps.db }, currentTenant(request)),
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
      (request) =>
        updateMember({ db: deps.db }, currentTenant(request), request.params.id, request.body),
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
      (request) =>
        transferPortfolio({ db: deps.db }, currentTenant(request), request.params.id, request.body),
    )
  }
}

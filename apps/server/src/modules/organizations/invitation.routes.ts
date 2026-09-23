import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Database } from '../../infrastructure/database.ts'
import type { Queue } from '../../infrastructure/queue.ts'
import type { Config } from '../../shared/config.ts'
import type { Auth } from '../auth/index.ts'
import { currentUser, requireSession } from '../auth/index.ts'
import {
  acceptInvitationInput,
  acceptInvitationOutput,
  createInvitationInput,
  invitationIdParams,
  invitationListOutput,
  invitationOutput,
  invitationPreviewOutput,
  invitationTokenParams,
  revokedInvitationOutput,
} from './invitation.schema.ts'
import {
  acceptInvitation,
  createInvitation,
  listInvitations,
  previewInvitation,
  revokeInvitation,
} from './invitation.ts'
import { requirePermission, requireTenant } from './tenant-context.ts'

export type InvitationRoutesDeps = { auth: Auth; config: Config; db: Database; queue: Queue }

export function invitationRoutes(deps: InvitationRoutesDeps): FastifyPluginAsyncZod {
  const session = requireSession(deps.auth)
  const tenant = requireTenant(deps)
  const canInvite = [session, tenant, requirePermission('invitation:create')]
  return async (app) => {
    app.post(
      '/api/v1/invitations',
      {
        schema: {
          body: createInvitationInput,
          response: { 200: invitationOutput },
          tags: ['Invitations'],
          operationId: 'createInvitation',
        },
        preHandler: canInvite,
      },
      (request) => {
        const ctx = request.ctx
        if (!ctx) throw new Error('tenant context missing')
        return createInvitation(
          { db: deps.db, queue: deps.queue, appUrl: deps.config.APP_URL },
          ctx,
          request.body,
        )
      },
    )

    app.get(
      '/api/v1/invitations',
      {
        schema: {
          response: { 200: invitationListOutput },
          tags: ['Invitations'],
          operationId: 'listInvitations',
        },
        preHandler: canInvite,
      },
      (request) => {
        const ctx = request.ctx
        if (!ctx) throw new Error('tenant context missing')
        return listInvitations({ db: deps.db }, ctx)
      },
    )

    app.delete(
      '/api/v1/invitations/:id',
      {
        schema: {
          params: invitationIdParams,
          response: { 200: revokedInvitationOutput },
          tags: ['Invitations'],
          operationId: 'revokeInvitation',
        },
        preHandler: canInvite,
      },
      (request) => {
        const ctx = request.ctx
        if (!ctx) throw new Error('tenant context missing')
        return revokeInvitation({ db: deps.db }, ctx, request.params.id)
      },
    )

    app.get(
      '/api/public/invitations/:token',
      {
        schema: {
          params: invitationTokenParams,
          response: { 200: invitationPreviewOutput },
          tags: ['Invitations'],
          operationId: 'getPublicInvitation',
        },
      },
      (request) => previewInvitation({ db: deps.db }, request.params.token),
    )

    app.post(
      '/api/v1/invitations/accept',
      {
        schema: {
          body: acceptInvitationInput,
          response: { 200: acceptInvitationOutput },
          tags: ['Invitations'],
          operationId: 'acceptInvitation',
        },
        preHandler: [session],
      },
      (request) =>
        acceptInvitation(
          { db: deps.db, maxOrgsPerUser: deps.config.MAX_ORGS_PER_USER },
          currentUser(request),
          request.body,
        ),
    )
  }
}

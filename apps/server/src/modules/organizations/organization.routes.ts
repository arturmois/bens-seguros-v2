import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Database } from '../../infrastructure/database.ts'
import type { Config } from '../../shared/config.ts'
import type { Auth } from '../auth/index.ts'
import { currentUser, requireSession } from '../auth/index.ts'
import { setActiveOrganization } from './active-organization.ts'
import { onboard } from './onboarding.ts'
import {
  onboardInput,
  onboardOutput,
  organizationOutput,
  renameOrganizationInput,
  renameOrganizationOutput,
  setActiveOrganizationInput,
  setActiveOrganizationOutput,
} from './organization.schema.ts'
import { getOrganization, renameOrganization } from './organization.ts'
import type { OrganizationSetup } from './portfolio.ts'
import { currentTenant, requirePermission, requireTenant } from './tenant-context.ts'

export type OrganizationRoutesDeps = {
  auth: Auth
  config: Config
  db: Database
  setupOrganization: readonly OrganizationSetup[]
}

export function organizationRoutes(deps: OrganizationRoutesDeps): FastifyPluginAsyncZod {
  const session = requireSession(deps.auth)
  const tenant = requireTenant(deps)
  return async (app) => {
    app.post(
      '/api/v1/onboarding',
      {
        schema: {
          body: onboardInput,
          response: { 200: onboardOutput },
          tags: ['Organizations'],
          operationId: 'onboardOrganization',
        },
        preHandler: [session],
      },
      (request) =>
        onboard(
          {
            db: deps.db,
            maxOrgsPerUser: deps.config.MAX_ORGS_PER_USER,
            setupOrganization: deps.setupOrganization,
          },
          currentUser(request),
          request.body,
        ),
    )

    app.post(
      '/api/v1/me/active-organization',
      {
        schema: {
          body: setActiveOrganizationInput,
          response: { 200: setActiveOrganizationOutput },
          tags: ['Organizations'],
          operationId: 'setActiveOrganization',
        },
        preHandler: [session],
      },
      (request) =>
        setActiveOrganization({ db: deps.db }, currentUser(request), request.body.organizationId),
    )

    app.get(
      '/api/v1/organization',
      {
        schema: {
          response: { 200: organizationOutput },
          tags: ['Organizations'],
          operationId: 'getOrganization',
        },
        preHandler: [session, tenant, requirePermission('organization:read')],
      },
      (request) => getOrganization({ db: deps.db }, currentTenant(request)),
    )

    app.patch(
      '/api/v1/organization',
      {
        schema: {
          body: renameOrganizationInput,
          response: { 200: renameOrganizationOutput },
          tags: ['Organizations'],
          operationId: 'renameOrganization',
        },
        preHandler: [session, tenant, requirePermission('organization:update')],
      },
      (request) => renameOrganization({ db: deps.db }, currentTenant(request), request.body.name),
    )
  }
}

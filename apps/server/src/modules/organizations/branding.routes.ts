import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Database } from '../../infrastructure/database.ts'
import type { Auth } from '../auth/index.ts'
import { requireSession } from '../auth/index.ts'
import {
  brandingOutput,
  updateBrandingInput,
  uploadLogoInput,
  uploadLogoOutput,
} from './branding.schema.ts'
import { readLogo, removeLogo, updateBranding, uploadLogo } from './branding.ts'
import { currentTenant, requirePermission, requireTenant } from './tenant-context.ts'

export type BrandingRoutesDeps = { auth: Auth; db: Database }

// A 200 KB image is ~273 KB in base64; the route stops anything past that margin before parsing.
const LOGO_BODY_LIMIT = 400 * 1024

export function brandingRoutes(deps: BrandingRoutesDeps): FastifyPluginAsyncZod {
  const session = requireSession(deps.auth)
  const tenant = requireTenant(deps)
  const canUpdate = [session, tenant, requirePermission('organization:update')]
  return async (app) => {
    app.patch(
      '/api/v1/organization/branding',
      {
        schema: {
          body: updateBrandingInput,
          response: { 200: brandingOutput },
          tags: ['Organizations'],
          operationId: 'updateOrganizationBranding',
        },
        preHandler: canUpdate,
      },
      (request) => updateBranding({ db: deps.db }, currentTenant(request), request.body),
    )

    app.put(
      '/api/v1/organization/logo',
      {
        bodyLimit: LOGO_BODY_LIMIT,
        schema: {
          body: uploadLogoInput,
          response: { 200: uploadLogoOutput },
          tags: ['Organizations'],
          operationId: 'uploadOrganizationLogo',
        },
        preHandler: canUpdate,
      },
      (request) => uploadLogo({ db: deps.db }, currentTenant(request), request.body.image),
    )

    app.delete(
      '/api/v1/organization/logo',
      {
        schema: { tags: ['Organizations'], operationId: 'removeOrganizationLogo' },
        preHandler: canUpdate,
      },
      async (request, reply) => {
        await removeLogo({ db: deps.db }, currentTenant(request))
        return reply.status(204).send()
      },
    )

    // Binary: the web reads it as an <img src>, so there is no JSON response schema.
    app.get(
      '/api/v1/organization/logo',
      {
        schema: { tags: ['Organizations'], operationId: 'getOrganizationLogo' },
        preHandler: [session, tenant, requirePermission('organization:read')],
      },
      async (request, reply) => {
        const logo = await readLogo({ db: deps.db }, currentTenant(request))
        reply.header('etag', logo.etag).header('cache-control', 'private, no-cache')
        if (request.headers['if-none-match'] === logo.etag) return reply.status(304).send()
        return reply.type(logo.type).send(logo.bytes)
      },
    )
  }
}

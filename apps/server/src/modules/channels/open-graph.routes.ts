import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Database } from '../../infrastructure/database.ts'
import type { Config } from '../../shared/config.ts'
import { AppError } from '../../shared/errors.ts'
import { isPreviewUserAgent, openGraphParams, renderOpenGraphHtml } from './open-graph.ts'

export type OpenGraphRoutesDeps = { db: Database; config: Config }

// Preview crawlers hit `/c/:key` through Caddy; browsers keep the SPA (door 1).
export function openGraphRoutes(deps: OpenGraphRoutesDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/c/:key',
      {
        schema: {
          params: openGraphParams,
          tags: ['Public chat'],
          operationId: 'getPublicChatOpenGraph',
        },
      },
      async (request, reply) => {
        if (!isPreviewUserAgent(request.headers['user-agent'])) {
          throw new AppError(404, 'NOT_FOUND', 'Link de atendimento não encontrado.')
        }
        const origin = `${request.protocol}://${request.hostname}`
        const html = await renderOpenGraphHtml(deps, request.params.key, { origin })
        return reply.type('text/html; charset=utf-8').send(html)
      },
    )
  }
}

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { commissionPreviewOutput, commissionPreviewQuery } from './example.schema.ts'
import { previewCommission } from './preview-commission.ts'

// Disposable (Phase 2): proves schema → route → OpenAPI → Orval → hook in the web app.
// No permission check yet: `requirePermission` arrives with RBAC (Phase 4).
export const exampleRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/v1/examples/commission-preview',
    {
      schema: {
        querystring: commissionPreviewQuery,
        response: { 200: commissionPreviewOutput },
        tags: ['Examples'],
        operationId: 'previewExampleCommission',
      },
    },
    async (request) => previewCommission(request.query),
  )
}

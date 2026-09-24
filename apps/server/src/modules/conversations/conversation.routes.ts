import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Database } from '../../infrastructure/database.ts'
import type { Auth } from '../auth/index.ts'
import { requireSession } from '../auth/index.ts'
import { currentTenant, requirePermission, requireTenant } from '../organizations/index.ts'
import {
  conversationIdParams,
  conversationListOutput,
  conversationListQuery,
  conversationOutput,
  conversationQuery,
  messageListOutput,
  messageListQuery,
} from './conversation.schema.ts'
import { findReadableConversation, listConversationMessages, listConversations } from './read.ts'

export type ConversationRoutesDeps = { auth: Auth; db: Database }

export function conversationRoutes(deps: ConversationRoutesDeps): FastifyPluginAsyncZod {
  const canRead = [
    requireSession(deps.auth),
    requireTenant(deps),
    requirePermission('conversation:read'),
  ]
  return async (app) => {
    app.get(
      '/api/v1/conversations',
      {
        schema: {
          querystring: conversationListQuery,
          response: { 200: conversationListOutput },
          tags: ['Conversations'],
          operationId: 'listConversations',
        },
        preHandler: canRead,
      },
      (request) => listConversations({ db: deps.db }, currentTenant(request), request.query),
    )

    app.get(
      '/api/v1/conversations/:id',
      {
        schema: {
          params: conversationIdParams,
          querystring: conversationQuery,
          response: { 200: conversationOutput },
          tags: ['Conversations'],
          operationId: 'getConversation',
        },
        preHandler: canRead,
      },
      (request) =>
        findReadableConversation({ db: deps.db }, currentTenant(request), request.params.id),
    )

    app.get(
      '/api/v1/conversations/:id/messages',
      {
        schema: {
          params: conversationIdParams,
          querystring: messageListQuery,
          response: { 200: messageListOutput },
          tags: ['Conversations'],
          operationId: 'listConversationMessages',
        },
        preHandler: canRead,
      },
      (request) =>
        listConversationMessages(
          { db: deps.db },
          currentTenant(request),
          request.params.id,
          request.query,
        ),
    )
  }
}

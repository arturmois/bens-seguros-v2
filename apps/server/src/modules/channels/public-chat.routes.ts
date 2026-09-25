import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Database } from '../../infrastructure/database.ts'
import type { Config } from '../../shared/config.ts'
import { AppError } from '../../shared/errors.ts'
import { readLogo } from '../organizations/index.ts'
import {
  messagesQuery,
  publicChatOutput,
  publicChatParams,
  publicMessageListOutput,
  publicMessageOutput,
  sendMessageInput,
  startSessionInput,
} from './public-chat.schema.ts'
import {
  describePublicChat,
  listVisitorMessages,
  publicChatOrganization,
  sendVisitorMessage,
  startSession,
} from './public-chat.ts'
import { visitorCookieFor, visitorCookieOf } from './visitor-token.ts'

export type PublicChatRoutesDeps = { db: Database; config: Config }

const MINUTE = 60_000

const rateLimited = new AppError(
  429,
  'RATE_LIMITED',
  'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.',
)

type Limit = { max: number; key: (request: FastifyRequest) => string }

// In-memory limits of the public chat (door 6), checked in order; the first one exceeded answers
// 429 before the handler. Each limit has its own counter.
function limitBy(app: FastifyInstance, limits: Limit[]) {
  const limiters = limits.map((limit) =>
    app.createRateLimit({
      max: limit.max,
      timeWindow: MINUTE,
      keyGenerator: limit.key,
    }),
  )
  return async (request: FastifyRequest) => {
    for (const limiter of limiters) {
      const result = await limiter(request)
      if (!result.isAllowed && result.isExceeded) throw rateLimited
    }
  }
}

const byIp = (request: FastifyRequest) => request.ip
const byKey = (request: FastifyRequest) => {
  const params = request.params
  return typeof params === 'object' && params !== null && 'key' in params
    ? String(params.key)
    : request.ip
}
// Before the cookie is checked: a request with no cookie is limited by its IP.
const byVisitor = (request: FastifyRequest) => visitorCookieOf(request.headers.cookie) ?? request.ip

// ADR-014: the Web Chat link, outside `/api/v1` and with no panel session. The key in the path
// resolves the tenant (AD-018); the visitor cookie scopes the conversation.
export function publicChatRoutes(deps: PublicChatRoutesDeps): FastifyPluginAsyncZod {
  return async (app) => {
    const limitReads = limitBy(app, [{ max: 120, key: byIp }])
    const limitStarts = limitBy(app, [
      { max: 5, key: byIp },
      { max: 60, key: byKey },
    ])
    const limitMessages = limitBy(app, [{ max: 20, key: byVisitor }])

    app.get(
      '/api/public/chat/:key',
      {
        schema: {
          params: publicChatParams,
          response: { 200: publicChatOutput },
          tags: ['Public chat'],
          operationId: 'getPublicChat',
        },
        onRequest: limitReads,
      },
      (request) => describePublicChat(deps, request.params.key),
    )

    // Binary: the page reads it as an <img src>, so there is no JSON response schema.
    app.get(
      '/api/public/chat/:key/logo',
      {
        schema: {
          params: publicChatParams,
          tags: ['Public chat'],
          operationId: 'getPublicChatLogo',
        },
        onRequest: limitReads,
      },
      async (request, reply) => {
        const tenant = await publicChatOrganization(deps, request.params.key)
        const logo = await readLogo(deps, tenant)
        reply.header('etag', logo.etag).header('cache-control', 'public, no-cache')
        if (request.headers['if-none-match'] === logo.etag) return reply.status(304).send()
        return reply.type(logo.type).send(logo.bytes)
      },
    )

    app.post(
      '/api/public/chat/:key/sessions',
      {
        schema: {
          params: publicChatParams,
          body: startSessionInput,
          response: { 201: publicMessageOutput },
          tags: ['Public chat'],
          operationId: 'startPublicChatSession',
        },
        onRequest: limitStarts,
      },
      async (request, reply) => {
        const { key } = request.params
        const started = await startSession(deps, key, request.body, request.ip)
        reply.header('set-cookie', visitorCookieFor(deps.config, key, started.token))
        return reply.status(201).send({ message: started.message })
      },
    )

    app.post(
      '/api/public/chat/:key/messages',
      {
        schema: {
          params: publicChatParams,
          body: sendMessageInput,
          response: { 200: publicMessageOutput, 201: publicMessageOutput },
          tags: ['Public chat'],
          operationId: 'sendPublicChatMessage',
        },
        onRequest: limitMessages,
      },
      async (request, reply) => {
        const sent = await sendVisitorMessage(
          deps,
          request.params.key,
          visitorCookieOf(request.headers.cookie),
          request.body,
        )
        return reply.status(sent.created ? 201 : 200).send({ message: sent.message })
      },
    )

    app.get(
      '/api/public/chat/:key/messages',
      {
        schema: {
          params: publicChatParams,
          querystring: messagesQuery,
          response: { 200: publicMessageListOutput },
          tags: ['Public chat'],
          operationId: 'listPublicChatMessages',
        },
        onRequest: limitReads,
      },
      (request) =>
        listVisitorMessages(
          deps,
          request.params.key,
          visitorCookieOf(request.headers.cookie),
          request.query.after,
        ),
    )
  }
}

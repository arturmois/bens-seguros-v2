import { randomUUID } from 'node:crypto'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import Fastify, { LogController } from 'fastify'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Deps } from './dependencies.ts'
import { createRealtime, type Realtime } from './infrastructure/realtime.ts'
import { authRoutes, headersOf, resolveSession } from './modules/auth/index.ts'
import {
  createDefaultChannel,
  publicChatRoutes,
  readVisitorToken,
  visitorTokenKey,
} from './modules/channels/index.ts'
import { moveContactOwner } from './modules/contacts/index.ts'
import {
  conversationRoutes,
  findMessage,
  findReadableConversation,
} from './modules/conversations/index.ts'
import {
  assertRouteDeclaresPermission,
  brandingRoutes,
  invitationRoutes,
  loadTenant,
  memberRoutes,
  organizationRoutes,
} from './modules/organizations/index.ts'
import { AppError, errorHandler, notFoundHandler } from './shared/errors.ts'

z.config(z.locales.ptBR())

const healthOutput = z.object({ status: z.literal('ok') })

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

declare module 'fastify' {
  interface FastifyInstance {
    realtime: Realtime
  }
}

export function buildApp(deps: Deps) {
  const { config } = deps
  const appOrigin = new URL(config.APP_URL).origin

  const app = Fastify({
    loggerInstance: deps.logger,
    genReqId: () => randomUUID(),
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    // `request.ip` is the client behind the proxy only when the proxy is trusted (AD-002).
    trustProxy: config.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)
  app.decorateRequest('user', null)
  app.decorateRequest('ctx', null)

  app.register(fastifyHelmet, {
    // The API returns JSON; the SPA's CSP is set by Caddy. Swagger UI (dev only) needs inline code.
    contentSecurityPolicy: config.NODE_ENV === 'production',
  })

  // Only the routes that ask for it are limited (the public chat, door 6 of `public-chat-api`).
  app.register(fastifyRateLimit, { global: false })

  // Collects every route schema; scripts/export-openapi.ts writes it for Orval (ADR-007).
  app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Bens Seguros API', version: '1.0.0' },
    },
    transform: jsonSchemaTransform,
  })
  if (config.NODE_ENV !== 'production') {
    app.register(fastifySwaggerUi, { routePrefix: '/api/docs' })
  }

  const realtime = createRealtime(app.server, {
    allowedOrigin: appOrigin,
    authenticate: async (request) => {
      const session = await resolveSession(deps.auth, headersOf(request))
      if (!session) return null
      const user = { requestId: '', ...session.context }
      const ctx = await loadTenant(deps, user)
      return {
        ...session.context,
        organizationId: ctx instanceof AppError ? null : ctx.organizationId,
      }
    },
    authorizeJoin: async (user, conversationId) => {
      const { userId, sessionId, isSuperAdmin } = user
      // The tenant of this moment (terms, active organization, membership), not the handshake's.
      const ctx = await loadTenant(deps, { requestId: '', userId, sessionId, isSuperAdmin })
      if (ctx instanceof AppError) return false
      return findReadableConversation(deps, ctx, conversationId).then(
        () => true,
        (error: unknown) => {
          if (error instanceof AppError && error.status === 404) return false
          throw error
        },
      )
    },
    authenticateVisitor: (token) =>
      readVisitorToken(visitorTokenKey(deps.config.BETTER_AUTH_SECRET), token),
  })
  app.decorate('realtime', realtime)
  app.addHook('preClose', async () => {
    await realtime.close()
  })

  // Events committed by any process (ADR-012) reach the sockets in the conversation's room.
  deps.events.on('message.created', async (event) => {
    const message = await findMessage(deps, event, event)
    if (!message) return
    realtime.io
      .to(`conversation:${event.conversationId}`)
      .emit('message.created', { conversationId: event.conversationId, message })
    // Visitors get PublicMessage, and only from their session's fromSeq (door 3).
    const publicMessage = {
      id: message.id,
      seq: message.seq,
      direction: message.direction,
      author: message.author,
      kind: message.kind,
      text: message.text,
      sentAt: message.sentAt,
    }
    const visitors = await realtime.visitor
      .in(`conversation:${event.conversationId}`)
      .fetchSockets()
    for (const socket of visitors) {
      const session = socket.data.session
      if (!session || message.seq < session.fromSeq) continue
      socket.emit('message.created', {
        conversationId: event.conversationId,
        message: publicMessage,
      })
    }
  })
  // Events sent while the listener was down are gone: every client reloads from the API.
  deps.events.onReconnect(() => {
    realtime.io.emit('events:resync', {})
    realtime.visitor.emit('events:resync', {})
  })
  // One place starts the listener, for the server and the tests alike.
  app.addHook('onReady', async () => {
    await deps.events.start()
  })

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
    // CSRF (AD-004): writes only from the app's own origin, on top of SameSite=Lax. Every path,
    // not a prefix of the raw URL: the router matches the decoded path (`/%61pi/...` is `/api/...`).
    if (MUTATING_METHODS.has(request.method) && request.headers.origin !== appOrigin) {
      throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origem da requisição não permitida.')
    }
  })

  app.addHook('onRoute', assertRouteDeclaresPermission)

  // Routes go through `register` so @fastify/swagger (loaded first) sees them.
  app.register(async (api) => {
    api.get(
      '/api/health',
      {
        schema: { response: { 200: healthOutput }, tags: ['Health'], operationId: 'getHealth' },
      },
      async () => ({ status: 'ok' as const }),
    )
  })
  app.register(authRoutes(deps))
  // Cross-module steps of the organizations module, wired here so it imports none of them (AD-017).
  app.register(organizationRoutes({ ...deps, setupOrganization: [createDefaultChannel] }))
  app.register(brandingRoutes(deps))
  app.register(invitationRoutes(deps))
  app.register(memberRoutes({ ...deps, portfolioMoves: [moveContactOwner] }))
  app.register(conversationRoutes(deps))
  app.register(publicChatRoutes(deps))

  return app
}

export type App = ReturnType<typeof buildApp>

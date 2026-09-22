import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Database } from '../../infrastructure/database.ts'
import type { Config } from '../../shared/config.ts'
import type { Auth } from './auth.ts'
import { meOutput } from './me.schema.ts'
import { getMe } from './me.ts'
import { currentUser, headersOf, requireSession } from './session-context.ts'

export type AuthRoutesDeps = { auth: Auth; config: Config; db: Database }

export function authRoutes(deps: AuthRoutesDeps): FastifyPluginAsyncZod {
  return async (app) => {
    // Better Auth behind Fastify (ADR-003), so the Origin hook, request ids and helmet apply.
    app.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      schema: { hide: true },
      async handler(request, reply) {
        const headers = headersOf(request)
        // The only client IP Better Auth sees is the one Fastify resolved (AD-002): behind the
        // trusted proxy, its X-Forwarded-For; otherwise the socket address.
        headers.set('x-forwarded-for', request.ip)
        const response = await deps.auth.handler(
          new Request(new URL(request.url, deps.config.APP_URL), {
            method: request.method,
            headers,
            ...(request.body !== undefined && { body: JSON.stringify(request.body) }),
          }),
        )

        reply.status(response.status)
        for (const [key, value] of response.headers) {
          if (key !== 'set-cookie') reply.header(key, value)
        }
        for (const cookie of response.headers.getSetCookie()) reply.header('set-cookie', cookie)
        return reply.send(await response.text())
      },
    })

    app.get(
      '/api/v1/me',
      {
        schema: { response: { 200: meOutput }, tags: ['Me'], operationId: 'getMe' },
        preHandler: [requireSession(deps.auth)],
      },
      (request) => getMe(deps, currentUser(request)),
    )
  }
}

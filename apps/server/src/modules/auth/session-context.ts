import type { IncomingHttpHeaders } from 'node:http'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from '../../shared/errors.ts'
import type { UserContext } from '../../shared/request-context.ts'
import type { Auth } from './auth.ts'

declare module 'fastify' {
  interface FastifyRequest {
    // Set by `requireSession`; null on routes that do not require it.
    user: UserContext | null
  }
}

export type SessionUser = {
  context: Omit<UserContext, 'requestId'>
  profile: {
    id: string
    name: string
    email: string
    emailVerified: boolean
    twoFactorEnabled: boolean
    activeOrganizationId: string | null
  }
  // Set-Cookie headers of a session refresh (after 12 h); the caller forwards them.
  setCookies: string[]
}

// One resolution for HTTP and Socket.IO: the session cookie, checked against the database.
export async function resolveSession(auth: Auth, headers: Headers): Promise<SessionUser | null> {
  const { headers: responseHeaders, response } = await auth.api.getSession({
    headers,
    returnHeaders: true,
  })
  if (!response) return null
  const { session, user } = response
  const twoFactorEnabled = user.twoFactorEnabled === true
  return {
    context: {
      userId: user.id,
      sessionId: session.id,
      // Effective super-admin only: the flag without 2FA grants nothing.
      isSuperAdmin: user.isSuperAdmin === true && twoFactorEnabled,
    },
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      twoFactorEnabled,
      activeOrganizationId: session.activeOrganizationId ?? null,
    },
    setCookies: responseHeaders.getSetCookie(),
  }
}

export function unauthenticated() {
  return new AppError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.')
}

export function headersOf(request: { headers: IncomingHttpHeaders }): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item)
  }
  return headers
}

// preHandler of every authenticated route without a tenant: `request.user`, or 401.
export function requireSession(auth: Auth) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await resolveSession(auth, headersOf(request))
    if (!session) throw unauthenticated()
    for (const cookie of session.setCookies) reply.header('set-cookie', cookie)
    request.user = { requestId: request.id, ...session.context }
  }
}

// The user of a route behind `requireSession`.
export function currentUser(request: FastifyRequest): UserContext {
  if (!request.user) throw unauthenticated()
  return request.user
}

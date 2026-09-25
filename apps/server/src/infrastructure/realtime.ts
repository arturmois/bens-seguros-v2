import type { Server as HttpServer, IncomingMessage } from 'node:http'
import { Server } from 'socket.io'
import { z } from 'zod'

export type Realtime = ReturnType<typeof createRealtime>

export type SocketUser = {
  userId: string
  sessionId: string
  isSuperAdmin: boolean
  organizationId: string | null
}

export type RealtimeOptions = {
  // Only this origin may open a socket (the handshake carries the session cookie).
  allowedOrigin: string
  // Resolves the session from the handshake headers, like an HTTP request (ADR-003).
  authenticate: (request: IncomingMessage) => Promise<SocketUser | null>
  // Whether the user may read the conversation now (tenant and portfolio, ADR-016). Asked at every
  // join, not at the handshake: the active organization and the portfolio change after it.
  authorizeJoin: (user: SocketUser, conversationId: string) => Promise<boolean>
}

// The same `status` + stable `code` as an API error body, so the web handles both alike.
export type RoomAck = { ok: true } | { ok: false; status: number; code: string }

const roomInput = z.object({ conversationId: z.uuid() }).strict()

const invalidRoom: RoomAck = { ok: false, status: 400, code: 'VALIDATION_ERROR' }
const hiddenRoom: RoomAck = { ok: false, status: 404, code: 'NOT_FOUND' }
const failedRoom: RoomAck = { ok: false, status: 500, code: 'INTERNAL_ERROR' }

declare module 'socket.io' {
  interface SocketData {
    user: SocketUser
  }
}

// Socket.IO on the API's own HTTP server (same origin, no adapter: one instance, ADR-006).
// `user:*` is every authenticated socket; `org:*` only when `requireTenant` would build a context;
// `conversation:*` on request (`conversation:join`), for a conversation the user may read.
export function createRealtime(httpServer: HttpServer, options: RealtimeOptions) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    // Refused before the upgrade: a page on another origin cannot ride the user's cookie.
    allowRequest: (request, callback) => {
      callback(null, request.headers.origin === options.allowedOrigin)
    },
  })

  io.on('connection', (socket) => {
    const user = socket.data.user
    void socket.join(`user:${user.userId}`)
    if (user.organizationId) void socket.join(`org:${user.organizationId}`)

    socket.on('conversation:join', async (input: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return
      const parsed = roomInput.safeParse(input)
      if (!parsed.success) return ack(invalidRoom)
      const { conversationId } = parsed.data
      try {
        if (!(await options.authorizeJoin(user, conversationId))) return ack(hiddenRoom)
      } catch {
        return ack(failedRoom)
      }
      await socket.join(`conversation:${conversationId}`)
      ack({ ok: true })
    })

    socket.on('conversation:leave', async (input: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return
      const parsed = roomInput.safeParse(input)
      if (!parsed.success) return ack(invalidRoom)
      await socket.leave(`conversation:${parsed.data.conversationId}`)
      ack({ ok: true })
    })
  })

  io.use((socket, next) => {
    options.authenticate(socket.request).then(
      (user) => {
        if (!user) return next(new Error('UNAUTHENTICATED'))
        socket.data.user = user
        next()
      },
      (error: unknown) => next(error instanceof Error ? error : new Error('UNAUTHENTICATED')),
    )
  })

  return {
    io,
    close() {
      return io.close()
    },
  }
}

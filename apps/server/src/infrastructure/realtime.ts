import type { Server as HttpServer, IncomingMessage } from 'node:http'
import { Server } from 'socket.io'

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
}

declare module 'socket.io' {
  interface SocketData {
    user: SocketUser
  }
}

// Socket.IO on the API's own HTTP server (same origin, no adapter: one instance, ADR-006).
// `conversation:*` arrives with the chat. `user:*` is every authenticated socket; `org:*` only when
// `requireTenant` would build a context.
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

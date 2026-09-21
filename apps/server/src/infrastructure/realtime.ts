import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'

export type Realtime = ReturnType<typeof createRealtime>

// Socket.IO on the API's own HTTP server (same origin, no adapter: one instance, ADR-006).
// Cookie authentication and the `org:*`, `user:*` and `conversation:*` rooms come with auth (Phase 3).
export function createRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, { path: '/socket.io', serveClient: false })

  return {
    io,
    close() {
      return io.close()
    },
  }
}

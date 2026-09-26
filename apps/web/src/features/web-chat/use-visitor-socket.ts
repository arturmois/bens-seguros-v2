import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { ListPublicChatMessages200ItemsItem } from '@/api/model'

type PublicMessage = ListPublicChatMessages200ItemsItem

type Pushed = {
  conversationId: string
  message: PublicMessage
}

declare global {
  interface Window {
    __bensVisitorSocket?: Socket
  }
}

// Connects the visitor to `/visitor` with the session token (door 2) and merges push + resync.
export function useVisitorSocket(options: {
  token: string | null
  enabled: boolean
  onMessage: (message: PublicMessage) => void
  onResync: () => void
}) {
  const { token, enabled, onMessage, onResync } = options
  const onMessageRef = useRef(onMessage)
  const onResyncRef = useRef(onResync)
  onMessageRef.current = onMessage
  onResyncRef.current = onResync

  useEffect(() => {
    if (!enabled || !token) return

    const socket = io('/visitor', {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      forceNew: true,
    })
    window.__bensVisitorSocket = socket

    const handleMessage = (payload: Pushed) => {
      onMessageRef.current(payload.message)
    }
    const handleResync = () => {
      onResyncRef.current()
    }

    socket.on('message.created', handleMessage)
    socket.on('events:resync', handleResync)
    // e2e seam: Playwright cannot emit server events, so it dispatches this window event.
    window.addEventListener('bens:visitor-resync', handleResync)

    return () => {
      socket.off('message.created', handleMessage)
      socket.off('events:resync', handleResync)
      window.removeEventListener('bens:visitor-resync', handleResync)
      socket.disconnect()
      if (window.__bensVisitorSocket === socket) delete window.__bensVisitorSocket
    }
  }, [enabled, token])
}

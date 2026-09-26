import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { io, type Socket } from 'socket.io-client'
import { getListConversationMessagesQueryKey, getListConversationsQueryKey } from '@/api/endpoints'
import type { ListConversationMessages200ItemsItem } from '@/api/model'

type PanelMessage = ListConversationMessages200ItemsItem

declare global {
  interface Window {
    __bensPanelSocket?: Socket
    __bensPanelJoined?: string
  }
}

// Panel Socket.IO: cookie session on the default namespace; join a conversation room for live messages.
export function usePanelSocket(conversationId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!conversationId) return

    const socket = io({
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
    })
    window.__bensPanelSocket = socket

    const onMessage = (payload: { conversationId: string; message: PanelMessage }) => {
      if (payload.conversationId !== conversationId) return
      void queryClient.invalidateQueries({
        queryKey: getListConversationMessagesQueryKey(conversationId),
      })
      void queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
    }

    const onResync = () => {
      void queryClient.invalidateQueries({
        queryKey: getListConversationMessagesQueryKey(conversationId),
      })
      void queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
    }

    socket.on('connect', () => {
      socket.emit('conversation:join', { conversationId }, (ack: { ok?: boolean }) => {
        if (ack?.ok) {
          window.__bensPanelJoined = conversationId
        } else {
          void queryClient.invalidateQueries({
            queryKey: getListConversationMessagesQueryKey(conversationId),
          })
        }
      })
    })
    socket.on('message.created', onMessage)
    socket.on('events:resync', onResync)

    return () => {
      socket.emit('conversation:leave', { conversationId }, () => undefined)
      socket.off('message.created', onMessage)
      socket.off('events:resync', onResync)
      socket.disconnect()
      if (window.__bensPanelSocket === socket) delete window.__bensPanelSocket
    }
  }, [conversationId, queryClient])
}

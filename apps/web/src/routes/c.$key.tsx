import { createFileRoute } from '@tanstack/react-router'
import { WebChatPage } from '@/features/web-chat/web-chat-page'

export const Route = createFileRoute('/c/$key')({
  component: PublicWebChat,
})

function PublicWebChat() {
  const { key } = Route.useParams()
  return <WebChatPage publicChatKey={key} />
}

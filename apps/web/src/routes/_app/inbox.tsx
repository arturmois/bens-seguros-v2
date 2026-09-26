import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { InboxPage } from '@/features/inbox/inbox-page'

const searchSchema = z.object({
  view: z.enum(['queue', 'mine']).default('queue'),
  conversationId: z.uuid().optional().catch(undefined),
})

export const Route = createFileRoute('/_app/inbox')({
  validateSearch: searchSchema,
  component: InboxRoute,
})

function InboxRoute() {
  const { view, conversationId } = Route.useSearch()
  return <InboxPage view={view} conversationId={conversationId} />
}

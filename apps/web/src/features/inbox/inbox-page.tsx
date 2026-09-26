import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import {
  getGetConversationQueryKey,
  getListConversationMessagesQueryKey,
  getListConversationsQueryKey,
  useCloseConversation,
  useGetConversation,
  useListConversationMessages,
  useListConversations,
  useSendConversationMessage,
  useTakeConversation,
} from '@/api/endpoints'
import type { ListConversations200ItemsItem } from '@/api/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMe } from '@/hooks/use-me'
import { ApiError } from '@/lib/http'
import { cn } from '@/lib/utils'
import { usePanelSocket } from './use-panel-socket'

export type InboxView = 'queue' | 'mine'

type InboxPageProps = {
  view: InboxView
  conversationId?: string | undefined
}

export function InboxPage({ view, conversationId }: InboxPageProps) {
  const list = useListConversations({ view }, { query: { retry: false } })

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4" data-testid="inbox-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Inbox</h1>
          <p className="text-muted-foreground text-sm">Fila e conversas em atendimento.</p>
        </div>
        <nav className="flex gap-2" aria-label="Views do inbox">
          <ViewLink view="queue" current={view} label="Fila" />
          <ViewLink view="mine" current={view} label="Minhas" />
        </nav>
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(16rem,20rem)_1fr]">
        <aside className="min-h-64 rounded-md border">
          {list.isPending ? (
            <p className="p-4 text-muted-foreground text-sm" data-testid="inbox-list-loading">
              Carregando conversas…
            </p>
          ) : null}
          {list.isError ? (
            <div className="flex flex-col gap-3 p-4" data-testid="inbox-list-error">
              <p className="text-sm">Não foi possível carregar as conversas.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void list.refetch()}>
                Tentar de novo
              </Button>
            </div>
          ) : null}
          {list.isSuccess && list.data.items.length === 0 ? (
            <p className="p-4 text-muted-foreground text-sm" data-testid="inbox-list-empty">
              {view === 'queue' ? 'Nenhuma conversa na fila.' : 'Você não tem conversas abertas.'}
            </p>
          ) : null}
          {list.isSuccess && list.data.items.length > 0 ? (
            <ul className="divide-y" data-testid="inbox-list">
              {list.data.items.map((item) => (
                <ConversationRow key={item.id} item={item} view={view} selected={conversationId} />
              ))}
            </ul>
          ) : null}
        </aside>

        <div className="min-h-64 rounded-md border">
          {conversationId ? (
            <Thread conversationId={conversationId} view={view} />
          ) : (
            <p className="p-6 text-muted-foreground text-sm">Selecione uma conversa.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function ViewLink({
  view,
  current,
  label,
}: {
  view: InboxView
  current: InboxView
  label: string
}) {
  return (
    <Link
      to="/inbox"
      search={{ view }}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm',
        current === view
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
      data-testid={`inbox-view-${view}`}
    >
      {label}
    </Link>
  )
}

function ConversationRow({
  item,
  view,
  selected,
}: {
  item: ListConversations200ItemsItem
  view: InboxView
  selected?: string | undefined
}) {
  return (
    <li>
      <Link
        to="/inbox"
        search={{ view, conversationId: item.id }}
        className={cn(
          'block px-3 py-3 text-sm hover:bg-muted/50',
          selected === item.id && 'bg-muted',
        )}
        data-testid="inbox-conversation-row"
      >
        <div className="font-medium">{item.contact.phoneE164}</div>
        <div className="text-muted-foreground text-xs">
          {item.handler === 'QUEUE'
            ? 'Na fila'
            : item.status === 'WAITING'
              ? 'Aguardando cliente'
              : 'Aberta'}
        </div>
      </Link>
    </li>
  )
}

function Thread({ conversationId, view }: { conversationId: string; view: InboxView }) {
  const me = useMe()
  const queryClient = useQueryClient()
  const conversation = useGetConversation(conversationId, { query: { retry: false } })
  const messages = useListConversationMessages(conversationId, undefined, {
    query: { enabled: conversation.isSuccess, retry: false },
  })
  const take = useTakeConversation()
  const send = useSendConversationMessage()
  const closeMutation = useCloseConversation()
  const [text, setText] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [failure, setFailure] = useState<string>()

  usePanelSocket(conversation.isSuccess ? conversationId : undefined)

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(conversationId) }),
      queryClient.invalidateQueries({
        queryKey: getListConversationMessagesQueryKey(conversationId),
      }),
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey({ view }) }),
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey({ view: 'queue' }) }),
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey({ view: 'mine' }) }),
    ])
  }

  if (conversation.isPending) {
    return (
      <p className="p-4 text-muted-foreground text-sm" data-testid="inbox-thread-loading">
        Carregando a conversa…
      </p>
    )
  }

  if (conversation.isError || !conversation.data) {
    const notFound = conversation.error instanceof ApiError && conversation.error.status === 404
    return (
      <div className="flex flex-col gap-3 p-4" data-testid="inbox-thread-error">
        <p className="text-sm">
          {notFound
            ? 'Conversa não encontrada.'
            : 'Não foi possível carregar a conversa. Tente de novo.'}
        </p>
        {!notFound ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void conversation.refetch()}
          >
            Tentar de novo
          </Button>
        ) : null}
      </div>
    )
  }

  const data = conversation.data
  const canClose = me.role === 'ADMIN' || me.role === 'MANAGER' || data.assigneeId === me.id
  const canSend = data.handler === 'HUMAN' && data.assigneeId === me.id && data.status !== 'CLOSED'
  const showTake = data.handler === 'QUEUE' || data.handler === 'AI'

  const ordered = [...(messages.data?.items ?? [])].sort((a, b) => a.seq - b.seq)

  async function onTake() {
    setFailure(undefined)
    try {
      await take.mutateAsync({ id: conversationId, data: {} })
      await invalidate()
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : 'Não foi possível assumir.')
    }
  }

  async function onSend(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setFailure(undefined)
    try {
      await send.mutateAsync({ id: conversationId, data: { text: trimmed } })
      setText('')
      await invalidate()
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : 'Não foi possível enviar.')
    }
  }

  async function onClose() {
    setFailure(undefined)
    try {
      await closeMutation.mutateAsync({ id: conversationId, data: {} })
      setConfirmClose(false)
      await invalidate()
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : 'Não foi possível encerrar.')
    }
  }

  return (
    <div className="flex h-full min-h-64 flex-col" data-testid="inbox-thread">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div>
          <p className="font-medium" data-testid="inbox-thread-phone">
            {data.contact.phoneE164}
          </p>
          {data.channel.kind === 'WEB_CHAT' ? (
            <p
              className="text-amber-700 text-xs dark:text-amber-400"
              data-testid="inbox-unverified-badge"
            >
              Telefone não verificado
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {data.handler} · {data.status}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showTake ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void onTake()}
              disabled={take.isPending}
              data-testid="inbox-take"
            >
              Assumir
            </Button>
          ) : null}
          {canClose && data.status !== 'CLOSED' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmClose(true)}
              data-testid="inbox-close"
            >
              Encerrar
            </Button>
          ) : null}
        </div>
      </header>

      {confirmClose ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-3"
          data-testid="inbox-close-confirm"
        >
          <p className="text-sm">Encerrar conversa?</p>
          <Button
            type="button"
            size="sm"
            onClick={() => void onClose()}
            disabled={closeMutation.isPending}
          >
            Confirmar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmClose(false)}>
            Cancelar
          </Button>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4" data-testid="inbox-messages">
        {messages.isPending ? (
          <p className="text-muted-foreground text-sm">Carregando mensagens…</p>
        ) : null}
        {messages.isError ? (
          <p className="text-sm">Não foi possível carregar as mensagens.</p>
        ) : null}
        {ordered.map((message) => (
          <div
            key={message.id}
            className={cn(
              'max-w-[85%] rounded-md px-3 py-2 text-sm',
              message.direction === 'INBOUND' ? 'self-start bg-muted' : 'self-end bg-primary/10',
            )}
            data-testid="inbox-message"
          >
            {message.text ?? '(mensagem sem texto)'}
          </div>
        ))}
      </div>

      {failure ? <p className="px-4 text-destructive text-sm">{failure}</p> : null}

      {canSend ? (
        <form className="flex gap-2 border-t p-4" onSubmit={(event) => void onSend(event)}>
          <div className="flex-1">
            <Label htmlFor="inbox-reply" className="sr-only">
              Mensagem
            </Label>
            <Input
              id="inbox-reply"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Escreva uma resposta"
              data-testid="inbox-reply-input"
            />
          </div>
          <Button type="submit" disabled={send.isPending || !text.trim()} data-testid="inbox-send">
            Enviar
          </Button>
        </form>
      ) : null}
    </div>
  )
}

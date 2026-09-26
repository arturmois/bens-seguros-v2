import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useQueryClient } from '@tanstack/react-query'
import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  getGetPublicChatSessionQueryOptions,
  getListPublicChatMessagesQueryKey,
  useGetPublicChat,
  useListPublicChatMessages,
  useSendPublicChatMessage,
  useStartPublicChatSession,
} from '@/api/endpoints'
import type { ListPublicChatMessages200ItemsItem } from '@/api/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/http'
import { cn } from '@/lib/utils'
import {
  PUBLIC_CHAT_KEY,
  readStoredVisitorToken,
  storeVisitorToken,
  WEB_CHAT_NOTICE_TEXT,
  WEB_CHAT_NOTICE_VERSION,
} from './constants'
import { useVisitorSocket } from './use-visitor-socket'

type PublicMessage = ListPublicChatMessages200ItemsItem

function mergeBySeq(current: PublicMessage[], incoming: PublicMessage[]) {
  const byId = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => a.seq - b.seq)
}

export function WebChatPage({ publicChatKey }: { publicChatKey: string }) {
  const keyOk = PUBLIC_CHAT_KEY.test(publicChatKey)
  const chat = useGetPublicChat(publicChatKey, {
    query: { enabled: keyOk, retry: false },
  })

  if (!keyOk) {
    return (
      <ChatShell>
        <ErrorState title="Link inválido" message="Este link de atendimento não é válido." />
      </ChatShell>
    )
  }

  if (chat.isPending) {
    return (
      <ChatShell>
        <p className="text-muted-foreground text-sm" data-testid="web-chat-loading">
          Carregando o atendimento…
        </p>
      </ChatShell>
    )
  }

  if (chat.isError || !chat.data) {
    const notFound = chat.error instanceof ApiError && chat.error.status === 404
    return (
      <ChatShell>
        <ErrorState
          title={notFound ? 'Link não encontrado' : 'Não foi possível carregar'}
          message={
            notFound
              ? 'Este link de atendimento não existe ou não está mais disponível.'
              : 'Não foi possível carregar o atendimento. Tente de novo.'
          }
          onRetry={notFound ? undefined : () => void chat.refetch()}
        />
      </ChatShell>
    )
  }

  return (
    <ChatShell brandColor={chat.data.brandColor}>
      <ActiveChat publicChatKey={publicChatKey} chat={chat.data} />
    </ChatShell>
  )
}

function ActiveChat({
  publicChatKey,
  chat,
}: {
  publicChatKey: string
  chat: {
    name: string
    brandColor: string | null
    greeting: string | null
    hasLogo: boolean
    noticeVersion: string
    turnstileSiteKey: string | null
  }
}) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [messages, setMessages] = useState<PublicMessage[]>([])
  const [bootError, setBootError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    async function restore() {
      try {
        const options = getGetPublicChatSessionQueryOptions(publicChatKey)
        const session = await queryClient.fetchQuery(options)
        if (cancelled) return
        storeVisitorToken(publicChatKey, session.token)
        setToken(session.token)
        setSessionReady(true)
        return
      } catch {
        const stored = readStoredVisitorToken(publicChatKey)
        if (stored) {
          if (cancelled) return
          setToken(stored)
          setSessionReady(true)
          return
        }
      }
      if (!cancelled) setSessionReady(true)
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [publicChatKey, queryClient])

  const list = useListPublicChatMessages(publicChatKey, undefined, {
    query: {
      enabled: Boolean(token),
      retry: false,
    },
  })

  useEffect(() => {
    if (list.data?.items) setMessages((current) => mergeBySeq(current, list.data.items))
  }, [list.data])

  useVisitorSocket({
    token,
    enabled: Boolean(token),
    onMessage: (message) => setMessages((current) => mergeBySeq(current, [message])),
    onResync: () => {
      void queryClient.refetchQueries({
        queryKey: getListPublicChatMessagesQueryKey(publicChatKey),
      })
    },
  })

  if (!sessionReady) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="web-chat-loading">
        Carregando o atendimento…
      </p>
    )
  }

  if (!token) {
    return (
      <StartForm
        publicChatKey={publicChatKey}
        chat={chat}
        failure={bootError}
        onStarted={(started) => {
          storeVisitorToken(publicChatKey, started.token)
          setToken(started.token)
          setMessages([started.message])
          setBootError(undefined)
        }}
        onFailure={setBootError}
      />
    )
  }

  return (
    <Thread
      publicChatKey={publicChatKey}
      chat={chat}
      messages={messages}
      listPending={list.isPending && messages.length === 0}
      listError={list.isError}
      onRetryList={() => void list.refetch()}
      onMessage={(message) => setMessages((current) => mergeBySeq(current, [message]))}
    />
  )
}

function StartForm({
  publicChatKey,
  chat,
  failure,
  onStarted,
  onFailure,
}: {
  publicChatKey: string
  chat: {
    name: string
    greeting: string | null
    hasLogo: boolean
    noticeVersion: string
    turnstileSiteKey: string | null
  }
  failure?: string | undefined
  onStarted: (started: { token: string; message: PublicMessage }) => void
  onFailure: (message: string) => void
}) {
  const turnstile = useRef<TurnstileInstance>(undefined)
  const [phone, setPhone] = useState('')
  const [text, setText] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [acceptError, setAcceptError] = useState<string>()
  const [turnstileToken, setTurnstileToken] = useState<string>()
  const start = useStartPublicChatSession()
  const waitingForToken = chat.turnstileSiteKey !== null && turnstileToken === undefined

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setAcceptError(undefined)
    if (!accepted) {
      setAcceptError('Aceite o aviso do Web Chat para continuar.')
      return
    }
    try {
      const result = await start.mutateAsync({
        key: publicChatKey,
        data: {
          phone,
          consent: true,
          noticeVersion: chat.noticeVersion || WEB_CHAT_NOTICE_VERSION,
          turnstileToken: turnstileToken ?? '',
          clientMessageId: crypto.randomUUID(),
          text,
        },
      })
      onStarted(result)
    } catch (error) {
      if (chat.turnstileSiteKey) {
        setTurnstileToken(undefined)
        turnstile.current?.reset()
      }
      onFailure(error instanceof ApiError ? error.message : 'Não foi possível iniciar o chat.')
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6" data-testid="web-chat-start">
      <BrandHeader name={chat.name} hasLogo={chat.hasLogo} publicChatKey={publicChatKey} />
      {chat.greeting && <p className="text-muted-foreground text-sm">{chat.greeting}</p>}
      {failure && (
        <p className="text-destructive text-sm" role="alert">
          {failure}
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="web-chat-phone">Telefone</Label>
          <Input
            id="web-chat-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="(11) 98765-4321"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="web-chat-first-message">Mensagem</Label>
          <textarea
            id="web-chat-first-message"
            name="text"
            rows={3}
            required
            maxLength={4000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Como podemos ajudar?"
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={accepted}
            onChange={(event) => {
              setAccepted(event.target.checked)
              if (event.target.checked) setAcceptError(undefined)
            }}
            data-testid="web-chat-notice"
          />
          <span>
            Li e aceito o aviso do Web Chat ({WEB_CHAT_NOTICE_VERSION}). {WEB_CHAT_NOTICE_TEXT}
          </span>
        </label>
        {acceptError && (
          <p className="text-destructive text-sm" role="alert" data-testid="web-chat-notice-error">
            {acceptError}
          </p>
        )}
        {chat.turnstileSiteKey && (
          <Turnstile
            ref={turnstile}
            siteKey={chat.turnstileSiteKey}
            onSuccess={setTurnstileToken}
            onExpire={() => setTurnstileToken(undefined)}
            options={{ theme: 'light' }}
          />
        )}
        <Button type="submit" disabled={start.isPending || waitingForToken}>
          {start.isPending ? 'Iniciando…' : 'Iniciar conversa'}
        </Button>
      </form>
    </div>
  )
}

function Thread({
  publicChatKey,
  chat,
  messages,
  listPending,
  listError,
  onRetryList,
  onMessage,
}: {
  publicChatKey: string
  chat: { name: string; hasLogo: boolean }
  messages: PublicMessage[]
  listPending: boolean
  listError: boolean
  onRetryList: () => void
  onMessage: (message: PublicMessage) => void
}) {
  const [text, setText] = useState('')
  const [sendError, setSendError] = useState<string>()
  const send = useSendPublicChatMessage()
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setSendError(undefined)
    try {
      const result = await send.mutateAsync({
        key: publicChatKey,
        data: { clientMessageId: crypto.randomUUID(), text: trimmed },
      })
      setText('')
      onMessage(result.message)
    } catch (error) {
      setSendError(error instanceof ApiError ? error.message : 'Não foi possível enviar.')
    }
  }

  return (
    <div
      className="flex h-[min(80svh,40rem)] w-full max-w-lg flex-col"
      data-testid="web-chat-thread"
    >
      <BrandHeader name={chat.name} hasLogo={chat.hasLogo} publicChatKey={publicChatKey} />
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border bg-card p-3">
        {listPending && <p className="text-muted-foreground text-sm">Carregando mensagens…</p>}
        {listError && messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm">Não foi possível carregar as mensagens.</p>
            <Button type="button" variant="outline" onClick={onRetryList}>
              Tentar de novo
            </Button>
          </div>
        )}
        <ul className="flex flex-col gap-2" aria-live="polite">
          {messages.map((message) => (
            <li
              key={message.id}
              data-testid="web-chat-message"
              data-direction={message.direction}
              className={cn(
                'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                message.direction === 'INBOUND'
                  ? 'ml-auto bg-primary text-primary-foreground'
                  : 'mr-auto bg-muted',
              )}
            >
              {message.text ?? (message.kind === 'UNSUPPORTED' ? 'Mensagem não suportada' : '')}
            </li>
          ))}
        </ul>
        <div ref={bottom} />
      </div>
      {sendError && (
        <p className="mt-2 text-destructive text-sm" role="alert">
          {sendError}
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <Input
          aria-label="Mensagem"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Escreva uma mensagem"
          maxLength={4000}
        />
        <Button type="submit" disabled={send.isPending || !text.trim()}>
          Enviar
        </Button>
      </form>
    </div>
  )
}

function BrandHeader({
  name,
  hasLogo,
  publicChatKey,
}: {
  name: string
  hasLogo: boolean
  publicChatKey: string
}) {
  return (
    <header className="flex items-center gap-3" data-testid="web-chat-brand">
      {hasLogo && (
        <img
          src={`/api/public/chat/${publicChatKey}/logo`}
          alt={`Logo de ${name}`}
          className="size-10 rounded-md object-contain"
        />
      )}
      <h1 className="font-semibold text-xl tracking-tight">{name}</h1>
    </header>
  )
}

function ChatShell({ children, brandColor }: { children: ReactNode; brandColor?: string | null }) {
  return (
    <main
      className="flex min-h-svh flex-col items-center justify-center p-6"
      style={
        brandColor ? ({ ['--web-chat-brand' as string]: brandColor } as CSSProperties) : undefined
      }
    >
      {children}
    </main>
  )
}

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry?: (() => void) | undefined
}) {
  return (
    <div
      className="flex max-w-md flex-col items-center gap-3 text-center"
      data-testid="web-chat-error"
    >
      <h1 className="font-semibold text-xl tracking-tight">{title}</h1>
      <p className="text-muted-foreground text-sm">{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  )
}

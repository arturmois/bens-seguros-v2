import type { Database, Transaction } from '../../infrastructure/database.ts'
import type { Config } from '../../shared/config.ts'
import { AppError } from '../../shared/errors.ts'
import { normalizePhone } from '../../shared/phone.ts'
import { recordConsent } from '../contacts/index.ts'
import { receiveInbound } from '../conversations/index.ts'
import { findPublicChat } from '../organizations/index.ts'
import { verifyTurnstile } from './turnstile.ts'
import {
  readVisitorToken,
  signVisitorToken,
  type VisitorSession,
  visitorTokenKey,
} from './visitor-token.ts'

// Version of the privacy notice the Web Chat visitor accepts (ADR-014). Provisional until the legal
// review before go-live; the text lives in the web.
export const WEB_CHAT_NOTICE_VERSION = '2026-09-25'

const PAGE_SIZE = 100

const unknownLink = new AppError(404, 'NOT_FOUND', 'Link de atendimento não encontrado.')
const outdatedNotice = new AppError(
  422,
  'NOTICE_OUTDATED',
  'O aviso de privacidade mudou. Recarregue a página e aceite a versão atual.',
)
const captchaFailed = new AppError(
  403,
  'TURNSTILE_FAILED',
  'Não foi possível confirmar que você não é um robô. Tente novamente.',
)
const sessionRequired = new AppError(
  401,
  'VISITOR_SESSION_REQUIRED',
  'Sua sessão de atendimento expirou. Comece uma nova conversa.',
)
const conflict = new AppError(409, 'CONFLICT', 'Mensagem já registrada.')
const invalidPhone = new AppError(422, 'INVALID_PHONE', 'Telefone inválido.')

type Deps = { db: Database; config: Config }

const publicMessageSelect = {
  id: true,
  seq: true,
  direction: true,
  author: true,
  kind: true,
  text: true,
  sentAt: true,
} as const

type StoredMessage = {
  id: string
  seq: number
  direction: 'INBOUND' | 'OUTBOUND'
  author: 'CONTACT' | 'AI' | 'HUMAN' | 'SYSTEM'
  kind: 'TEXT' | 'UNSUPPORTED'
  text: string | null
  sentAt: Date
}

function toPublicMessage(message: StoredMessage) {
  return { ...message, sentAt: message.sentAt.toISOString() }
}

// The Web Chat's inbound id: a retry of the same browser message hits the F2 dedupe (door 7).
function externalIdOf(clientMessageId: string) {
  return `webchat:${clientMessageId}`
}

async function organizationOf(deps: Deps, key: string) {
  const chat = await findPublicChat(deps, key)
  if (!chat) throw unknownLink
  return chat
}

export async function describePublicChat(deps: Deps, key: string) {
  const chat = await organizationOf(deps, key)
  return {
    name: chat.name,
    brandColor: chat.brandColor,
    greeting: chat.greeting,
    hasLogo: chat.hasLogo,
    noticeVersion: WEB_CHAT_NOTICE_VERSION,
    turnstileSiteKey: deps.config.TURNSTILE_SITE_KEY ?? null,
  }
}

export async function publicChatOrganization(deps: Deps, key: string) {
  const chat = await organizationOf(deps, key)
  return { organizationId: chat.organizationId }
}

async function webChatChannel(tx: Transaction) {
  const channel = await tx.channel.findFirst({ where: { kind: 'WEB_CHAT' }, select: { id: true } })
  if (!channel) throw unknownLink
  return channel.id
}

async function messageById(tx: Transaction, id: string) {
  return tx.message.findUniqueOrThrow({
    where: { id },
    select: { ...publicMessageSelect, conversationId: true },
  })
}

export type StartSessionInput = {
  phone: string
  noticeVersion: string
  turnstileToken: string
  clientMessageId: string
  text: string
}

// The visitor's first message, with the notice accepted in the same transaction (door 3), and the
// signed session for this browser starting at that message's seq (door 5).
export async function startSession(
  deps: Deps,
  key: string,
  input: StartSessionInput,
  remoteIp: string,
) {
  const { organizationId } = await publicChatOrganization(deps, key)
  if (input.noticeVersion !== WEB_CHAT_NOTICE_VERSION) throw outdatedNotice
  const phoneE164 = normalizePhone(input.phone)
  if (!phoneE164) throw invalidPhone
  if (!(await verifyTurnstile(deps.config, input.turnstileToken, remoteIp))) throw captchaFailed

  const tenant = { organizationId }
  const channelId = await deps.db.withTenant(tenant, webChatChannel)
  const result = await receiveInbound(
    deps,
    tenant,
    {
      channelId,
      externalId: externalIdOf(input.clientMessageId),
      fromPhone: phoneE164,
      kind: 'TEXT',
      text: input.text,
      sentAt: new Date(),
    },
    {
      onReceived: (tx, message) =>
        recordConsent(tx, {
          contactId: message.contactId,
          conversationId: message.conversationId,
          channelId,
          noticeVersion: input.noticeVersion,
        }),
    },
  )

  // A retried start finds its own first message; one of another phone is not this visitor's.
  const { message, contactId } = await deps.db.withTenant(tenant, async (tx) => {
    const stored = await messageById(tx, result.messageId)
    const conversation = await tx.conversation.findUniqueOrThrow({
      where: { id: stored.conversationId },
      select: { contact: { select: { id: true, phoneE164: true } } },
    })
    if (conversation.contact.phoneE164 !== phoneE164) throw conflict
    return { message: stored, contactId: conversation.contact.id }
  })

  const session: VisitorSession = {
    organizationId,
    contactId,
    conversationId: message.conversationId,
    fromSeq: message.seq,
  }
  const { conversationId: _conversationId, ...visible } = message
  return {
    message: toPublicMessage(visible),
    token: signVisitorToken(visitorTokenKey(deps.config.BETTER_AUTH_SECRET), session),
  }
}

// The session in the cookie, only for the organization of this link.
async function sessionOf(deps: Deps, key: string, token: string | null) {
  const { organizationId } = await publicChatOrganization(deps, key)
  const session = token
    ? readVisitorToken(visitorTokenKey(deps.config.BETTER_AUTH_SECRET), token)
    : null
  if (!session || session.organizationId !== organizationId) throw sessionRequired
  return session
}

export async function sendVisitorMessage(
  deps: Deps,
  key: string,
  token: string | null,
  input: { clientMessageId: string; text: string },
) {
  const session = await sessionOf(deps, key, token)
  const tenant = { organizationId: session.organizationId }
  const contact = await deps.db.withTenant(tenant, async (tx) => ({
    channelId: await webChatChannel(tx),
    phone: await tx.contact.findUnique({
      where: { id: session.contactId },
      select: { phoneE164: true },
    }),
  }))
  if (!contact.phone) throw sessionRequired

  const result = await receiveInbound(
    deps,
    tenant,
    {
      channelId: contact.channelId,
      externalId: externalIdOf(input.clientMessageId),
      fromPhone: contact.phone.phoneE164,
      kind: 'TEXT',
      text: input.text,
      sentAt: new Date(),
    },
    {
      // The contact and channel always lead to the session's conversation; if not, nothing is kept.
      onReceived: async (_tx, message) => {
        if (message.conversationId !== session.conversationId) throw conflict
      },
    },
  )
  if (result.conversationId !== session.conversationId) throw conflict

  const message = await deps.db.withTenant(tenant, (tx) =>
    tx.message.findUniqueOrThrow({ where: { id: result.messageId }, select: publicMessageSelect }),
  )
  return { created: result.created, message: toPublicMessage(message) }
}

// Only this browser's session: the messages from its first one on (door 5, AD-018).
export async function listVisitorMessages(
  deps: Deps,
  key: string,
  token: string | null,
  after: number | undefined,
) {
  const session = await sessionOf(deps, key, token)
  const items = await deps.db.withTenant({ organizationId: session.organizationId }, (tx) =>
    tx.message.findMany({
      where: {
        conversationId: session.conversationId,
        seq: { gte: Math.max(session.fromSeq, (after ?? 0) + 1) },
      },
      orderBy: { seq: 'asc' },
      take: PAGE_SIZE,
      select: publicMessageSelect,
    }),
  )
  return { items: items.map(toPublicMessage) }
}

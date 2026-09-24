import { randomInt, randomUUID } from 'node:crypto'
import type { Prisma } from '../src/generated/prisma/client.ts'
import type { Database } from '../src/infrastructure/database.ts'
import { type InboundMessage, receiveInbound } from '../src/modules/conversations/index.ts'
import { normalizePhone } from '../src/shared/phone.ts'

type Tenant = { organizationId: string }

// A valid Brazilian mobile number (national format), different on every call.
export function randomPhone(): string {
  for (;;) {
    const raw = `(11) 9${randomInt(1, 10)}${String(randomInt(0, 10_000_000)).padStart(7, '0')}`
    if (normalizePhone(raw)) return raw
  }
}

export async function webChatOf(db: Database, tenant: Tenant) {
  const channel = await db.withTenant(tenant, (tx) =>
    tx.channel.findFirstOrThrow({ where: { kind: 'WEB_CHAT' }, select: { id: true } }),
  )
  return channel.id
}

// A customer message through the real entry point, with fresh defaults for what is not given.
export async function inbound(db: Database, tenant: Tenant, message: Partial<InboundMessage> = {}) {
  return receiveInbound({ db }, tenant, {
    channelId: message.channelId ?? (await webChatOf(db, tenant)),
    externalId: 'externalId' in message ? message.externalId : `ext-${randomUUID()}`,
    fromPhone: message.fromPhone ?? randomPhone(),
    kind: message.kind ?? 'TEXT',
    text: 'text' in message ? message.text : 'Olá, quero um seguro.',
    sentAt: message.sentAt ?? new Date(),
  })
}

// A contact and an empty conversation on the Web Chat, stored directly (a precondition, not the
// behaviour under test).
export async function seedConversation(
  db: Database,
  tenant: Tenant,
  data: Partial<Prisma.ConversationUncheckedCreateInput> = {},
  contact: { ownerId?: string | null } = {},
) {
  const channelId = await webChatOf(db, tenant)
  return db.withTenant(tenant, async (tx) => {
    const phone = normalizePhone(randomPhone()) ?? ''
    const created = await tx.contact.create({
      data: { phoneE164: phone, ownerId: contact.ownerId ?? null },
    })
    const conversation = await tx.conversation.create({
      data: {
        contactId: created.id,
        channelId,
        status: 'OPEN',
        handler: 'QUEUE',
        ...data,
      },
    })
    return { ...conversation, phoneE164: phone }
  })
}

export async function conversationOf(db: Database, tenant: Tenant, id: string) {
  return db.withTenant(tenant, (tx) => tx.conversation.findUniqueOrThrow({ where: { id } }))
}

export async function messagesOf(db: Database, tenant: Tenant, conversationId: string) {
  return db.withTenant(tenant, (tx) =>
    tx.message.findMany({ where: { conversationId }, orderBy: { seq: 'asc' } }),
  )
}

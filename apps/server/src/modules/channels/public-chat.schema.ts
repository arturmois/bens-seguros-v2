import { z } from 'zod'

// The public Web Chat caps a message below the domain limit: an anonymous channel (plan Assumptions).
export const MAX_PUBLIC_TEXT = 4000

export const publicChatParams = z.object({ key: z.string().regex(/^[0-9a-f]{32}$/) }).strict()

export const publicChatOutput = z
  .object({
    name: z.string(),
    brandColor: z.string().nullable(),
    greeting: z.string().nullable(),
    hasLogo: z.boolean(),
    noticeVersion: z.string(),
    turnstileSiteKey: z.string().nullable(),
  })
  .strict()

const messageText = z.string().min(1).max(MAX_PUBLIC_TEXT)

export const startSessionInput = z
  .object({
    phone: z.string().min(1).max(40),
    consent: z.literal(true),
    noticeVersion: z.string().min(1).max(40),
    turnstileToken: z.string().max(4096),
    clientMessageId: z.uuid(),
    text: messageText,
  })
  .strict()

export const sendMessageInput = z.object({ clientMessageId: z.uuid(), text: messageText }).strict()

export const messagesQuery = z.object({ after: z.coerce.number().int().min(0).optional() }).strict()

export const publicMessage = z
  .object({
    id: z.uuid(),
    seq: z.int(),
    direction: z.enum(['INBOUND', 'OUTBOUND']),
    author: z.enum(['CONTACT', 'AI', 'HUMAN', 'SYSTEM']),
    kind: z.enum(['TEXT', 'UNSUPPORTED']),
    text: z.string().nullable(),
    sentAt: z.iso.datetime(),
  })
  .strict()

export const publicMessageOutput = z.object({ message: publicMessage }).strict()

export const startSessionOutput = z
  .object({ message: publicMessage, token: z.string().min(1) })
  .strict()

export const visitorSessionOutput = z.object({ token: z.string().min(1) }).strict()

export const publicMessageListOutput = z.object({ items: z.array(publicMessage) }).strict()

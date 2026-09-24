import { z } from 'zod'
import { pageOutput, pageQuery } from '../../shared/pagination.ts'

export const conversationListQuery = pageQuery.strict()

export const messageListQuery = pageQuery.strict()

// The detail takes no query; strict so an unknown field is a 400 like on the other routes.
export const conversationQuery = z.object({}).strict()

export const conversationIdParams = z.object({ id: z.uuid() }).strict()

export const conversationOutput = z
  .object({
    id: z.uuid(),
    status: z.enum(['OPEN', 'WAITING', 'CLOSED']),
    handler: z.enum(['AI', 'QUEUE', 'HUMAN']),
    assigneeId: z.uuid().nullable(),
    contact: z
      .object({ id: z.uuid(), phoneE164: z.string(), ownerId: z.uuid().nullable() })
      .strict(),
    channel: z.object({ id: z.uuid(), kind: z.enum(['WEB_CHAT']), name: z.string() }).strict(),
    lastSeq: z.int(),
    lastMessageAt: z.iso.datetime().nullable(),
    closedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict()

export const conversationListOutput = pageOutput(conversationOutput).strict()

export const messageOutput = z
  .object({
    id: z.uuid(),
    seq: z.int(),
    direction: z.enum(['INBOUND', 'OUTBOUND']),
    author: z.enum(['CONTACT', 'AI', 'HUMAN', 'SYSTEM']),
    authorUserId: z.uuid().nullable(),
    kind: z.enum(['TEXT', 'UNSUPPORTED']),
    text: z.string().nullable(),
    deliveryStatus: z.enum(['PENDING', 'SENT', 'FAILED']).nullable(),
    sentAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
  })
  .strict()

export const messageListOutput = pageOutput(messageOutput).strict()

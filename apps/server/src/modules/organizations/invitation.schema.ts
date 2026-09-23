import { z } from 'zod'
import { ROLES } from '../../shared/permissions.ts'

export const INVITABLE_ROLES = ['ADMIN', 'MANAGER', 'COMMERCIAL', 'VIEWER'] as const

const invitableRole = z.enum(INVITABLE_ROLES)
const invitationStatus = z.enum(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'])

export const createInvitationInput = z
  .object({
    email: z.email(),
    role: invitableRole,
  })
  .strict()

export const invitationOutput = z
  .object({
    id: z.uuid(),
    email: z.email(),
    role: invitableRole,
    expiresAt: z.iso.datetime(),
    status: z.literal('PENDING'),
  })
  .strict()

export const invitationListOutput = z
  .object({
    items: z.array(
      z
        .object({
          id: z.uuid(),
          email: z.email(),
          role: z.enum(ROLES),
          expiresAt: z.iso.datetime(),
        })
        .strict(),
    ),
  })
  .strict()

export const invitationIdParams = z.object({ id: z.uuid() }).strict()

export const revokedInvitationOutput = z
  .object({
    id: z.uuid(),
    status: z.literal('REVOKED'),
  })
  .strict()

export const invitationTokenParams = z.object({ token: z.string().min(1) }).strict()

export const invitationPreviewOutput = z
  .object({
    organizationName: z.string(),
    email: z.email(),
    role: z.enum(ROLES),
    status: invitationStatus,
    expiresAt: z.iso.datetime(),
  })
  .strict()

export const acceptInvitationInput = z.object({ token: z.string().min(1) }).strict()

export const acceptInvitationOutput = z
  .object({
    organizationId: z.uuid(),
    role: z.enum(ROLES),
  })
  .strict()

import { z } from 'zod'
import { ROLES } from '../../shared/permissions.ts'

const name = z.string().trim().min(2).max(80)

export const onboardInput = z.object({ name }).strict()

export const onboardOutput = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    publicChatKey: z.string(),
    role: z.literal('ADMIN'),
  })
  .strict()

export const setActiveOrganizationInput = z.object({ organizationId: z.uuid() }).strict()

export const setActiveOrganizationOutput = z
  .object({
    organizationId: z.uuid(),
    role: z.enum(ROLES),
  })
  .strict()

export const organizationOutput = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    role: z.enum(ROLES),
  })
  .strict()

export const renameOrganizationInput = z.object({ name }).strict()

export const renameOrganizationOutput = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
  })
  .strict()

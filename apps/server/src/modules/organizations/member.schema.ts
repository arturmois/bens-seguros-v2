import { z } from 'zod'
import { ROLES } from '../../shared/permissions.ts'

const assignableRole = z.enum(['ADMIN', 'MANAGER', 'COMMERCIAL', 'VIEWER'])

export const updateMemberInput = z
  .object({
    role: assignableRole.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.role !== undefined || value.active !== undefined)

export const memberIdParams = z.object({ id: z.uuid() }).strict()

export const memberOutput = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    role: z.enum(ROLES),
    active: z.boolean(),
    email: z.email(),
    name: z.string(),
    commissionSplitBp: z.int(),
  })
  .strict()

export const memberListOutput = z
  .object({
    items: z.array(memberOutput),
  })
  .strict()

export const transferPortfolioInput = z.object({ toMemberId: z.uuid() }).strict()

export const transferPortfolioOutput = z
  .object({
    transferred: z.int(),
  })
  .strict()

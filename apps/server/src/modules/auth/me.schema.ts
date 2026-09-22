import { z } from 'zod'
import { PERMISSIONS, ROLES } from '../../shared/permissions.ts'
import { termsStateOutput } from './terms.schema.ts'

export const meOutput = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  isSuperAdmin: z.boolean(),
  activeOrganizationId: z.uuid().nullable(),
  role: z.enum(ROLES).nullable(),
  permissions: z.array(z.enum(PERMISSIONS)),
  terms: termsStateOutput,
})

export type MeOutput = z.infer<typeof meOutput>

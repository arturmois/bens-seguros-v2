import { z } from 'zod'
import { termsStateOutput } from './terms.schema.ts'

export const meOutput = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  isSuperAdmin: z.boolean(),
  activeOrganizationId: z.uuid().nullable(),
  terms: termsStateOutput,
})

export type MeOutput = z.infer<typeof meOutput>

import { z } from 'zod'

export const meOutput = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  isSuperAdmin: z.boolean(),
  activeOrganizationId: z.uuid().nullable(),
})

export type MeOutput = z.infer<typeof meOutput>

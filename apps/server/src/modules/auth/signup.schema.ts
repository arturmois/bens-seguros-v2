import { z } from 'zod'

export const signupConfigOutput = z
  .object({
    signupMode: z.enum(['closed', 'self_serve']),
    turnstileSiteKey: z.string().nullable(),
  })
  .strict()

export type SignupConfigOutput = z.infer<typeof signupConfigOutput>

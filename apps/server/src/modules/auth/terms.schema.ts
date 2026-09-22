import { z } from 'zod'

export const termsAcceptanceInput = z
  .object({
    termsVersion: z.string(),
    privacyVersion: z.string(),
  })
  .strict()

export const termsAcceptanceOutput = z
  .object({
    termsVersion: z.string(),
    privacyVersion: z.string(),
    acceptedAt: z.iso.datetime(),
  })
  .strict()

export const termsStateOutput = z
  .object({
    pending: z.boolean(),
    termsVersion: z.string(),
    privacyVersion: z.string(),
  })
  .strict()

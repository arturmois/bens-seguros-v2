import { z } from 'zod'

const brandColor = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/)
const greeting = z.string().trim().min(1).max(500)

export const updateBrandingInput = z
  .object({
    brandColor: brandColor.nullable().optional(),
    greeting: greeting.nullable().optional(),
  })
  .strict()
  .refine((value) => value.brandColor !== undefined || value.greeting !== undefined)

export const brandingOutput = z
  .object({
    brandColor: z.string().nullable(),
    greeting: z.string().nullable(),
  })
  .strict()

export const uploadLogoInput = z.object({ image: z.base64() }).strict()

export const uploadLogoOutput = z.object({ logoUpdatedAt: z.iso.datetime() }).strict()

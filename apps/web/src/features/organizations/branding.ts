import { z } from 'zod'

// Same rules as the server (`branding.schema.ts`); an empty field is sent as null.
export const brandingSchema = z.object({
  brandColor: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === '' || /^#[0-9a-f]{6}$/.test(value), 'Use o formato #rrggbb.'),
  greeting: z.string().trim().max(500, 'A saudação pode ter no máximo 500 caracteres.'),
})

// ADR-014: the public Web Chat link. The page behind it arrives in F3.
export function webChatLink(origin: string, publicChatKey: string) {
  return `${origin}/c/${publicChatKey}`
}

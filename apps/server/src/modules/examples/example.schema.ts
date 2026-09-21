import { z } from 'zod'

export const commissionPreviewQuery = z
  .object({
    premiumCents: z.coerce.number().int().min(0),
    rateBp: z.coerce.number().int().min(0).max(10_000),
    splitBp: z.coerce.number().int().min(0).max(10_000),
  })
  .strict()

export const commissionPreviewOutput = z.object({
  brokerageAmountCents: z.number().int(),
  salespersonAmountCents: z.number().int(),
})

export type CommissionPreviewQuery = z.infer<typeof commissionPreviewQuery>

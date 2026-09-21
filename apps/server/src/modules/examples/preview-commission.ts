import { applyBp } from '../../shared/money.ts'
import type { CommissionPreviewQuery } from './example.schema.ts'

// ADR-010: the salesperson share applies to the already rounded brokerage amount.
export function previewCommission(input: CommissionPreviewQuery) {
  const brokerageAmountCents = applyBp(input.premiumCents, input.rateBp)
  return {
    brokerageAmountCents,
    salespersonAmountCents: applyBp(brokerageAmountCents, input.splitBp),
  }
}

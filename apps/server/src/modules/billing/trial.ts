import type { Transaction } from '../../infrastructure/database.ts'

const TRIAL_MS = 14 * 24 * 60 * 60 * 1000

// The onboarding subscription. Plan and Subscription stay here until Fase 5 owns billing.
export async function startTrial(tx: Transaction, now: Date) {
  const plan = await tx.plan.findUniqueOrThrow({ where: { code: 'trial' } })
  const trialEndsAt = new Date(now.getTime() + TRIAL_MS)
  await tx.subscription.create({
    data: { planId: plan.id, status: 'TRIALING', trialEndsAt },
  })
  return { maxUsers: plan.maxUsers, trialEndsAt }
}

import type { Database } from '../../infrastructure/database.ts'
import { AppError, isUniqueViolation } from '../../shared/errors.ts'
import { uuidv7 } from '../../shared/id.ts'
import type { UserContext } from '../../shared/request-context.ts'
import { record } from '../audit/index.ts'
import { assignActiveOrganization } from '../auth/index.ts'
import { startTrial } from '../billing/index.ts'
import { assertOrgLimit } from './membership.ts'
import { slugCandidate, slugFromName } from './slug.ts'

const MAX_SLUG_ATTEMPTS = 20

type OnboardingDeps = { db: Database; maxOrgsPerUser: number }

export type OnboardingInput = { name: string }

export async function onboard(
  deps: OnboardingDeps,
  user: UserContext,
  input: OnboardingInput,
  now = new Date(),
) {
  await assertOrgLimit(deps.db, user.userId, deps.maxOrgsPerUser)

  const base = slugFromName(input.name)
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const id = uuidv7()
    const slug = slugCandidate(base, attempt)
    try {
      await deps.db.withTenant({ organizationId: id }, async (tx) => {
        await tx.organization.create({ data: { id, name: input.name, slug } })
        await tx.member.create({
          data: { userId: user.userId, role: 'OWNER', active: true },
        })
        await startTrial(tx, now)
        await assignActiveOrganization(tx, user.sessionId, id)
        await record(tx, user, {
          action: 'organization.create',
          entityId: id,
          changes: { role: 'OWNER' },
        })
      })
      return { id, name: input.name, slug, role: 'OWNER' as const }
    } catch (error) {
      if (isUniqueViolation(error) && attempt < MAX_SLUG_ATTEMPTS) continue
      throw error
    }
  }
  throw new AppError(409, 'CONFLICT', 'Registro já existe.')
}

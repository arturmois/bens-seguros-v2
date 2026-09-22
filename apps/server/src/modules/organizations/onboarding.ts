import { Prisma } from '../../generated/prisma/client.ts'
import type { Database } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'
import { uuidv7 } from '../../shared/id.ts'
import type { UserContext } from '../../shared/request-context.ts'
import { assignActiveOrganization } from '../auth/index.ts'
import { startTrial } from '../billing/index.ts'
import { countMemberships } from './membership.ts'
import { slugCandidate, slugFromName } from './slug.ts'

const ORG_LIMIT = new AppError(
  422,
  'ORG_LIMIT_REACHED',
  'Você já participa do número máximo de organizações.',
)

const MAX_SLUG_ATTEMPTS = 20

type OnboardingDeps = { db: Database; maxOrgsPerUser: number }

export type OnboardingInput = { name: string }

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export async function onboard(
  deps: OnboardingDeps,
  user: UserContext,
  input: OnboardingInput,
  now = new Date(),
) {
  const held = await deps.db.withUser(user.userId, (tx) => countMemberships(tx, user.userId))
  if (held >= deps.maxOrgsPerUser) throw ORG_LIMIT

  const base = slugFromName(input.name)
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const id = uuidv7()
    const slug = slugCandidate(base, attempt)
    try {
      await deps.db.withTenant({ organizationId: id }, async (tx) => {
        await tx.organization.create({ data: { id, name: input.name, slug } })
        await tx.member.create({
          data: { userId: user.userId, role: 'OWNER', active: true, commissionSplitBp: 0 },
        })
        await startTrial(tx, now)
        await assignActiveOrganization(tx, user.sessionId, id)
      })
      return { id, name: input.name, slug, role: 'OWNER' as const }
    } catch (error) {
      if (isUniqueViolation(error) && attempt < MAX_SLUG_ATTEMPTS) continue
      throw error
    }
  }
  throw new AppError(409, 'CONFLICT', 'Registro já existe.')
}

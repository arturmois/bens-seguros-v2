import type { LegalDocument } from '../../generated/prisma/client.ts'
import type { Database } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'
import type { UserContext } from '../../shared/request-context.ts'

export const CURRENT_TERMS_VERSION = '1.0'
export const CURRENT_PRIVACY_VERSION = '1.0'

const CURRENT = [
  { document: 'TERMS', version: CURRENT_TERMS_VERSION },
  { document: 'PRIVACY', version: CURRENT_PRIVACY_VERSION },
] as const satisfies readonly { document: LegalDocument; version: string }[]

export type TermsState = {
  pending: boolean
  termsVersion: string
  privacyVersion: string
}

type TermsDeps = { db: Database }

export async function termsArePending(db: Database, userId: string) {
  return (await termsState({ db }, userId)).pending
}

export async function termsState(deps: TermsDeps, userId: string): Promise<TermsState> {
  const rows = await deps.db.termsAcceptance.findMany({
    where: { userId, OR: CURRENT.map((item) => ({ ...item })) },
    select: { document: true },
  })
  const accepted = new Set(rows.map((row) => row.document))
  return {
    pending: !accepted.has('TERMS') || !accepted.has('PRIVACY'),
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
  }
}

export async function acceptTerms(
  deps: TermsDeps,
  user: UserContext,
  input: { termsVersion: string; privacyVersion: string },
  ipAddress: string,
) {
  if (
    input.termsVersion !== CURRENT_TERMS_VERSION ||
    input.privacyVersion !== CURRENT_PRIVACY_VERSION
  ) {
    throw new AppError(
      409,
      'TERMS_VERSION_MISMATCH',
      'Os termos foram atualizados. Recarregue a página para ver a versão atual.',
    )
  }

  const existing = await deps.db.termsAcceptance.findMany({
    where: { userId: user.userId, OR: CURRENT.map((item) => ({ ...item })) },
  })
  if (existing.length === CURRENT.length) {
    const acceptedAt = existing.reduce(
      (earliest, row) => (row.acceptedAt < earliest ? row.acceptedAt : earliest),
      existing[0]?.acceptedAt ?? new Date(),
    )
    return response(acceptedAt)
  }

  const present = new Set(existing.map((row) => row.document))
  const acceptedAt = new Date()
  await deps.db.termsAcceptance.createMany({
    data: CURRENT.filter((item) => !present.has(item.document)).map((item) => ({
      userId: user.userId,
      document: item.document,
      version: item.version,
      acceptedAt,
      ipAddress,
    })),
  })
  return response(acceptedAt)
}

function response(acceptedAt: Date) {
  return {
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    acceptedAt: acceptedAt.toISOString(),
  }
}

import { createHash, randomBytes } from 'node:crypto'
import { enqueueEmail } from '../../emails/send-email.tsx'
import { Prisma } from '../../generated/prisma/client.ts'
import type { Database } from '../../infrastructure/database.ts'
import type { Queue } from '../../infrastructure/queue.ts'
import { AppError } from '../../shared/errors.ts'
import type { RequestContext, UserContext } from '../../shared/request-context.ts'
import { assignActiveOrganization } from '../auth/index.ts'
import type { INVITABLE_ROLES } from './invitation.schema.ts'
import { countMemberships } from './membership.ts'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const TOKEN_BYTES = 32

const alreadyMember = new AppError(409, 'ALREADY_MEMBER', 'Esta pessoa já é membro da organização.')
const invitationPending = new AppError(
  409,
  'INVITATION_PENDING',
  'Já existe um convite pendente para este e-mail.',
)
const hidden = new AppError(404, 'NOT_FOUND', 'Convite não encontrado.')
const closed = new AppError(422, 'INVITATION_CLOSED', 'Este convite não está mais aberto.')
const expired = new AppError(422, 'INVITATION_EXPIRED', 'Este convite expirou.')
const emailMismatch = new AppError(
  403,
  'INVITATION_EMAIL_MISMATCH',
  'Este convite é para outro e-mail.',
)
const quotaReached = new AppError(
  422,
  'USER_QUOTA_REACHED',
  'O plano não tem vagas para outro usuário.',
)
const orgLimit = new AppError(
  422,
  'ORG_LIMIT_REACHED',
  'Você já participa do número máximo de organizações.',
)

type InvitableRole = (typeof INVITABLE_ROLES)[number]

type CreateDeps = { db: Database; queue: Queue; appUrl: string }

type AcceptDeps = { db: Database; maxOrgsPerUser: number }

export type CreateInvitationInput = { email: string; role: InvitableRole }

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

type PreviewStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'

function previewStatus(status: string, expiresAt: Date, now: Date): PreviewStatus {
  if (status === 'PENDING' && expiresAt.getTime() <= now.getTime()) return 'EXPIRED'
  if (status === 'ACCEPTED' || status === 'REVOKED' || status === 'PENDING') return status
  throw new Error('unexpected invitation status')
}

export async function createInvitation(
  deps: CreateDeps,
  ctx: RequestContext,
  input: CreateInvitationInput,
  now = new Date(),
) {
  const email = input.email.toLowerCase()
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const expiresAt = new Date(now.getTime() + WEEK_MS)
  try {
    const created = await deps.db.withTenant(ctx, async (tx) => {
      const user = await tx.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      })
      if (user) {
        const member = await tx.member.findFirst({
          where: { userId: user.id },
          select: { id: true },
        })
        if (member) throw alreadyMember
      }
      const pending = await tx.invitation.findFirst({
        where: { email, status: 'PENDING' },
        select: { id: true },
      })
      if (pending) throw invitationPending
      const invitation = await tx.invitation.create({
        data: {
          email,
          role: input.role,
          tokenHash: tokenHash(token),
          status: 'PENDING',
          expiresAt,
        },
      })
      const organization = await tx.organization.findFirstOrThrow({ select: { name: true } })
      await enqueueEmail(deps.queue, tx, {
        template: 'invitation',
        to: email,
        props: {
          organizationName: organization.name,
          url: `${deps.appUrl}/accept-invitation?token=${token}`,
        },
      })
      return invitation
    })
    return {
      id: created.id,
      email,
      role: input.role,
      expiresAt: created.expiresAt.toISOString(),
      status: 'PENDING' as const,
    }
  } catch (error) {
    if (isUniqueViolation(error)) throw invitationPending
    throw error
  }
}

export async function listInvitations(deps: { db: Database }, ctx: RequestContext) {
  const rows = await deps.db.withTenant(ctx, (tx) =>
    tx.invitation.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, email: true, role: true, expiresAt: true },
    }),
  )
  return {
    items: rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      expiresAt: row.expiresAt.toISOString(),
    })),
  }
}

export async function revokeInvitation(deps: { db: Database }, ctx: RequestContext, id: string) {
  return deps.db.withTenant(ctx, async (tx) => {
    const row = await tx.invitation.findFirst({ where: { id }, select: { id: true, status: true } })
    if (!row) throw hidden
    if (row.status !== 'PENDING') throw closed
    await tx.invitation.update({ where: { id: row.id }, data: { status: 'REVOKED' } })
    return { id: row.id, status: 'REVOKED' as const }
  })
}

export async function previewInvitation(deps: { db: Database }, token: string, now = new Date()) {
  const hash = tokenHash(token)
  const row = await deps.db.withInvitation(hash, (tx) =>
    tx.invitation.findFirst({
      where: { tokenHash: hash },
      select: {
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        organizationId: true,
      },
    }),
  )
  if (!row) throw hidden
  const organization = await deps.db.withTenant({ organizationId: row.organizationId }, (tx) =>
    tx.organization.findFirstOrThrow({ select: { name: true } }),
  )
  const status = previewStatus(row.status, row.expiresAt, now)
  return {
    organizationName: organization.name,
    email: row.email,
    role: row.role,
    status,
    expiresAt: row.expiresAt.toISOString(),
  }
}

export async function acceptInvitation(
  deps: AcceptDeps,
  user: UserContext,
  input: { token: string },
  now = new Date(),
) {
  const hash = tokenHash(input.token)
  const found = await deps.db.withInvitation(hash, (tx) =>
    tx.invitation.findFirst({
      where: { tokenHash: hash },
      select: {
        email: true,
        status: true,
        expiresAt: true,
        organizationId: true,
      },
    }),
  )
  if (!found) throw hidden
  const account = await deps.db.user.findUniqueOrThrow({
    where: { id: user.userId },
    select: { email: true },
  })
  if (account.email.toLowerCase() !== found.email) throw emailMismatch
  if (found.status !== 'PENDING') throw closed
  if (found.expiresAt.getTime() <= now.getTime()) throw expired

  const held = await deps.db.withUser(user.userId, (tx) => countMemberships(tx, user.userId))
  if (held >= deps.maxOrgsPerUser) throw orgLimit

  return deps.db.withTenant({ organizationId: found.organizationId }, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Subscription" FOR UPDATE`
    const current = await tx.invitation.findFirst({
      where: { tokenHash: hash },
      select: { id: true, status: true, expiresAt: true, role: true },
    })
    if (current?.status !== 'PENDING') throw closed
    if (current.expiresAt.getTime() <= now.getTime()) throw expired
    const member = await tx.member.findFirst({
      where: { userId: user.userId },
      select: { id: true },
    })
    if (member) throw alreadyMember
    const subscription = await tx.subscription.findFirst({
      include: { plan: { select: { maxUsers: true } } },
    })
    if (!subscription) throw new Error('Subscription missing')
    const active = await tx.member.count({ where: { active: true } })
    if (active >= subscription.plan.maxUsers) throw quotaReached
    await tx.member.create({
      data: { userId: user.userId, role: current.role, active: true, commissionSplitBp: 0 },
    })
    await tx.invitation.update({ where: { id: current.id }, data: { status: 'ACCEPTED' } })
    await assignActiveOrganization(tx, user.sessionId, found.organizationId)
    return { organizationId: found.organizationId, role: current.role }
  })
}

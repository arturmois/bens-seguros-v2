import type { Database } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'
import type { Role } from '../../shared/permissions.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { record } from '../audit/index.ts'
import { portfolioMoves } from './portfolio.ts'

const hidden = new AppError(404, 'NOT_FOUND', 'Membro não encontrado.')
const ownerImmutable = new AppError(
  422,
  'OWNER_IMMUTABLE',
  'O proprietário não pode ser alterado nem desativado.',
)
const quotaReached = new AppError(
  422,
  'USER_QUOTA_REACHED',
  'O plano não tem vagas para outro usuário.',
)
const sameMember = new AppError(
  422,
  'SAME_MEMBER',
  'A carteira não pode ser transferida para o mesmo membro.',
)
const targetInactive = new AppError(
  422,
  'TARGET_INACTIVE',
  'O destino da carteira precisa estar ativo.',
)

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  active: true,
  commissionSplitBp: true,
  user: { select: { email: true, name: true } },
} as const

function present(member: {
  id: string
  userId: string
  role: Role
  active: boolean
  commissionSplitBp: number
  user: { email: string; name: string }
}) {
  return {
    id: member.id,
    userId: member.userId,
    role: member.role,
    active: member.active,
    email: member.user.email,
    name: member.user.name,
    commissionSplitBp: member.commissionSplitBp,
  }
}

export async function updateMember(
  deps: { db: Database },
  ctx: RequestContext,
  id: string,
  input: { role?: Role | undefined; active?: boolean | undefined },
) {
  return deps.db.withTenant(ctx, async (tx) => {
    const member = await tx.member.findFirst({ where: { id }, select: memberSelect })
    if (!member) throw hidden
    if (member.role === 'OWNER') throw ownerImmutable

    const nextRole = input.role ?? member.role
    const nextActive = input.active ?? member.active
    const roleChanged = nextRole !== member.role
    const activeChanged = nextActive !== member.active
    if (!roleChanged && !activeChanged) return present(member)

    if (activeChanged && nextActive) {
      await tx.$queryRaw`SELECT id FROM "Subscription" FOR UPDATE`
      const subscription = await tx.subscription.findFirst({
        include: { plan: { select: { maxUsers: true } } },
      })
      if (!subscription) {
        throw new Error(`Subscription missing for organization ${ctx.organizationId}`)
      }
      const activeCount = await tx.member.count({ where: { active: true } })
      if (activeCount >= subscription.plan.maxUsers) throw quotaReached
    }

    await tx.member.update({
      where: { id: member.id },
      data: { role: nextRole, active: nextActive },
    })
    const changes: { role?: [Role, Role]; active?: [boolean, boolean] } = {}
    if (roleChanged) changes.role = [member.role, nextRole]
    if (activeChanged) changes.active = [member.active, nextActive]
    await record(tx, ctx, { action: 'member.update', entityId: member.id, changes })
    return present({ ...member, role: nextRole, active: nextActive })
  })
}

export async function listMembers(deps: { db: Database }, ctx: RequestContext) {
  const rows = await deps.db.withTenant(ctx, (tx) =>
    tx.member.findMany({
      select: memberSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
  )
  return { items: rows.map(present) }
}

export async function transferPortfolio(
  deps: { db: Database },
  ctx: RequestContext,
  id: string,
  input: { toMemberId: string },
) {
  if (input.toMemberId === id) throw sameMember
  return deps.db.withTenant(ctx, async (tx) => {
    const source = await tx.member.findFirst({
      where: { id },
      select: { id: true, userId: true },
    })
    if (!source) throw hidden
    const target = await tx.member.findFirst({
      where: { id: input.toMemberId },
      select: { id: true, userId: true, active: true },
    })
    if (!target) throw hidden
    if (!target.active) throw targetInactive

    let transferred = 0
    for (const move of portfolioMoves) {
      transferred += await move(tx, source.userId, target.userId)
    }
    await record(tx, ctx, {
      action: 'portfolio.transfer',
      entityId: source.id,
      changes: { fromMemberId: source.id, toMemberId: target.id, transferred },
    })
    return { transferred }
  })
}

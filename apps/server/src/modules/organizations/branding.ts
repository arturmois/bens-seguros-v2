import { createHash } from 'node:crypto'
import type { Database } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'
import type { RequestContext } from '../../shared/request-context.ts'
import { record } from '../audit/index.ts'
import { detectImageType, MAX_LOGO_BYTES } from './logo.ts'

const noLogo = new AppError(404, 'NOT_FOUND', 'Logo não encontrado.')
const tooLarge = new AppError(422, 'LOGO_TOO_LARGE', 'O logo pode ter no máximo 200 KB.')
const unsupported = new AppError(
  422,
  'LOGO_UNSUPPORTED_TYPE',
  'Envie uma imagem PNG, JPEG ou WebP.',
)

type Deps = { db: Database }

export type BrandingInput = {
  brandColor?: string | null | undefined
  greeting?: string | null | undefined
}

export async function updateBranding(deps: Deps, ctx: RequestContext, input: BrandingInput) {
  return deps.db.withTenant(ctx, async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { brandColor: true, greeting: true },
    })
    const after = await tx.organization.update({
      where: { id: ctx.organizationId },
      data: {
        ...(input.brandColor !== undefined && { brandColor: input.brandColor }),
        ...(input.greeting !== undefined && { greeting: input.greeting }),
      },
      select: { brandColor: true, greeting: true },
    })
    // The trail takes no nulls (AD-008), so an empty field is recorded as ''.
    const changes: Record<string, [string, string]> = {}
    if (after.brandColor !== before.brandColor) {
      changes.brandColor = [before.brandColor ?? '', after.brandColor ?? '']
    }
    if (after.greeting !== before.greeting) {
      changes.greeting = [before.greeting ?? '', after.greeting ?? '']
    }
    if (Object.keys(changes).length > 0) {
      await record(tx, ctx, {
        action: 'organization.update',
        entityId: ctx.organizationId,
        changes,
      })
    }
    return after
  })
}

// `image` is base64 already validated by the route schema.
export async function uploadLogo(deps: Deps, ctx: RequestContext, image: string, now = new Date()) {
  const bytes = Buffer.from(image, 'base64')
  if (bytes.length > MAX_LOGO_BYTES) throw tooLarge
  const type = detectImageType(bytes)
  if (!type) throw unsupported

  return deps.db.withTenant(ctx, async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { logoUpdatedAt: true },
    })
    await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { logo: bytes, logoMimeType: type, logoUpdatedAt: now },
      select: { id: true },
    })
    // The bytes never go to the trail: only whether a logo existed before and after.
    await record(tx, ctx, {
      action: 'organization.update',
      entityId: ctx.organizationId,
      changes: { logo: [before.logoUpdatedAt !== null, true] },
    })
    return { logoUpdatedAt: now.toISOString() }
  })
}

export async function removeLogo(deps: Deps, ctx: RequestContext) {
  await deps.db.withTenant(ctx, async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { logoUpdatedAt: true },
    })
    if (before.logoUpdatedAt === null) return
    await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { logo: null, logoMimeType: null, logoUpdatedAt: null },
      select: { id: true },
    })
    await record(tx, ctx, {
      action: 'organization.update',
      entityId: ctx.organizationId,
      changes: { logo: [true, false] },
    })
  })
}

export async function readLogo(deps: Deps, ctx: Pick<RequestContext, 'organizationId'>) {
  const row = await deps.db.withTenant(ctx, (tx) =>
    tx.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { logo: true, logoMimeType: true },
    }),
  )
  if (!row?.logo || !row.logoMimeType) throw noLogo
  const bytes = Buffer.from(row.logo)
  const etag = `"${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}"`
  return { bytes, type: row.logoMimeType, etag }
}

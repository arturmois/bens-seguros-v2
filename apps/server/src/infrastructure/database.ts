import { PrismaPg } from '@prisma/adapter-pg'
import { z } from 'zod'
import { PrismaClient } from '../generated/prisma/client.ts'

const TENANT_FIELD = 'organizationId'
// The tenant itself. Only its own module writes it; a tenant-scoped row never re-points to another.
const TENANT_ROOT = 'Organization'

// Operations that must be filtered by tenant in their top-level `where`.
const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
])
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn'])
const UPDATE_OPERATIONS = new Set(['update', 'updateMany', 'updateManyAndReturn'])

// Raised for a query that could cross tenants. A programming error: it surfaces as a 500.
export class TenantGuardError extends Error {
  override name = 'TenantGuardError'
}

type ModelInfo = {
  tenantScoped: boolean
  // Relation field name → target model name.
  relations: Map<string, string>
}

const runtimeDataModelSchema = z.object({
  models: z.record(
    z.string(),
    z.object({
      fields: z.array(z.object({ name: z.string(), kind: z.string(), type: z.string() })),
    }),
  ),
})

// Prisma keeps the schema metadata on an internal field. Validated here so an upgrade that moves it
// fails at boot (and in the guard tests) instead of silently disabling the guard.
export function readModels(client: object): Map<string, ModelInfo> {
  const dataModel = runtimeDataModelSchema.parse(Reflect.get(client, '_runtimeDataModel'))
  const models = new Map<string, ModelInfo>()
  for (const [name, model] of Object.entries(dataModel.models)) {
    models.set(name, {
      tenantScoped: model.fields.some((field) => field.name === TENANT_FIELD),
      relations: new Map(
        model.fields
          .filter((field) => field.kind === 'object')
          .map((field) => [field.name, field.type]),
      ),
    })
  }
  return models
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value]
}

// `{ organizationId: '…' }` or a compound unique such as `{ id_organizationId: { id, organizationId } }`.
function hasTenantFilter(where: unknown): boolean {
  if (!isRecord(where)) return false
  return Object.entries(where).some(([key, value]) =>
    key === TENANT_FIELD
      ? typeof value === 'string'
      : key.split('_').includes(TENANT_FIELD) &&
        isRecord(value) &&
        typeof value[TENANT_FIELD] === 'string',
  )
}

type Guard = (model: string, operation: string, args: unknown) => void

export function createTenantGuard(models: Map<string, ModelInfo>): Guard {
  function modelInfo(model: string): ModelInfo {
    const info = models.get(model)
    if (!info) throw new TenantGuardError(`Unknown model ${model}`)
    return info
  }

  // No nested write ever reaches a tenant-scoped relation: rows are linked by their scalar foreign
  // key in their own write, and the composite FK rejects another tenant's row. A nested write cannot
  // be made safe here, because the composite FK shares `organizationId`: connecting through the
  // relation rewrites the tenant of one side. A tenant-scoped row never writes its tenant relation.
  function checkNestedWrites(model: string, data: unknown, path: string) {
    const { relations, tenantScoped } = modelInfo(model)
    for (const item of asList(data)) {
      if (!isRecord(item)) continue

      for (const [field, target] of relations) {
        const operations = item[field]
        if (!isRecord(operations)) continue
        const at = `${path}.${field}`

        if (modelInfo(target).tenantScoped) {
          throw new TenantGuardError(
            `${at}: nested writes into ${target} are not allowed (write ${target} itself, link by foreign key)`,
          )
        }
        if (tenantScoped && target === TENANT_ROOT) {
          throw new TenantGuardError(`${at} must not write the tenant relation`)
        }

        // A model without organizationId (such as User) may be written nested; its own nested
        // writes follow the same rule.
        checkNestedWrites(target, operations.create, `${at}.create`)
        if (isRecord(operations.createMany)) {
          checkNestedWrites(target, operations.createMany.data, `${at}.createMany`)
        }
        for (const update of asList(operations.update ?? [])) {
          // To-one: `update: data` or `update: { where?, data }`; to-many: `update: { where, data }`.
          const updateData = isRecord(update) && 'data' in update ? update.data : update
          checkNestedWrites(target, updateData, `${at}.update`)
        }
        for (const upsert of asList(operations.upsert ?? [])) {
          if (!isRecord(upsert)) continue
          checkNestedWrites(target, upsert.create, `${at}.upsert`)
          checkNestedWrites(target, upsert.update, `${at}.upsert`)
        }
        for (const connectOrCreate of asList(operations.connectOrCreate ?? [])) {
          if (isRecord(connectOrCreate)) {
            checkNestedWrites(target, connectOrCreate.create, `${at}.connectOrCreate`)
          }
        }
      }
    }
  }

  // Reads follow relations from a tenant-filtered root, and composite FKs keep those rows in the same
  // tenant. A model without organizationId (Organization, User) has no such filter, so from it no
  // relation to a tenant-scoped model is read, counted, filtered or ordered by, at any depth.
  function checkReads(model: string, args: unknown, path: string) {
    if (!isRecord(args)) return
    for (const key of ['include', 'select'] as const) {
      checkProjection(model, args[key], `${path}.${key}`)
    }
    checkRelationFilter(model, args.where, `${path}.where`)
    for (const orderBy of asList(args.orderBy ?? [])) {
      checkRelationFilter(model, orderBy, `${path}.orderBy`)
    }
  }

  function assertReadable(model: string, target: string, at: string) {
    if (!modelInfo(model).tenantScoped && modelInfo(target).tenantScoped) {
      throw new TenantGuardError(`${at}: ${model} has no tenant filter to read ${target} through`)
    }
  }

  function checkProjection(model: string, projection: unknown, path: string) {
    if (!isRecord(projection)) return
    const { relations } = modelInfo(model)
    for (const [key, value] of Object.entries(projection)) {
      if (key === '_count') {
        const counted = isRecord(value) ? value.select : undefined
        if (isRecord(counted)) {
          for (const field of Object.keys(counted)) {
            const target = relations.get(field)
            if (target) assertReadable(model, target, `${path}._count.${field}`)
          }
        }
        continue
      }
      const target = relations.get(key)
      if (!target || value === false || value === undefined) continue
      assertReadable(model, target, `${path}.${key}`)
      checkReads(target, value, `${path}.${key}`)
    }
  }

  // `where` and `orderBy` share the shape that matters here: relation keys whose values nest the
  // same shape for the target model (`some`, `is`, `_count`…), combined with AND/OR/NOT.
  function checkRelationFilter(model: string, filter: unknown, path: string) {
    for (const item of asList(filter)) {
      if (!isRecord(item)) continue
      const { relations } = modelInfo(model)
      for (const [key, value] of Object.entries(item)) {
        if (key === 'AND' || key === 'OR' || key === 'NOT') {
          checkRelationFilter(model, value, `${path}.${key}`)
          continue
        }
        const target = relations.get(key)
        if (!target) continue
        assertReadable(model, target, `${path}.${key}`)
        if (!isRecord(value)) continue
        for (const [operator, nested] of Object.entries(value)) {
          const inner = ['some', 'every', 'none', 'is', 'isNot'].includes(operator)
            ? nested
            : { [operator]: nested }
          checkRelationFilter(target, inner, `${path}.${key}.${operator}`)
        }
      }
    }
  }

  return (model, operation, args) => {
    const where = isRecord(args) ? args.where : undefined
    const data = isRecord(args) ? args.data : undefined
    checkReads(model, args, `${model}.${operation}`)

    if (!modelInfo(model).tenantScoped) {
      // No tenant filter to enforce, but its nested writes must not reach tenant-scoped rows.
      checkNestedWrites(model, data, `${model}.${operation}.data`)
      if (isRecord(args)) {
        checkNestedWrites(model, args.create, `${model}.${operation}.create`)
        checkNestedWrites(model, args.update, `${model}.${operation}.update`)
      }
      return
    }

    if (CREATE_OPERATIONS.has(operation)) {
      for (const row of asList(data)) {
        if (!isRecord(row) || typeof row[TENANT_FIELD] !== 'string') {
          throw new TenantGuardError(
            `${model}.${operation} without data.${TENANT_FIELD} (use the unchecked scalar, not a relation connect)`,
          )
        }
      }
      checkNestedWrites(model, data, `${model}.${operation}.data`)
      return
    }

    if (!WHERE_OPERATIONS.has(operation)) {
      throw new TenantGuardError(`${model}.${operation} is not supported by the tenant guard`)
    }
    if (!hasTenantFilter(where)) {
      throw new TenantGuardError(`${model}.${operation} without where.${TENANT_FIELD}`)
    }

    // A row never changes tenant.
    const updateData = operation === 'upsert' && isRecord(args) ? args.update : data
    if ((UPDATE_OPERATIONS.has(operation) || operation === 'upsert') && isRecord(updateData)) {
      if (updateData[TENANT_FIELD] !== undefined) {
        throw new TenantGuardError(`${model}.${operation} must not change ${TENANT_FIELD}`)
      }
    }

    if (operation === 'upsert' && isRecord(args)) {
      if (!isRecord(args.create) || typeof args.create[TENANT_FIELD] !== 'string') {
        throw new TenantGuardError(`${model}.upsert without create.${TENANT_FIELD}`)
      }
      checkNestedWrites(model, args.create, `${model}.upsert.create`)
      checkNestedWrites(model, args.update, `${model}.upsert.update`)
      return
    }
    checkNestedWrites(model, data, `${model}.${operation}.data`)
  }
}

// `?schema=` follows the Prisma convention. The tests use it to give each Vitest worker its own schema.
export function parseDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl)
  const schema = url.searchParams.get('schema') ?? 'public'
  url.searchParams.delete('schema')
  return { connectionString: url.toString(), schema }
}

export function createDatabase(databaseUrl: string) {
  const { connectionString, schema } = parseDatabaseUrl(databaseUrl)
  // search_path also covers raw SQL (pg-boss, $queryRaw), which the adapter's `schema` does not qualify.
  const adapter = new PrismaPg(
    { connectionString, options: `-c search_path="${schema}"` },
    { schema },
  )
  const client = new PrismaClient({ adapter })
  const guard = createTenantGuard(readModels(client))

  return client.$extends({
    name: 'tenant-guard',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          guard(model, operation, args)
          return query(args)
        },
      },
    },
  })
}

export type Database = ReturnType<typeof createDatabase>
// The client inside `db.$transaction(async (tx) => …)`. Repositories accept either.
export type Transaction = Parameters<Parameters<Database['$transaction']>[0]>[0]
export type DbClient = Database | Transaction

import { PrismaPg } from '@prisma/adapter-pg'
import { z } from 'zod'
import { PrismaClient } from '../generated/prisma/client.ts'

const TENANT_FIELD = 'organizationId'

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

  // Nested writes (`data`) may reference existing rows of tenant-scoped models by unique key. Those
  // references must carry the tenant too, or a foreign id from the input would link across tenants.
  function checkNestedWrites(model: string, data: unknown, path: string) {
    for (const item of asList(data)) {
      if (!isRecord(item)) continue
      const { relations } = modelInfo(model)

      for (const [field, target] of relations) {
        const operations = item[field]
        if (!isRecord(operations)) continue
        const targetScoped = modelInfo(target).tenantScoped
        const at = `${path}.${field}`

        if (targetScoped) {
          for (const operation of ['connect', 'set'] as const) {
            if (operations[operation] === undefined) continue
            for (const where of asList(operations[operation])) {
              if (!hasTenantFilter(where)) {
                throw new TenantGuardError(
                  `${at}.${operation} on ${target} without ${TENANT_FIELD}`,
                )
              }
            }
          }
          for (const connectOrCreate of asList(operations.connectOrCreate ?? [])) {
            if (!isRecord(connectOrCreate) || !hasTenantFilter(connectOrCreate.where)) {
              throw new TenantGuardError(
                `${at}.connectOrCreate on ${target} without ${TENANT_FIELD}`,
              )
            }
            checkNestedWrites(target, connectOrCreate.create, `${at}.connectOrCreate`)
          }
        }

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
      }
    }
  }

  return (model, operation, args) => {
    if (!modelInfo(model).tenantScoped) return
    const where = isRecord(args) ? args.where : undefined
    const data = isRecord(args) ? args.data : undefined

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

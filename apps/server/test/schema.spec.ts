import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ADR-004: every relation between two tenant-scoped models (models with `organizationId`) references
// `(id, organizationId)`, so the database itself rejects a row from another tenant.

type Field = { name: string; type: string; relationFields: string[] | undefined }

function parseModels(schema: string): Map<string, Field[]> {
  const models = new Map<string, Field[]>()
  for (const [, name, body] of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    if (name === undefined || body === undefined) continue
    const fields = body
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^\w/.test(line))
      .map((line) => {
        const [fieldName = '', type = ''] = line.split(/\s+/)
        const relationFields = line.match(/@relation\([^)]*fields:\s*\[([^\]]*)\]/)?.[1]
        return {
          name: fieldName,
          type: type.replace(/[?[\]]/g, ''),
          relationFields: relationFields?.split(',').map((field) => field.trim()),
        }
      })
    models.set(name, fields)
  }
  return models
}

function findSimpleTenantRelations(schema: string): string[] {
  const models = parseModels(schema)
  const tenantScoped = new Set(
    [...models]
      .filter(([, fields]) => fields.some((f) => f.name === 'organizationId'))
      .map(([n]) => n),
  )
  const violations: string[] = []
  for (const [model, fields] of models) {
    if (!tenantScoped.has(model)) continue
    for (const field of fields) {
      // The side without `fields` is the back-relation; the owning side carries the foreign key.
      if (!tenantScoped.has(field.type) || field.relationFields === undefined) continue
      if (!field.relationFields.includes('organizationId'))
        violations.push(`${model}.${field.name}`)
    }
  }
  return violations
}

describe('tenant-scoped relations', () => {
  it('every relation between tenant-scoped models uses a composite foreign key', () => {
    const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')

    expect(
      parseModels(schema)
        .get('Example')
        ?.some((f) => f.name === 'parent'),
    ).toBe(true)
    expect(findSimpleTenantRelations(schema)).toEqual([])
  })

  it('flags a relation between tenant-scoped models without organizationId', () => {
    const schema = `
model Organization {
  id String @id
}

model Product {
  id             String @id
  organizationId String
  items          Item[]

  @@unique([id, organizationId])
}

model Item {
  id             String       @id
  organizationId String
  productId      String
  organization   Organization @relation(fields: [organizationId], references: [id])
  product        Product      @relation(fields: [productId], references: [id]) // simple FK
  sibling        Item?        @relation("Siblings", fields: [siblingId, organizationId], references: [id, organizationId])
  siblingId      String?
  siblings       Item[]       @relation("Siblings")
}
`

    expect(findSimpleTenantRelations(schema)).toEqual(['Item.product'])
  })
})

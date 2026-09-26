import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

type SourceFile = { path: string; source: string }

const IMPORT_PATTERN =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function importsOf(source: string): string[] {
  return [...source.matchAll(IMPORT_PATTERN)].flatMap((match) =>
    [match[1], match[2], match[3]].filter((spec) => spec !== undefined),
  )
}

// Paths are relative to `src/`, POSIX style: `modules/clients/create-client.ts`.
function resolveImport(fromFile: string, specifier: string): string {
  if (!specifier.startsWith('.')) return specifier
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier))
}

function moduleOf(file: string): string | undefined {
  const [root, name] = file.split('/')
  return root === 'modules' ? name : undefined
}

function findBoundaryViolations(files: SourceFile[]): string[] {
  const violations: string[] = []

  for (const file of files) {
    const fromModule = moduleOf(file.path)
    const layer = file.path.split('/')[0]

    for (const specifier of importsOf(file.source)) {
      const target = resolveImport(file.path, specifier)
      const targetModule = moduleOf(target)

      if (specifier === 'pg-boss' || specifier.startsWith('pg-boss/')) {
        if (file.path !== 'infrastructure/queue.ts') {
          violations.push(`${file.path}: imports pg-boss outside infrastructure/queue.ts`)
        }
        continue
      }

      if (targetModule !== undefined && targetModule !== fromModule) {
        const isPublicApi =
          target === `modules/${targetModule}` || target === `modules/${targetModule}/index.ts`
        if (!isPublicApi) {
          violations.push(
            `${file.path}: deep import ${specifier} (use modules/${targetModule}/index.ts)`,
          )
        }
      }

      if (
        layer === 'shared' &&
        (targetModule !== undefined || target.startsWith('infrastructure/'))
      ) {
        violations.push(`${file.path}: shared/ must not import ${specifier}`)
      }

      if (layer === 'infrastructure' && targetModule !== undefined) {
        violations.push(`${file.path}: infrastructure/ must not import ${specifier}`)
      }
    }
  }

  return violations
}

// ADR-013 / architecture.md §4: the conversation domain never reaches the AI or a channel adapter
// (the adapter calls it), and contacts sit below both.
const FORBIDDEN_MODULE_EDGES: Record<string, string[]> = {
  conversations: ['ai', 'channels'],
  contacts: ['conversations', 'channels', 'ai'],
}

// Module -> the modules it imports (through their index).
function moduleGraph(files: SourceFile[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>()
  for (const file of files) {
    const fromModule = moduleOf(file.path)
    if (fromModule === undefined) continue
    const edges = graph.get(fromModule) ?? new Set<string>()
    graph.set(fromModule, edges)
    for (const specifier of importsOf(file.source)) {
      const targetModule = moduleOf(resolveImport(file.path, specifier))
      if (targetModule !== undefined && targetModule !== fromModule) edges.add(targetModule)
    }
  }
  return graph
}

function findForbiddenModuleEdges(files: SourceFile[]): string[] {
  const violations: string[] = []
  for (const [from, targets] of moduleGraph(files)) {
    for (const target of targets) {
      if (FORBIDDEN_MODULE_EDGES[from]?.includes(target)) violations.push(`${from} -> ${target}`)
    }
  }
  return violations.sort()
}

// Every import cycle between modules, each written from its smallest module name.
function findModuleCycles(files: SourceFile[]): string[] {
  const graph = moduleGraph(files)
  const cycles = new Set<string>()
  const walk = (path: string[]) => {
    const current = path.at(-1) ?? ''
    for (const next of graph.get(current) ?? []) {
      const start = path.indexOf(next)
      if (start >= 0) {
        const cycle = path.slice(start)
        const first = cycle.indexOf([...cycle].sort()[0] ?? '')
        const rotated = [...cycle.slice(first), ...cycle.slice(0, first)]
        cycles.add([...rotated, rotated[0]].join(' -> '))
      } else {
        walk([...path, next])
      }
    }
  }
  for (const module of graph.keys()) walk([module])
  return [...cycles].sort()
}

// architecture.md §3: the module that owns each table, by Prisma delegate and by table name.
const TABLE_OWNERS: Record<string, string> = {
  User: 'auth',
  Session: 'auth',
  Account: 'auth',
  Verification: 'auth',
  TwoFactor: 'auth',
  TermsAcceptance: 'auth',
  RateLimit: 'auth',
  Organization: 'organizations',
  Member: 'organizations',
  Invitation: 'organizations',
  AuditLog: 'audit',
  Plan: 'billing',
  Subscription: 'billing',
  Contact: 'contacts',
  ConsentRecord: 'contacts',
  Conversation: 'conversations',
  Message: 'conversations',
  Channel: 'channels',
}

const WRITE_METHODS =
  'create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany'
const DELEGATE_WRITE = new RegExp(`\\.\\s*(\\w+)\\s*\\.\\s*(${WRITE_METHODS})\\s*\\(`, 'g')
const SQL_WRITE = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(\w+)"/g

// A module writes only its own tables (architecture.md §4); tests seed whatever they need.
function findForeignWrites(files: SourceFile[]): string[] {
  const violations: string[] = []
  for (const file of files) {
    const module = moduleOf(file.path)
    if (module === undefined || file.path.endsWith('.spec.ts')) continue
    for (const [, delegate = '', method] of file.source.matchAll(DELEGATE_WRITE)) {
      const table = delegate.charAt(0).toUpperCase() + delegate.slice(1)
      const owner = TABLE_OWNERS[table]
      if (owner !== undefined && owner !== module) {
        violations.push(`${file.path}: ${delegate}.${method} writes a table of ${owner}`)
      }
    }
    for (const [, verb = '', table = ''] of file.source.matchAll(SQL_WRITE)) {
      const owner = TABLE_OWNERS[table]
      if (owner !== undefined && owner !== module) {
        violations.push(
          `${file.path}: ${verb.split(/\s+/)[0]} "${table}" writes a table of ${owner}`,
        )
      }
    }
  }
  return violations
}

function readSourceTree(root: string): SourceFile[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => ({
      path: file.split(path.sep).join('/'),
      source: readFileSync(path.join(root, file), 'utf8'),
    }))
}

describe('tenant isolation', () => {
  it('has no syntactic tenant guard', () => {
    // Row level security replaced it (ADR-004); a second, partial mechanism would read as a guarantee.
    const srcRoot = fileURLToPath(new URL('../src', import.meta.url))
    const leftovers = readSourceTree(srcRoot)
      .filter((file) => !file.path.startsWith('generated/'))
      .filter((file) => /\b(createTenantGuard|TenantGuardError|readModels)\b/.test(file.source))
      .map((file) => file.path)

    expect(leftovers).toEqual([])
  })
})

// Only the database module sets the tenant of a session (ADR-004).
function filesCitingTenantSetting(files: SourceFile[]) {
  return files
    .filter(
      (file) => file.path !== 'infrastructure/database.ts' && !file.path.startsWith('generated/'),
    )
    .filter(
      (file) =>
        file.source.includes('app.tenant_id') ||
        file.source.includes('app.user_id') ||
        file.source.includes('app.invitation_token'),
    )
    .map((file) => file.path)
}

// Ids are generated by the server, so the primary key can stay out of the tenant-scoped uniques.
function inputsAcceptingId(exports: Record<string, unknown>) {
  return Object.entries(exports)
    .filter(([name, value]) => name.endsWith('Input') && value instanceof z.ZodObject)
    .filter(([, value]) => value instanceof z.ZodObject && 'id' in value.shape)
    .map(([name]) => name)
}

describe('tenant settings and ids', () => {
  const srcRoot = fileURLToPath(new URL('../src', import.meta.url))

  it('only the database module sets the tenant', () => {
    expect(filesCitingTenantSetting(readSourceTree(srcRoot))).toEqual([])
    expect(
      filesCitingTenantSetting([
        { path: 'modules/x/x.repository.ts', source: "tx.$executeRaw`SET app.tenant_id = 'b'`" },
        { path: 'infrastructure/database.ts', source: "set_config('app.tenant_id', id, true)" },
      ]),
    ).toEqual(['modules/x/x.repository.ts'])
  })

  it('only the database module sets the invitation token', () => {
    expect(filesCitingTenantSetting(readSourceTree(srcRoot))).toEqual([])
    expect(
      filesCitingTenantSetting([
        {
          path: 'modules/x/invitation.ts',
          source: "set_config('app.invitation_token', hash, true)",
        },
        {
          path: 'infrastructure/database.ts',
          source: "set_config('app.invitation_token', hash, true)",
        },
      ]),
    ).toEqual(['modules/x/invitation.ts'])
  })

  it('input schemas never accept an id', async () => {
    const schemaFiles = readSourceTree(srcRoot).filter((file) =>
      /^modules\/.+\.schema\.ts$/.test(file.path),
    )
    const offenders: string[] = []
    for (const file of schemaFiles) {
      const exports: Record<string, unknown> = await import(path.join(srcRoot, file.path))
      offenders.push(...inputsAcceptingId(exports).map((name) => `${file.path}#${name}`))
    }

    expect(schemaFiles.length).toBeGreaterThan(0)
    expect(offenders).toEqual([])
    expect(
      inputsAcceptingId({
        createClientInput: z.object({ id: z.uuid(), name: z.string() }),
        updateClientInput: z.object({ name: z.string() }),
        idParams: z.object({ id: z.uuid() }),
      }),
    ).toEqual(['createClientInput'])
  })
})

describe('module boundaries', () => {
  it('the source tree has no boundary violations', () => {
    const srcRoot = fileURLToPath(new URL('../src', import.meta.url))

    expect(findBoundaryViolations(readSourceTree(srcRoot))).toEqual([])
  })

  // Named proof for web-chat-ui C16 (and the boot gate in app.ts).
  it('every /api/v1 route declares a permission', async () => {
    const { buildTestApp } = await import('./app.ts')
    const built = await buildTestApp()
    try {
      // `onRoute` → assertRouteDeclaresPermission throws if a /api/v1 route is bare.
      await expect(built.app.ready()).resolves.toBeDefined()
      const routes = built.app.printRoutes()
      expect(routes).toMatch(/conversations/)
      expect(routes).toMatch(/messages/)
    } finally {
      await built.close()
    }
  })

  describe('checker', () => {
    const check = (filePath: string, source: string) =>
      findBoundaryViolations([{ path: filePath, source }])

    it('allows imports of another module through its index', () => {
      expect(
        check('modules/policies/issue-policy.ts', "import { x } from '../proposals/index.ts'"),
      ).toEqual([])
      expect(check('modules/policies/issue-policy.ts', "import { x } from '../proposals'")).toEqual(
        [],
      )
    })

    it('allows deep imports inside the same module', () => {
      expect(
        check('modules/chat/bot/agent.ts', "import { x } from '../conversations/state.ts'"),
      ).toEqual([])
    })

    it('flags deep imports into another module', () => {
      expect(
        check(
          'modules/policies/issue-policy.ts',
          "import { x } from '../proposals/proposal.repository.ts'",
        ),
      ).toHaveLength(1)
      expect(
        check(
          'modules/policies/issue-policy.ts',
          "export * from '../proposals/proposal-stages.ts'",
        ),
      ).toHaveLength(1)
      expect(
        check(
          'modules/policies/issue-policy.ts',
          "const m = await import('../proposals/internal.ts')",
        ),
      ).toHaveLength(1)
    })

    it('flags pg-boss imports outside infrastructure/queue.ts', () => {
      expect(check('infrastructure/queue.ts', "import { PgBoss } from 'pg-boss'")).toEqual([])
      expect(
        check('modules/billing/billing.jobs.ts', "import { PgBoss } from 'pg-boss'"),
      ).toHaveLength(1)
      expect(check('app.ts', "import type { Job } from 'pg-boss'")).toHaveLength(1)
    })

    it('flags shared/ importing modules/ or infrastructure/', () => {
      expect(
        check('shared/money.ts', "import { x } from '../modules/audit/index.ts'"),
      ).toHaveLength(1)
      expect(
        check('shared/errors.ts', "import { db } from '../infrastructure/database.ts'"),
      ).toHaveLength(1)
    })

    it('flags infrastructure/ importing modules/', () => {
      expect(
        check('infrastructure/email.ts', "import { x } from '../modules/auth/index.ts'"),
      ).toHaveLength(1)
    })
  })
})

describe('conversation module boundaries', () => {
  const srcRoot = fileURLToPath(new URL('../src', import.meta.url))
  const source = (path: string, text: string) => ({ path, source: text })

  it('forbids the conversation module dependencies the adr rules out', () => {
    expect(findForbiddenModuleEdges(readSourceTree(srcRoot))).toEqual([])
    expect(
      findForbiddenModuleEdges([
        source('modules/conversations/x.ts', "import { a } from '../ai/index.ts'"),
        source('modules/conversations/y.ts', "import { c } from '../channels/index.ts'"),
        source('modules/contacts/x.ts', "import { c } from '../conversations/index.ts'"),
        source('modules/contacts/y.ts', "import { c } from '../channels/index.ts'"),
        source('modules/contacts/z.ts', "import { a } from '../ai/index.ts'"),
        source('modules/channels/x.ts', "import { c } from '../conversations/index.ts'"),
        source('modules/conversations/z.ts', "import { c } from '../contacts/index.ts'"),
      ]),
    ).toEqual([
      'contacts -> ai',
      'contacts -> channels',
      'contacts -> conversations',
      'conversations -> ai',
      'conversations -> channels',
    ])
  })

  it('finds no import cycle between modules', () => {
    expect(findModuleCycles(readSourceTree(srcRoot))).toEqual([])
    expect(
      findModuleCycles([
        source('modules/a/x.ts', "import { b } from '../b/index.ts'"),
        source('modules/b/x.ts', "import { a } from '../a/index.ts'"),
      ]),
    ).toEqual(['a -> b -> a'])
    expect(
      findModuleCycles([
        source('modules/a/x.ts', "import { b } from '../b/index.ts'"),
        source('modules/b/x.ts', "import { c } from '../c'"),
        source('modules/c/x.ts', "import { a } from '../a/index.ts'"),
        source('modules/d/x.ts', "import { a } from '../a/index.ts'"),
      ]),
    ).toEqual(['a -> b -> c -> a'])
  })

  it('lets each module write only its own tables', () => {
    expect(findForeignWrites(readSourceTree(srcRoot))).toEqual([])
    const writes = [
      source('modules/contacts/a.ts', 'await tx.conversation.create({ data })'),
      source('modules/conversations/b.ts', 'await tx.contact.createMany({ data })'),
      source('modules/contacts/c.ts', 'await tx.message.update({ where, data })'),
      source('modules/contacts/d.ts', 'await tx.conversation\n  .updateMany({ where, data })'),
      source('modules/organizations/e.ts', 'await tx.channel.upsert({ where, create, update })'),
      source('modules/conversations/f.ts', 'await tx.contact.delete({ where })'),
      source('modules/channels/g.ts', 'await tx.message.deleteMany({ where })'),
      source('modules/contacts/h.ts', 'tx.$executeRaw`INSERT INTO "Message" (id) VALUES (1)`'),
      source('modules/conversations/i.ts', 'tx.$executeRaw`UPDATE "Contact" SET x = 1`'),
      source('modules/conversations/j.ts', 'tx.$executeRaw`DELETE FROM "Channel"`'),
    ]
    for (const write of writes) expect(findForeignWrites([write]), write.path).toHaveLength(1)
    expect(
      findForeignWrites([
        source('modules/conversations/k.ts', 'await tx.channel.findUnique({ where })'),
        source('modules/conversations/l.ts', 'await tx.message.create({ data })'),
        source(
          'modules/conversations/m.ts',
          'SELECT id FROM "Conversation" WHERE id = $1 FOR UPDATE',
        ),
        source('modules/contacts/n.spec.ts', 'await tx.conversation.create({ data })'),
      ]),
    ).toEqual([])
  })
})

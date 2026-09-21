import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

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

function readSourceTree(root: string): SourceFile[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => ({
      path: file.split(path.sep).join('/'),
      source: readFileSync(path.join(root, file), 'utf8'),
    }))
}

describe('module boundaries', () => {
  it('the source tree has no boundary violations', () => {
    const srcRoot = fileURLToPath(new URL('../src', import.meta.url))

    expect(findBoundaryViolations(readSourceTree(srcRoot))).toEqual([])
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

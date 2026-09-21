# Tenant guard verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 863b23e..5ea8d8c172c6e6d38d8d61f254ab001b24f0040c
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Summary: all 19 checks are proven at HEAD with located assertions, and all 5 injected faults were
killed. The verdict is FAIL because the Coverage recompute found cross-tenant write paths that the
plan's own words name ("uma linha nunca muda de tenant", AC 7; "em qualquer profundidade", AC 9).
Three of them were run against the real database in a scratch worktree, and in each one a row
moved or linked across tenants with no error. It also found one member of AC 13 that has no proof,
and one `Test policy` expectation that is only partly met.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-004-tenant-isolation.md` (layers 3 guard, 4 composite FK, raw SQL trade-off) | yes - read in full | none | - |
| `docs/architecture.md` §7 "Isolamento de tenant (ADR-004)" (lines 327-336) | yes | none | - |
| `docs/architecture.md` §5 "Jobs e crons" (lines 233-261; jobs use a system `RequestContext`, no bypass) | yes | none | - |

No check contradicts these sources: layer 3 is covered by C1/C2, and layer 4 (a composite FK on
every tenant→tenant relation, backed by a schema test) is covered by C15/C19. These are
non-UI sources, so there is no screen or arrangement to enumerate.

## Checks

Proof run (one invocation, at HEAD `5ea8d8c`, real tree):
`cd apps/server && pnpm exec vitest run src/infrastructure/database.spec.ts test/schema.spec.ts --reporter=verbose`
exited 0 with `Tests 21 passed (21)`. Each named test below appears individually as `✓` in that
output. The rg hits in `database.spec.ts` and `schema.spec.ts` show that every name exists.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | 13 where-ops without `organizationId` throw in the guard | `✓ createTenantGuard (decision table) > rejects every where-operation without organizationId` exit 0 | `apps/server/src/infrastructure/database.spec.ts:228` - `expect(() => guard('Invoice', operation, { where: { id: 'i' } }), operation).toThrow(TenantGuardError)` looped over the 13 `WHERE_OPERATIONS` (spec:33-47); `:233` with the tenant filter `.not.toThrow()` | PASS |
| C2 | same 13 through `db` throw; rows unchanged | `✓ tenant guard on the database client > rejects every where-operation on the client and changes no rows` exit 0 | `apps/server/src/infrastructure/database.spec.ts:73` - `await expect(calls[operation](), operation).rejects.toThrow(TenantGuardError)`; `:77-78` - `expect(after).toHaveLength(before.length)` / `expect(after.map((row) => row.name)).toEqual(before.map((row) => row.name))` | PASS |
| C3 | with `organizationId` (direct or `id_organizationId`) only tenant rows come back | `✓ ... returns only the tenant rows when organizationId is present` exit 0 | `apps/server/src/infrastructure/database.spec.ts:91` - `expect(fromB).toBeNull()`; `:92` - `expect(fromA?.id).toBe(example.id)` | PASS |
| C4 | 6 non-literal shapes rejected, 2 accepted | `✓ ... accepts only a literal organizationId filter` exit 0 | `apps/server/src/infrastructure/database.spec.ts:249` - `expect(() => guard('Invoice', 'findMany', { where }), shape).toThrow(TenantGuardError)` over `equals, in, undefined, AND, OR, NOT` (:241-246); `:252`, `:253-257` `.not.toThrow()` for the literal and `id_organizationId` | PASS |
| C5 | 3 create ops reject a row missing `organizationId`, incl. one bad row among good | `✓ ... rejects every create operation with a row missing organizationId` exit 0 | `apps/server/src/infrastructure/database.spec.ts:266` - `expect(() => guard('Invoice', operation, { data: bad }), operation).toThrow(TenantGuardError)` with `bad = [{ organizationId: org }, { name: 'x' }]` (:263) | PASS |
| C6 | `upsert` needs the tenant in `where` and in `create` | `✓ ... requires the tenant on both sides of an upsert` exit 0 | `apps/server/src/infrastructure/database.spec.ts:272-274` - `guard('Invoice', 'upsert', { where: { id: 'i' }, create: { organizationId: org } })).toThrow(TenantGuardError)`; `:275-277` - `.toThrow(/upsert without create.organizationId/)` | PASS |
| C7 | unknown ops fail closed citing `is not supported` | `✓ ... fails closed on an unknown operation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:289-292` - `expect(() => guard('Invoice', operation, { where: { organizationId: org } }), operation).toThrow(/is not supported/)` over `findRaw, aggregateRaw, somethingPrismaAddsLater` | PASS |
| C8 | the 4 update paths that set scalar `organizationId` throw | `✓ ... never moves a row to another tenant` exit 0 | `apps/server/src/infrastructure/database.spec.ts:299-302` - `guard('Invoice', operation, { where, data: { organizationId: other } })).toThrow(TenantGuardError)` for `update, updateMany, updateManyAndReturn`; `:304-310` upsert `update: { organizationId: other }` `.toThrow(TenantGuardError)` | PASS |
| C9 | `updateMany` A→B on `db` throws; rows stay in A | `✓ ... rejects moving rows between tenants on the client` exit 0 | `apps/server/src/infrastructure/database.spec.ts:104` - `.rejects.toThrow(TenantGuardError)`; `:108` - `expect(after.every((row) => row.organizationId === tenantA.organizationId)).toBe(true)` | PASS |
| C10 | `Organization` passes unvalidated | `✓ ... leaves models without organizationId alone` exit 0 | `apps/server/src/infrastructure/database.spec.ts:190` - `await expect(deps.db.organization.findMany({ take: 1 })).resolves.toBeInstanceOf(Array)` | PASS |
| C11 | `connect`/`set` without tenant throw at 6 nested positions, pass with it | `✓ ... checks connect and set at every nested position` exit 0 | `apps/server/src/infrastructure/database.spec.ts:339` - `expect(() => update(wrap(unscoped[operation])), label).toThrow(TenantGuardError)`; `:340` `.not.toThrow()` for scoped, over the 6 positions at :314-327 | PASS |
| C12 | `connectOrCreate` without tenant in `where` throws citing `connectOrCreate on` | `✓ ... checks connects inside nested creates, connectOrCreate and set` exit 0 | `apps/server/src/infrastructure/database.spec.ts:349-351` - `expect(() => create({ connectOrCreate: { where: { id: 'i' }, create: {} } })).toThrow(/items.connectOrCreate on Item/)` | PASS |
| C13 | `db` nested connect without tenant throws with the message | `✓ ... rejects a nested connect to a tenant-scoped row without organizationId` exit 0 | `apps/server/src/infrastructure/database.spec.ts:139` - `.rejects.toThrow(/data.parent.connect on Example without organizationId/)` | PASS |
| C14 | tenant-filtered connect to a B row → `P2025`, `parentId` stays null | `✓ ... does not find a foreign row through a tenant-filtered connect` exit 0 | `apps/server/src/infrastructure/database.spec.ts:156` - `expect(error).toMatchObject({ code: 'P2025' })`; `:160` - `expect(reloaded?.parentId).toBeNull()` | PASS |
| C15 | `parentId` from B → `P2003`, nothing created | `✓ ... lets the composite foreign key reject a parent id from another tenant` exit 0 | `apps/server/src/infrastructure/database.spec.ts:171` - `expect(error).toMatchObject({ code: 'P2003' })`; `:175` - `expect(created).toBeNull()` | PASS |
| C16 | include under tenant filter returns only A's children + A's org; root still guarded | `✓ ... allows include of relations under a tenant filter and still guards the root` exit 0 | `apps/server/src/infrastructure/database.spec.ts:120` - `expect(loaded?.children.map((child) => child.name)).toEqual(['child-1'])`; `:124` - `expect(loaded?.organization.id).toBe(tenantA.organizationId)`; `:125-127` `.rejects.toThrow(TenantGuardError)` | PASS |
| C17 | `tx` guarded; with tenant returns rows | `✓ ... guards the transaction client too` exit 0 | `apps/server/src/infrastructure/database.spec.ts:179-181` - `deps.db.$transaction(async (tx) => tx.example.findMany({ where: { name: 'x' } }))).rejects.toThrow(TenantGuardError)`; `:186` - `expect(found.length).toBeGreaterThan(0)` | PASS |
| C18 | `readModels` fails closed on absent/malformed metadata; classifies Example/Organization; maps `parent` | `✓ ... reads the model classification from the Prisma runtime and fails closed` exit 0 | `apps/server/src/infrastructure/database.spec.ts:194-195` - `expect(() => readModels({})).toThrow()` / `readModels({ _runtimeDataModel: { models: 'unexpected' } })).toThrow()`; `:198-200` - `tenantScoped).toBe(true)`, `toBe(false)`, `relations.get('parent')).toBe('Example')` | PASS |
| C19 | schema test passes on the real schema and flags `Item.product` | `✓ tenant-scoped relations > every relation between tenant-scoped models uses a composite foreign key` and `✓ ... flags a relation between tenant-scoped models without organizationId` exit 0 | `apps/server/test/schema.spec.ts:60` - `expect(findSimpleTenantRelations(schema)).toEqual([])`; `:89` - `expect(findSimpleTenantRelations(schema)).toEqual(['Item.product'])` | PASS |

The diff touches every proof: `database.spec.ts` (+365) and `test/schema.spec.ts` (+91) are both
in `863b23e..HEAD`.

Precision and level findings about the checks (these are not failures of the claims as written):

- **C2 / AC 1 precision gap.** AC 1 says "nenhum SQL SHALL ser executado". C2 can only observe
  that no write took effect: row count and names are unchanged. A read that ran before the throw
  would not be visible. The guard runs before `query(args)` (`database.ts:213-214`), so the
  structure holds, but the check proves a weaker claim than the criterion states.
- **C10 precision gap.** `resolves.toBeInstanceOf(Array)` shows that the query was allowed. It does
  not show that "sem validação" covers nested writes under `Organization`. That gap turns into
  the AC 9 finding in Coverage below.
- **Level note (plan `Flow` step 4 / `Observable`).** The plan says `TenantGuardError` surfaces as
  `500 INTERNAL_ERROR` with `requestId`. No check claims this and no test crosses HTTP for it. The
  `Swept existing` re-read below confirms the path in the code only.

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| where-operations (13) | Prisma 7.10.0 generated TypeMap `apps/server/src/generated/prisma/internal/prismaNamespace.ts:498-563` (17 model ops) minus 3 create ops minus `upsert` | all 13: C1 (loop spec:227) · C2 (loop spec:72) | - |
| create operations (3) | same TypeMap: `create`, `createMany`, `createManyAndReturn` (`database.ts:24`) | each: C5 (loop spec:261) | - |
| `upsert` sides (2) | code `database.ts:166`, `:179` | `where` C6 · `create` C6 | - |
| total known ops (17) vs code | TypeMap 17 = `WHERE_OPERATIONS` 14 (incl. `upsert`) + `CREATE_OPERATIONS` 3 at `database.ts:8-24` | exact match; anything else hits `database.ts:163-164` → C7 | - |
| rejected filter shapes (6) | plan AC 3 | `{ equals }`, `{ in }`, `undefined`, `AND`, `OR`, `NOT`: C4 | - |
| accepted filter shapes (2) | plan AC 2 / code `database.ts:74-83` | direct string C3, C4 · `id_organizationId` C3, C4 | - |
| unknown operations (3) | checks C7 (fail-closed branch `database.ts:163`) | `findRaw`, `aggregateRaw`, invented name: C7 | - |
| paths that change a row's tenant | plan AC 7 "(uma linha nunca muda de tenant)" + Swept "data lifecycle"; members taken from Prisma's `ExampleUpdateInput` (`apps/server/src/generated/prisma/models/Example.ts:257-264`, `organization?: OrganizationUpdateOneRequiredWithoutExamplesNestedInput` with `connect`/`connectOrCreate`/`create`, `Organization.ts:312-318`) | scalar `organizationId` in `update`, `updateMany`, `updateManyAndReturn`, `upsert.update`: C8, C9 | `update` with `data.organization.connect` (tried in the scratch worktree: a row of A was moved to B, and `findFirst` under B returned it) · `upsert.update` with `organization.connect` (tried: row moved to B) · `organization.connectOrCreate` / `organization.create` in update (same unchecked branch, `database.ts:107` skips non-scoped targets and `:173` checks only the scalar key) |
| nested references to a tenant-scoped model, "em qualquer profundidade" (AC 9) | plan AC 9 vs AC 8; code returns before any nested check for a non-scoped root (`database.ts:147`) | roots on tenant-scoped models: C11, C13 | writes rooted at `Organization` (`organization.update({ where: { id: A }, data: { examples: { connect: { id: rowOfB } } } })`, tried: B's row became A's, no error). AC 8 ("deixar passar sem validação") and AC 9 contradict each other here, and no check settles which one wins |
| nested positions (6) | plan AC 9 | `create`, `createMany.data`, `update`, `upsert.create`, `upsert.update`, `connectOrCreate.create`: C11 (spec:314-327) | - |
| nested reference operations (3) | plan AC 9-10 / code `database.ts:108`, `:118` | `connect` C11, C13 · `set` C11 · `connectOrCreate.where` C12 | - |
| DB errors on a cross-tenant reference (2) | plan AC 11-12 | `P2025` C14 · `P2003` C15 (FK `Example_parentId_organizationId_fkey` in `prisma/migrations/20260921170202_init/migration.sql:32`) | - |
| relation reads under a tenant filter (2) | plan AC 13 "`include` e `select` de relações" | `include` C16 | `select` of a relation (no proof asserts it) |
| application clients (2) | plan AC 14 | `db` C2 · `tx` C17 | - |
| model classification (2) | `schema.prisma` models (`prisma/schema.prisma:14`, `:25`) | `Example` tenant-scoped C18 · `Organization` not C10, C18 | - |
| fail-closed metadata doors (2) | plan AC 15 / `database.ts:50` (Zod parse) | absent C18 · malformed C18; `createDatabase` calls it at construction `database.ts:206` | - |
| startup config: guard install (3 assemblies) | each assembly read directly; `rg "new PrismaClient"` → only `apps/server/src/infrastructure/database.ts:205` | `apps/server/src/server.ts:19` `createDependencies(config)` · `apps/server/test/app.ts:27` `createDependencies(testConfig())` (C2 boots this one) · `apps/server/scripts/export-openapi.ts:18` `buildApp(createDependencies(config))`; all → `apps/server/src/dependencies.ts:18` `db: createDatabase(config.DATABASE_URL)` | - |
| plan one-way doors (4) | plan `Landing` | single extension `database.ts:208-218` C2, C17 · runtime datamodel `database.ts:50` C18 · create by scalar only C5 · composite FK C15, C19 | - |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary (`createTenantGuard`) | `apps/server/src/infrastructure/database.ts:87-188` | boundary C2, C9, C13, C16, C17 · own layer C1, C4, C5, C6, C7, C8, C11, C12 | no - gap: the author's evidence lists "6 posições aninhadas × 3 operações de referência" as rows of the decision table. At its own layer, `connect` and `set` are asserted at all 6 positions (C11), but `connectOrCreate` only at `create` (C12, spec:349). That is 13 of 18 rows. The decision row "update data changes the tenant through the `organization` relation" has no rejecting case, and spec:357-364 asserts the opposite (allowed) |
| Decides, reached across a boundary (`readModels`) | `apps/server/src/infrastructure/database.ts:49-63` | boundary C18 (real client, spec:197-200) · own layer C18 (fake objects, spec:194-195) | yes |
| Instrumentation, pass-throughs (`createDatabase` / extension) | `apps/server/src/infrastructure/database.ts:198-219` | none of its own; covered by C2, C17 | yes |

## Swept existing re-read

- observability: `existing - shared/errors.ts`. Confirmed: `apps/server/src/shared/errors.ts:53` `request.log.error({ err: error }, 'unhandled error')` and `:55-56` `.status(500).send(body('INTERNAL_ERROR', …, { requestId: request.id }))`. `TenantGuardError` (`database.ts:28-30`) has no `statusCode`, so it skips the 4xx branch at `errors.ts:48` and reaches line 53. The constraint is there.
- idempotency and concurrency are `n/a`: user-approved policy, nothing to re-read.

## Faults injected

Isolation: the real tree's `git status --porcelain` baseline was empty. The scratch was
`git worktree add <scratchpad>/wt HEAD` followed by `pnpm install --frozen-lockfile --offline`
(the postinstall ran `prisma generate`). Before any fault, the baseline run in the scratch gave 21
passed. After each fault the file was restored with `git checkout -- <file>`.

| Mutation | Location | Killed |
| --- | --- | --- |
| literal filter check `typeof value === 'string'` → `value !== undefined` (accepts `{ equals }`/`{ in }`) | `apps/server/src/infrastructure/database.ts:78` | yes - `× accepts only a literal organizationId filter` (C4) |
| tenant-change check `updateData[TENANT_FIELD] !== undefined` → `false` | `apps/server/src/infrastructure/database.ts:173` | yes - `× never moves a row to another tenant` (C8) |
| nested reference check `if (!hasTenantFilter(where))` → `if (false)` | `apps/server/src/infrastructure/database.ts:111` | yes - `× checks connect and set at every nested position` (C11) |
| guard not invoked by the extension: `guard(model, operation, args)` → `void guard` | `apps/server/src/infrastructure/database.ts:213` | yes - `× rejects every where-operation on the client and changes no rows` (C2) |
| composite FK reverted to simple `fields: [parentId], references: [id]` | `apps/server/prisma/schema.prisma:34` | yes - `× every relation between tenant-scoped models uses a composite foreign key` (C19) |

Behaviour probes, run in the same scratch as throwaway specs and not counted as mutants. Each
passed, which shows that the uncovered paths above really do cross tenants at HEAD:
`example.update({ where: { id, organizationId: A }, data: { organization: { connect: { id: B } } } })`
returned `organizationId === B`; the same through `upsert.update` returned `organizationId === B`;
`organization.update({ where: { id: A }, data: { examples: { connect: { id: rowOfB } } } })` made
the row of B findable under A.

Discard: `git worktree remove --force <scratchpad>/wt`. Afterwards the real tree's porcelain was
empty and matched the baseline (checked with `diff`).

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` at `5ea8d8c`: lint OK (64 files),
typecheck OK, 79 passed, 0 failed (15 files), build OK. Tenant proofs: 21 passed, 0 failed.

Ranked gaps:

1. A row can change tenant through the relation: `update`/`upsert.update` with `data.organization.connect` (also `connectOrCreate`/`create`) passes the guard, which breaks AC 7's "uma linha nunca muda de tenant". Tried and confirmed. No check covers it, and `database.spec.ts:357-364` asserts it is allowed. Cause: `apps/server/src/infrastructure/database.ts:107` (non-scoped target skipped) and `:173` (checks only the scalar key).
2. Nested writes rooted at a non-tenant-scoped model (`Organization`) are never checked (`database.ts:147`). `organization.update(... examples: { connect: { id: rowOfB } })` moves B's row into A. AC 8 and AC 9 contradict each other, and no check resolves it (a plan-level precision gap).
3. `Test policy` row for `createTenantGuard` is partly met: `connectOrCreate` is asserted at 1 of 6 nested positions, and the relation-based tenant-change row has no rejecting case.
4. AC 13 `select` of relations has no proof (C16 covers `include` only).
5. Precision: C2 proves "no write took effect", not AC 1's "no SQL executed". There is no HTTP-level proof of the `500 INTERNAL_ERROR` + `requestId` surface named in the plan's `Flow`/`Observable`.

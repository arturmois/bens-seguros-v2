# Tenant RLS verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 50b19a0..a51de9b
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

All 16 named proofs exist, ran individually at `a51de9b` and pass, and each check has a located
assertion. The verdict is FAIL for four reasons, ranked:

1. **RLS bypass through `Organization` referential actions (not covered by Out of scope).**
   `Example.organizationId -> Organization.id` is `ON DELETE CASCADE ON UPDATE CASCADE`
   (`prisma/migrations/20260921170202_init/migration.sql`, FK `Example_organizationId_fkey`).
   PostgreSQL runs referential actions as the table owner with RLS not forced, and `bens_app` has
   `DELETE`/`UPDATE` on `Organization`, which has no RLS. From inside `withTenant(A)`,
   `tx.organization.delete({ where: { id: B } })` removed **every row of B in `Example`** (the count
   of B's rows inside the transaction went 2 -> 0). `tx.organization.update({ where: { id: B }, data: { id: <new uuid> } })`
   moved all of B's rows to a new tenant id, so B's count also went 2 -> 0. The same happens outside `withTenant`, in psql as `bens_app`
   (`DELETE FROM "Organization" WHERE id = B` -> `b_rows_after = 0`). The plan's Out of scope
   excuses "RLS em `Organization`" (onboarding, "minhas organizações"). It does not excuse writes
   into a tenant-scoped table. S1 says "nenhuma query ... grava linha de B, qualquer que seja a
   forma", and ADR-004 "Why" says "O RLS vale para qualquer forma de query". Needs a fix or an
   explicit scope decision from the user. Examples of a fix: `ON DELETE/UPDATE RESTRICT` on that FK,
   or no `UPDATE(id)`/`DELETE` on `Organization` for `bens_app`.
2. **Surviving mutant in the schema checker (AC 11).** Removing `c.relforcerowsecurity AND`
   from `findUnprotectedTenantTables` (`test/schema.spec.ts:17`) leaves all 5 schema proofs green. The
   synthetic tables in C12 (`Open`, `EnabledOnly`) both lack the policy, so C12 only exercises the
   policy clause. A future migration with `ENABLE` + policy but no `FORCE` would pass the checker.
   Removing `c.relrowsecurity` would survive for the same reason. That one was not injected (cap
   of 5), but it follows from the same synthetic inputs.
3. **Unmet Test policy row: the boot role check has no own-layer proof.** The row requires one case per row of the decision
   table. `assertRowSecurityApplies` (`src/infrastructure/database.ts:49`) decides on
   `rolsuper` and `rolbypassrls`. C7 uses `bens`, which is both, and C8 uses `bens_app`, which is
   neither. No case covers a `BYPASSRLS`-only role, so dropping `role.bypassRls` from the condition
   would pass every proof. This was not injected (cap); it holds by construction of the inputs.
4. **Coverage members named by the plan with no proof.** AC 2 names `update` of the scalar, but
   only `updateMany` is proven. AC 3 names `set`/`connectOrCreate` "a partir de ... `Organization`",
   but only `examples.connect` is proven from `Organization`. The adversarial pass showed these are
   blocked, but no test proves them.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-004-tenant-isolation.md` (revised) | yes - read in full | Item 6 "todo índice único de tabela tenant-scoped inclui `organizationId`" vs C13/Landing door 5 as amended mid-build ("a chave primária fica de fora"). The PK `Example_pkey` is a global unique index. The oracle is real for anyone holding a B id: `create({ data: { id: <B id> } })` in A -> `P2002 Example_pkey`, and raw `INSERT ... ON CONFLICT (id) DO NOTHING` -> 0 rows. The ADR text must be ratified or amended | "Why": RLS "vale para qualquer forma de query". The `Organization` cascade (gap 1) writes B's rows, and no check covers referential actions |
| `docs/architecture.md` §7 "Isolamento de tenant" | yes | item 5 repeats "todo índice único"; same PK narrowing as above | item 3 "Registro de outro tenant retorna 404 porque o banco não o devolve" holds for reads; the cascade in gap 1 is uncovered |
| `docs/architecture.md` §5 "Jobs" | yes | none - jobs "rodam ... dentro de `db.withTenant` ... (sem bypass)"; pg-boss connects as `bens_app` (C8) | - |
| `.specs/features/tenant-guard/` (context only) | yes - verification.md shapes replayed below | n/a | n/a |

Mid-build changes to the approved artifacts (the Handoff names C2, C3, C13 and door 1). It does not
name that **plan.md AC 2, AC 3 and Landing door 5 were also rewritten in `a51de9b`**.

- **C2 / AC 2 - fixes a wrong expectation; does not weaken security.** Prisma rejects a scalar
  `organizationId` in a nested `children.create`/`createMany` at validation ("Unknown argument
  `organizationId`"). With `organization.connect B`, the child inherits A from the parent through
  the composite FK. The security intent, "no row of B written", is still asserted as an invariant
  (`database.spec.ts:126`, `:127-129`, `:130`). What is lost is only the error signal for that one
  shape: the illegal intent now succeeds silently in A.
- **C3 / AC 3 - fixes a wrong expectation; does not weaken security.** `set`/`connectOrCreate`
  against an invisible row cannot touch B, and the test asserts B identical and A's pre-existing
  rows unchanged (`:176`, `:181`). Confirmed adversarially from `Organization` too:
  `examples.set [B]` -> `P2014`, `examples.connectOrCreate` -> new row in A, B unchanged.
- **C13 / door 5 - a narrowing, disclosed, but it contradicts the ADR wording.** The original door 5
  literal (`@@unique`/`@unique`) already excluded `@id` in Prisma terms, so the check was aligned to
  the plan. But ADR-004 item 6 and architecture §7.5 say "todo índice único", and the PK existence
  oracle is real. Its safety depends on an unenforced convention ("id nunca vem do input"): Prisma
  accepts `id` in `create`, and no lint or test forbids it. Needs user ratification.

## Checks

Proof command (one invocation, verbose): `cd apps/server && pnpm exec vitest run src/infrastructure/database.spec.ts src/infrastructure/queue.spec.ts src/app.spec.ts test/schema.spec.ts test/architecture.spec.ts test/boot.spec.ts --reporter=verbose`. Result: 6 files, 37 tests passed, exit 0, every named test listed with a check mark.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | 8 read shapes in A return only A | `✓ database.spec.ts > row level security > reads only the tenant rows in every read shape` (rg: `src/infrastructure/database.spec.ts:46`) | `src/infrastructure/database.spec.ts:66` - `expect(reads.findMany.map((row) => row.organizationId)).not.toContain(tenantB.organizationId)`; `:68` `expect(reads.findUnique).toBeNull()`; `:69-70` count/aggregate `toBe(0)`; `:71` groupBy `toEqual([tenantA.organizationId])`; `:75` `_count.examples` `toBe(0)`; `:76` raw `not.toContain(rowB.id)` | PASS |
| C2 | 4 writes into B -> `P2039`; `children.create` lands in A; B unchanged | `✓ ... rejects every write into another tenant` (rg `:80`) | `src/infrastructure/database.spec.ts:123` - `expect(prismaCode(error), write).toBe('P2039')`; `:122` `expect(error, write).toBeUndefined()` for `children.create`; `:126` `expect(afterB).toEqual(before[1])`; `:130` exactly 1 new A row | PASS |
| C3 | 3 references fail with P2025/P2018/P2003/P2039; `set`/`connectOrCreate` absorbed; B and A's existing rows unchanged | `✓ ... cannot link or move another tenant's row` (rg `:133`) | `src/infrastructure/database.spec.ts:173` - `expect(['P2025', 'P2018', 'P2003', 'P2039'], reference).toContain(prismaCode(error))`; `:176` `expect(afterB).toEqual(before[1])`; `:181` existing A rows `toEqual(before[0])` | PASS |
| C4 | findMany/count/create outside `withTenant` fail; count unchanged | `✓ ... fails outside withTenant` (rg `:184`) | `src/infrastructure/database.spec.ts:188-192` - `await expect(deps.db.example.findMany()).rejects.toThrow()` (same for count, create); `:194` `expect(await snapshot(tenantA)).toEqual(before)`. Weak: `toThrow()` accepts any error, not specifically a DB error, though the adversarial pass saw `42704`/`22P02` from the DB, including on an empty table | PASS |
| C5 | `create` without `organizationId` gets A | `✓ ... fills organizationId from the tenant` (rg `:197`) | `src/infrastructure/database.spec.ts:200` - `expect(created.organizationId).toBe(tenantA.organizationId)` | PASS |
| C6 | scalar `parentId` within A links; B -> `P2003`, unchanged | `✓ ... links rows only within the tenant` (rg `:203`) | `src/infrastructure/database.spec.ts:211` - `expect(linked.parentId).toBe(parentA.id)`; `:218` `expect(prismaCode(error)).toBe('P2003')`; `:222` `expect(reloaded?.parentId).toBe(parentA.id)` | PASS |
| C7 | boot as superuser exits 1 naming the role | `✓ boot.spec.ts > server boot > refuses to boot with a role that bypasses row security` (rg `test/boot.spec.ts:23`) | `test/boot.spec.ts:41-44` - `await expect(boot).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Database role "bens" bypasses row level security') })` | PASS |
| C8 | client is `bens_app` (no super/bypass); pg-boss schema owned by `bens_app`; prisma.config reads `MIGRATION_DATABASE_URL` | `✓ ... connects as the application role` (rg `:244`) | `src/infrastructure/database.spec.ts:249` - `expect(role).toEqual({ name: 'bens_app', superuser: false, bypassRls: false })`; `:256` `expect(schema?.owner).toBe('bens_app')`; `:260` `expect(prismaConfig).toContain('process.env.MIGRATION_DATABASE_URL')` (source-text assertion, matches the claim as written) | PASS |
| C9 | enqueue in `withTenant`: rollback -> no job; commit -> processed | `✓ queue.spec.ts > queue > enqueues inside a tenant transaction` (rg `src/infrastructure/queue.spec.ts:37`) | `src/infrastructure/queue.spec.ts:54` - `expect(await jobsIn(name)).toEqual([])`; `:61` `expect(processed).toEqual([2])` | PASS |
| C10 | after 5 commit + 5 rollback, 10 outside queries fail; B sees only B | `✓ ... does not leak the tenant to the next transaction` (rg `:225`) | `src/infrastructure/database.spec.ts:237` - `await expect(deps.db.example.count(), \`outside #${i}\`).rejects.toThrow()`; `:241` `expect(asB.every((row) => row.organizationId === tenantB.organizationId)).toBe(true)` | PASS |
| C11 | every `organizationId` table has ENABLE + FORCE + `tenant_isolation` | `✓ schema.spec.ts > tenant tables > every tenant table is protected by row security` (rg `test/schema.spec.ts:64`) | `test/schema.spec.ts:69` - `expect(unprotected).toEqual([])` | PASS |
| C12 | checker flags a synthetic tenant table without RLS | `✓ ... flags a tenant table without row security` (rg `:72`) | `test/schema.spec.ts:85` - `expect(tables).toEqual(['EnabledOnly', 'Open'])`. Proven as written, but both synthetic tables lack the policy, so the FORCE and ENABLE clauses are not discriminated (surviving mutant F5) | PASS |
| C13 | unique indexes include `organizationId` (PK excluded); synthetic flagged | `✓ ... every unique index of a tenant table includes organizationId` (rg `:88`) | `test/schema.spec.ts:103` - `expect(real).toEqual([])`; `:104` `expect(synthetic).toEqual(['Client_email_key'])` | PASS |
| C14 | composite-FK test passes on the real schema and flags `Item.product` | `✓ ... every relation between tenant-scoped models uses a composite foreign key`, `✓ ... flags a relation between tenant-scoped models without organizationId` (rg `:156`, `:167`) | `test/schema.spec.ts:164` - `expect(findSimpleTenantRelations(schema)).toEqual([])`; `:193` `.toEqual(['Item.product'])` | PASS |
| C15 | no `createTenantGuard`/`TenantGuardError`/`readModels` in `src` | `✓ architecture.spec.ts > tenant isolation > has no syntactic tenant guard` (rg `test/architecture.spec.ts:82`) | `test/architecture.spec.ts:90` - `expect(leftovers).toEqual([])`; `rg` for the three names in `apps/server/src` -> no hits outside generated | PASS |
| C16 | isolation violation -> `500 INTERNAL_ERROR` with `requestId` = `x-request-id` | `✓ app.spec.ts > error handler > surfaces a row security violation as a generic 500` (rg `src/app.spec.ts:134`) | `src/app.spec.ts:137` - `expect(res.statusCode).toBe(500)`; `:138-144` `toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.', details: { requestId: res.headers['x-request-id'] } } })` | PASS |

All 16 proofs are in files the diff touched (`git diff --stat 50b19a0..a51de9b`: `database.spec.ts`, `queue.spec.ts`, `app.spec.ts`, `schema.spec.ts`, `architecture.spec.ts`, `boot.spec.ts`). C14's two tests are unchanged from `tenant-guard` by design ("critério mantido").

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| read shapes (8 named by AC 1) | plan AC 1; Prisma read API | findMany, findUnique B, count, aggregate, groupBy, org include examples, org include `_count`, raw SQL -> C1 (`database.spec.ts:66-77`). The Prisma shapes the plan does not name were replayed adversarially as `bens_app`; B is invisible in every one: `findFirst`/fluent `org(B).examples()` -> `[]`, `cursor` on a B row -> `[]`, `orderBy examples._count` -> B `0`, `where examples.some` -> `[]`, `_count.select.children.where organization.examples`, `example include organization.include.examples`, `COPY ... TO STDOUT`, `pg_stats` (hidden) | - |
| writes into another tenant (AC 2 names 5; Prisma + PG add more) | plan AC 2; Prisma write API; PostgreSQL referential actions | create -> C2; updateMany scalar -> C2; organization.connect -> C2; upsert create B -> C2; nested children.create -> C2. Blocked adversarially but not in any test: `createMany`/`createManyAndReturn` B -> `P2039`; `organization(B).update examples.create` -> `P2039`; raw `INSERT` B -> `P2010/42501`; W3m upsert -> `P2039` | `update` of the scalar (named in AC 2; adversarially `P2039`, no test); **`Organization` delete/update-id cascade writes B's rows - NOT blocked (gap 1)** |
| references to another tenant's row (AC 3: connect/set/connectOrCreate from Example or Organization) | plan AC 3; Prisma relation API | parent.connect, children.connect, children.set, children.connectOrCreate, org examples.connect -> C3 | org `examples.set` and org `examples.connectOrCreate` (named by AC 3 "a partir de ... Organization"; adversarially `P2014` and "creates in A, B unchanged", no test) |
| operations outside `withTenant` (3) | plan AC 4; PostgreSQL (`current_setting` without `missing_ok`) | findMany, count, create -> C4 (`:188-192`). Adversarial: `deleteMany`, `updateMany`, `findUnique`, `update`/`delete` by id, raw select, batch `$transaction([])`, each on empty and non-empty tables -> error (`42704` or `22P02`), never an empty result | - |
| scalar FK link (2) | plan AC 6 | same tenant -> C6 `:211`; other tenant `P2003` -> C6 `:218` | - |
| startup config: DB role per assembly (6 assemblies) | `src/server.ts`, `src/dependencies.ts`, `test/app.ts`/`test/setup-db.ts`, `scripts/export-openapi.ts`, `prisma.config.ts`, pg-boss in `queue.ts` | server: `server.ts:34` `await deps.db.assertRowSecurityApplies()` before `listen` -> C7. dependencies: `dependencies.ts:18` `createDatabase(config.DATABASE_URL)` and `:13`,`:19-23` pg-boss on the same `connectionString` -> C8 `:249`, `:256`. Test harness: `setup-db.ts:21` app URL defaults to `bens_app`, and the owner (`:16`) only migrates/grants/drops -> C8 `:249`. pg-boss: `queue.ts:33` `new PgBoss({ connectionString })` from `DATABASE_URL` -> C8 `:256`. Prisma CLI: `prisma.config.ts:12` `process.env.MIGRATION_DATABASE_URL` -> C8 `:260`. export-openapi: `scripts/export-openapi.ts:11` placeholder URL, `app.ready()` without `queue.start()` or any query, so it never connects (n/a) | - |
| transaction and pool (2) | plan AC 10; PostgreSQL `set_config(..., true)` | commit -> C10; rollback -> C10 (killed F2) | - |
| `enqueue` in tenant tx (2) | plan AC 9 | commit C9 `:61`; rollback C9 `:54` | - |
| tenant-table protection clauses (3) | plan door 2 / AC 11; checker SQL `test/schema.spec.ts:17-20` | policy -> C11, C12. FORCE -> C11 on the real table (killed F1) | FORCE and ENABLE in the checker: no synthetic table isolates either clause (F5 survived) |
| schema invariants (3) | plan AC 11-13 | RLS C11; unique with tenant C13; composite FK C14 | - |
| boot decision table (3 rows) | `database.ts:49` `!role or role.superuser or role.bypassRls` | superuser (also bypass) -> C7; neither -> C8 `:250` | `BYPASSRLS`-only role (and missing role) - no case |
| plan doors (6) | plan Landing | 1 role -> C7, C8; 2 policy -> C11; 3 per-tx tenant -> C10; 4 default -> C5; 5 unique -> C13; 6 pg-boss role -> C8, C9 | - |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary - `tenant_isolation` policies | `prisma/migrations/20260921215300_tenant_rls/migration.sql` | boundary C16 (HTTP 500) · own layer C1-C6 against real PostgreSQL; presence C11 | yes - `USING` (C1), `WITH CHECK` (C2), no tenant (C4) each asserted |
| Decides, reached across a boundary - boot role check | `src/server.ts:34-45`, `src/infrastructure/database.ts:44-52` | boundary C7 (process exit) · own layer: one case per row of `superuser`/`bypassRls` | no - only the boundary proof exists (checks.md Evidence says "provada no boundary do processo por C7"); the `BYPASSRLS`-only row has no case |
| Instrumentation, pass-throughs | `src/infrastructure/database.ts:33-41` (`withTenant`) | none of its own; consumers C1-C6, C9, C10 | yes - consumers cover it; F2 (session-level `set_config`) killed by C4 and C10 |

Swept `existing` row re-read: "observability: existing - `shared/errors.ts` loga `unhandled error`
com `requestId`". It holds: `src/shared/errors.ts:53` `request.log.error({ err: error }, 'unhandled error')`,
and `:56` sends `{ requestId: request.id }`.

### Adversarial pass (real DB, `bens_app`, throwaway schemas `verify_adv`/`verify_adv2`, dropped afterwards)

| Attempt | Observed | Judged against the plan |
| --- | --- | --- |
| `tx.organization.delete({ where: { id: B } })` in `withTenant(A)`; also `DELETE FROM "Organization" WHERE id = B` outside | B's `Example` rows 2 -> 0 (cascade runs as the owner, RLS not forced) | **breach** - gap 1, not covered by Out of scope |
| `tx.organization.update({ where: { id: B }, data: { id: <new> } })` | B's rows moved to the new id; B sees 0 | **breach** - gap 1 |
| `SET app.tenant_id = B` (session) via `tx.$executeRawUnsafe` in `withTenant(A)`, then 12 `db.example.count()` outside | all 12 returned B's count (`ok:2`) - the pooled connection carries B | not addressed by plan or ADR: door 3 rejects session `SET` for `withTenant` only. Nothing forbids application SQL touching `app.tenant_id`, and nothing resets it on checkout. Trust question; recommend an architecture test forbidding `app.tenant_id` outside `database.ts` |
| `tx.$executeRaw\`SELECT set_config('app.tenant_id', B, true)\`` or `SET LOCAL` in `withTenant(A)` | reads B's rows for the rest of that transaction | same trust question; transaction-local, no pool carry-over; not addressed by plan/ADR |
| `RESET app.tenant_id` inside the tx | next query errors (`22P02`) | fail-closed |
| `SET ROLE bens` | `permission denied to set role "bens"` (no role memberships) | closed |
| `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` / `DROP POLICY` / `TRUNCATE` / `CREATE TABLE public.x` | `must be owner` / `permission denied` | closed. `bens_app` can `CREATE SCHEMA` (needed by pg-boss, door 6) |
| nested `db.$transaction` inside `withTenant(A)` | different connection, no tenant -> `42704` | fail-closed |
| nested `db.withTenant(B)` inside `withTenant(A)` | each sees only its own tenant | isolated |
| create/upsert/raw `ON CONFLICT DO NOTHING` with the id of a B row | `P2002 Example_pkey` / `42501 (USING expression)` / 0 rows vs 1 | existence oracle for a known UUID; door 5 as amended accepts it ("id nunca vem do input"), which is unenforced; ADR item 6 wording contradicts (Binding sources) |
| unique `(organizationId, name)` with B's name | inserted in A | no oracle |
| composite FK `parentId` -> B id | `P2003` (same as a non-existent id) | no oracle |
| `ON UPDATE CASCADE` on the composite FK: update a B row's `id` as B | only B's own child followed | cannot cross tenants (children share `organizationId`) |
| `pgboss.job` read in a tenant tx | readable by `bens_app` (owner) for all tenants | door 6 accepted; jobs are not tenant-scoped tables; payload hygiene is a jobs rule |
| `Organization` rows of B readable/renamable from A | yes | Out of scope ("RLS em `Organization`") |
| `pg_class.reltuples` | total row estimate across tenants visible | metadata only; not addressed; minor |

## Faults injected

Worktree `scratchpad/wt` at `a51de9b` with `pnpm install --frozen-lockfile`. The real tree's
`git status --porcelain` was empty before and still empty after `git worktree remove --force`
(checked with `diff`).

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 - delete `ALTER TABLE "Example" FORCE ROW LEVEL SECURITY;` | `prisma/migrations/20260921215300_tenant_rls/migration.sql:7` | yes - C11 `expected [ 'Example' ] to deeply equal []` |
| F2 - `set_config('app.tenant_id', …, true)` -> `false` (session-level) | `src/infrastructure/database.ts:38` | yes - C10 `promise resolved "10" instead of rejecting`; C4 also |
| F3 - remove `await deps.db.assertRowSecurityApplies()` | `src/server.ts:34` | yes - C7 `expected Error ... to match object { code, stderr }` |
| F4 - harness app URL -> `ownerDatabaseUrl()` | `test/setup-db.ts:21` | yes - C8 `expected { name: 'bens', superuser: true, … } to deeply equal { name: 'bens_app', … }`; C1-C4, C10 also |
| F5 - checker drops `c.relforcerowsecurity AND` | `test/schema.spec.ts:17` | no - survived: 5/5 schema proofs green (C12 synthetic tables lack the policy) |

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` at `a51de9b`: exit 0. Biome checked 64 files with
no fixes; tsc passed for server and web; vitest ran 15 files, **74 passed, 0 failed**; server tsc build and web vite build passed.

## Ranked gaps

1. `Organization` cascade (`ON DELETE CASCADE`/`ON UPDATE CASCADE` + `bens_app` DML on `Organization`) deletes or moves another tenant's `Example` rows from inside `withTenant(A)` or outside it. No check covers it - `prisma/migrations/20260921170202_init/migration.sql` (FK `Example_organizationId_fkey`), `docker/postgres/init/01-app-role.sql` (grants)
2. Surviving mutant F5: the checker's FORCE (and ENABLE) clause is not discriminated. C12 - `test/schema.spec.ts:72-85`
3. Test policy row unmet: boot check lacks an own-layer case for a `BYPASSRLS`-only role - `src/infrastructure/database.ts:49`
4. Coverage members named by the plan without proof: AC 2 `update` scalar; AC 3 `set`/`connectOrCreate` from `Organization` - C2, C3
5. ADR-004 item 6 / architecture §7.5 "todo índice único" vs the mid-build PK exclusion in C13 and door 5. The oracle exists for known ids, and the premise "id never from input" is not enforced. Needs ratification
6. Not a check failure, report only: a session-level `SET app.tenant_id` issued by application SQL poisons the pooled connection for later out-of-`withTenant` queries. Plan and ADR are silent; they rely on application code not writing `app.tenant_id`
7. Not a check failure, report only: plan AC 2, AC 3 and door 5 were edited in `a51de9b` after approval. The Handoff lists C2/C3/C13/door 1, but not the plan AC edits

# Tenant RLS verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 50b19a0..f642446
**Round**: 3 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 3 scope: the fix diff `562e200..f642446`, plus every verdict from round 2 that was not PASS.
The fix diff has two commits. `f7fb0ff` is the round 2 report. `f642446` changes `database.spec.ts`,
`schema.spec.ts`, `checks.md`, `plan.md` (AC 3 and a new Assumptions row) and ADR-004 (a new
Trade-offs line). No production code changed in round 3: no migration, no `src/**/*.ts` outside
specs, and no `schema.prisma`.

All 21 named proofs exist. All of them ran individually at `f642446` in one batched invocation, and
all of them passed. Each check has a located assertion. The gate is green: 79 passed.

The round 2 findings, one by one:

1. **C18 / AC 16: closed.** The synthetic schema now has one FK for each of the 6 forbidden actions,
   plus the `RESTRICT` and `NO ACTION` controls. The assertion at `test/schema.spec.ts:150-157` lists
   all six by name. The surviving round 2 mutant F2 (the allowlist rewritten as the denylist
   `IN ('c','n')`) is now killed. So is each mutant that drops just one of the three members round 2
   found untested.
2. **C2/C3 text drift and the too-wide accepted codes: closed.** C2's text now names 6 writes, the
   same 6 the test runs. The `P2014`-for-everything list is gone. C3 now asserts one exact code per
   shape through the `expected` table (`database.spec.ts:191-205`). A key-set equality at `:200`
   stops an unlisted shape from falling through as "absorbed". Plan AC 3 now lists `P2025`, `P2018`
   and `P2014` "conforme o formato", which matches the table exactly. A fault that moved
   `parent.connect` to `P2003` is now killed. `P2003` was one of the codes round 2 accepted.
3. **C20 vacuous on the real tree: disclosed, not changed.** The claim text now says only the
   synthetic case exercises the checker while no module exports `*Input`. The claim is now accurate,
   so it passes as written. The underlying precision gap is still there (report-only, below).
4. **Session tenant poisoning: recorded as an accepted risk** in the plan's Assumptions (`Confirmed?
   n`) and in ADR-004 Trade-offs. My judgment is below.

### Is the accepted risk consistent with the plan's criteria?

**It contradicts no enumerated criterion.** AC 17 asks for a *textual* test ("IF algum arquivo ...
cita `app.tenant_id` THEN o teste de arquitetura SHALL falhar"), and C19 meets it. AC 4 and AC 10
describe the database's behaviour when only `withTenant` sets the tenant. C4 and C10 prove that. No
criterion claims a runtime defence against application code that sets the tenant itself. ADR-004
item 7 ("Só `infrastructure/database.ts` toca em `app.tenant_id`") is the rule, and the new
Trade-offs line admits that only the literal is enforced. So the binding source and the plan agree.

Three caveats, all report-only. None of them changes a row:

- **The recorded risk is narrower than what I observed.** The Assumptions row and the ADR line
  describe *session* contamination of the pool ("contamina a conexão do pool"). On the real DB,
  inside an open `withTenant(A)`, a second `set_config('app.tenant_id', B, true)` switched the tenant
  for the rest of that transaction. The read that followed returned B's 2 rows (adversarial item 9).
  So a dynamically built key breaks the S1 story sentence ("Dentro de `withTenant(A)`, nenhuma query
  vê ... linha de B, qualquer que seja a forma") *within* the transaction, not only for the pool.
  The generic Assumptions wording ("um `SET app.tenant_id` montado com string dinâmica") covers this,
  but the ADR line understates it.
- **It narrows two story sentences** that the criteria never turned into runtime checks: S1's
  "qualquer que seja a forma" and S4's "nada troca o tenant da sessão".
- **The user has not confirmed it (`Confirmed? n`).** Accepting a residual cross-tenant risk is a
  product/security decision. Under `CLAUDE.md` that is the user's call, not the author's. The user
  should ratify the row, or ask for the reset-on-checkout.

Other report-only items:

- **C20 still rests on a naming suffix.** The only input schema in the tree is
  `commissionPreviewQuery` (`src/modules/examples/example.schema.ts:3`), so the real-tree half checks
  zero members. A future `createXBody` or `createXQuery` with `id` would not be caught, and neither
  would a union, a `.transform` or a `z.looseObject`. This matches AC 18 as approved.
- **C3's parenthetical is explanation, not assertion.** "o `set` fica sem filhos, o
  `connectOrCreate` cria uma linha nova em A" is not asserted directly. The test asserts "concluem
  sem erro" (`:204`), B identical (`:208`), every A row in A (`:209`) and A's existing rows unchanged
  (`:213`). Unlike C2 (`:136`), it does not assert how many rows `connectOrCreate` adds.
- **Existence oracle through `RESTRICT`.** This is carried from round 2 and still out of scope. On
  the real DB, deleting Org B or changing its id returns `Key (id)=(B) is referenced from table
  "Example"`. That reveals that B has data. `Organization` has no RLS until Phase 4. The error reaches
  HTTP as a generic 500.

## Binding sources

ADR-004 was touched by `f642446`, so it is verified at `f642446`. `docs/architecture.md` and
`CLAUDE.md` are untouched in `562e200..f642446` (`git diff --stat`), so they are carried from
`562e200`.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-004-tenant-isolation.md` - verified at `f642446` (read in full; only change is the new Trade-offs line) | yes | none | - |
| `docs/architecture.md` §7 item 5 - carried from `562e200` | yes (round 2) | none | - |
| `docs/architecture.md` §5 "Jobs" - carried from `a51de9b` | yes (round 1) | none | - |
| `CLAUDE.md` "Tenant" rules - carried from `562e200` (file untouched, re-read this round) | yes | none | - |

Notes on ADR-004 at `f642446`:

- Item 7 ("Só `infrastructure/database.ts` toca em `app.tenant_id`") and item 8 ("FK com cascade para
  tabela sem RLS") match C18 and C19.
- The new Trade-offs line matches the plan's Assumptions row. It understates the in-transaction
  effect, as described above.

## Checks

Proof command, one invocation at `f642446`:
`cd apps/server && pnpm exec vitest run src/infrastructure/database.spec.ts src/infrastructure/queue.spec.ts src/app.spec.ts test/schema.spec.ts test/architecture.spec.ts test/boot.spec.ts --reporter=verbose`.
Result: 6 files, **42 passed**, exit 0. Every named test is listed individually with `✓`.

Citations in `database.spec.ts` and `schema.spec.ts` were refreshed at `f642446`, because the fix
touched both files:

- `database.spec.ts`: lines after `:186` moved by +3.
- `schema.spec.ts`: lines after `:139` moved by +11.

`queue.spec.ts`, `app.spec.ts`, `boot.spec.ts` and `architecture.spec.ts` are untouched in
`562e200..f642446`, so their lines are carried.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | 8 read shapes in A return only A | `✓ database.spec.ts > row level security > reads only the tenant rows in every read shape` (rg `src/infrastructure/database.spec.ts:48`) - verified at `f642446` | `src/infrastructure/database.spec.ts:68` - `expect(reads.findMany.map((row) => row.organizationId)).not.toContain(tenantB.organizationId)`; `:70` `toBeNull()`; `:71-72` `toBe(0)`; `:73` groupBy `toEqual([tenantA.organizationId])`; `:77` `_count.examples` `toBe(0)`; `:78` raw `not.toContain(rowB.id)` | PASS |
| C2 (text changed round 3) | 6 writes into B: create, update scalar, updateMany scalar, organization.connect, upsert create -> `P2039`; children.create lands in A; B identical; every A row in A | `✓ ... rejects every write into another tenant` (rg `:82`; members `:88`, `:92`, `:96`, `:100`, `:107`, `:115`) - verified at `f642446` | `src/infrastructure/database.spec.ts:129` - `else expect(prismaCode(error), write).toBe('P2039')`; `:128` `if (landsInA.has(write)) expect(error, write).toBeUndefined()` with `landsInA = new Set(['children.create'])` (`:125`); `:132` `expect(afterB).toEqual(before[1])`; `:133` `afterA.every(... === tenantA.organizationId)` `toBe(true)`. The text now matches the test's 6 members one-to-one | PASS |
| C3 (text changed round 3) | 7 references to B, one exact outcome each: parent.connect `P2025`; children.connect `P2018`; org examples.connect `P2018`; org examples.set `P2014`; children.set, children.connectOrCreate, org examples.connectOrCreate -> no error; B identical; A's existing rows unchanged; all A rows in A | `✓ ... cannot link or move another tenant's row` (rg `:139`; members `:145`, `:149`, `:153`, `:157`, `:164`, `:171`, `:180`) - verified at `f642446` | `src/infrastructure/database.spec.ts:205` - `else expect(prismaCode(error), reference).toBe(code)`, with the table at `:191-198` (`'parent.connect': 'P2025'`, `'children.connect': 'P2018'`, `'organization examples.set': 'P2014'`, `'organization examples.connect': 'P2018'`, three `undefined`); `:204` `if (code === undefined) expect(error, reference).toBeUndefined()`; `:200` `expect(Object.keys(references).sort()).toEqual(Object.keys(expected).sort())`; `:208` `expect(afterB).toEqual(before[1])`; `:213` existing A rows `toEqual(before[0])` | PASS |
| C4 | findMany/count/create outside `withTenant` fail; count unchanged | `✓ ... fails outside withTenant` (rg `:216`) - verified at `f642446` | `src/infrastructure/database.spec.ts:220` - `await expect(deps.db.example.findMany()).rejects.toThrow()` (`:221` count, `:222` create); `:226` `expect(await snapshot(tenantA)).toEqual(before)` | PASS |
| C5 | `create` without `organizationId` gets A | `✓ ... fills organizationId from the tenant` (rg `:229`) - verified at `f642446` | `src/infrastructure/database.spec.ts:232` - `expect(created.organizationId).toBe(tenantA.organizationId)` | PASS |
| C6 | scalar `parentId` within A links; B -> `P2003`, unchanged | `✓ ... links rows only within the tenant` (rg `:235`) - verified at `f642446` | `src/infrastructure/database.spec.ts:243` - `expect(linked.parentId).toBe(parentA.id)`; `:250` `expect(prismaCode(error)).toBe('P2003')`; `:254` `expect(reloaded?.parentId).toBe(parentA.id)` | PASS |
| C7 | boot as superuser exits 1 naming the role | `✓ boot.spec.ts > server boot > refuses to boot with a role that bypasses row security` (rg `test/boot.spec.ts:23`) - proof re-run at `f642446`, citation carried from `562e200` (file untouched) | `test/boot.spec.ts:41-44` - `await expect(boot).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Database role "bens" bypasses row level security') })` | PASS |
| C8 | client is `bens_app`; pg-boss schema owned by `bens_app`; prisma.config reads `MIGRATION_DATABASE_URL` | `✓ ... connects as the application role` (rg `:276`) - verified at `f642446` | `src/infrastructure/database.spec.ts:281` - `expect(role).toEqual({ name: 'bens_app', superuser: false, bypassRls: false })`; `:288` `expect(schema?.owner).toBe('bens_app')`; `:292` `expect(prismaConfig).toContain('process.env.MIGRATION_DATABASE_URL')` | PASS |
| C9 | enqueue in `withTenant`: rollback -> no job; commit -> processed | `✓ queue.spec.ts > queue > enqueues inside a tenant transaction` (rg `src/infrastructure/queue.spec.ts:37`) - proof re-run at `f642446`, citation carried from `562e200` | `src/infrastructure/queue.spec.ts:54` - `expect(await jobsIn(name)).toEqual([])`; `:61` `expect(processed).toEqual([2])` | PASS |
| C10 | after 5 commit + 5 rollback, 10 outside queries fail; B sees only B | `✓ ... does not leak the tenant to the next transaction` (rg `:257`) - verified at `f642446` | `src/infrastructure/database.spec.ts:269` - ``await expect(deps.db.example.count(), `outside #${i}`).rejects.toThrow()``; `:273` `expect(asB.every((row) => row.organizationId === tenantB.organizationId)).toBe(true)` | PASS |
| C11 | every `organizationId` table has ENABLE + FORCE + `tenant_isolation` | `✓ schema.spec.ts > tenant tables > every tenant table is protected by row security` (rg `test/schema.spec.ts:85`) - verified at `f642446` | `test/schema.spec.ts:90` - `expect(unprotected).toEqual([])` | PASS |
| C12 | checker flags a synthetic tenant table without RLS, one case per clause | `✓ ... flags a tenant table without row security` (rg `:93`) - verified at `f642446` | `test/schema.spec.ts:122` - `expect(tables).toEqual(['NoEnable', 'NoForce', 'NoPolicy', 'Open'])` (control `Protected` stays out) | PASS |
| C13 | unique indexes include `organizationId` (PK excluded); synthetic flagged | `✓ ... every unique index of a tenant table includes organizationId` (rg `:160`) - verified at `f642446` | `test/schema.spec.ts:175` - `expect(real).toEqual([])`; `:176` `expect(synthetic).toEqual(['Client_email_key'])` | PASS |
| C14 | composite-FK test passes on the real schema and flags `Item.product` | `✓ ... every relation between tenant-scoped models uses a composite foreign key` (rg `:228`), `✓ ... flags a relation between tenant-scoped models without organizationId` (rg `:239`) - verified at `f642446` | `test/schema.spec.ts:236` - `expect(findSimpleTenantRelations(schema)).toEqual([])`; `:265` `.toEqual(['Item.product'])` | PASS |
| C15 | no syntactic guard names in `src` | `✓ architecture.spec.ts > tenant isolation > has no syntactic tenant guard` (rg `test/architecture.spec.ts:83`) - proof re-run at `f642446`, citation carried from `562e200` | `test/architecture.spec.ts:91` - `expect(leftovers).toEqual([])` | PASS |
| C16 | isolation violation -> `500 INTERNAL_ERROR` with `requestId` | `✓ app.spec.ts > error handler > surfaces a row security violation as a generic 500` (rg `src/app.spec.ts:134`) - proof re-run at `f642446`, citation carried from `562e200` | `src/app.spec.ts:137` - `expect(res.statusCode).toBe(500)`; `:138` `toEqual({ error: { code: 'INTERNAL_ERROR', ..., details: { requestId: res.headers['x-request-id'] } } })` | PASS |
| C17 | `organization.delete`/id change of B, inside and outside `withTenant`, -> `P2003`; B identical | `✓ ... does not reach tenant rows through Organization` (rg `:295`; attempts `:299`, `:303`, `:310`, `:312`) - verified at `f642446` | `src/infrastructure/database.spec.ts:320` - `expect(prismaCode(await errorOf(run)), attempt).toBe('P2003')`; `:322` `expect(await snapshot(tenantB)).toEqual(before)` | PASS |
| C18 (text changed round 3) | no FK from a tenant table to an unguarded table uses CASCADE/SET NULL/SET DEFAULT; checker flags one synthetic FK per forbidden action (6) and neither `RESTRICT` nor `NO ACTION` | `✓ schema.spec.ts > tenant tables > foreign keys to unguarded tables never cascade` (rg `test/schema.spec.ts:125`; synthetic FKs `:137-145`) - verified at `f642446` | `test/schema.spec.ts:149` - `expect(real).toEqual([])`; `:150-157` `expect(synthetic).toEqual(['DeleteCascade_fkey', 'SetDefault_fkey', 'SetNull_fkey', 'UpdateCascade_fkey', 'UpdateSetDefault_fkey', 'UpdateSetNull_fkey'])`. `Restricted` and `NoAction` (`:144-145`) are absent from the list, so the exact `toEqual` also proves the controls stay out | PASS |
| C19 | no `src` file outside `infrastructure/database.ts` cites `app.tenant_id`; checker flags a synthetic file | `✓ architecture.spec.ts > tenant settings and ids > only the database module sets the tenant` (rg `test/architecture.spec.ts:116`) - proof re-run at `f642446`, citation carried from `562e200` | `test/architecture.spec.ts:117` - `expect(filesCitingTenantSetting(readSourceTree(srcRoot))).toEqual([])`; `:118-123` `.toEqual(['modules/x/x.repository.ts'])`. The check is literal text only; the accepted risk is judged above | PASS |
| C20 (text changed round 3) | no exported `*Input` in `modules/**/*.schema.ts` accepts `id`; synthetic flagged; only the synthetic case exercises the checker while no module exports `*Input` | `✓ ... input schemas never accept an id` (rg `test/architecture.spec.ts:126`) - verified at `f642446` (claim re-read; file untouched) | `test/architecture.spec.ts:138-145` - `inputsAcceptingId({ createClientInput: z.object({ id: z.uuid(), ... }), updateClientInput, idParams }))` `.toEqual(['createClientInput'])`; `:137` `expect(offenders).toEqual([])`; `:136` `expect(schemaFiles.length).toBeGreaterThan(0)`. `rg -n "Input" src/modules --glob '*.schema.ts'` finds no match, only `commissionPreviewQuery` (`example.schema.ts:3`), so the claim's disclosure is accurate | PASS |
| C21 | `assertRowSecurityApplies` throws for a `BYPASSRLS`-only role and for `bens`; resolves for `bens_app` | `✓ ... refuses every role that bypasses row security` (rg `:325`) - verified at `f642446` | `src/infrastructure/database.spec.ts:337` - `await expect(bypass.assertRowSecurityApplies()).rejects.toThrow(RowSecurityBypassError)`; `:338` owner `.rejects.toThrow(RowSecurityBypassError)`; `:339` `await expect(deps.db.assertRowSecurityApplies()).resolves.toBeUndefined()`. After the runs, `pg_roles` (non-`pg_`) holds only `bens`, `bens_app` | PASS |

The fix's new surfaces are the C3 `expected` table and the three new C18 synthetic FKs. Both live in
files that `f642446` touched, and the proofs that exercise them ran at `f642446`.

## Coverage

These rows were recomputed at `f642446`: the rows round 3 touched (the FK actions, the references,
the writes, the invariants and the doors) and the `Organization` row (regression re-run). The other
rows are carried and say where from.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| read shapes (8) - carried from `a51de9b` | plan AC 1; Prisma read API | C1, all 8 (`database.spec.ts:68-79`) | - |
| writes into another tenant (6 named by AC 2) - verified at `f642446` | plan AC 2 | create `:88`, update scalar `:92`, updateMany scalar `:96`, organization.connect `:100`, upsert create `:107` -> `P2039` `:129`; children.create `:115` -> lands in A `:128`, `:133`; B identical `:132`. C2's text now names the same 6 | - |
| writes that reach tenant rows through `Organization` (2 ops x 2 contexts) - verified at `f642446` | plan AC 15; `Example_organizationId_fkey` in dev `public` is `ON UPDATE RESTRICT ON DELETE RESTRICT` (`\d "Example"`) | C17 attempts `:299`, `:303`, `:310`, `:312` -> `P2003` `:320`; B identical `:322`. Adversarial as `bens_app` on the real DB (items 1-4 below): all four refused with `violates RESTRICT setting of foreign key constraint "Example_organizationId_fkey"`; B's 2 rows identical afterwards | - |
| references to another tenant's row (7 named by AC 3) - verified at `f642446` | plan AC 3 (codes `P2025`, `P2018`, `P2014` "conforme o formato") | parent.connect `:145` -> `P2025`; children.connect `:149` -> `P2018`; org examples.connect `:180` -> `P2018`; org examples.set `:164` -> `P2014` (all exact, `:205`); children.set `:153`, children.connectOrCreate `:157`, org examples.connectOrCreate `:171` -> no error `:204`; the key-set equality `:200` ties the 7 members to the 7 outcomes; B identical `:208`; existing A rows `:213`. Each code in AC 3 is asserted at least once, and no member accepts a code outside AC 3 | - |
| operations outside `withTenant` (3) - carried from `a51de9b` | plan AC 4 | C4 `:220-222`. Regression this round (item 6, 8): raw read and three raw writes outside -> `unrecognized configuration parameter "app.tenant_id"` | - |
| scalar FK link (2) - carried from `a51de9b` | plan AC 6 | C6 `:243`, `:250` | - |
| startup config: DB role per assembly (6) - carried from `a51de9b` | `server.ts`, `dependencies.ts`, test harness, pg-boss, Prisma CLI, export-openapi | as round 1 (no assembly file changed in `562e200..f642446`) | - |
| transaction and pool (2) - carried from `a51de9b` | plan AC 10 | C10 `:269`, `:273` | - |
| `enqueue` in tenant tx (2) - carried from `a51de9b` | plan AC 9 | C9 `queue.spec.ts:54`, `:61` | - |
| tenant-table protection clauses (3) - carried from `562e200` | checker SQL `test/schema.spec.ts:10-24` (unchanged) | ENABLE `NoEnable`, FORCE `NoForce`, policy `NoPolicy`, all `Open`, control `Protected` (C12 `:122`); real C11 `:90` | - |
| FK actions from a tenant table to an unguarded table (AC 16: 3 actions x 2 events = 6) - verified at `f642446` | plan AC 16; PostgreSQL `pg_constraint.confdeltype`/`confupdtype` (`a` no action, `r` restrict, `c` cascade, `n` set null, `d` set default) | ON DELETE CASCADE -> `DeleteCascade_fkey` (`:137`); ON UPDATE CASCADE -> `UpdateCascade_fkey` (`:138`); ON DELETE SET NULL -> `SetNull_fkey` (`:139`); ON DELETE SET DEFAULT -> `SetDefault_fkey` (`:141`); ON UPDATE SET NULL -> `UpdateSetNull_fkey` (`:142`); ON UPDATE SET DEFAULT -> `UpdateSetDefault_fkey` (`:143`); all six asserted at `:150-157`; controls `Restricted` (`:144`) and `NoAction` (`:145`) stay out. Faults F1-F4 below each made this proof fail | - |
| boot decision table (3 rows) - carried from `562e200` | `database.ts` `!role or role.superuser or role.bypassRls` (unchanged) | superuser C7, C21 `:338`; `BYPASSRLS`-only C21 `:337`; neither C21 `:339`, C8 `:282` | - |
| schema and code invariants (6) - verified at `f642446` | plan AC 11-13, 16-18 | RLS C11; unique C13; composite FK C14; FK without cascade C18 (all 6 actions); tenant only in `database.ts` C19 (literal); no `id` in `*Input` C20 (synthetic only, disclosed in the claim) | - |
| plan doors (7) - verified at `f642446` | plan Landing | 7 FK to unguarded -> C17, C18; 1 role -> C7, C8, C21; 2 policy -> C11; 3 per-tx tenant -> C10; 4 default -> C5; 5 unique + PK exception -> C13, C20; 6 pg-boss role -> C8, C9 | - |

Sets swept for a missing row: plan AC 3 names three codes, and each one is asserted. Plan AC 2 names
6 shapes, and C2 runs 6. AC 16 names 3 x 2 actions, and C18 runs 6. The new Assumptions row names
no set.

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary - `tenant_isolation` policies - carried from `a51de9b` | `prisma/migrations/20260921215300_tenant_rls/migration.sql` | boundary C16 (HTTP 500) · own layer C1-C6 against real PostgreSQL; presence C11 | yes - `USING` (C1), `WITH CHECK` (C2), missing tenant (C4) each asserted; C3 now asserts one exact code per reference shape |
| Decides, reached across a boundary - FK action `RESTRICT` - verified at `f642446` (C18 touched) | `prisma/migrations/20260921221115_organization_fk_restrict/migration.sql`, `prisma/schema.prisma` | own layer C17 against real PostgreSQL (4 attempts); presence C18 over all 6 forbidden actions; boundary through the `shared/errors.ts` path C16 proves | yes - C17 asserts `P2003` per attempt and B identical; C18 asserts each forbidden action by name; F1-F4 killed |
| Decides, reached across a boundary - boot role check - carried from `562e200` | `src/server.ts`, `src/infrastructure/database.ts` (`assertRowSecurityApplies`) | boundary C7 · own layer one case per role row | yes - C21 `:337`, `:338`, `:339` |
| Instrumentation, pass-throughs - carried from `a51de9b` | `src/infrastructure/database.ts` (`withTenant`) | none of its own; consumers C1-C6, C9, C10 | yes - consumers cover it |

Swept `existing` row, re-read at `f642446`: "observability: existing - `shared/errors.ts` loga
`unhandled error` com `requestId`". It holds.

- `src/shared/errors.ts:53` has `request.log.error({ err: error }, 'unhandled error')`.
- `:56` sends `{ requestId: request.id }`.

The other Swept rows are `n/a` (policy), or they point at checks.

### Adversarial pass, round 3 (real DB `bens`, `docker exec psql -U bens_app`, each attack a fresh session)

The fixture was Organizations `verify-r3-a` (1 row) and `verify-r3-b` (2 rows). Every mutating
attack ran in a transaction that was rolled back, or failed. The fixture was deleted afterwards:
`count(*) ... LIKE 'verify-r3-%'` = `0`.

| Attempt | Observed | Judged against the plan |
| --- | --- | --- |
| 1-2: delete Org B / change its id, inside `withTenant(A)` | `violates RESTRICT setting of foreign key constraint "Example_organizationId_fkey"` (both) | closed (AC 15) |
| 3-4: delete Org B / change its id, outside `withTenant` | same `RESTRICT` error (both) | closed (AC 15) |
| 5: cross-tenant read in A: `count(*) WHERE "organizationId" = B`, B row by id, all names | `0`, `0`, `a1` only | closed (AC 1) |
| 6: cross-tenant read outside | `unrecognized configuration parameter "app.tenant_id"` | closed (AC 4) |
| 7: cross-tenant writes in A: insert with B's id, move own row to B, update and delete B rows by id | `new row violates row-level security policy` (twice); the update and delete touched 0 rows (B snapshot identical) | closed (AC 2, AC 3) |
| 8: cross-tenant writes outside: insert into B, update B row, delete B's rows | `unrecognized configuration parameter "app.tenant_id"` (all three) | closed (AC 4) |
| 9: inside `withTenant(A)`, a second `set_config('app.tenant_id', B, true)`, then `count(*)` | `2` (B's rows) | the accepted risk; the behaviour is broader than the ADR line describes (report-only, above) |
| B snapshot before vs after | `b1`, `b2`, both `organizationId` = B, `parentId` null - identical | - |

## Faults injected

I used a worktree at `f642446`:
`/tmp/claude-1000/-home-ixcsoft-www-bens-seguros-v2/12e23510-489e-457e-90f3-4b2ae8887175/scratchpad/wt-r3`.

- **Setup:** `pnpm install --frozen-lockfile`, then `prisma generate`, then the root `.env` copied
  into the worktree.
- **Baseline:** `schema.spec.ts` and `database.spec.ts` ran green in the worktree, 16/16.
- **Discipline:** each fault was applied with `sed`, run with a `-t` filter for the narrowest proof,
  and reverted with `git -C <wt> checkout -- .`. I checked that the worktree was clean before the
  next fault.
- **Real tree:** its `git status --porcelain` was empty before. After `git worktree remove --force`
  and `git worktree prune` it was still empty (`diff` of the two files: identical). I never used
  `git stash`.
- **Database:** no `*_probe` or `verify*` schema remains, and the only non-`pg_` roles are `bens`
  and `bens_app`.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 - re-run of round 2 F2: allowlist `NOT IN ('r', 'a')` rewritten as denylist `IN ('c', 'n')` for both events | `test/schema.spec.ts:61` | yes - C18 `expected [ 'DeleteCascade_fkey', …(3) ] to deeply equal [ 'DeleteCascade_fkey', …(5) ]` (both SET DEFAULT FKs missing) |
| F2 - checker drops `ON DELETE SET DEFAULT` (`confdeltype NOT IN ('r', 'a', 'd')`) | `test/schema.spec.ts:61` | yes - C18 `expected [ 'DeleteCascade_fkey', …(4) ] to deeply equal [ …(6) ]` |
| F3 - checker drops `ON UPDATE SET NULL` (`confupdtype NOT IN ('r', 'a', 'n')`) | `test/schema.spec.ts:61` | yes - C18 `expected [ 'DeleteCascade_fkey', …(4) ] to deeply equal [ …(6) ]` |
| F4 - checker drops `ON UPDATE SET DEFAULT` (`confupdtype NOT IN ('r', 'a', 'd')`) | `test/schema.spec.ts:61` | yes - C18 `expected [ 'DeleteCascade_fkey', …(4) ] to deeply equal [ …(6) ]` |
| F5 - C3 expected code `'parent.connect': 'P2025'` -> `'P2003'` (a code the round 2 list accepted) | `src/infrastructure/database.spec.ts:192` | yes - C3 `parent.connect: expected 'P2025' to be 'P2003'` |

This is five faults, the cap. F2-F4 drop, one at a time, the three actions round 2 found untested.
I did not inject the other three single-action drops (`ON DELETE CASCADE`, `ON DELETE SET NULL`,
`ON UPDATE CASCADE`), because the cap was reached. Their synthetic FKs (`DeleteCascade`, `SetNull`,
`UpdateCascade`) and the round 2 faults already covered them. The exact `toEqual` over six names at
`:150-157` fails whenever any one name goes missing. F5 shows that the per-shape assertion is exact:
under round 2's accepted-code list this mutant would have passed.

C18 and C3 are the only proofs that round 3 touched. Every other proof is unchanged, and round 1 or
round 2 already made each of them fail once (carried from `562e200`).

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` at `f642446` (real tree): exit 0.

- **lint:** Biome checked 64 files and applied no fixes.
- **typecheck:** `tsc --noEmit` passed for server and web.
- **test:** vitest ran 15 files, **79 passed, 0 failed**.
- **build:** the server `tsc -p tsconfig.build.json` and the web `vite build` both passed.

The real tree's `git status --porcelain` was still empty afterwards.

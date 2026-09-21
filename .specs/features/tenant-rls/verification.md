# Tenant RLS verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 50b19a0..562e200
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 2 scope: the fix diff `a51de9b..562e200` (`d5e05d0` round 1 report, `b514955` plan/checks/ADR/
architecture/CLAUDE.md, `562e200` migration + schema + tests), plus every round 1 verdict that was not
PASS. All 21 named proofs exist and ran individually at `562e200`, and all of them pass. Each check has a
located assertion. The gate is green (79 passed).

Every round 1 gap is closed. The `Organization` cascade is now refused inside and outside `withTenant`.
The C12 mutant from round 1 is now killed. The boot check has an own-layer case for a `BYPASSRLS`-only
role. The plan-named members of AC 2 and AC 3 have proofs. The ADR and architecture now state the
primary-key exception, which the user ratified as criterion 18.

The verdict is still **FAIL** for one reason, which is in the new round 2 surface:

1. **Surviving mutant, and unproven members, in the FK-action checker (C18 / AC 16).** AC 16 names
   three actions (`CASCADE`, `SET NULL`, `SET DEFAULT`) for two events (`ON DELETE`, `ON UPDATE`).
   The C18 synthetic schema has only `DeleteCascade`, `UpdateCascade` and `SetNull` (delete). Three
   members have no case: `ON DELETE SET DEFAULT`, `ON UPDATE SET NULL` and `ON UPDATE SET DEFAULT`.
   The checker at HEAD is an allowlist (`NOT IN ('r', 'a')`), so it catches all six today. But when
   the checker was rewritten as a plausible denylist (`IN ('c', 'n')`), every schema proof stayed green
   (F2 survived). `SET DEFAULT` is the most dangerous of the six. I tested it in a throwaway schema,
   with the Example FK changed to `ON DELETE SET DEFAULT`, as `bens_app` inside `withTenant(A)`.
   `DELETE FROM "Organization" WHERE id = B` moved both of B's rows into A. The column default is
   `current_setting('app.tenant_id')`, and the action runs as the owner, so RLS does not apply. A
   regression of the checker to a denylist would let that FK through.

Report-only findings. They do not fail any row, but the user should know them:

- **Pool poisoning by a non-literal `app.tenant_id`.** Criterion 17 is a text search, as the plan
  wrote it ("cita `app.tenant_id`"). So C19 meets the plan as approved. It does not close the runtime
  risk from round 1. On the real DB, as `bens_app`, `SELECT set_config('app.' || 'tenant_id', B, false)`
  worked. So did `SET app.tenant_id = B`. After either one, a query outside `withTenant` on that pooled
  session read B's 2 rows. A string built at runtime, or a key passed in as a parameter, would not
  match `includes('app.tenant_id')`. Is that acceptable? Per the plan, yes: AC 17 asks for a textual
  guard against application code citing the setting, not a runtime defence. As a residual risk, it is
  a gap: nothing resets `app.tenant_id` when a connection is checked out, so deliberate or obfuscated
  code can still poison the pool. Code review is the only control. One option is a `RESET app.tenant_id`
  or `DISCARD ALL` on checkout, which would make this fail closed.
- **C20 is vacuous on the real tree.** No module exports a schema whose name ends in `Input`. The only
  input schema is `commissionPreviewQuery` (`src/modules/examples/example.schema.ts`), named `*Query`.
  So `offenders.toEqual([])` passes on zero members, and only the synthetic half discriminates (F4
  killed). The door 5 primary-key exception rests on a naming convention. A future `createXBody` or
  `createXQuery` with `id` would not be caught, and neither would a `z.looseObject`, a
  `.transform`/pipe, or a union. That matches AC 18 as the user approved it. It is a precision gap on
  the premise.
- **C2 and C3 claim text drift.** C2's text says "das 5 escritas" but the test has 6 (`update scalar`
  added). C3's text says "das 5 referências ... `P2025`, `P2018`, `P2003` ou `P2039`" but the test has
  7. The test also widened the accepted codes to include `P2014` for every failing member
  (`database.spec.ts:200`). So `parent.connect` would now pass on `P2014` too. Plan AC 3 still lists
  only four codes, and still says `set` "conclui". But `organization examples.set` fails with `P2014`.
  The Handoff in `checks.md` records the `P2014` decision. The security invariant (B identical, A's
  existing rows unchanged) is asserted independently at `:205` and `:210`.
- **Existence oracle from RESTRICT (Organization, out of scope).** A `DELETE` or id change of
  `Organization` B returns `P2003` when B has tenant rows, and succeeds when B has none. The PG detail
  says `Key (id)=(B) is referenced from table "Example"`. That reveals whether another tenant has data.
  It stays inside the plan's Out of scope ("RLS em `Organization`", Phase 4). The error reaches HTTP as
  a generic 500.

## Binding sources

Verified at `562e200` for ADR-004 and architecture §7 (both touched by `b514955`). Architecture §5 is
carried from `a51de9b` (not touched).

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-004-tenant-isolation.md` (items 6-8 revised in round 2) - verified at `562e200` | yes - read in full | none. Item 6 now says "exceto a chave primária ... nenhum schema de entrada (`*Input`) aceita `id`, e um teste garante isso", which matches C13, door 5 and C20. Item 7 (RESTRICT, and only `database.ts` touches `app.tenant_id`) matches C17-C19. Item 8 matches C11-C14 and C18-C20 | - (the missing `SET DEFAULT` proof for item 8's "FK com cascade" is listed under Coverage) |
| `docs/architecture.md` §7 item 5 - verified at `562e200` | yes | none. It now carries the PK exception and "FK para `Organization` é `RESTRICT`" | - |
| `docs/architecture.md` §5 "Jobs" - carried from `a51de9b` | yes (round 1) | none | - |
| `CLAUDE.md` "Tenant" rules - verified at `562e200` | yes | none. It now says `onDelete: Restrict, onUpdate: Restrict` and that "schema de entrada (`<x>Input`) nunca aceita `id`". The one existing input schema is named `*Query`, which the rule's suffix does not reach (report-only, above) | - |

Round 1 items re-judged:

- **ADR item 6 / C13 primary-key wording:** resolved. The ADR, architecture §7.5 and plan door 5 now
  state the exception and tie it to criterion 18, which the user approved (plan AC 18 says
  "aprovado pelo usuário").
- **Unlisted plan edits:** resolved. The `checks.md` Handoff now says "round 1 edits to plan AC 2,
  AC 3 and door 5 are the C2/C3/C13 corrections listed above". The round 2 plan edits
  (`git diff d5e05d0..b514955 -- plan.md`) are exactly S4 (AC 15-19), door 7 and the door 5
  parenthesis, and all of them are listed. Remaining drift: the `P2014` code is in the Handoff but not
  in plan AC 3 or in C3's text (report-only, above).

## Checks

Proof command (one invocation, verbose, at `562e200`):
`cd apps/server && pnpm exec vitest run src/infrastructure/database.spec.ts src/infrastructure/queue.spec.ts src/app.spec.ts test/schema.spec.ts test/architecture.spec.ts test/boot.spec.ts --reporter=verbose`.
Result: 6 files, **42 passed**, exit 0, and every named test is listed with `✓`. All citations below
were refreshed at `562e200`. `database.spec.ts`, `schema.spec.ts` and `architecture.spec.ts` changed
in the fix, so their lines moved. `queue.spec.ts`, `app.spec.ts` and `boot.spec.ts` did not change, and
their lines match round 1.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | 8 read shapes in A return only A | `✓ database.spec.ts > row level security > reads only the tenant rows in every read shape` (rg `src/infrastructure/database.spec.ts:48`) - verified at `562e200` | `src/infrastructure/database.spec.ts:68` - `expect(reads.findMany.map((row) => row.organizationId)).not.toContain(tenantB.organizationId)`; `:70` `expect(reads.findUnique).toBeNull()`; `:71-72` count/aggregate `toBe(0)`; `:73` groupBy `toEqual([tenantA.organizationId])`; `:77` `_count.examples` `toBe(0)`; `:78` raw `not.toContain(rowB.id)` | PASS |
| C2 | writes into B -> `P2039` (now 5 members, `update scalar` added); `children.create` lands in A; B unchanged | `✓ ... rejects every write into another tenant` (rg `:82`; members at `:88`, `:92`, `:96`, `:100`, `:107`, `:115`) - verified at `562e200` | `src/infrastructure/database.spec.ts:129` - `else expect(prismaCode(error), write).toBe('P2039')`; `:128` `if (landsInA.has(write)) expect(error, write).toBeUndefined()`; `:132` `expect(afterB).toEqual(before[1])`; `:136` `...toHaveLength(1)` | PASS |
| C3 | references to B fail or are absorbed (now 7 members); B and A's existing rows unchanged | `✓ ... cannot link or move another tenant's row` (rg `:139`; members at `:145`, `:149`, `:153`, `:157`, `:164`, `:171`, `:180`) - verified at `562e200` | `src/infrastructure/database.spec.ts:200` - `expect(['P2014', 'P2025', 'P2018', 'P2003', 'P2039'], reference).toContain(prismaCode(error))`; `:198` absorbed `toBeUndefined()`; `:205` `expect(afterB).toEqual(before[1])`; `:210` existing A rows `toEqual(before[0])`. The accepted-code set was widened to include `P2014` for every member (precision note above) | PASS |
| C4 | findMany/count/create outside `withTenant` fail; count unchanged | `✓ ... fails outside withTenant` (rg `:213`) - verified at `562e200` | `src/infrastructure/database.spec.ts:217` - `await expect(deps.db.example.findMany()).rejects.toThrow()` (`:218` count, `:219` create); `:223` `expect(await snapshot(tenantA)).toEqual(before)` | PASS |
| C5 | `create` without `organizationId` gets A | `✓ ... fills organizationId from the tenant` (rg `:226`) - verified at `562e200` | `src/infrastructure/database.spec.ts:229` - `expect(created.organizationId).toBe(tenantA.organizationId)` | PASS |
| C6 | scalar `parentId` within A links; B -> `P2003`, unchanged | `✓ ... links rows only within the tenant` (rg `:232`) - verified at `562e200` | `src/infrastructure/database.spec.ts:240` - `expect(linked.parentId).toBe(parentA.id)`; `:247` `expect(prismaCode(error)).toBe('P2003')`; `:251` `expect(reloaded?.parentId).toBe(parentA.id)` | PASS |
| C7 | boot as superuser exits 1 naming the role | `✓ boot.spec.ts > server boot > refuses to boot with a role that bypasses row security` (rg `test/boot.spec.ts:23`) - verified at `562e200` (file untouched) | `test/boot.spec.ts:41-44` - `await expect(boot).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Database role "bens" bypasses row level security') })` | PASS |
| C8 | client is `bens_app`; pg-boss schema owned by `bens_app`; prisma.config reads `MIGRATION_DATABASE_URL` | `✓ ... connects as the application role` (rg `:273`) - verified at `562e200` | `src/infrastructure/database.spec.ts:278` - `expect(role).toEqual({ name: 'bens_app', superuser: false, bypassRls: false })`; `:285` `expect(schema?.owner).toBe('bens_app')`; `:289` `expect(prismaConfig).toContain('process.env.MIGRATION_DATABASE_URL')` | PASS |
| C9 | enqueue in `withTenant`: rollback -> no job; commit -> processed | `✓ queue.spec.ts > queue > enqueues inside a tenant transaction` (rg `src/infrastructure/queue.spec.ts:37`) - verified at `562e200` (file untouched) | `src/infrastructure/queue.spec.ts:54` - `expect(await jobsIn(name)).toEqual([])`; `:61` `expect(processed).toEqual([2])` | PASS |
| C10 | after 5 commit + 5 rollback, 10 outside queries fail; B sees only B | `✓ ... does not leak the tenant to the next transaction` (rg `:254`) - verified at `562e200` | `src/infrastructure/database.spec.ts:266` - ``await expect(deps.db.example.count(), `outside #${i}`).rejects.toThrow()``; `:270` `expect(asB.every((row) => row.organizationId === tenantB.organizationId)).toBe(true)` | PASS |
| C11 | every `organizationId` table has ENABLE + FORCE + `tenant_isolation` | `✓ schema.spec.ts > tenant tables > every tenant table is protected by row security` (rg `test/schema.spec.ts:85`) - verified at `562e200` | `test/schema.spec.ts:90` - `expect(unprotected).toEqual([])` | PASS |
| C12 | checker flags a synthetic tenant table without RLS, one case per clause | `✓ ... flags a tenant table without row security` (rg `:93`) - verified at `562e200` | `test/schema.spec.ts:122` - `expect(tables).toEqual(['NoEnable', 'NoForce', 'NoPolicy', 'Open'])`, with a fully protected `Protected` control that stays out of the list. Round 1 mutant F5 is now killed (re-run below) | PASS |
| C13 | unique indexes include `organizationId` (PK excluded, now ratified); synthetic flagged | `✓ ... every unique index of a tenant table includes organizationId` (rg `:149`) - verified at `562e200` | `test/schema.spec.ts:164` - `expect(real).toEqual([])`; `:165` `expect(synthetic).toEqual(['Client_email_key'])` | PASS |
| C14 | composite-FK test passes on the real schema and flags `Item.product` | `✓ ... every relation between tenant-scoped models uses a composite foreign key` (rg `:217`), `✓ ... flags a relation between tenant-scoped models without organizationId` (rg `:228`) - verified at `562e200` | `test/schema.spec.ts:225` - `expect(findSimpleTenantRelations(schema)).toEqual([])`; `:254` `.toEqual(['Item.product'])` | PASS |
| C15 | no syntactic guard names in `src` | `✓ architecture.spec.ts > tenant isolation > has no syntactic tenant guard` (rg `test/architecture.spec.ts:83`) - verified at `562e200` | `test/architecture.spec.ts:91` - `expect(leftovers).toEqual([])` | PASS |
| C16 | isolation violation -> `500 INTERNAL_ERROR` with `requestId` | `✓ app.spec.ts > error handler > surfaces a row security violation as a generic 500` (rg `src/app.spec.ts:134`) - verified at `562e200` (file untouched) | `src/app.spec.ts:137` - `expect(res.statusCode).toBe(500)`; `:138` `expect(res.json()).toEqual({ error: { code: 'INTERNAL_ERROR', ..., details: { requestId: res.headers['x-request-id'] } } })` | PASS |
| C17 | `organization.delete`/id change of B, inside and outside `withTenant`, -> `P2003`; B identical | `✓ database.spec.ts > row level security > does not reach tenant rows through Organization` (rg `:292`; attempts at `:296`, `:300`, `:307`, `:309`) - verified at `562e200` | `src/infrastructure/database.spec.ts:317` - `expect(prismaCode(await errorOf(run)), attempt).toBe('P2003')`; `:319` `expect(await snapshot(tenantB)).toEqual(before)` | PASS |
| C18 | no FK from a tenant table to an unguarded table cascades; checker flags synthetic `ON DELETE CASCADE` and `ON UPDATE CASCADE` | `✓ schema.spec.ts > tenant tables > foreign keys to unguarded tables never cascade` (rg `test/schema.spec.ts:125`) - verified at `562e200` | `test/schema.spec.ts:145` - `expect(real).toEqual([])`; `:146` `expect(synthetic).toEqual(['DeleteCascade_fkey', 'SetNull_fkey', 'UpdateCascade_fkey'])`. Proven as written. The claim is narrower than AC 16 (which also names `SET DEFAULT` and `ON UPDATE SET NULL`), and F2 survived: see Coverage | PASS |
| C19 | no `src` file outside `infrastructure/database.ts` cites `app.tenant_id`; checker flags a synthetic file | `✓ architecture.spec.ts > tenant settings and ids > only the database module sets the tenant` (rg `test/architecture.spec.ts:116`) - verified at `562e200` | `test/architecture.spec.ts:117` - `expect(filesCitingTenantSetting(readSourceTree(srcRoot))).toEqual([])`; `:118-123` synthetic `.toEqual(['modules/x/x.repository.ts'])`. `rg -n tenant_id apps/server/src` -> only `infrastructure/database.ts:17,38`. The check is a literal text search; non-literal forms are not caught (report-only above) | PASS |
| C20 | no exported `*Input` Zod object in `modules/**/*.schema.ts` accepts `id`; checker flags a synthetic one | `✓ architecture.spec.ts > tenant settings and ids > input schemas never accept an id` (rg `test/architecture.spec.ts:126`) - verified at `562e200` | `test/architecture.spec.ts:137` - `expect(offenders).toEqual([])`; `:138-145` `inputsAcceptingId({ createClientInput, updateClientInput, idParams })` `.toEqual(['createClientInput'])`; `:136` `expect(schemaFiles.length).toBeGreaterThan(0)`. The real-tree half has 0 `*Input` members (vacuous, report-only above) | PASS |
| C21 | `assertRowSecurityApplies` throws for a `BYPASSRLS`-only role and for `bens`; resolves for `bens_app` | `✓ database.spec.ts > row level security > refuses every role that bypasses row security` (rg `:322`) - verified at `562e200` | `src/infrastructure/database.spec.ts:334` - `await expect(bypass.assertRowSecurityApplies()).rejects.toThrow(RowSecurityBypassError)`; `:335` owner `.rejects.toThrow(RowSecurityBypassError)`; `:336` `await expect(deps.db.assertRowSecurityApplies()).resolves.toBeUndefined()`. The probe role is dropped in `finally`; after every run (including the F5 mutant) `pg_roles` held only `bens`, `bens_app` | PASS |

All five round 2 proofs (C17-C21) live in files `562e200` touched. So do the added C2/C3 members and the
C12 cases.

## Coverage

Rows round 2 added or touched are recomputed at `562e200`. The others are carried from `a51de9b`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| read shapes (8) - carried from `a51de9b` | plan AC 1; Prisma read API | C1, all 8 (`database.spec.ts:68-79`) | - |
| writes into another tenant (6 named by AC 2) - verified at `562e200` | plan AC 2 | create `:88`, update scalar `:92`, updateMany scalar `:96`, organization.connect `:100`, upsert create `:107` -> `P2039` `:129`; children.create `:115` -> lands in A `:128`, `:133`; B identical `:132` | - |
| writes that reach tenant rows through `Organization` (2 ops x 2 contexts) - verified at `562e200` | plan AC 15; PostgreSQL referential actions (`Example_organizationId_fkey` now `r`/`r` in the worker schema and in dev `public`) | delete in A `:296`, id change in A `:300`, delete outside `:307`, id change outside `:309` -> `P2003` `:317`; B identical `:319`. Adversarial as `bens_app` (throwaway schema `verify_r2`, dropped): all four refused with `violates RESTRICT setting of foreign key constraint "Example_organizationId_fkey"`; B's 2 rows identical afterwards. Other paths hunted: `TRUNCATE "Organization" CASCADE` / `TRUNCATE "Example"` -> `permission denied`; a `bens_app`-owned table with an FK into `Example`/`Organization` -> `permission denied` (no `REFERENCES`); a trigger on `Organization` -> `permission denied`; `ALTER TABLE ... DROP CONSTRAINT` / `DISABLE ROW LEVEL SECURITY` -> `must be owner`. The only other FK on a tenant table is the composite self-FK `Example_parentId_organizationId_fkey` (`r`/`c`), whose `ON UPDATE CASCADE` stays inside one tenant because it shares `organizationId`. No SECURITY DEFINER functions, no user triggers, no other tables with `organizationId` (`pgboss.*`, `_prisma_migrations`, `Organization` do not have it) | - |
| references to another tenant's row (7 named by AC 3) - verified at `562e200` | plan AC 3 | parent.connect `:145`, children.connect `:149`, org examples.set `:164`, org examples.connect `:180` -> error code `:200`; children.set `:153`, children.connectOrCreate `:157`, org examples.connectOrCreate `:171` -> absorbed `:198`; B identical `:205`, A's existing rows `:210` | - |
| operations outside `withTenant` (3) - carried from `a51de9b` | plan AC 4 | C4 `:217-219`. Regression: raw `SELECT count(*)` outside -> `invalid input syntax for type uuid: ""` | - |
| scalar FK link (2) - carried from `a51de9b` | plan AC 6 | C6 `:240`, `:247`. Regression: raw `UPDATE ... SET "parentId" = <B row>` in A -> `violates foreign key constraint "Example_parentId_organizationId_fkey"` | - |
| startup config: DB role per assembly (6) - carried from `a51de9b` | `server.ts`, `dependencies.ts`, test harness, pg-boss, Prisma CLI, export-openapi | as round 1; `server.ts:34` `await deps.db.assertRowSecurityApplies()` unchanged | - |
| transaction and pool (2) - carried from `a51de9b` | plan AC 10 | C10 `:266`, `:270` | - |
| `enqueue` in tenant tx (2) - carried from `a51de9b` | plan AC 9 | C9 `queue.spec.ts:54`, `:61` | - |
| tenant-table protection clauses (3) - verified at `562e200` | checker SQL `test/schema.spec.ts:10-24` | ENABLE -> `NoEnable`; FORCE -> `NoForce` (round 1 F5 re-run now killed); policy -> `NoPolicy`; all three -> `Open`; control `Protected` (C12 `:122`); real table C11 `:90` | - |
| FK actions from a tenant table to an unguarded table (AC 16: 3 actions x 2 events = 6) - verified at `562e200` | plan AC 16; PostgreSQL `confdeltype`/`confupdtype` (`c` cascade, `n` set null, `d` set default) | ON DELETE CASCADE -> `DeleteCascade_fkey`; ON UPDATE CASCADE -> `UpdateCascade_fkey`; ON DELETE SET NULL -> `SetNull_fkey` (C18 `:146`); RESTRICT and NO ACTION controls stay out of the list | **ON DELETE SET DEFAULT, ON UPDATE SET NULL, ON UPDATE SET DEFAULT: no synthetic case.** F2 (allowlist -> denylist `IN ('c','n')`) survived. `SET DEFAULT` moves B's rows into the deleting tenant (shown on the real DB, above) |
| boot decision table (3 rows) - verified at `562e200` | `database.ts:49` `!role or role.superuser or role.bypassRls` | superuser -> C7 `boot.spec.ts:41`, C21 `:335`; `BYPASSRLS`-only -> C21 `:334` (F5 killed); neither -> C21 `:336`, C8 `:279`. `!role` cannot happen: `current_user` is always in `pg_roles` | - |
| schema and code invariants (6) - verified at `562e200` | plan AC 11-13, 16-18 | RLS C11; unique C13; composite FK C14; FK without cascade C18 (partial, row above); tenant only in `database.ts` C19 (F3 killed); no `id` in input C20 (F4 killed) | - (the C18 gap is counted once, in the FK-action row) |
| plan doors (7) - verified at `562e200` | plan Landing | 7 FK to unguarded table -> C17, C18 (F1 killed); 1 role -> C7, C8, C21; 2 policy -> C11; 3 per-tx tenant -> C10; 4 default -> C5; 5 unique + PK exception -> C13, C20; 6 pg-boss role -> C8, C9 | - |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary - `tenant_isolation` policies - carried from `a51de9b` | `prisma/migrations/20260921215300_tenant_rls/migration.sql` | boundary C16 (HTTP 500) · own layer C1-C6 against real PostgreSQL; presence C11 | yes - `USING` (C1), `WITH CHECK` (C2), missing tenant (C4) each asserted |
| Decides, reached across a boundary - FK action `RESTRICT` (new in round 2) - verified at `562e200` | `prisma/migrations/20260921221115_organization_fk_restrict/migration.sql`, `prisma/schema.prisma:34-35` | own layer C17 against real PostgreSQL (4 attempts); presence C18 on the worker schema; boundary: the Prisma error reaches HTTP through the same `shared/errors.ts` path C16 proves (plan Surface: "None", and no route deletes an organization yet) | yes - each attempt asserted `P2003`, and B's rows asserted identical; F1 (`CASCADE`) killed by C17 |
| Decides, reached across a boundary - boot role check (unmet in round 1) - verified at `562e200` | `src/server.ts:34`, `src/infrastructure/database.ts:44-52` | boundary C7 (process exit) · own layer: one case per row of `superuser`/`bypassRls` | yes - C21 covers the `BYPASSRLS`-only row (`:334`), the superuser row (`:335`) and the neither row (`:336`); F5 (drop `role.bypassRls`) killed |
| Instrumentation, pass-throughs - carried from `a51de9b` | `src/infrastructure/database.ts:33-41` (`withTenant`) | none of its own; consumers C1-C6, C9, C10 | yes - consumers cover it |

Swept `existing` row re-read at `562e200`: "observability: existing - `shared/errors.ts` loga
`unhandled error` com `requestId`". It holds: `src/shared/errors.ts:53`
`request.log.error({ err: error }, 'unhandled error')`, and `:56` sends `{ requestId: request.id }`.
The other Swept rows are `n/a` (policy) or point at checks.

### Adversarial pass, round 2 (real DB, `bens_app` via `docker exec psql`, throwaway schemas `verify_r2`, `verify_r2sd`, `verify_r2_evil`, all dropped; `pg_namespace` shows no `verify%` left)

| Attempt | Observed | Judged against the plan |
| --- | --- | --- |
| Round 1 cascade attacks: delete Org B / change its id, inside `withTenant(A)` and outside | all 4 -> `violates RESTRICT setting of foreign key constraint "Example_organizationId_fkey"`; B's 2 rows identical | closed (AC 15) |
| Delete own Org A while A has rows | refused (RESTRICT) | expected |
| Delete or rename an Org with no tenant rows | allowed | `Organization` has no RLS - Out of scope |
| `TRUNCATE "Organization" CASCADE`, `TRUNCATE "Example"` | `permission denied` | closed |
| `bens_app` creates a schema (allowed, door 6) with an FK into `Example`/`Organization`; trigger on `Organization` | `permission denied for table ...` | closed |
| `ALTER TABLE "Example" DROP CONSTRAINT` / `DISABLE ROW LEVEL SECURITY` | `must be owner` | closed |
| FK changed to `ON DELETE SET DEFAULT` (hypothetical migration), delete Org B in `withTenant(A)` | B's `b1`, `b2` now have `organizationId` = A, visible to A | a real cross-tenant move; the HEAD checker catches it, but no proof asserts that (gap 1, F2) |
| Regression, in A: read B / insert into B / update scalar to B / `parentId` -> B row / update or delete a B row by id | 0 visible / RLS `WITH CHECK` error / RLS `WITH CHECK` error / composite FK error / 0 rows / 0 rows | closed (C1-C3, C6) |
| Regression: `SET app.tenant_id = B` (session), then an outside query | returned B's count (2) | not closed at runtime; C19 forbids the literal in `src` (report-only) |
| `set_config('app.' \|\| 'tenant_id', B, false)`, then an outside query | returned B's count (2) | not caught by C19's text search; acceptable per AC 17 as written, residual risk (report-only) |

## Faults injected

Worktrees `scratchpad/wt2` and `scratchpad/wt3` at `562e200`, each with `pnpm install --frozen-lockfile`.
The worktree baseline was green (26/26 on the three touched spec files). Each fault was reverted with
`git -C <wt> checkout -- .` before the next one. The real tree's `git status --porcelain` was empty
before, and still empty after each `git worktree remove --force` (checked with `diff`). I never used
`git stash`. After the runs, `pg_roles` held only `bens` and `bens_app`.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 - `ON DELETE RESTRICT` -> `ON DELETE CASCADE` on `Example_organizationId_fkey` | `prisma/migrations/20260921221115_organization_fk_restrict/migration.sql:5` | yes - C17 `delete in tenant A: expected undefined to be 'P2003'` |
| F2 - FK checker allowlist `NOT IN ('r','a')` -> denylist `IN ('c','n')` (both events) | `test/schema.spec.ts:61` | no - C18 stayed green (1 passed); the synthetic schema has no `SET DEFAULT` case |
| F3 - `app.tenant_id` checker narrowed to `includes("set_config('app.tenant_id'")` | `test/architecture.spec.ts:101` | yes - C19 `expected [] to deeply equal [ 'modules/x/x.repository.ts' ]` |
| F4 - `Input` checker drops the `'id' in value.shape` condition | `test/architecture.spec.ts:109` | yes - C20 `expected [ 'createClientInput', …(1) ] to deeply equal [ 'createClientInput' ]` |
| F5 - `assertRowSecurityApplies` drops `\|\| role.bypassRls` | `src/infrastructure/database.ts:49` | yes - C21 `promise resolved "undefined" instead of rejecting` |
| Re-run of round 1 F5 (the mutant that was not killed): protection checker drops `c.relforcerowsecurity AND` | `test/schema.spec.ts:17` | yes - C12 `expected [ 'NoEnable', 'NoPolicy', 'Open' ] to deeply equal [ 'NoEnable', 'NoForce', …(2) ]` |

F1-F5 are the five new faults on round 2 surfaces (the cap). The last row re-checks a round 1 verdict
that was not PASS, and does not count as a new fault. I reasoned about the other FK-checker clauses
from the inputs, without injecting them. Dropping the delete half is killed by `DeleteCascade`/`SetNull`.
Dropping the update half is killed by `UpdateCascade`. Dropping "parent has no `organizationId`" is
killed by the real schema, because the self-FK `ON UPDATE CASCADE` would be flagged. Dropping "child has
`organizationId`" would only over-report. The `SET DEFAULT` gap is what F2 exposed.

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` at `562e200`: exit 0. Biome checked 64 files
and applied no fixes. tsc passed for server and web. vitest ran 15 files, **79 passed, 0 failed**. The
server tsc build and the web vite build passed. The real tree's porcelain was still empty afterwards.

## Ranked gaps

1. AC 16 members `ON DELETE SET DEFAULT`, `ON UPDATE SET NULL` and `ON UPDATE SET DEFAULT` have no
   proof, and mutant F2 (denylist `IN ('c','n')`) survived. `SET DEFAULT` would silently move another
   tenant's rows into the deleting tenant - C18 - `test/schema.spec.ts:125-146` (synthetic cases at
   `:137-141`). Fix: add a `SetDefault` synthetic FK (and an `ON UPDATE SET NULL` one) and expect them
   in `:146`.
2. Report-only: pool poisoning by a non-literal `app.tenant_id` (`'app.' || 'tenant_id'`, or a key
   passed as a parameter) passes C19's text search, and still poisons the pooled session on the real
   DB. It is acceptable under AC 17 as written, but it is a residual runtime risk with no reset on
   checkout - C19 - `test/architecture.spec.ts:101`
3. Report-only: C20 is vacuous on the real tree (0 `*Input` exports). The only existing input schema
   is `commissionPreviewQuery`, so the PK-exception premise rests on a naming suffix -
   `src/modules/examples/example.schema.ts`
4. Report-only: the C2/C3 claim text and plan AC 3 were not updated for 6/7 members and `P2014`. The
   widened code set also applies to the four previously-proven members -
   `src/infrastructure/database.spec.ts:200`

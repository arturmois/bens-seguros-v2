# Tenant guard verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 863b23e..c842952
**Round**: 4 - scoped
**Verifier**: independent sub-agent (author != verifier)

Summary: 33 of the 38 checks are proven at `c842952`, and each has a located assertion. The other
5 (C11, C12, C13, C14, C25) are `SUPERSEDED`. That was approved by the user and recorded in both
`plan.md` and `checks.md`, and a live check covers every member they held. All 5 injected faults
were killed. The gate is green (92 passed). On the real PostgreSQL, every non-PASS verdict from
round 3 is now closed:

- `_count: true` in `include` and in `select` from `Organization` (H1, H2);
- the count through a node without a tenant (H11);
- `where` inside `_count.select.<relation>` (H12);
- the `upsert` whose `where` names A and whose `create` names B (W3, direct and compound);
- the unmet `createTenantGuard` Test policy row;
- the stale `Swept` citations.

The hunt covered 60+ further shapes: other `_count` placements, `relationLoadStrategy`, `omit`,
`distinct`, `cursor`, `createManyAndReturn`/`updateManyAndReturn` with `include`, nested writes and
reads through `Organization`, and the round 1 and 2 regression samples. It found **no path that
moves, links or reads a row across tenants**.

The verdict is still **FAIL**, on one member of the set round 4 added (AC 24). An `upsert` whose
`where` names **two** tenants passes the guard when the compound key comes first:
`where: { id_organizationId: { id, organizationId: B }, organizationId: A }` with
`create: { organizationId: B }`. On the real DB it created the row in B (probe W3m). `tenantOf`
(`apps/server/src/infrastructure/database.ts:76-86`) returns the **first** tenant key it meets. With
the keys in the other order, the same call throws (guard probe G2). So the result depends on key
order.

The impact is low. The `where` can match no row, because it needs `organizationId = A AND = B`. The
effect is therefore the same as a plain `create({ organizationId: B })`, which the guard allows by
design because it does not know `ctx`. Still, AC 24 says "IF o `create.organizationId` … difere do
tenant do seu `where` THEN SHALL lançar", and here it differs from the `where`'s direct tenant A and
nothing throws. Neither C36 nor the Coverage row names a `where` that carries two tenants. I record
it as an Unproven member and a precision gap in AC 24; I did not soften it.

Scope of this round (verify.md "Re-verifying after a fix"):

- the fix diff `2dd553a..c842952`:
  - `a8ce0e0`, the round 3 report;
  - `507353e`, specs: AC 24, AC 25 and C34-C38;
  - `c842952`: `database.ts` +28/-10 and `database.spec.ts` +103/-2;
- every round 3 verdict that was not PASS.

Each section says whether it was `verified at c842952` or `carried from 2dd553a`.

## Binding sources

`carried from 2dd553a`. No commit in `2dd553a..c842952` touches `docs/` (`git diff --stat
2dd553a..HEAD -- docs` is empty), and the guard's interface did not change. I re-opened ADR-004 at
`c842952` to confirm that layers 3 and 4 still read as round 3 cited them.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-004-tenant-isolation.md` (layer 3 guard, line 18; layer 4 composite FK, line 19; threat "vazamento entre tenants … referência cruzada", line 24) | yes - re-read lines 1-30 at c842952 | none | - |
| `docs/architecture.md` §7 "Isolamento de tenant (ADR-004)" (line 327) | yes - carried from 2dd553a (file unchanged in range) | none | - |
| `docs/architecture.md` §5 "Jobs e crons" (line 233) | yes - carried from 2dd553a (file unchanged in range) | none | - |

These are not UI sources, so there is no screen or arrangement to enumerate.

## Checks

`verified at c842952`. All proofs ran at HEAD in the real tree, in one batched invocation:

`cd apps/server && pnpm exec vitest run src/infrastructure/database.spec.ts src/app.spec.ts test/schema.spec.ts --reporter=verbose`

It exited 0 with `Test Files 3 passed (3)` and `Tests 43 passed (43)`. Every proof named below
appears as its own `✓` line in that output. Among them are the five new ones:

- `✓ … tenant guard on the database client > rejects counting tenant rows through Organization on the client`
- `✓ … > rejects an upsert that would create the row in another tenant`
- `✓ … createTenantGuard (decision table) > rejects every _count form through unguarded models`
- `✓ … > requires the same tenant on both sides of an upsert`
- `✓ … > rejects nested tenant writes below an unguarded node on every route`

`rg -n "it\('"` hits for C34-C38 in `apps/server/src/infrastructure/database.spec.ts`:

- `:672 it('rejects every _count form through unguarded models'` (C34)
- `:324 it('rejects counting tenant rows through Organization on the client'` (C35)
- `:703 it('requires the same tenant on both sides of an upsert'` (C36)
- `:333 it('rejects an upsert that would create the row in another tenant'` (C37)
- `:720 it('rejects nested tenant writes below an unguarded node on every route'` (C38)

The fix inserted 27 lines at `:324` and 10 lines in the decision-table model map (`:405-415`). Every
`database.spec.ts` citation below `:323` has been refreshed. `app.spec.ts` and `test/schema.spec.ts`
are not in the fix diff, and their lines did not change.

The five superseded tests are still gone. `rg -c` for their five names over `src` and `test` found
no hits (exit 1). Their members are covered by live checks: C28 (`spec:622`), C29 (`spec:285`) and
C30 (`spec:305`). See the round 3 supersession mapping, which still holds because those tests did
not change in the fix.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | 13 where-ops without `organizationId` throw in the guard | `✓ createTenantGuard (decision table) > rejects every where-operation without organizationId` exit 0 | `apps/server/src/infrastructure/database.spec.ts:423-425` - `expect(() => guard('Invoice', operation, { where: { id: 'i' } }), operation).toThrow(TenantGuardError)` over `WHERE_OPERATIONS` (:39-53); `:427-430` `.not.toThrow()` with the tenant | PASS |
| C2 | same 13 through `db` throw; rows unchanged | `✓ tenant guard on the database client > rejects every where-operation on the client and changes no rows` exit 0 | `apps/server/src/infrastructure/database.spec.ts:100` - `await expect(calls[operation](), operation).rejects.toThrow(TenantGuardError)`; `:104-105` - `expect(after).toHaveLength(before.length)` / `expect(after.map((row) => row.name)).toEqual(before.map((row) => row.name))` | PASS |
| C3 | tenant filter (direct or `id_organizationId`) returns only tenant rows | `✓ ... returns only the tenant rows when organizationId is present` exit 0 | `apps/server/src/infrastructure/database.spec.ts:118` - `expect(fromB).toBeNull()`; `:119` - `expect(fromA?.id).toBe(example.id)` | PASS |
| C4 | 6 non-literal shapes rejected, 2 accepted | `✓ ... accepts only a literal organizationId filter` exit 0 | `apps/server/src/infrastructure/database.spec.ts:444` - `expect(() => guard('Invoice', 'findMany', { where }), shape).toThrow(TenantGuardError)` over the 6 shapes at :435-442; `:447`, `:448-452` `.not.toThrow()` | PASS |
| C5 | 3 create ops reject a row missing `organizationId` | `✓ ... rejects every create operation with a row missing organizationId` exit 0 | `apps/server/src/infrastructure/database.spec.ts:461` - `expect(() => guard('Invoice', operation, { data: bad }), operation).toThrow(TenantGuardError)` with `bad = [{ organizationId: org }, { name: 'x' }]` (:458) | PASS |
| C6 | `upsert` needs the tenant in `where` and in `create` | `✓ ... requires the tenant on both sides of an upsert` exit 0 | `apps/server/src/infrastructure/database.spec.ts:467-469` - `guard('Invoice', 'upsert', { where: { id: 'i' }, create: { organizationId: org } })).toThrow(TenantGuardError)`; `:470-472` - `.toThrow(/upsert without create.organizationId/)` | PASS |
| C7 | unknown ops fail closed citing `is not supported` | `✓ ... fails closed on an unknown operation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:484-487` - `expect(() => guard('Invoice', operation, { where: { organizationId: org } }), operation).toThrow(/is not supported/)` | PASS |
| C8 | 4 update paths setting scalar `organizationId` throw | `✓ ... never moves a row to another tenant` exit 0 | `apps/server/src/infrastructure/database.spec.ts:494-497` - `guard('Invoice', operation, { where, data: { organizationId: other } })).toThrow(TenantGuardError)`; `:499-505` upsert `update: { organizationId: other }` `.toThrow(TenantGuardError)` | PASS |
| C9 | `updateMany` A→B on `db` throws; rows stay in A | `✓ ... rejects moving rows between tenants on the client` exit 0 | `apps/server/src/infrastructure/database.spec.ts:131` - `.rejects.toThrow(TenantGuardError)`; `:135` - `expect(after.every((row) => row.organizationId === tenantA.organizationId)).toBe(true)` | PASS |
| C10 | `Organization` passes without where-validation | `✓ ... leaves models without organizationId alone` exit 0 | `apps/server/src/infrastructure/database.spec.ts:363` - `await expect(deps.db.organization.findMany({ take: 1 })).resolves.toBeInstanceOf(Array)` | PASS |
| C11 | `connect`/`set` without tenant at 6 nested positions (AC 9) | superseded - test removed (`rg` no hit) | replaced by C28 `spec:622` and C30 `spec:305`; recorded in `plan.md` AC 9 and `checks.md` C11 | SUPERSEDED |
| C12 | `connectOrCreate` without tenant throws citing `connectOrCreate on` (AC 10) | superseded - test removed (`rg` no hit) | replaced by C28 (`connectOrCreate` at `spec:589`, asserted at `:622`); recorded in `plan.md` AC 10 and `checks.md` C12 | SUPERSEDED |
| C13 | `db` nested connect without tenant throws with the old message (AC 9) | superseded - test removed (`rg` no hit) | replaced by C29 `spec:236`, `:285`; recorded in `checks.md` C13 and Handoff | SUPERSEDED |
| C14 | tenant-filtered connect to a B row → `P2025` (AC 11) | superseded - test removed (`rg` no hit) | connect refused before SQL: C29 `spec:285`; cross-tenant link rejected by the DB: C30 `spec:305`; recorded in `plan.md` AC 11 and `checks.md` C14 | SUPERSEDED |
| C15 | scalar `parentId` from B → `P2003`, nothing created | `✓ ... lets the composite foreign key reject a parent id from another tenant` exit 0 | `apps/server/src/infrastructure/database.spec.ts:165` - `expect(error).toMatchObject({ code: 'P2003' })`; `:169` - `expect(created).toBeNull()` | PASS |
| C16 | include under tenant filter returns only A's children + A's org; root guarded | `✓ ... allows include of relations under a tenant filter and still guards the root` exit 0 | `apps/server/src/infrastructure/database.spec.ts:147` - `expect(loaded?.children.map((child) => child.name)).toEqual(['child-1'])`; `:151` - `expect(loaded?.organization.id).toBe(tenantA.organizationId)`; `:152-154` `.rejects.toThrow(TenantGuardError)` | PASS |
| C17 | `tx` guarded; with tenant returns rows | `✓ ... guards the transaction client too` exit 0 | `apps/server/src/infrastructure/database.spec.ts:352-354` - `deps.db.$transaction(async (tx) => tx.example.findMany({ where: { name: 'x' } }))).rejects.toThrow(TenantGuardError)`; `:359` - `expect(found.length).toBeGreaterThan(0)` | PASS |
| C18 | `readModels` fails closed; classifies Example/Organization; maps `parent` | `✓ ... reads the model classification from the Prisma runtime and fails closed` exit 0 | `apps/server/src/infrastructure/database.spec.ts:367-368` - `expect(() => readModels({})).toThrow()` / `...{ models: 'unexpected' } })).toThrow()`; `:371-373` - `tenantScoped).toBe(true)`, `.toBe(false)`, `relations.get('parent')).toBe('Example')` | PASS |
| C19 | schema test passes on the real schema and flags `Item.product` | `✓ tenant-scoped relations > every relation between tenant-scoped models uses a composite foreign key` and `✓ ... flags a relation between tenant-scoped models without organizationId` exit 0 | `apps/server/test/schema.spec.ts:60` - `expect(findSimpleTenantRelations(schema)).toEqual([])`; `:89` - `expect(findSimpleTenantRelations(schema)).toEqual(['Item.product'])` (file unchanged) | PASS |
| C20 | tenant relation write throws on 4 update paths + nested update, for 6 ops | `✓ createTenantGuard (decision table) > never writes the tenant relation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:521-524` - `expect(() => guard('Invoice', path, { where, data: { organization } }), ...).toThrow(TenantGuardError)`; `:526-534` upsert.update; `:535-542` nested `items.update.data.organization`; 6 ops at :510-517 | PASS |
| C21 | `db` update/upsert via `organization.connect` B throw; row stays in A | `✓ tenant guard on the database client > rejects moving a row through the organization relation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:177` - `await expect(deps.db.example.update({ where, data: toB })).rejects.toThrow(TenantGuardError)`; `:178-184` upsert; `:187` - `expect(reloaded?.organizationId).toBe(tenantA.organizationId)` | PASS |
| C22 | unguarded model writing a tenant-scoped relation throws for 11 nested ops in create/update/upsert; scalar update passes | `✓ ... rejects nested writes into tenant-scoped relations from unguarded models` exit 0 | `apps/server/src/infrastructure/database.spec.ts:562-565` create, `:566-569` update, `:570-578` upsert `.toThrow(TenantGuardError)`; ops :547-559; `:581-583` - `guard('Organization', 'update', { where: { id: org }, data: { name: 'Nova' } })).not.toThrow()` | PASS |
| C23 | `db` `organization.update ... examples.connect rowOfB` throws; row stays in B | `✓ ... rejects moving rows into an organization through its relation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:193-198` - `deps.db.organization.update({ … data: { examples: { connect: { id: rowOfB.id } } } })).rejects.toThrow(TenantGuardError)`; `:203` - `expect(reloaded?.organizationId).toBe(tenantB.organizationId)` | PASS |
| C24 | unreachable-DB client rejects 13 ops with `TenantGuardError`, never a connection error | `✓ ... rejects before sending any SQL` exit 0 | `apps/server/src/infrastructure/database.spec.ts:89` - `expect(error, operation).toBeInstanceOf(TenantGuardError)` over 13 ops (:87-90), client at `127.0.0.1:1` (:84) | PASS |
| C25 | `connectOrCreate` without tenant at 6 nested positions (AC 10) | superseded - test removed (`rg` no hit) | replaced by C28 (`connectOrCreate` at every position, `spec:589`, `:622`); recorded in `plan.md` AC 10 and `checks.md` C25 | SUPERSEDED |
| C26 | `select` of relation under A filter returns exactly `[{ name: 'child-s', organizationId: A }]`; root guarded | `✓ ... allows select of relations under a tenant filter` exit 0 | `apps/server/src/infrastructure/database.spec.ts:215` - `expect(loaded?.children).toEqual([{ name: 'child-s', organizationId: tenantA.organizationId }])`; `:216-221` `.rejects.toThrow(TenantGuardError)` | PASS |
| C27 | guard violation through a route → generic `500` + `requestId` = header, no `organizationId` | `✓ src/app.spec.ts > error handler > surfaces a tenant guard violation as a generic 500` exit 0 | `apps/server/src/app.spec.ts:131` - `expect(res.statusCode).toBe(500)`; `:132-138` - `expect(res.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.', details: { requestId: res.headers['x-request-id'] } } })`; `:139` - `expect(res.body).not.toContain('organizationId')` | PASS |
| C28 | 11 nested ops into a tenant-scoped relation throw at 7 positions, even with the own tenant | `✓ createTenantGuard (decision table) > rejects every nested write into a tenant-scoped relation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:622` - `expect(call(write), \`${position} ${operation}\`).toThrow(TenantGuardError)`; `write = { [operation]: { id: 'x', organizationId: org } }` (:620, own tenant); ops :587-599; positions :602-616 | PASS |
| C29 | via `db`, the 10 round 2 paths throw; A's and B's ids unchanged | `✓ tenant guard on the database client > rejects the round 2 cross-tenant paths and moves no row` exit 0 | `apps/server/src/infrastructure/database.spec.ts:285` - `await expect(call(), path).rejects.toThrow(TenantGuardError)` over the 10 paths at :234-282; `:288` - `expect((await examplesOf(tenantA)).map((row) => row.id)).toEqual(beforeA)`; `:289` same for B | PASS |
| C30 | scalar `parentId` within A links; from B → `P2003`, `parentId` unchanged | `✓ ... links rows only through the scalar foreign key` exit 0 | `apps/server/src/infrastructure/database.spec.ts:299` - `expect(linked.parentId).toBe(parentA.id)`; `:305` - `expect(error).toMatchObject({ code: 'P2003' })`; `:306` - `expect((await deps.db.example.findUnique({ where }))?.parentId).toBe(parentA.id)` | PASS |
| C31 | from an unguarded model/node: include, select, `_count.select`, where (direct, some, AND/OR/NOT), orderBy throw; allowed shapes pass | `✓ createTenantGuard (decision table) > rejects reading tenant-scoped relations through unguarded models` exit 0 | `apps/server/src/infrastructure/database.spec.ts:652` - `expect(() => guard(model, operation, args), label).toThrow(TenantGuardError)` over the 10 labels at :628-650; `:655-663` `.not.toThrow()` for `Invoice` include under tenant and `Organization` scalar read | PASS |
| C32 | via `db`: `organization.findMany include examples`, `where examples.some`, and `example include organization.include.examples` throw | `✓ ... rejects cross-tenant reads through Organization on the client` exit 0 | `apps/server/src/infrastructure/database.spec.ts:310-312` - `await expect(deps.db.organization.findMany({ include: { examples: true } })).rejects.toThrow(TenantGuardError)`; `:313-315` where; `:316-321` nested include `.rejects.toThrow(TenantGuardError)` | PASS |
| C33 | unknown model fails closed citing `Unknown model` | `✓ createTenantGuard (decision table) > fails closed on an unknown model` exit 0 | `apps/server/src/infrastructure/database.spec.ts:667-669` - `expect(() => guard('Ghost', 'findMany', { where: { organizationId: org } })).toThrow(/Unknown model/)` | PASS |
| C34 | from an unguarded model: `include._count: true`, `select._count: true`, `_count.select.<rel>.where` throw; from a tenant model `_count: true` passes and a `where` inside `_count.select.<rel>` through an unguarded node throws | `✓ createTenantGuard (decision table) > rejects every _count form through unguarded models` exit 0 | `apps/server/src/infrastructure/database.spec.ts:695` - `expect(() => guard(model, 'findMany', args), label).toThrow(TenantGuardError)` over the 4 labels at :674-692 (`'include _count: true'`, `'select _count: true'`, `'_count.select with where'`, `'where inside a tenant _count through an unguarded node'`); `:698-700` - `guard('Invoice', 'findMany', { where: { organizationId: org }, include: { _count: true } })).not.toThrow()` | PASS |
| C35 | via `db`, `organization.findMany({ include: { _count: true } })` and `({ select: { _count: true } })` throw | `✓ tenant guard on the database client > rejects counting tenant rows through Organization on the client` exit 0 | `apps/server/src/infrastructure/database.spec.ts:325-327` - `await expect(deps.db.organization.findMany({ include: { _count: true } })).rejects.toThrow(TenantGuardError)`; `:328-330` - `await expect(deps.db.organization.findMany({ select: { _count: true } })).rejects.toThrow(TenantGuardError)` | PASS |
| C36 | `upsert` with `where` of `org-1` (direct or `id_organizationId`) and `create.organizationId` `org-2` throws; same tenant does not | `✓ createTenantGuard (decision table) > requires the same tenant on both sides of an upsert` exit 0 | `apps/server/src/infrastructure/database.spec.ts:709-712` - `expect(() => guard('Invoice', 'upsert', { where, create: { organizationId: other }, update: {} }), label).toThrow(TenantGuardError)` over `direct`/`compound` (:704-707); `:713-716` same with `create: { organizationId: org }` `.not.toThrow()`. The claim as written is proven. A `where` carrying **both** forms with different tenants is outside it: see Coverage | PASS |
| C37 | via `db`, `upsert` with `where` of A (missing id) and `create` of B throws; no such row in B | `✓ tenant guard on the database client > rejects an upsert that would create the row in another tenant` exit 0 | `apps/server/src/infrastructure/database.spec.ts:334-343` - `await expect(deps.db.example.upsert({ where: { id: …dcba, organizationId: tenantA.organizationId }, create: { name: 'r4-upsert-into-b', organizationId: tenantB.organizationId }, update: {} })).rejects.toThrow(TenantGuardError)`; `:348` - `expect(created).toBeNull()` | PASS |
| C38 | below an unguarded node, a nested tenant write throws via `create`, `createMany.data`, `upsert.create`, `upsert.update`, `connectOrCreate.create` | `✓ createTenantGuard (decision table) > rejects nested tenant writes below an unguarded node on every route` exit 0 | `apps/server/src/infrastructure/database.spec.ts:730-732` - `expect(() => guard('User', 'update', { where: { id: 'u' }, data: { teams } }), route).toThrow(TenantGuardError)` over the 5 routes at :722-728 (`Team` is unguarded, :415) | PASS |

Level and precision findings, `verified at c842952`:

- **Round 3 precision gap C31 vs AC 22 (`_count: true`): closed.** AC 25 now names every form, and
  C34/C35 prove boolean `_count` at both layers.
- **New precision gap in AC 24 / C36.** "o tenant do seu `where`" assumes the `where` names one
  tenant. A `where` can carry a direct `organizationId` and a compound key with a **different**
  tenant. The code resolves it with the first key it meets (`database.ts:78-84`), so the verdict
  depends on key order. Neither the AC nor the check says what should happen. See Coverage, member
  "`where` naming two tenants".
- Level: C35 and C37 cross the real client and DB for the two new decision rows. C34, C36 and C38
  cover them at the guard's own layer. This matches the Test policy row.

## Coverage

`verified at c842952` for every row whose authority the fix touched: the `_count` rows, the
`upsert` rows, the routes below an unguarded node, the AC 22 reads row, and round 3's
nested-write-positions row. The rest are `carried from 2dd553a`, since the fix did not touch the
code that decides them.

**Attack sweep against the real database.** Throwaway `src/probe.spec.ts` in the scratch worktree
at `c842952`, tenants from `withTwoTenants`. A holds `a-alpha`, `a-mike`, `a-zulu`; B holds
`a-november`, `b-secret`, `b-other`. After the writes, `organizationId`/`parentId` were read back
with raw SQL.

| # | Attack | Guard | Result on the real DB |
| --- | --- | --- | --- |
| H1 | `organization.findMany({ where: { id: { in: [A, B] } }, include: { _count: true } })` | `TenantGuardError` (`include._count.examples: Organization has no tenant filter…`) | closed (round 3: leaked A=15, B=15) |
| H2 | `organization.findMany({ where: { id: B }, select: { id: true, _count: true } })` | `TenantGuardError` | closed |
| H11 | `example.findFirst(A, include: { organization: { include: { _count: true } } })` | `TenantGuardError` | closed |
| H12 | `example.findFirst(A, include: { _count: { select: { children: { where: { organization: { examples: { some: { name: 'b-secret' } } } } } } } })` | `TenantGuardError` (`_count.children.where.organization.examples…`) | closed |
| W3 / W3c / W3n | `example.upsert` where A (direct / `id_organizationId` / `organizationId_name`), `create.organizationId` B | `TenantGuardError` (`must create in the tenant of its where`) each | no row created in B - closed |
| **W3m** | **`example.upsert({ where: { id_organizationId: { id: <b-secret>, organizationId: B }, organizationId: A }, create: { organizationId: B, name: 'w3m-into-b' }, update: { name: 'w3m-upd' } })`** | **passes** | **row `w3m-into-b` created in B (`in_b: true`); `b-secret` untouched** |
| W3m2 | same `where`, keys in the other order (direct A first), `create` A | passes | row created in A (the guard probe G2 shows that `create` B in this order throws) |
| W3s | `upsert` where A, `create` A | passes | created in A (expected) |
| C-a / C-b / C-c / C-d / C-e | `_count: {}` / `{ select: undefined }` / `{ select: true }` / `'true'` / `1` from Organization | passes the guard | Prisma validation rejects each (`Unknown field at "_count selection"`, `needs at least one truthy value`, `Unknown argument`) - not exposed |
| C-f / C-u | `select._count.select.examples: {}` / `include._count.select.examples.where` from Organization | `TenantGuardError` | closed |
| C-g / C-h / C-n | `orderBy: { examples: { _count } }` on `findMany` (object and array) and on `groupBy` | `TenantGuardError` | closed |
| C-i / C-k | `organization.groupBy/aggregate({ _count: { examples: true } })` | passes the guard | Prisma rejects (`Unknown field examples … OrganizationCountAggregateOutputType`) - not exposed |
| C-j / C-l | `organization.groupBy _count._all` / `aggregate _count: true` | passes | counts Organization rows only, no tenant data |
| C-m | `organization.count({ select: { examples: true } })` | `TenantGuardError` | closed |
| C-o / C-p / C-r / C-z | `_count` nested inside an included/selected `organization` (select, include+select, via `children`, fluent `.organization({ include: { _count } })`) | `TenantGuardError` each | closed |
| C-q | `example.findMany(A, orderBy: { organization: { examples: { _count } } })` | `TenantGuardError` | closed |
| C-v / C-w | `_count.select.children.where` through `parent.organization.examples` / `OR [organization.examples]` | `TenantGuardError` | closed |
| C-s / C-t | tenant root `include._count: true` / `_count.select.children.where organizationId B` | passes | `{ children: 0 }`, own tenant only (composite FK) |
| C-x / tx | batch `$transaction([org include _count])` / interactive tx | `TenantGuardError` | closed |
| C-y / H4 | fluent `organization.findUnique({ id: B }).examples()` | `TenantGuardError` (`select.examples`) | closed |
| R-1 / R-2 / R-3 | `relationLoadStrategy: 'join'` with `_count`/`include examples` from Organization, and via `example.include.organization.include.examples` | `TenantGuardError` each | closed; the strategy does not change the args the guard walks |
| R-4 / R-6 | `omit` + `include._count` / `omit` + `include.examples` under `organization` | `TenantGuardError` | closed |
| R-5 | `organization.findMany({ omit: { examples: true } })` | passes | scalars only |
| R-7 / R-8 | `distinct` on Organization / on Example under A | passes | scalars only, own tenant |
| K-1 / K-3 / K-5 / K-6 | `example.findMany(A, cursor: <B row by id / id_organizationId / organizationId_name>, orderBy: { name })` | passes | `[]`, the same as a missing cursor (K-2, K-7) - no ordering or existence oracle on B's rows |
| K-4 | cursor on an A row | passes | A rows only |
| K-8 / K-9 | cursor with a relation filter | passes | Prisma rejects (`Unable to resolve field …`) - not exposed |
| M-1 / M-2 / M-4 | `createManyAndReturn`/`updateManyAndReturn` with `include/select organization._count` or `.include.examples` | `TenantGuardError` | closed |
| M-3 | `createManyAndReturn(A, include: { organization: true })` | passes | own org only |
| N-1 / N-2 / N-3 / N-9 | `organization.update/create/upsert` with `examples.connect/createMany/set/create` | `TenantGuardError` | closed |
| N-4 / R1-1 | `example.update(organization.update/connect …)` | `TenantGuardError` (`must not write the tenant relation`) | closed |
| N-6 / N-7 / N-8 | `organization.createManyAndReturn include _count` / `updateManyAndReturn select _count` / `deleteMany where examples` | `TenantGuardError` | closed |
| R2-N1 / N5 / N14 / N17 | round 2 `parent.connect B`, `parent.upsert`, `children.connect B`, `create children.connect` | `TenantGuardError` | closed |
| R1-W2 | `updateMany data.organizationId { set: B }` | `TenantGuardError` | closed |
| W1 | scalar `parentId` = B row | passes the guard | Prisma `P2003` (`Example_parentId_organizationId_fkey`) |
| W9 | scalar `parentId: null` (detach, the round 3 open note) | passes | own row detached in A, no cross-tenant effect |
| H14 / READ | `example where organization.examples` / `organization include examples` | `TenantGuardError` | closed |
| final | rows `a-alpha`, `a-november`, `b-secret` | - | A / B / B, `parentId` null - no row moved |

Guard-level probe on the upsert order (`createTenantGuard` with one tenant-scoped `Invoice`):

- G1: `where: { id_organizationId: { id, organizationId: 'org-2' }, organizationId: 'org-1' }` with
  `create` `org-2` **passes**.
- G2: `where: { organizationId: 'org-1', id_organizationId: { …'org-2' } }` with `create` `org-2`
  throws `must create in the tenant of its where`.
- G3: the G2 `where` with `create` `org-1` passes.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| where-operations (13) | carried from 2dd553a (Prisma TypeMap; `database.ts:10-25`) | C1 (`spec:423`) · C2 (`spec:100`) · C24 (`spec:89`) | - |
| create operations (3) | carried from 2dd553a | C5 (`spec:461`) | - |
| `upsert` sides present (2) | code `database.ts:255`, `:268` | `where` C6 (`spec:467`) · `create` C6 (`spec:470`) | - |
| total known ops (17) vs code | `database.ts:10-26` (unchanged) | exact; anything else → `:252-253` → C7 | - |
| rejected / accepted filter shapes (6 / 2) | code `tenantOf` `database.ts:76-86` (refactored from `hasTenantFilter`, same acceptance) | C4 (`spec:444`) / C3, C4 (`spec:447-452`) | - |
| unknown operations (3) | carried from 2dd553a | C7 | - |
| updates that change the tenant (4) | code `database.ts:260-265` | C8, C9 (R1-W2 on DB) | - |
| `_count` forms from a node without tenant - verified at c842952 | plan AC 25; Prisma read args (`_count` as `true` or `{ select: { rel: true \| { where } } }`; other shapes rejected by Prisma: C-a…C-e); code `database.ts:173-191` | `include._count: true` C34 (`spec:674`), C35 (`spec:325`) · `select._count: true` C34 (`spec:675`), C35 (`spec:328`) · `_count.select.<rel>` C31 (`spec:631`), C34 (`spec:676`) · nested inside an included unguarded node: shares the same `checkProjection` path (`:196`), H11/C-o/C-p/C-r on DB, C31 `via an unguarded node` | - |
| `where` inside `_count.select.<rel>` (1) - verified at c842952 | plan AC 25; code `database.ts:186-188` | C34 (`spec:680-692`); fault F2 killed | - |
| other `_count` placements (orderBy, groupBy/aggregate, count select) - verified at c842952 | Prisma args | `orderBy rel._count` C31 (`spec:636`), C-g/C-h/C-n on DB · `groupBy/aggregate _count.<rel>`: Prisma rejects (C-i, C-k), no proof needed · `count select rel`: guard throws (C-m), same `checkProjection` path as C31 `select` | - |
| `upsert` tenant equality (AC 24) - verified at c842952 | plan AC 24; code `tenantOf` `database.ts:76-86` + comparison `:271-273`. The shapes of a `where` that carries a tenant: direct, compound, **both at once** | direct C36 (`spec:705`), C37 (`spec:334-348`), W3 on DB · compound `id_organizationId` C36 (`spec:706`), W3c · compound `organizationId_name` W3n on DB (same code path as C36 compound) | **`where` naming two tenants** (compound B before direct A) with `create` B: passes the guard and creates the row in B on the real DB (W3m, G1). The result depends on key order (G2 throws). No check, and the code does not meet AC 24's "difere do tenant do seu `where`" for the direct tenant |
| routes below an unguarded node (6) - verified at c842952 | code `checkNestedWrites` recursion `database.ts:126`, `:128`, `:133`, `:137-138`, `:142` | `update` (`:133`) C28 (`spec:614`) · `create` (`:126`) C38 · `createMany.data` (`:128`) C38 · `upsert.create`/`upsert.update` (`:137-138`) C38 · `connectOrCreate.create` (`:142`) C38 (`spec:722-732`); fault F5 killed | - (round 3's Unproven closed) |
| nested-write positions (top-level callers) | code `database.ts:232`, `:234`, `:235`, `:248`, `:274`, `:275`, `:278` | tenant `create.data` C28 · tenant `update.data` C28 · tenant `upsert.create`/`update` C28 · unguarded `data`/`create`/`update` C22, C28 | - |
| reads through a node without tenant (AC 22) - verified at c842952 | plan AC 22; Prisma read args; code `database.ts:152-223` | `include` C31, C32 · `select` C31 · `_count` (all forms) C31, C34, C35 · `where` direct/`some`/`AND`/`OR`/`NOT` C31, C32 · `orderBy` C31 · via unguarded node C31, C32 · `cursor`: relation fields rejected by Prisma (K-8, K-9), and a B-row cursor under A yields `[]` (K-1) · fluent: reduced to `select` (C-y) | - (round 3's `_count: true` and `_count.select.where` members closed) |
| paths that change a row's tenant | carried from 2dd553a, re-sampled on DB (R1-1, R2-N1/N5/N14/N17, R1-W2, N-1…N-4) | C29, C28, C20-C23 | - |
| forbidden nested ops (11) | carried from 2dd553a | C28 11 × 7 (`spec:587-622`) | - |
| round 2 paths (10) | carried from 2dd553a | C29 (`spec:234-285`) | - |
| scalar FK link (2) | carried from 2dd553a | C30 (`spec:299`, `:305`), C15; W1 on DB | - |
| unknown model (1) | code `database.ts:97` | C33 (`spec:667`) | - |
| application clients (2) | carried from 2dd553a | `db` C2 · `tx` C17 (tx probe on DB) | - |
| model classification (2) / fail-closed metadata doors (2) | carried from 2dd553a (`database.ts:51-65`, called at `:298`) | C10, C18 | - |
| "no SQL" of AC 1 (13) | carried from 2dd553a | C24 | - |
| error surface (Flow hop 4) (1) | carried from 2dd553a (`shared/errors.ts:53-56`) | C27 | - |
| startup config: guard install (3 assemblies) | read at c842952: `server.ts:19`, `test/app.ts:27`, `scripts/export-openapi.ts:18` → `dependencies.ts:18` `createDatabase(config.DATABASE_URL)` | C2 via `test/app.ts`; the others share `createDependencies` | - |
| plan one-way doors (6) | carried from 2dd553a (plan `Landing` unchanged) | single extension `database.ts:300-310` C2, C17, C24 · runtime datamodel C18 · scalar-FK-only link C28-C30 · create only by scalar C5 · `TENANT_ROOT` `:7`, `:120` C20, C21 · composite FK C15, C19, C30 | - |

Notes (not counted as Unproven members):

- **Stale citation in `checks.md` (round 3 note): mostly fixed.** The `Swept` rows and the Coverage
  footnote now cite only live checks (see below). One stale citation remains, in the `Test policy`
  section: the `Cost:` line (`checks.md:200`) still lists the superseded C11. It is a cost estimate
  from round 1, not a proof claim.
- **Detaching a parent (round 3 open note).** `data: { parentId: null }` detaches within the own
  tenant (W9) and has no cross-tenant effect.

## Test policy rows

`verified at c842952`. Every row in `checks.md` was re-judged, because the fix touched `database.ts`.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary - `createTenantGuard` | `apps/server/src/infrastructure/database.ts:94-280` | boundary C2, C9, C16, C17, C21, C23, C24, C26, C27, C29, C30, C32, C35, C37 · own layer C1, C4-C8, C20, C22, C28, C31, C33, C34, C36, C38 | yes - both rows that round 3 found without an own-layer case are now asserted. (a) boolean `_count` (`:175-179`) by C34 `spec:674-675`, plus the tenant-root pass case `:698-700`. (b) Recursion into a non-tenant target via `create`/`createMany`/`upsert`/`connectOrCreate` (`:126`, `:128`, `:137-138`, `:142`) by C38 `spec:722-732`. The new rows, `where` inside `_count.select` (`:186-188`) and the `upsert` tenant comparison (`:271-273`, with `tenantOf` direct and compound), are asserted by C34 `spec:680-692` and C36 `spec:704-716`, and each also has a boundary proof (C35, C37). The one shape outside the decision table (a `where` naming two tenants, decided by key order) is recorded under Coverage as a code defect against AC 24 rather than as a missing test-policy case |
| Decides, reached across a boundary - `readModels` | `apps/server/src/infrastructure/database.ts:51-65` | boundary C18 (real client, `spec:370-373`) · own layer C18 (fakes, `spec:367-368`) | yes - carried from 2dd553a; lines 51-65 are not in the fix diff |
| Instrumentation, pass-throughs - `createDatabase` / extension | `apps/server/src/infrastructure/database.ts:290-311` | none of its own; covered by C2, C17, C24 | yes - verified at c842952 (not in the fix diff) |

## Faults injected

`verified at c842952`.

Isolation:

1. The real tree's `git status --porcelain` baseline was empty (`porcelain-before-r4.txt` in the
   scratchpad).
2. Scratch: `git worktree add <scratchpad>/wt4 HEAD`, then `pnpm install --frozen-lockfile`.
3. The probe specs were deleted before the faults, and the scratch porcelain was empty.
4. Each fault was one `sed` on `apps/server/src/infrastructure/database.ts`. Only its narrowest
   proof(s) ran with `-t`, then `git checkout -- <file>` restored the file.

Each fault targets a round 4 surface and forces a different proof to fail.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 - `_count: true` branch `if (value === true) {` → `if (false) {` | `apps/server/src/infrastructure/database.ts:175` | yes - `× rejects every _count form through unguarded models` (C34, `AssertionError: include _count: true`) and `× rejects counting tenant rows through Organization on the client` (C35, `promise resolved "[ { …(5) }, { …(5) } ]" instead of rejecting`) |
| F2 - `where` inside `_count.select`: `checkRelationFilter(target, options.where, …)` → `void options` | `apps/server/src/infrastructure/database.ts:187` | yes - C34 fails at label `where inside a tenant _count through an unguarded node` |
| F3 - `upsert` same-tenant comparison `if (args.create[TENANT_FIELD] !== tenantOf(where)) {` → `if (false) {` | `apps/server/src/infrastructure/database.ts:271` | yes - `× requires the same tenant on both sides of an upsert` (C36, label `direct`) and `× rejects an upsert that would create the row in another tenant` (C37, `promise resolved "{ …(5) }" instead of rejecting`) |
| F4 - `tenantOf` on the compound key returns the field name instead of the tenant (`return tenant` → `return TENANT_FIELD`) | `apps/server/src/infrastructure/database.ts:82` | yes - C36 fails at label `compound: expected [Function] to not throw an error but 'TenantGuardError: Invoice.upsert must…' was thrown` |
| F5 - recursion below an unguarded node: `checkNestedWrites(target, connectOrCreate.create, …)` → `void connectOrCreate` | `apps/server/src/infrastructure/database.ts:142` | yes - `× rejects nested tenant writes below an unguarded node on every route` (C38, label `connectOrCreate.create`) |

The 5-fault cap was reached. Every new proof (C34, C35, C36, C37, C38) was made to fail at least
once.

Discard: `git worktree remove --force <scratchpad>/wt4`. `git worktree list` then showed only the
main tree, and `diff porcelain-before-r4.txt porcelain-after-r4.txt` was empty
(`PORCELAIN-UNCHANGED`). The porcelain was still empty after the gate.

## Swept existing re-read

`verified at c842952`:

- The rows fixed in round 4 cite only live checks: "failure modes: C2, C9, C15, C29, C30, C37" and
  "authorization: C1, C2, C3, C28, C29, C31, C32, C34, C35". None of them is superseded, and each
  one has a PASS row above.
- Observability is `existing - shared/errors.ts`, and the code is there:
  `apps/server/src/shared/errors.ts:53` `request.log.error({ err: error }, 'unhandled error')`, then
  `:56` `INTERNAL_ERROR` with `requestId`. C27 proves it end to end.
- Idempotency and concurrency are `n/a` (user-approved).

## Gate

I ran `pnpm lint && pnpm typecheck && pnpm test && pnpm build` at `c842952` in the real tree, and it
exited 0:

- lint checked 64 files, no fixes;
- typecheck OK;
- `Test Files 15 passed (15)`, `Tests 92 passed (92)`, 0 failed;
- build OK.

Tenant proofs: 43 passed, 0 failed. The porcelain was still empty afterwards.

Ranked gaps:

1. **AC 24 is not met for an `upsert` whose `where` names two tenants.** The call
   `db.example.upsert({ where: { id_organizationId: { id, organizationId: B }, organizationId: A }, create: { organizationId: B, … }, update: {…} })`
   passes the guard and creates the row in B (W3m on the real DB; G1 at the guard's own layer). The
   same `where` with the direct key first throws (G2).
   - Cause: `tenantOf` returns the first tenant key it meets
     (`apps/server/src/infrastructure/database.ts:78-84`). The comparison at `:271` checks only that
     one.
   - Impact: low. The `where` can match no row, so no existing row moves, links or is read, and the
     effect equals a plain `create` in B. It is still a hole in the letter of AC 24, and a guard
     whose result depends on key order.
   - Checks: no check or Coverage row names a `where` with two tenants, which is also a precision
     gap in AC 24/C36.
   - Likely fix: have `tenantOf` collect every tenant in the `where` and reject one that names more
     than one.
2. **Minor stale prose:** the `checks.md` `Test policy` `Cost:` line (`:200`) still cites the
   superseded C11.

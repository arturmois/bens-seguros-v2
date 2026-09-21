# Tenant guard verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 863b23e..2dd553a
**Round**: 3 - scoped
**Verifier**: independent sub-agent (author != verifier)

Summary: 28 of the 33 checks are proven at `2dd553a`, each with a located assertion. The other 5
(C11, C12, C13, C14, C25) are `SUPERSEDED`. The supersession is recorded in both `plan.md` and
`checks.md`, and a live check covers every member they held. All 5 injected faults were killed.
All ten round 2 cross-tenant paths (N1-N6, N14-N17, N23) and the three round 1 attacks are
**closed**: I re-ran each one on the real PostgreSQL at `2dd553a`. Each threw `TenantGuardError`,
and no row changed tenant. The gate is green (87 passed).

The verdict is still **FAIL**. The attack hunt found one path through the guard that still works,
and it reads data from other tenants.
`db.organization.findMany({ include: { _count: true } })` and
`db.organization.findMany({ select: { id: true, _count: true } })` pass the guard. They return the
`Example` count of **every** tenant in one call (observed: `[{A: {examples: 15}}, {B: {examples: 15}}]`).
AC 22 says that counting (`_count`) a tenant-scoped relation from a node without `organizationId`
SHALL throw. The guard only walks the `_count: { select: { … } }` form (`database.ts:168-176`).
C31 proves only that form, so the table hid the gap. The `createTenantGuard` `Test policy` row is
also still unmet. Two decision rows have no asserted case at the guard's own layer: boolean
`_count`, and recursion into a non-tenant target through `create`, `createMany`, `upsert` and
`connectOrCreate`.

Scope of this round (per verify.md "Re-verifying after a fix"): the fix diff `589e117..2dd553a`
(`a3bf6a1` specs; `2dd553a` `database.ts` +83/-30 and `database.spec.ts` +181/-103), plus every
non-PASS verdict from round 2:

- the ten N paths;
- the AC 9/10 wording gap;
- the unmet `Test policy` row, including `Unknown model`;
- the unguarded `upsert.create` gap;
- the `Organization` include read;
- the P2011 note.

Each section says whether it was `verified at 2dd553a` or `carried from 589e117`.

## Binding sources

`verified at 2dd553a` for ADR-004 and §7, because round 3 changed what they promise to hold. §5
is `carried from 589e117`. No commit in `589e117..2dd553a` touches `docs/`.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-004-tenant-isolation.md` (layer 3 guard, line 18; layer 4 composite FK "para que o banco rejeite referências cruzadas", line 19; threat "vazamento entre tenants … referência cruzada", line 24) | yes - re-read lines 1-40 at 2dd553a | none | - (layer 4 now holds for writes: nested relation writes are refused by the guard, and scalar `parentId` from B gives `P2003`, as probes W1, W4 and W5 show on the real DB. The remaining read leak is a failure of the code against AC 22, which the plan already states, so it is recorded under Coverage rather than as a gap in the source) |
| `docs/architecture.md` §7 "Isolamento de tenant (ADR-004)" (line 327; item 5 "Referências vindas do input são carregadas com escopo antes do uso") | yes - re-read lines 327-336 at 2dd553a | none | - |
| `docs/architecture.md` §5 "Jobs e crons" (line 233) | yes - carried from 589e117 | none | - |

These are not UI sources, so there is no screen or arrangement to enumerate.

## Checks

`verified at 2dd553a`. All proofs ran in one batched invocation in the real tree:

`cd apps/server && pnpm exec vitest run src/infrastructure/database.spec.ts src/app.spec.ts test/schema.spec.ts --reporter=verbose`
exited 0 with `Test Files 3 passed (3)` and `Tests 38 passed (38)`. Every proof named below
appears as its own `✓` line in that output.

Existence (`rg -n "it\('"`), hits for the new tests C28-C33:

- `database.spec.ts:549 it('rejects every nested write into a tenant-scoped relation'` (C28)
- `:224 it('rejects the round 2 cross-tenant paths and moves no row'` (C29)
- `:292 it('links rows only through the scalar foreign key'` (C30)
- `:590 it('rejects reading tenant-scoped relations through unguarded models'` (C31)
- `:309 it('rejects cross-tenant reads through Organization on the client'` (C32)
- `:629 it('fails closed on an unknown model'` (C33)

The five superseded tests are gone on purpose. `rg -n` for their names (`checks connect and set at every nested position`,
`checks connects inside nested creates`, `rejects a nested connect to a tenant-scoped row`,
`does not find a foreign row`, `checks connectOrCreate at every nested position`) returns no hits.
The fix shifted every line in `database.spec.ts`, so all citations below were refreshed.
`app.spec.ts` and `test/schema.spec.ts` are not in the fix diff, and their lines are unchanged.

**Supersession check.** C11, C12, C13, C14 and C25 are marked superseded in `checks.md` (the
lines that carry "substituído na rodada 3 (aprovado pelo usuário)"). Their ACs 9, 10 and 11 are
marked "substituído pelo critério 20 na rodada 3 (aprovado pelo usuário)" in `plan.md`. Each
member they covered now has a live check:

- The old nested positions (`items.create`, `items.createMany.data`, `items.update`,
  `items.upsert.create`, `items.upsert.update`, `items.connectOrCreate.create`, each wrapping
  `product.connect`/`set`/`connectOrCreate`) all start with a nested op into the tenant-scoped
  `items`. C28 asserts each of those outer ops (`create`, `createMany`, `update`, `upsert`,
  `connectOrCreate`) at `tenant update.data` (`spec:568`, `:585`).
- The DB-level `connect` of C13 and C14 is now refused before SQL. C29 covers it (`spec:236`,
  `:285`), and so does probe N1.

So each of the five counts as `SUPERSEDED`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | 13 where-ops without `organizationId` throw in the guard | `✓ createTenantGuard (decision table) > rejects every where-operation without organizationId` exit 0 | `apps/server/src/infrastructure/database.spec.ts:386-388` - `expect(() => guard('Invoice', operation, { where: { id: 'i' } }), operation).toThrow(TenantGuardError)` over `WHERE_OPERATIONS` (:39-53); `:390-393` `.not.toThrow()` with the tenant | PASS |
| C2 | same 13 through `db` throw; rows unchanged | `✓ tenant guard on the database client > rejects every where-operation on the client and changes no rows` exit 0 | `apps/server/src/infrastructure/database.spec.ts:100` - `await expect(calls[operation](), operation).rejects.toThrow(TenantGuardError)`; `:104-105` - `expect(after).toHaveLength(before.length)` / `expect(after.map((row) => row.name)).toEqual(before.map((row) => row.name))` | PASS |
| C3 | tenant filter (direct or `id_organizationId`) returns only tenant rows | `✓ ... returns only the tenant rows when organizationId is present` exit 0 | `apps/server/src/infrastructure/database.spec.ts:118` - `expect(fromB).toBeNull()`; `:119` - `expect(fromA?.id).toBe(example.id)` | PASS |
| C4 | 6 non-literal shapes rejected, 2 accepted | `✓ ... accepts only a literal organizationId filter` exit 0 | `apps/server/src/infrastructure/database.spec.ts:407` - `expect(() => guard('Invoice', 'findMany', { where }), shape).toThrow(TenantGuardError)` over the 6 shapes at :398-405; `:410`, `:411-415` `.not.toThrow()` | PASS |
| C5 | 3 create ops reject a row missing `organizationId` | `✓ ... rejects every create operation with a row missing organizationId` exit 0 | `apps/server/src/infrastructure/database.spec.ts:424` - `expect(() => guard('Invoice', operation, { data: bad }), operation).toThrow(TenantGuardError)` with `bad = [{ organizationId: org }, { name: 'x' }]` (:421) | PASS |
| C6 | `upsert` needs the tenant in `where` and in `create` | `✓ ... requires the tenant on both sides of an upsert` exit 0 | `apps/server/src/infrastructure/database.spec.ts:430-432` - `guard('Invoice', 'upsert', { where: { id: 'i' }, create: { organizationId: org } })).toThrow(TenantGuardError)`; `:433-435` - `.toThrow(/upsert without create.organizationId/)` | PASS |
| C7 | unknown ops fail closed citing `is not supported` | `✓ ... fails closed on an unknown operation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:447-450` - `expect(() => guard('Invoice', operation, { where: { organizationId: org } }), operation).toThrow(/is not supported/)` | PASS |
| C8 | 4 update paths setting scalar `organizationId` throw | `✓ ... never moves a row to another tenant` exit 0 | `apps/server/src/infrastructure/database.spec.ts:457-460` - `guard('Invoice', operation, { where, data: { organizationId: other } })).toThrow(TenantGuardError)`; `:462-468` upsert `update: { organizationId: other }` `.toThrow(TenantGuardError)` | PASS |
| C9 | `updateMany` A→B on `db` throws; rows stay in A | `✓ ... rejects moving rows between tenants on the client` exit 0 | `apps/server/src/infrastructure/database.spec.ts:131` - `.rejects.toThrow(TenantGuardError)`; `:135` - `expect(after.every((row) => row.organizationId === tenantA.organizationId)).toBe(true)` | PASS |
| C10 | `Organization` passes without where-validation | `✓ ... leaves models without organizationId alone` exit 0 | `apps/server/src/infrastructure/database.spec.ts:336` - `await expect(deps.db.organization.findMany({ take: 1 })).resolves.toBeInstanceOf(Array)` | PASS |
| C11 | `connect`/`set` without tenant at 6 nested positions (AC 9) | superseded - test removed (`rg` no hit) | replaced by C28 `spec:585` (every nested op into a tenant-scoped relation throws, even with the own tenant) and C30; recorded in `plan.md` AC 9 and `checks.md` C11 | SUPERSEDED |
| C12 | `connectOrCreate` without tenant throws citing `connectOrCreate on` (AC 10) | superseded - test removed (`rg` no hit) | replaced by C28 (`connectOrCreate` at `spec:552`, asserted at `:585`); recorded in `plan.md` AC 10 and `checks.md` C12 | SUPERSEDED |
| C13 | `db` nested connect without tenant throws with the old message (AC 9) | superseded - test removed (`rg` no hit) | replaced by C29 `spec:236`, `:285` (`parent.connect` via `db` rejects); recorded in `checks.md` C13 and Handoff "C13 superseded by C29" | SUPERSEDED |
| C14 | tenant-filtered connect to a B row → `P2025` (AC 11) | superseded - test removed (`rg` no hit) | the connect never reaches the DB now: C29 `spec:285`; cross-tenant link rejected by the DB via scalar FK: C30 `spec:305`; recorded in `plan.md` AC 11 and `checks.md` C14 | SUPERSEDED |
| C15 | scalar `parentId` from B → `P2003`, nothing created | `✓ ... lets the composite foreign key reject a parent id from another tenant` exit 0 | `apps/server/src/infrastructure/database.spec.ts:165` - `expect(error).toMatchObject({ code: 'P2003' })`; `:169` - `expect(created).toBeNull()` | PASS |
| C16 | include under tenant filter returns only A's children + A's org; root guarded | `✓ ... allows include of relations under a tenant filter and still guards the root` exit 0 | `apps/server/src/infrastructure/database.spec.ts:147` - `expect(loaded?.children.map((child) => child.name)).toEqual(['child-1'])`; `:151` - `expect(loaded?.organization.id).toBe(tenantA.organizationId)`; `:152-154` `.rejects.toThrow(TenantGuardError)` | PASS |
| C17 | `tx` guarded; with tenant returns rows | `✓ ... guards the transaction client too` exit 0 | `apps/server/src/infrastructure/database.spec.ts:325-327` - `deps.db.$transaction(async (tx) => tx.example.findMany({ where: { name: 'x' } }))).rejects.toThrow(TenantGuardError)`; `:332` - `expect(found.length).toBeGreaterThan(0)` | PASS |
| C18 | `readModels` fails closed; classifies Example/Organization; maps `parent` | `✓ ... reads the model classification from the Prisma runtime and fails closed` exit 0 | `apps/server/src/infrastructure/database.spec.ts:340-341` - `expect(() => readModels({})).toThrow()` / `...{ models: 'unexpected' } })).toThrow()`; `:344-346` - `tenantScoped).toBe(true)`, `.toBe(false)`, `relations.get('parent')).toBe('Example')` | PASS |
| C19 | schema test passes on the real schema and flags `Item.product` | `✓ tenant-scoped relations > every relation between tenant-scoped models uses a composite foreign key` and `✓ ... flags a relation between tenant-scoped models without organizationId` exit 0 | `apps/server/test/schema.spec.ts:60` - `expect(findSimpleTenantRelations(schema)).toEqual([])`; `:89` - `expect(findSimpleTenantRelations(schema)).toEqual(['Item.product'])` (carried from 589e117, file unchanged) | PASS |
| C20 | tenant relation write throws on 4 update paths + nested update, for 6 ops | `✓ createTenantGuard (decision table) > never writes the tenant relation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:484-487` - `expect(() => guard('Invoice', path, { where, data: { organization } }), ...).toThrow(TenantGuardError)`; `:489-497` upsert.update; `:498-505` nested `items.update.data.organization`; 6 ops at :473-480 | PASS |
| C21 | `db` update/upsert via `organization.connect` B throw; row stays in A | `✓ tenant guard on the database client > rejects moving a row through the organization relation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:177` - `await expect(deps.db.example.update({ where, data: toB })).rejects.toThrow(TenantGuardError)`; `:178-184` upsert `.rejects.toThrow(TenantGuardError)`; `:187` - `expect(reloaded?.organizationId).toBe(tenantA.organizationId)` | PASS |
| C22 | unguarded model writing a tenant-scoped relation throws for 11 nested ops in create/update/upsert; scalar update passes | `✓ ... rejects nested writes into tenant-scoped relations from unguarded models` exit 0 | `apps/server/src/infrastructure/database.spec.ts:525-528` create, `:529-532` update, `:533-541` upsert `.toThrow(TenantGuardError)`; ops :510-522; `:544-546` - `guard('Organization', 'update', { where: { id: org }, data: { name: 'Nova' } })).not.toThrow()` | PASS |
| C23 | `db` `organization.update ... examples.connect rowOfB` throws; row stays in B | `✓ ... rejects moving rows into an organization through its relation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:193-198` - `deps.db.organization.update({ where: { id: tenantA.organizationId }, data: { examples: { connect: { id: rowOfB.id } } } })).rejects.toThrow(TenantGuardError)`; `:203` - `expect(reloaded?.organizationId).toBe(tenantB.organizationId)` | PASS |
| C24 | unreachable-DB client rejects 13 ops with `TenantGuardError`, never a connection error | `✓ ... rejects before sending any SQL` exit 0 | `apps/server/src/infrastructure/database.spec.ts:89` - `expect(error, operation).toBeInstanceOf(TenantGuardError)` over 13 ops (:87-90), client `createDatabase('postgresql://guard:guard@127.0.0.1:1/unreachable')` (:84) | PASS |
| C25 | `connectOrCreate` without tenant at 6 nested positions (AC 10) | superseded - test removed (`rg` no hit) | replaced by C28 (`connectOrCreate` into tenant-scoped relation throws at every position, `spec:552`, `:585`); recorded in `plan.md` AC 10 and `checks.md` C25 | SUPERSEDED |
| C26 | `select` of relation under A filter returns exactly `[{ name: 'child-s', organizationId: A }]`; root guarded | `✓ ... allows select of relations under a tenant filter` exit 0 | `apps/server/src/infrastructure/database.spec.ts:215` - `expect(loaded?.children).toEqual([{ name: 'child-s', organizationId: tenantA.organizationId }])`; `:216-221` `.rejects.toThrow(TenantGuardError)` | PASS |
| C27 | guard violation through a route → generic `500` + `requestId` = header, no `organizationId` | `✓ src/app.spec.ts > error handler > surfaces a tenant guard violation as a generic 500` exit 0 | `apps/server/src/app.spec.ts:131` - `expect(res.statusCode).toBe(500)`; `:132-138` - `expect(res.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.', details: { requestId: res.headers['x-request-id'] } } })`; `:139` - `expect(res.body).not.toContain('organizationId')` | PASS |
| C28 | 11 nested ops into a tenant-scoped relation throw at 7 positions, even with the own tenant | `✓ createTenantGuard (decision table) > rejects every nested write into a tenant-scoped relation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:585` - `expect(call(write), \`${position} ${operation}\`).toThrow(TenantGuardError)`; `write = { [operation]: { id: 'x', organizationId: org } }` (:583, own tenant); ops :550-562; positions :565-579 | PASS |
| C29 | via `db`, the 10 round 2 paths throw; A's and B's ids unchanged | `✓ tenant guard on the database client > rejects the round 2 cross-tenant paths and moves no row` exit 0 | `apps/server/src/infrastructure/database.spec.ts:285` - `await expect(call(), path).rejects.toThrow(TenantGuardError)` over the 10 paths at :234-282; `:288` - `expect((await examplesOf(tenantA)).map((row) => row.id)).toEqual(beforeA)`; `:289` same for B | PASS |
| C30 | scalar `parentId` within A links; from B → `P2003`, `parentId` unchanged | `✓ ... links rows only through the scalar foreign key` exit 0 | `apps/server/src/infrastructure/database.spec.ts:299` - `expect(linked.parentId).toBe(parentA.id)`; `:305` - `expect(error).toMatchObject({ code: 'P2003' })`; `:306` - `expect((await deps.db.example.findUnique({ where }))?.parentId).toBe(parentA.id)` | PASS |
| C31 | from an unguarded model/node: include, select, `_count.select`, where (direct, some, AND/OR/NOT), orderBy throw; allowed shapes pass | `✓ createTenantGuard (decision table) > rejects reading tenant-scoped relations through unguarded models` exit 0 | `apps/server/src/infrastructure/database.spec.ts:615` - `expect(() => guard(model, operation, args), label).toThrow(TenantGuardError)` over the 10 labels at :592-611; `:618-626` `.not.toThrow()` for `Invoice` include under tenant and `Organization` scalar read. As written the claim names only `_count.select`, and that is what is proven; see Coverage for `_count: true` | PASS |
| C32 | via `db`: `organization.findMany include examples`, `where examples.some`, and `example include organization.include.examples` throw | `✓ ... rejects cross-tenant reads through Organization on the client` exit 0 | `apps/server/src/infrastructure/database.spec.ts:310-312` - `await expect(deps.db.organization.findMany({ include: { examples: true } })).rejects.toThrow(TenantGuardError)`; `:313-315` where `.rejects.toThrow(TenantGuardError)`; `:316-321` nested include `.rejects.toThrow(TenantGuardError)` | PASS |
| C33 | unknown model fails closed citing `Unknown model` | `✓ createTenantGuard (decision table) > fails closed on an unknown model` exit 0 | `apps/server/src/infrastructure/database.spec.ts:630-632` - `expect(() => guard('Ghost', 'findMany', { where: { organizationId: org } })).toThrow(/Unknown model/)` | PASS |

Level and precision findings, `verified at 2dd553a`:

- **Round 2 precision gap AC 9/10: closed by supersession.** AC 20 forbids every nested write into
  a tenant-scoped relation, whatever `organizationId` it carries. C28 fixes the root's own tenant
  in the payload (`spec:583`). On the real DB, probe N-own (`parent.connect` with tenant A) is also
  refused.
- **Round 2 precision gap AC 7 (nested scalar `organizationId`): closed.** No nested write into
  `Example` exists any more (C28, C29, and N3, N5, N6 on the DB).
- **New precision gap: C31 vs AC 22.** AC 22 says "conta (`_count`)" with no qualifier. C31 names
  and tests only `_count: { select: { rel: true } }` (`spec:594`). Prisma also accepts
  `_count: true`, which counts every relation. The guard lets it through, and on the real DB it
  returns other tenants' counts (Coverage, H1/H2).

## Coverage

`verified at 2dd553a` for every row whose authority the fix touched (C28-C33, the rows that list
superseded checks, the round 2 non-PASS rows). The rest are `carried from 589e117`.

**Attack sweep against the real database** (throwaway `src/probe.spec.ts` in a scratch worktree
at `2dd553a`, tenants from `withTwoTenants`, each row's `organizationId`/`parentId` read back with
raw SQL after the call):

| # | Attack | Guard | Result on the real DB |
| --- | --- | --- | --- |
| R1-1 | `example.update(A-row, data.organization.connect B)` | `TenantGuardError` (`must not write the tenant relation`) | row stays in A - closed |
| R1-2 | `example.upsert(A-row, update.organization.connect B)` | `TenantGuardError` | row stays in A - closed |
| R1-3 | `organization.update(A, examples.connect rowOfB)` | `TenantGuardError` (`nested writes into Example are not allowed`) | rowOfB stays in B - closed |
| N1 | `example.update(A-row, parent.connect { id: rowB, organizationId: B })` | `TenantGuardError` | rowA=A, rowB=B - closed |
| N2 | `parent.connect { id_organizationId: { rowB, B } }` | `TenantGuardError` | unchanged - closed |
| N3 | `parent.create { organizationId: B }` | `TenantGuardError` | unchanged - closed |
| N4 | `parent.connectOrCreate` where B | `TenantGuardError` | unchanged - closed |
| N5 | `parent.upsert` create/update `organizationId: B` | `TenantGuardError` | unchanged - closed |
| N6 | `child.update(parent.update { organizationId: B })` | `TenantGuardError` | parent=A, child=A - closed (no cascade) |
| N14 | `children.connect rowB` | `TenantGuardError` | rowB stays in B - closed |
| N15 | `children.set [rowB]` | `TenantGuardError` | closed |
| N16 | `children.connectOrCreate rowB` | `TenantGuardError` | closed |
| N17 | `example.create(A, children.connect rowB)` | `TenantGuardError` | closed |
| N23 | `example.upsert(create.children.connect rowB)` | `TenantGuardError` | closed |
| N-own | `parent.connect { id, organizationId: A }` (own tenant, AC 20) | `TenantGuardError` | closed |
| N12 | `parent.disconnect` | `TenantGuardError` (the round 2 `P2011` note is moot: the guard refuses before SQL) | child unchanged |
| N19 / N20 / N20c | `organization.create examples.create` / `organization.upsert` `update.examples.connect` / `create.examples.connect` (round 2 gap 4) | `TenantGuardError` each | rowB stays in B - closed |
| READ-R2 | `organization.findMany({ include: { examples: true } })` | `TenantGuardError` | closed |
| H18b | interactive `$transaction` → `tx.example.update(parent.connect rowB)` | `TenantGuardError` | closed |
| W1 / W4 / W5 | scalar `parentId` = rowOfB in `update` / `create` / `createMany` | passes guard | Prisma `P2003` (`Example_parentId_organizationId_fkey`), nothing linked |
| W2 | `updateMany data.organizationId { set: B }` | `TenantGuardError` | row stays in A |
| W6 / W7 | `organization.update examples.updateMany` / `example.update organization.update` | `TenantGuardError` | closed |
| W8 | `organization.update(B, data.id = A)` | passes guard (Organization unguarded, out of scope) | Prisma `P2002` |
| H3c / H10 / H10b | `organization.findUnique/update/deleteMany` with `where.examples.some` | `TenantGuardError` | closed |
| H4 / H4b | fluent `organization.findUnique({id:B}).examples()` / `example(A).organization().examples()` | `TenantGuardError` (Prisma hands the guard `select.examples`) | closed |
| H5 / H6 / H6b | `include._count.select.examples` / `orderBy examples._count` (single and array) | `TenantGuardError` | closed |
| H7 / H8 / H8b / H9 | `aggregate` / `count` / `count NOT[…]` / `groupBy` with `where.examples` | `TenantGuardError` | closed |
| H14 / H14b / H14c | `example(A)` where `organization.is.examples`, `organization.examples`, `include.children.where.organization.examples` | `TenantGuardError` | closed |
| H15 / H16 | `createManyAndReturn include organization.include.examples` / `updateManyAndReturn select organization.select.examples` | `TenantGuardError` | closed |
| H17 / H18 | batch `$transaction([organization include examples])` / interactive tx `organization where examples` | `TenantGuardError` | closed |
| H19 / H20 | `organization include examples { where organizationId B }` / `select examples` | `TenantGuardError` | closed |
| H3a / H3b / H13 | `cursor` with a relation filter (`organization cursor {id:B, examples.some}`; `example cursor … organization.examples`) | passes guard | Prisma rejects (`Unable to resolve field examples/organization`) - not exposed |
| H9b / H9c | `organization.groupBy having` (scalar) / `distinct` | passes | scalar only, no tenant data |
| **H1** | **`db.organization.findMany({ where: { id: { in: [A, B] } }, include: { _count: true } })`** | **passes** | **returned `[{"org":"A","_count":{"examples":15}},{"org":"B","_count":{"examples":15}}]` - counts of both tenants' rows in one call** |
| **H2** | **`db.organization.findMany({ where: { id: B }, select: { id: true, _count: true } })`** | **passes** | **returned `[{"org":"B","_count":{"examples":15}}]` - tenant B's row count read without a tenant filter** |
| H11 | `example.findFirst(A, include: { organization: { include: { _count: true } } })` | passes | returns A's own org count (same tenant, but it breaks the AC 22 letter: a count through a node without `organizationId`) |
| H12 | `example.findFirst(A, include: { _count: { select: { children: { where: { organization: { examples: { some: … } } } } } } })` | passes | `_count.children: 0`; a filter through `Organization` on `examples` that the guard never walks. Same tenant in this schema, but AC 22 "filtra … por relação tenant-scoped" at a node without `organizationId` is not enforced there |
| W3 | `example.upsert(where {id, organizationId: A} (miss), create { organizationId: B })` | passes | new row created in **B** (not a move, link or read; see note) |

A guard-level probe (`createTenantGuard` with the `Invoice/Item/User` table used by the spec) at
`2dd553a` confirmed that `guard('User', 'findMany', { include: { _count: true } })` and
`{ select: { _count: true } }` pass. It also confirmed that the recursion under an unguarded node
does reject correctly for `owner.create`, `owner.createMany.data`, `owner.upsert.create` and
`owner.connectOrCreate.create`. Cause of H1/H2/H11: `checkProjection`
(`apps/server/src/infrastructure/database.ts:168-176`) reads `value.select` only when
`value` is a record. For `_count: true`, `counted` is `undefined`, so the loop `continue`s without
an `assertReadable`. Cause of H12: the same branch checks only the keys of `_count.select`
(`:171-173`). It never passes their values (`{ where }`) to `checkReads`/`checkRelationFilter`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| where-operations (13) | carried from 589e117 (Prisma TypeMap) | C1 (`spec:386`) · C2 (`spec:100`) · C24 (`spec:89`) | - |
| create operations (3) | carried from 589e117 | C5 | - |
| `upsert` sides (2) | code `database.ts:240`, `:253` | `where` C6 · `create` C6 | - |
| total known ops (17) vs code | `database.ts:10-26` (unchanged) | exact; anything else → `:237-238` → C7 | - |
| rejected / accepted filter shapes (6 / 2) | carried from 589e117 | C4 / C3, C4 | - |
| unknown operations (3) | carried from 589e117 | C7 | - |
| updates that change the tenant (4) | code `database.ts:245-250` | C8, C9 (W2 on DB) | - |
| paths that change a row's tenant (round 2 unproven row) - verified at 2dd553a | the 10 round 2 paths + N-own + N6 cascade | all: C29 (`spec:234-285`), C28; each re-run on the DB above and closed | - |
| old nested positions (6) - lists superseded C11 | round 2 test positions (`589e117:database.spec.ts:401-414`) | each wraps a nested op into tenant-scoped `items`: `create`, `createMany`, `update`, `upsert`(×2), `connectOrCreate` → C28 at `tenant update.data` (`spec:568`, `:585`) | - |
| nested reference ops (3) - lists superseded C11, C12 | plan AC 20 | `connect` C28, C29 · `set` C28, C29 · `connectOrCreate` C28, C29 | - |
| DB errors on a cross-tenant reference - lists superseded C14 | plan AC 12, AC 21 | `P2003` C15 (`spec:165`), C30 (`spec:305`); `P2025` retired (the connect is refused before SQL, C29) | - |
| `connectOrCreate` by position (6) - lists superseded C25 | round 2 test positions (`589e117:spec:524-537`) | C28 (`connectOrCreate` op at every position) | - |
| forbidden nested ops (11) | plan AC 20; code `database.ts:110-114` (any key of a record under a tenant-scoped relation) | C28, 11 × 7 (`spec:550-562`, `:585`) | - |
| nested-write positions (code branches of `checkNestedWrites` and its callers) | code: top-level callers `database.ts:217`, `:219`, `:220`, `:233`, `:256`, `:257`, `:260`; recursion into a non-tenant target `:121` (create), `:123` (createMany.data), `:128` (update), `:132-133` (upsert create/update), `:137` (connectOrCreate.create) | tenant `create.data` (`:233`) C28 · tenant `update.data` (`:260`) C28 · tenant `upsert.create`/`upsert.update` (`:256-257`) C28 · unguarded `data` (`:217`) C22, C28 · unguarded `upsert.create`/`update` (`:219-220`) C28 (`spec:575-576`), C22 · recursion via `update` (`:128`) C28 "under an unguarded node" (`spec:577-578`) | recursion into a non-tenant target via `create` (`:121`), `createMany.data` (`:123`), `upsert.create`/`upsert.update` (`:132-133`), `connectOrCreate.create` (`:137`): no asserted case. The code rejects them (guard-level probe above), but a regression in any of those four branches would pass the suite. The row in `checks.md` gives "sob nó sem tenant" as one member proven by a single `update` case |
| round 2 paths (10) | plan AC 20 + round 2 report | C29 table-driven over 10 (`spec:234-282`) | - |
| scalar FK link (2) | plan AC 21 | same tenant C30 (`spec:299`) · other tenant `P2003` C30 (`spec:305`), C15 | - |
| reads through a node without the tenant (AC 22) | plan AC 22 ("inclui, seleciona, conta (`_count`), filtra (`where`, … `AND`/`OR`/`NOT`) ou ordena (`orderBy`)"); Prisma read args (`include`, `select`, `_count` as `true` or `{ select }`, `where`, `orderBy`, `cursor`, fluent); code `database.ts:147-208` | `include` C31, C32 · `select` C31 · `_count: { select: { rel } }` C31 (`spec:594`) · `where` direct/`some`/`AND`/`OR`/`NOT` C31, C32 · `orderBy` C31 · via an unguarded node inside include/select C31, C32 · `cursor`: Prisma rejects relation fields (H3, H13), so it needs no proof · fluent: reduced by Prisma to `select` (H4) | **`_count: true` in `include` or `select`**: no check, no rejection in code (`database.ts:168-176`), and on the real DB it returns other tenants' counts (H1, H2) and counts through a node without `organizationId` (H11). **`_count.select.<rel>.where`** filtering through a node without `organizationId`: not walked (`:171-173`), passes (H12) |
| unknown model (1) | plan AC 23; code `database.ts:92` | C33 (`spec:630-632`) | - |
| application clients (2) | plan AC 14 | `db` C2 · `tx` C17 (H18b, H18 also on the DB) | - |
| model classification (2) | carried from 589e117 | C10, C18 | - |
| fail-closed metadata doors (2) | carried from 589e117 (`database.ts:52`, called at `:280`) | C18 | - |
| "no SQL" of AC 1 (13) | plan AC 1 | C24 | - |
| error surface (Flow hop 4) (1) | carried from 589e117 (`shared/errors.ts:53-56`) | C27 | - |
| startup config: guard install (3 assemblies) | carried from 589e117 (`server.ts:19`, `test/app.ts:27`, `scripts/export-openapi.ts:18` → `dependencies.ts:18`) | C2 via `test/app.ts`; the others share `createDependencies` | - |
| plan one-way doors (6, incl. round 3 "vínculo só por FK escalar") | plan `Landing` | single extension `database.ts:282-292` C2, C17, C24 · runtime datamodel C18 · scalar-FK-only link C28, C29, C30 · create only by scalar C5 · `TENANT_ROOT` `database.ts:7`, `:115` C20, C21 · composite FK C15, C19, C30 | - |

Notes (not counted as Unproven members):

- **W3: an `upsert` can create in another tenant.** The `where` names A and the `create` names B.
  When nothing matches, the new row lands in B. AC 5 asks only for "`create.organizationId`
  string", so this is within the letter. It is a create, not a move, link or read, and a plain
  `create({ organizationId: B })` has the same property, because the guard does not know `ctx`.
  A guard that compares `where.organizationId` with `create.organizationId` would close it
  cheaply. This is a plan precision observation.
- **Detaching a parent.** `parent.disconnect` is now refused by the guard. The scalar way
  (`data: { parentId: null }`) was not probed in this round.
- **Stale prose in `checks.md`.** The `Swept` rows "failure modes" and "authorization" still cite
  the superseded C11, C13 and C14. The Coverage footnote still cites C14 `P2025`. The
  replacements (C28-C30) are live, so no member is lost.

## Test policy rows

`verified at 2dd553a` (both rows in `checks.md` re-judged; the fix touched `database.ts`).

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary - `createTenantGuard` | `apps/server/src/infrastructure/database.ts:89-262` | boundary C2, C9, C16, C17, C21, C23, C24, C26, C27, C29, C30, C32 · own layer C1, C4-C8, C20, C22, C28, C31, C33 | no - gap: round 2's missing `Unknown model` row is now asserted (C33 `spec:630`). Round 2's "another tenant's filter" row is retired by AC 20, and C28 fixes the own tenant (`spec:583`). Two decision rows still have no asserted case at the guard's own layer. (a) `_count` given as a boolean (`database.ts:169`: `isRecord(value) ? value.select : undefined`): no test, and the branch falls open (H1/H2 on the DB). (b) Recursion into a non-tenant target via `create`/`createMany`/`upsert`/`connectOrCreate` (`:121`, `:123`, `:132-133`, `:137`): only the `update` recursion (`:128`) is asserted (`spec:577-578`) |
| Decides, reached across a boundary - `readModels` | `apps/server/src/infrastructure/database.ts:51-65` | boundary C18 (real client, `spec:343-346`) · own layer C18 (fakes, `spec:340-341`) | yes - carried from 589e117; lines 51-65 are not in the fix diff |
| Instrumentation, pass-throughs - `createDatabase` / extension | `apps/server/src/infrastructure/database.ts:272-293` | none of its own; covered by C2, C17, C24 | yes - verified at 2dd553a (not in the fix diff; C24 still proves guard → `query` order) |

## Faults injected

`verified at 2dd553a`. Isolation: the real tree's `git status --porcelain` baseline was empty
(saved to the scratchpad as `porcelain-before.txt`). Scratch:
`git worktree add <scratchpad>/wt3 HEAD`, then `pnpm install --frozen-lockfile`. The probe
specs were deleted before the faults, and the scratch porcelain was empty. Each fault was one
`sed` on `apps/server/src/infrastructure/database.ts`. Only its narrowest proof(s) ran with
`-t`, and then `git checkout -- <file>` restored the file.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 - nested-write prohibition `if (modelInfo(target).tenantScoped) {` → `if (false) {` | `apps/server/src/infrastructure/database.ts:110` | yes - `× rejects every nested write into a tenant-scoped relation` (C28) and `× rejects the round 2 cross-tenant paths and moves no row` (C29) |
| F2 - `TENANT_ROOT` branch `if (tenantScoped && target === TENANT_ROOT) {` → `if (false) {` | `apps/server/src/infrastructure/database.ts:115` | yes - `× never writes the tenant relation` (C20) and `× rejects moving a row through the organization relation` (C21) |
| F3 - `checkReads(model, args, …)` call at guard entry removed | `apps/server/src/infrastructure/database.ts:213` | yes - `× rejects reading tenant-scoped relations through unguarded models` (C31) and `× rejects cross-tenant reads through Organization on the client` (C32) |
| F4 - `checkRelationFilter` AND/OR/NOT recursion replaced by nothing (the key then falls through as a non-relation) | `apps/server/src/infrastructure/database.ts:193` | yes - C31 fails at label `where AND` (`AssertionError: where AND`) |
| F5 - `_count` branch: `if (target) assertReadable(…)` → `void target` | `apps/server/src/infrastructure/database.ts:173` | yes - C31 fails at label `_count` (`AssertionError: _count`) |

The 5-fault cap was reached. `checkProjection`'s relation branch (`:180`) and the operator
mapping in `checkRelationFilter` (`:201-204`) were not mutated separately. F3 disables both, and
C31/C32 caught it. The recursion branches `:121`, `:123`, `:132-133`, `:137` were not mutated.
From the spec they have no asserting case (Coverage, Test policy), so a mutant there is expected
to survive.

Discard: `git worktree remove --force <scratchpad>/wt3`. `git worktree list` then showed only the
main tree, and `diff porcelain-before.txt porcelain-after.txt` was empty (`PORCELAIN-UNCHANGED`).

## Swept existing re-read

`verified at 2dd553a`. Observability is `existing - shared/errors.ts`, and the code is there:
`apps/server/src/shared/errors.ts:53` `request.log.error({ err: error }, 'unhandled error')`, then
status 500 with `requestId`. C27 proves it end to end. Idempotency and concurrency are `n/a`
(user-approved).

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` at `2dd553a` (real tree): exit 0. Lint
checked 64 files, typecheck OK, `Test Files 15 passed (15)`, `Tests 87 passed (87)`, 0 failed,
build OK. Tenant proofs: 38 passed, 0 failed. Porcelain still empty afterwards.

Ranked gaps:

1. **Cross-tenant read through `_count: true` (AC 22).**
   `db.organization.findMany({ include: { _count: true } })` and
   `{ select: { _count: true } }` pass the guard. On the real DB they return the `Example` count
   of every tenant in one call (H1: A=15, B=15; H2: B=15). The same shape counts through a node
   without `organizationId` from a tenant root (H11). Cause:
   `apps/server/src/infrastructure/database.ts:168-176`, where boolean `_count` never reaches
   `assertReadable`. C31 names only `_count.select` (`database.spec.ts:594`), so this is also a
   precision gap in the check against AC 22.
2. **`Test policy` row for `createTenantGuard` is unmet.** No own-layer case for boolean `_count`.
   None for the recursion into a non-tenant target via `create`, `createMany.data`,
   `upsert.create`/`update` and `connectOrCreate.create` (`database.ts:121`, `:123`, `:132-133`,
   `:137`). Only `update` (`:128`) is asserted (`database.spec.ts:577-578`). The code rejects all
   four today (guard-level probe), but no test would catch a regression.
3. **AC 22 letter: `_count.select.<rel>.where` is not walked.** A filter through `Organization` on
   `examples` inside a `_count.select` passes (H12,
   `apps/server/src/infrastructure/database.ts:171-173`). In the current schema that path reaches
   only the root's own tenant, so no data leaks yet. From a future non-tenant model with a
   non-tenant relation, it would be a filter oracle.
4. **Plan precision (note, not an AC failure):** `upsert` whose `where` names A and whose `create`
   names B creates the row in B (W3). The prose in `checks.md` `Swept` and Coverage footnotes
   still cites the superseded C11, C13 and C14.

# Tenant guard verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 863b23e..589e117
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Summary: all 27 checks are proven at `589e117`, each with a located assertion. All 5 injected
faults were killed. The three round 1 attacks are now closed: the guard rejects each one against
the real database. The verdict is still **FAIL**, because the attack sweep found **nine** other
relation shapes that move a row across tenants at `589e117`, with no error, against the real
PostgreSQL. They go through the tenant-scoped self-relation (`parent` / `children`). The guard
accepts **any** string as `organizationId` in a nested `connect`/`set`/`connectOrCreate` where.
It never compares that value with the root's tenant. It also never looks at the `organizationId`
scalar inside a nested `create`/`update`/`upsert`. And the composite FK
`(parentId, organizationId)` makes Prisma rewrite the row's own `organizationId` when it links
the row. This breaks AC 7 ("uma linha nunca muda de tenant"), the S2 goal ("Um id vindo do input
não liga uma linha a outra corretora"), and ADR-004 layer 4 ("para que o banco rejeite
referências cruzadas"). The `Test policy` row for `createTenantGuard` is also still unmet.

Scope of this round (per verify.md "Re-verifying after a fix"): the fix diff `5ea8d8c..589e117`
(`database.ts` +23/-2, `database.spec.ts` +212/-27, `app.spec.ts` +15), plus every non-PASS
verdict from round 1. Each section below says whether it was `verified at 589e117` or
`carried from 5ea8d8c`.

## Binding sources

`verified at 589e117` for the contradiction and uncovered columns. The fix did not touch the
sources.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-004-tenant-isolation.md` (layer 3 guard, line 18; layer 4 composite FK "para que o banco rejeite referências cruzadas", line 19; threat model "referência cruzada", line 24) | yes - re-read lines 15-31 | none | Cross-tenant reference through a relation whose connect filter names **another** tenant. No check covers it. On the real DB, `example.update({ where: A-row, data: { parent: { connect: { id: rowOfB, organizationId: B } } } })` is accepted by the guard, and the composite FK does not reject it: Prisma writes `(parentId, organizationId) = (rowOfB, B)`, so the A row now belongs to B. Layer 4's promise does not hold for relation writes |
| `docs/architecture.md` §7 "Isolamento de tenant (ADR-004)" (line 327) | yes - carried from 5ea8d8c | none | same as the row above |
| `docs/architecture.md` §5 "Jobs e crons" (line 233) | yes - carried from 5ea8d8c | none | - |

These are not UI sources, so there is no screen or arrangement to enumerate.

## Checks

`verified at 589e117`. All 27 proofs ran in one batched invocation in the real tree:

`cd apps/server && pnpm exec vitest run src/infrastructure/database.spec.ts src/app.spec.ts test/schema.spec.ts --reporter=verbose`
exited 0 with `Test Files 3 passed (3)` and `Tests 37 passed (37)`. Every proof named below
appears as its own `✓` line in that output.

Existence (`rg -n "it\('"`), with the hits for the new tests C20-C27:
`database.spec.ts:445 it('never writes the tenant relation'` (C20) ·
`:205 it('rejects moving a row through the organization relation'` (C21) ·
`:483 it('rejects nested writes into tenant-scoped relations from unguarded models'` (C22) ·
`:223 it('rejects moving rows into an organization through its relation'` (C23) ·
`:82 it('rejects before sending any SQL'` (C24) ·
`:523 it('checks connectOrCreate at every nested position'` (C25) ·
`:239 it('allows select of relations under a tenant filter'` (C26) ·
`app.spec.ts:128 it('surfaces a tenant guard violation as a generic 500'` (C27).
The fix shifted every line in `database.spec.ts`, so all C1-C18 citations below were refreshed.
`test/schema.spec.ts` is not in the fix diff, and its lines are unchanged.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | 13 where-ops without `organizationId` throw in the guard | `✓ createTenantGuard (decision table) > rejects every where-operation without organizationId` exit 0 | `apps/server/src/infrastructure/database.spec.ts:316` - `expect(() => guard('Invoice', operation, { where: { id: 'i' } }), operation).toThrow(TenantGuardError)` looped over the 13 `WHERE_OPERATIONS`; `:320-323` `.not.toThrow()` with the tenant filter | PASS |
| C2 | same 13 through `db` throw; rows unchanged | `✓ tenant guard on the database client > rejects every where-operation on the client and changes no rows` exit 0 | `apps/server/src/infrastructure/database.spec.ts:100` - `await expect(calls[operation](), operation).rejects.toThrow(TenantGuardError)`; `:104-105` - `expect(after).toHaveLength(before.length)` / `expect(after.map((row) => row.name)).toEqual(before.map((row) => row.name))` | PASS |
| C3 | with `organizationId` (direct or `id_organizationId`) only tenant rows come back | `✓ ... returns only the tenant rows when organizationId is present` exit 0 | `apps/server/src/infrastructure/database.spec.ts:118` - `expect(fromB).toBeNull()`; `:119` - `expect(fromA?.id).toBe(example.id)` | PASS |
| C4 | 6 non-literal shapes rejected, 2 accepted | `✓ ... accepts only a literal organizationId filter` exit 0 | `apps/server/src/infrastructure/database.spec.ts:337` - `expect(() => guard('Invoice', 'findMany', { where }), shape).toThrow(TenantGuardError)` over the 6 shapes at :328-335; `:340`, `:341-345` `.not.toThrow()` | PASS |
| C5 | 3 create ops reject a row missing `organizationId` | `✓ ... rejects every create operation with a row missing organizationId` exit 0 | `apps/server/src/infrastructure/database.spec.ts:354` - `expect(() => guard('Invoice', operation, { data: bad }), operation).toThrow(TenantGuardError)` with `bad = [{ organizationId: org }, { name: 'x' }]` (:351) | PASS |
| C6 | `upsert` needs the tenant in `where` and in `create` | `✓ ... requires the tenant on both sides of an upsert` exit 0 | `apps/server/src/infrastructure/database.spec.ts:360-362` - `guard('Invoice', 'upsert', { where: { id: 'i' }, create: { organizationId: org } })).toThrow(TenantGuardError)`; `:363-365` - `.toThrow(/upsert without create.organizationId/)` | PASS |
| C7 | unknown ops fail closed citing `is not supported` | `✓ ... fails closed on an unknown operation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:377-380` - `expect(() => guard('Invoice', operation, { where: { organizationId: org } }), operation).toThrow(/is not supported/)` | PASS |
| C8 | 4 update paths setting scalar `organizationId` throw | `✓ ... never moves a row to another tenant` exit 0 | `apps/server/src/infrastructure/database.spec.ts:387-390` - `guard('Invoice', operation, { where, data: { organizationId: other } })).toThrow(TenantGuardError)`; `:392-398` upsert `update: { organizationId: other }` `.toThrow(TenantGuardError)` | PASS |
| C9 | `updateMany` A→B on `db` throws; rows stay in A | `✓ ... rejects moving rows between tenants on the client` exit 0 | `apps/server/src/infrastructure/database.spec.ts:131` - `.rejects.toThrow(TenantGuardError)`; `:135` - `expect(after.every((row) => row.organizationId === tenantA.organizationId)).toBe(true)` | PASS |
| C10 | `Organization` passes without where-validation | `✓ ... leaves models without organizationId alone` exit 0 | `apps/server/src/infrastructure/database.spec.ts:269` - `await expect(deps.db.organization.findMany({ take: 1 })).resolves.toBeInstanceOf(Array)` | PASS |
| C11 | `connect`/`set` without tenant throw at 6 nested positions, pass with it | `✓ ... checks connect and set at every nested position` exit 0 | `apps/server/src/infrastructure/database.spec.ts:427` - `expect(() => update(wrap(unscoped[operation])), label).toThrow(TenantGuardError)`; `:428` `.not.toThrow()` for `scoped` (:417-420) | PASS |
| C12 | `connectOrCreate` without tenant in `where` throws citing `connectOrCreate on` | `✓ ... checks connects inside nested creates, connectOrCreate and set` exit 0 | `apps/server/src/infrastructure/database.spec.ts:437-439` - `expect(() => create({ connectOrCreate: { where: { id: 'i' }, create: {} } })).toThrow(/items.connectOrCreate on Item/)` | PASS |
| C13 | `db` nested connect without tenant throws with the message | `✓ ... rejects a nested connect to a tenant-scoped row without organizationId` exit 0 | `apps/server/src/infrastructure/database.spec.ts:166` - `.rejects.toThrow(/data.parent.connect on Example without organizationId/)` | PASS |
| C14 | A-filtered connect to a B row → `P2025`, `parentId` stays null | `✓ ... does not find a foreign row through a tenant-filtered connect` exit 0 | `apps/server/src/infrastructure/database.spec.ts:183` - `expect(error).toMatchObject({ code: 'P2025' })`; `:187` - `expect(reloaded?.parentId).toBeNull()` | PASS |
| C15 | scalar `parentId` from B → `P2003`, nothing created | `✓ ... lets the composite foreign key reject a parent id from another tenant` exit 0 | `apps/server/src/infrastructure/database.spec.ts:198` - `expect(error).toMatchObject({ code: 'P2003' })`; `:202` - `expect(created).toBeNull()` | PASS |
| C16 | include under tenant filter returns only A's children + A's org; root guarded | `✓ ... allows include of relations under a tenant filter and still guards the root` exit 0 | `apps/server/src/infrastructure/database.spec.ts:147` - `expect(loaded?.children.map((child) => child.name)).toEqual(['child-1'])`; `:151` - `expect(loaded?.organization.id).toBe(tenantA.organizationId)`; `:152-154` `.rejects.toThrow(TenantGuardError)` | PASS |
| C17 | `tx` guarded; with tenant returns rows | `✓ ... guards the transaction client too` exit 0 | `apps/server/src/infrastructure/database.spec.ts:258-260` - `deps.db.$transaction(async (tx) => tx.example.findMany({ where: { name: 'x' } }))).rejects.toThrow(TenantGuardError)`; `:265` - `expect(found.length).toBeGreaterThan(0)` | PASS |
| C18 | `readModels` fails closed; classifies Example/Organization; maps `parent` | `✓ ... reads the model classification from the Prisma runtime and fails closed` exit 0 | `apps/server/src/infrastructure/database.spec.ts:273-274` - `expect(() => readModels({})).toThrow()` / `...{ models: 'unexpected' } })).toThrow()`; `:277-279` - `tenantScoped).toBe(true)`, `.toBe(false)`, `relations.get('parent')).toBe('Example')` | PASS |
| C19 | schema test passes on the real schema and flags `Item.product` | `✓ tenant-scoped relations > every relation between tenant-scoped models uses a composite foreign key` and `✓ ... flags a relation between tenant-scoped models without organizationId` exit 0 | `apps/server/test/schema.spec.ts:60` - `expect(findSimpleTenantRelations(schema)).toEqual([])`; `:89` - `expect(findSimpleTenantRelations(schema)).toEqual(['Item.product'])` | PASS |
| C20 | tenant relation write throws on 4 update paths + nested update, for 6 relation ops | `✓ createTenantGuard (decision table) > never writes the tenant relation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:458-461` - `expect(() => guard('Invoice', path, { where, data: { organization } }), \`${path} ${operation}\`).toThrow(TenantGuardError)` for `update, updateMany, updateManyAndReturn`; `:463-471` `upsert.update` `.toThrow(TenantGuardError)`; `:472-479` nested `items.update.data.organization` `.toThrow(TenantGuardError)`; the 6 ops `connect, connectOrCreate, create, update, upsert, disconnect` at :447-454 | PASS |
| C21 | `db` update/upsert via `organization.connect` B throw; row stays in A | `✓ tenant guard on the database client > rejects moving a row through the organization relation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:210` - `await expect(deps.db.example.update({ where, data: toB })).rejects.toThrow(TenantGuardError)`; `:211-217` upsert `.rejects.toThrow(TenantGuardError)`; `:220` - `expect(reloaded?.organizationId).toBe(tenantA.organizationId)` | PASS |
| C22 | unguarded model writing a tenant-scoped relation throws for 11 nested ops in create/update/upsert; scalar-only update passes | `✓ ... rejects nested writes into tenant-scoped relations from unguarded models` exit 0 | `apps/server/src/infrastructure/database.spec.ts:499-502` - `guard('Organization', 'create', { data: { name: 'x', invoices } })...toThrow(TenantGuardError)`; `:503-506` update; `:507-515` upsert; ops listed :484-496, and each payload carries `organizationId: org` (:498), so the throw is not the tenant-filter check; `:518-520` - `guard('Organization', 'update', { where: { id: org }, data: { name: 'Nova' } })).not.toThrow()` | PASS |
| C23 | `db` `organization.update ... examples.connect rowOfB` throws; row stays in B | `✓ ... rejects moving rows into an organization through its relation` exit 0 | `apps/server/src/infrastructure/database.spec.ts:226-231` - `deps.db.organization.update({ where: { id: tenantA.organizationId }, data: { examples: { connect: { id: rowOfB.id } } } })).rejects.toThrow(TenantGuardError)`; `:236` - `expect(reloaded?.organizationId).toBe(tenantB.organizationId)` | PASS |
| C24 | unreachable-DB client rejects 13 ops with `TenantGuardError`, never a connection error | `✓ ... rejects before sending any SQL` exit 0 | `apps/server/src/infrastructure/database.spec.ts:89` - `expect(error, operation).toBeInstanceOf(TenantGuardError)` over the 13 `WHERE_OPERATIONS`, client `createDatabase('postgresql://guard:guard@127.0.0.1:1/unreachable')` (:84) | PASS |
| C25 | `connectOrCreate` without tenant throws at the 6 nested positions, passes with it | `✓ ... checks connectOrCreate at every nested position` exit 0 | `apps/server/src/infrastructure/database.spec.ts:546` - `expect(() => update(wrap(unscoped)), position).toThrow(TenantGuardError)`; `:547` - `expect(() => update(wrap(scoped)), position).not.toThrow()`, positions at :524-537 | PASS |
| C26 | `select` of relation under A filter returns exactly `[{ name: 'child-s', organizationId: A }]`; root guarded | `✓ ... allows select of relations under a tenant filter` exit 0 | `apps/server/src/infrastructure/database.spec.ts:248` - `expect(loaded?.children).toEqual([{ name: 'child-s', organizationId: tenantA.organizationId }])`; `:249-254` `.rejects.toThrow(TenantGuardError)` | PASS |
| C27 | guard violation through a route → generic `500` + `requestId` = header, no `organizationId` in the body | `✓ src/app.spec.ts > error handler > surfaces a tenant guard violation as a generic 500` exit 0 | `apps/server/src/app.spec.ts:131` - `expect(res.statusCode).toBe(500)`; `:132-138` - `expect(res.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.', details: { requestId: res.headers['x-request-id'] } } })`; `:139` - `expect(res.body).not.toContain('organizationId')`; route `:36` uses the app's guarded `db` | PASS |

Every check, as written, is proven. Level and precision findings, `verified at 589e117`:

- **Round 1 finding 5 (AC 1 "nenhum SQL"): closed.** C24 now proves the throw comes before the
  driver. Fault F4 below moved the guard after `query(args)`, and C24 caught it.
- **Round 1 finding 5 (HTTP 500 level): closed.** C27 crosses HTTP with `app.inject`.
- **Precision gap in the plan: AC 9 and AC 10 (and so C11, C12, C25).** They accept "`organizationId`
  string", meaning *any* tenant's id, where the S2 goal needs *the root's* tenant. Each `scoped`
  fixture (`database.spec.ts:417-420`, `:541-543`) uses the same `org` as the root, so no test
  ever sends a nested filter with a different tenant. The ambiguity lets the code satisfy AC 9
  to the letter and still link rows across tenants (see Coverage).
- **Precision gap: AC 7.** Its text lists only top-level `update*` and `upsert.update` data. Its
  parenthetical ("uma linha nunca muda de tenant") is broader, and the code does not meet it:
  nested `create`/`update`/`upsert` data can set `organizationId`, and a relation `connect` can
  rewrite it through the composite FK.

## Coverage

`verified at 589e117` for every row whose authority the fix touched, plus the round 1 non-PASS
rows. The other rows are `carried from 5ea8d8c`, because the fix did not touch their authority
(the Prisma TypeMap, the filter shapes, the assemblies).

**Attack sweep against the real database** (throwaway `probe.spec.ts` in the scratch worktree at
`589e117`, tenants from `withTwoTenants`, each row's `organizationId` read back with raw SQL):

| # | Attack | Guard | Result on the real DB |
| --- | --- | --- | --- |
| R1-1 | `example.update(A-row, data.organization.connect B)` | `TenantGuardError` | row stays in A - **closed** |
| R1-2 | `example.upsert(A-row, update.organization.connect B)` | `TenantGuardError` | row stays in A - **closed** |
| R1-3 | `organization.update(A, examples.connect rowOfB)` | `TenantGuardError` | rowOfB stays in B - **closed** |
| N1 | `example.update(A-row, data.parent.connect { id: rowOfB, organizationId: B })` | passes | **A-row now in B** |
| N2 | same with `connect: { id_organizationId: { id: rowOfB, organizationId: B } }` | passes | **A-row now in B** |
| N3 | `example.update(A-row, data.parent.create { name, organizationId: B })` | passes | **A-row now in B** |
| N4 | `example.update(A-row, data.parent.connectOrCreate { where: { id: rowOfB, organizationId: B }, … })` | passes | **A-row now in B** |
| N5 | `example.update(A-row, data.parent.upsert { create: { organizationId: B }, update: {} })` | passes | **A-row now in B** |
| N6 | `example.update(A-child, data.parent.update { organizationId: B })` | passes | **parent and child now in B** (`ON UPDATE CASCADE` on the composite FK) |
| N14 | `example.update(A-row, data.children.connect { id: rowOfB, organizationId: B })` | passes | **rowOfB now in A** |
| N15 | `example.update(A-row, data.children.set [{ id: rowOfB, organizationId: B }])` | passes | **rowOfB now in A** |
| N16 | `example.update(A-row, data.children.connectOrCreate { where: { id: rowOfB, organizationId: B }, … })` | passes | **rowOfB now in A** |
| N17 | `example.create({ organizationId: A, children: { connect: { id: rowOfB, organizationId: B } } })` | passes | **rowOfB now in A** |
| N23 | `example.upsert(create path, create.children.connect { id: rowOfB, organizationId: B })` | passes | **rowOfB now in A** |
| N7 | `children.update.data.organizationId` | Prisma validation (`Unknown argument`) | row stays - not exposed by Prisma |
| N18 | `create` with unchecked scalar + `parent.connect` | Prisma validation | not exposed |
| N19 / N20 | `organization.create` with `examples.create` / `organization.upsert` with `update.examples.connect` | `TenantGuardError` | closed |
| N12 | `data.parent.disconnect` | Prisma `P2011` (it tries to null `organizationId`) | row stays - no move (see note) |
| read | `organization.findMany({ include: { examples: … } })` | passes | returned examples of 2 tenants in one call (a read, not a move - see note) |

(N1-N6 and N14-N17 are the numbers used in the probe. N8-N11, N13 and N21-N22 were
duplicates, scalar-only cases, or rejected by Prisma validation; none moved a row.)

Cause, from the code: `hasTenantFilter` (`apps/server/src/infrastructure/database.ts:76-85`)
checks `typeof value === 'string'` and never compares it with the root's tenant. The nested
`connect`/`set`/`connectOrCreate` branch (`database.ts:119-137`) uses that check. The nested
`create`/`update`/`upsert` recursion (`database.ts:140-153`) only looks at relation fields,
never at the scalar `organizationId`. The composite FK
`@relation(fields: [parentId, organizationId], …)` (`apps/server/prisma/schema.prisma:34`) makes
Prisma write `organizationId` whenever it links `parent`/`children`, and
`Example_parentId_organizationId_fkey … ON UPDATE CASCADE`
(`apps/server/prisma/migrations/20260921170202_init/migration.sql:32`) carries a parent's tenant
change down to its children.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| where-operations (13) | carried from 5ea8d8c: Prisma TypeMap (`prismaNamespace.ts:498-563`) minus create ops and `upsert` | all 13: C1 (`spec:315`) · C2 (`spec:99`) · C24 (`spec:87`) | - |
| create operations (3) | carried from 5ea8d8c | each: C5 | - |
| `upsert` sides (2) | code `database.ts:187`, `:200` | `where` C6 · `create` C6 | - |
| total known ops (17) vs code | `database.ts:10-26` (unchanged) | exact match; anything else → `database.ts:184-185` → C7 | - |
| rejected / accepted filter shapes (6 / 2) | carried from 5ea8d8c | C4 / C3, C4 | - |
| unknown operations (3) | carried from 5ea8d8c | C7 | - |
| paths that change a row's tenant (AC 7 "uma linha nunca muda de tenant") - `verified at 589e117` | Prisma input types for `Example`: relations `organization`, `parent` (`ExampleUncheckedCreateWithoutChildrenInput` has `organizationId`, `Example.ts:511-517`; `ExampleUncheckedUpdateWithoutChildrenInput` has `organizationId`, `Example.ts:568-574`), `children`; plus the real DB probe above | scalar in `update`/`updateMany`/`updateManyAndReturn`/`upsert.update`: C8, C9 · `organization` relation × 6 ops × 5 paths: C20, C21 | `parent.connect` with another tenant's filter (N1, N2) · `parent.create` with `organizationId` B (N3) · `parent.connectOrCreate` (N4) · `parent.upsert` (N5) · `parent.update { organizationId }` with cascade to children (N6) · `children.connect` / `set` / `connectOrCreate` with another tenant's filter (N14, N15, N16) · nested `children.connect` from a top-level `create` (N17) and `upsert.create` (N23). All 10 were tried on the real DB at `589e117` and moved a row, with no error |
| updates that change the tenant through the relation (5) | checks C20 + code `database.ts:112-114` | `update` C20, C21 · `updateMany` C20 · `updateManyAndReturn` C20 · `upsert.update` C20, C21 · nested `update` C20 | - |
| operations on the `organization` relation (6) | Prisma `OrganizationUpdateOneRequiredWithoutExamplesNestedInput` + plan AC 18 | `connect`, `connectOrCreate`, `create`, `update`, `upsert`, `disconnect`: C20 (`spec:447-454`) | - |
| nested writes from a model without the tenant (11) | Prisma nested to-many operations; code `database.ts:115-117`, `:162-169` | all 11: C22 (`spec:484-496`) · `connect` also C23 | - |
| roots of an unguarded model's nested write (3) | code `database.ts:164` (`data`), `:166` (`create`), `:167` (`update`) | `data` C22, C23 · `update` C22 | `create` of an unguarded `upsert` (`database.ts:166`): no rejecting case. C22's `create: { name: 'x' }` (`spec:511`) carries no relation. N20 on the real DB rejected only the `update` side |
| `connectOrCreate` by nested position (6) | plan AC 10 × C11's positions | all 6: C25 (`spec:524-537`) | - |
| nested reference ops (3) | code `database.ts:120`, `:130` | `connect` C11, C13 · `set` C11 · `connectOrCreate.where` C12, C25 | - |
| nested reference filter **value** (root's tenant vs another tenant) - new set | S2 goal + ADR-004 layer 4 "referência cruzada" | root's tenant: C11, C25 (not rejected, correctly) · missing: C11, C12, C13, C25 | another tenant's `organizationId` (`connect`, `set`, `connectOrCreate`, compound `id_organizationId`): no check, no rejection in code, and it links across tenants on the DB (N1, N2, N4, N14-N17, N23) |
| DB errors on a cross-tenant reference (2) | plan AC 11-12 | `P2025` C14 · `P2003` C15 | - |
| relation reads under a tenant filter (2) | plan AC 13 | `include` C16 · `select` C26 | - |
| application clients (2) | plan AC 14 | `db` C2 · `tx` C17 | - |
| model classification (2) | carried from 5ea8d8c | C10, C18 | - |
| fail-closed metadata doors (2) | carried from 5ea8d8c (`database.ts:52`, called at `:227`) | C18 | - |
| "no SQL" of AC 1 (13) | plan AC 1 | C24, loop over 13 (`spec:87-90`) | - |
| error surface (Flow hop 4) (1) | plan `Flow`/`Observable`; `apps/server/src/shared/errors.ts:47-56` | `500 INTERNAL_ERROR` + `requestId` C27 | - |
| startup config: guard install (3 assemblies) | re-read at 589e117: `apps/server/src/server.ts:19`, `apps/server/test/app.ts:27`, `apps/server/scripts/export-openapi.ts:18` → `apps/server/src/dependencies.ts:18` `db: createDatabase(config.DATABASE_URL)`; `rg "new PrismaClient"` → only `database.ts:226` | C2 boots `test/app.ts`; the others share `createDependencies` | - |
| plan one-way doors (5, including the round 2 `TENANT_ROOT`) | plan `Landing` | single extension `database.ts:229-239` C2, C17, C24 · runtime datamodel C18 · create only by scalar C5 · `TENANT_ROOT` `database.ts:7`, `:112` C20, C21 · composite FK C15, C19 | - (but see the "paths that change a row's tenant" row above: the composite FK door is also what carries `organizationId` across in N1-N6 and N14-N23) |

Notes (not counted as Unproven members, and no less real for that):

- **Cross-tenant read from an unguarded root.** `organization.findMany({ include: { examples } })`
  returns tenant-scoped rows of every tenant. The plan's `Impact` says super-admin listings
  "precisam iterar por org ou consultar só modelos não tenant-scoped", but no AC encodes this.
  AC 13 covers only reads whose root has a tenant filter. This is a plan-level precision gap.
- **N12.** `parent.disconnect` fails with `P2011`, because Prisma tries to null the shared
  `organizationId`. That is not a leak, but it means a tenant-scoped row can never be detached
  from its parent. It is a side effect of the shared FK column that no check records.

## Test policy rows

`verified at 589e117` (both rows in `checks.md` re-judged).

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary - `createTenantGuard` | `apps/server/src/infrastructure/database.ts:89-209` | boundary C2, C9, C13, C16, C17, C21, C23, C24, C26, C27 · own layer C1, C4-C8, C11, C12, C20, C22, C25 | no - gap: round 1's missing rows are now asserted (C25 `connectOrCreate` × 6 positions, C20 tenant relation, C22 unguarded root), but two decision rows still have no asserted case at the guard's own layer. (a) The fail-closed `Unknown model` branch at `database.ts:92`: `rg -n "Unknown model"` hits only `database.ts:92`, no test. (b) The nested-reference decision is missing its "filter names another tenant" row. The code has no such branch, and on the real DB that input moves rows (N1-N23). The coverage expectation "one asserted case per row of the decision table" cannot be met while the table is missing the row the S2 goal needs |
| Decides, reached across a boundary - `readModels` | `apps/server/src/infrastructure/database.ts:51-65` | boundary C18 (real client, `spec:276-279`) · own layer C18 (fakes, `spec:273-274`) | yes - carried from 5ea8d8c; the file range is not in the fix diff (only the new `TENANT_ROOT` const moved its lines) |
| Instrumentation, pass-throughs - `createDatabase` / extension | `apps/server/src/infrastructure/database.ts:219-240` | none of its own; covered by C2, C17, and now C24 (proves the order guard → `query`) | yes |

## Faults injected

`verified at 589e117`. Isolation: the real tree's `git status --porcelain` baseline was empty
(saved to the scratchpad). The scratch was
`git worktree add <scratchpad>/wt2 HEAD` followed by `pnpm install --frozen-lockfile`. The
unmutated baseline in the scratch was 37 passed. Each fault was applied to
`apps/server/src/infrastructure/database.ts`, only its narrowest proof was run with `-t`, and the
file was restored with `git checkout -- <file>` after each run. The probe spec was deleted before
the faults, so the scratch porcelain was empty.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 - `TENANT_ROOT` check `if (tenantScoped && target === TENANT_ROOT)` → `if (false)` | `apps/server/src/infrastructure/database.ts:112` | yes - `× never writes the tenant relation` (C20) and `× rejects moving a row through the organization relation` (C21) |
| F2 - unguarded-model branch at the guard entry: dropped the three `checkNestedWrites` calls, keeping the bare `return` | `apps/server/src/infrastructure/database.ts:164-168` | yes - `× rejects moving rows into an organization through its relation` (C23) |
| F3 - unguarded branch inside `checkNestedWrites`: `if (!tenantScoped && targetScoped)` → `if (false)` | `apps/server/src/infrastructure/database.ts:115` | yes - `× rejects nested writes into tenant-scoped relations from unguarded models` (C22) |
| F4 - guard moved after the query: `return query(args).then((result) => { guard(model, operation, args); return result })` | `apps/server/src/infrastructure/database.ts:234-235` | yes - `× rejects before sending any SQL` (C24; the unreachable DB surfaced a connection error instead) |
| F5 - `TenantGuardError` given `statusCode = 400` (routes it into the 4xx branch at `errors.ts:47`) | `apps/server/src/infrastructure/database.ts:30-32` | yes - `× surfaces a tenant guard violation as a generic 500` (C27) |

The 5-fault cap was reached. C25 and C26 were not mutated: C25's surface
(`database.ts:131`) is the same `connectOrCreate` check C12 already exercises, and C26 has no
select-specific branch in the guard to mutate.

Discard: `git worktree remove --force <scratchpad>/wt2`. `git worktree list` then showed only the
main tree, and `diff porcelain-before porcelain-after` was empty (`PORCELAIN-UNCHANGED`).

## Swept existing re-read

`verified at 589e117`. Observability is `existing - shared/errors.ts`: `errors.ts:53`
`request.log.error({ err: error }, 'unhandled error')` and `:54-56` status 500 with
`requestId`. The code is there, and C27 now proves it end to end. Idempotency and concurrency
are `n/a` (user-approved).

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` at `589e117` (real tree): exit 0. Lint
checked 64 files, typecheck OK, `Test Files 15 passed (15)`, `Tests 86 passed (86)`, 0 failed,
build OK. Tenant proofs: 37 passed, 0 failed. The porcelain was still empty afterwards.

Ranked gaps:

1. **Rows still move between tenants through the tenant-scoped self-relation.** Ten paths were
   confirmed on the real DB at `589e117`, each with no error. `parent.connect` /
   `connectOrCreate` with another tenant's `organizationId`, and `parent.create` / `upsert` with
   `organizationId: B`, move the A row to B (N1-N5). `parent.update { organizationId: B }` moves
   the parent and cascades its children (N6). `children.connect` / `set` / `connectOrCreate`
   with B's filter pull B's row into A, from `update`, `create` or `upsert.create` (N14-N17,
   N23). This breaks AC 7 "uma linha nunca muda de tenant", the S2 goal and ADR-004 layer 4.
   Cause: `apps/server/src/infrastructure/database.ts:76-85` (any string passes), `:119-137`
   (no comparison with the root tenant), `:140-153` (the nested scalar `organizationId` is never
   checked); the composite FK column at `apps/server/prisma/schema.prisma:34` plus
   `ON UPDATE CASCADE` at `migration.sql:32`.
2. **Precision gap in the plan: AC 9 and AC 10.** They require "`organizationId` string", not
   the root's tenant, so C11, C12 and C25 prove a filter that never stops a cross-tenant link.
   AC 7 names only top-level data. The round 3 criteria need "the nested tenant must equal the
   root's", or a ban on nested writes into relations whose FK includes `organizationId`.
3. **`Test policy` row for `createTenantGuard` is unmet.** No asserted case for the
   `Unknown model` fail-closed branch (`database.ts:92`), and no decision row for a nested
   filter that names another tenant.
4. **Unguarded root `upsert.create` has no rejecting case.** Code `database.ts:166` is exercised
   only with a relation-free `create` (`database.spec.ts:511`).
5. **Plan-level (not an AC):** `organization.findMany({ include: { examples } })` reads
   tenant-scoped rows of every tenant. `Impact` names this, but no criterion does.
   `parent.disconnect` is impossible (`P2011`) because the FK column is shared.

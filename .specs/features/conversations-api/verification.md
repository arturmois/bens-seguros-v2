# Conversations API verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 255e024..d560e80
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

## Binding sources

Profile `standard`: step 1 (ui) does not run; there is no UI binding source (the plan has no screen, the Orval client is generated). The sources the plan names were opened for the Coverage recompute and read against the checks for contradictions only.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-016-roles-portfolio-assignment.md` (COMMERCIAL sees own portfolio + queue, other portfolio -> 404) | yes - read in full | none | - |
| `docs/architecture.md` §9 (prefix `/api/v1`, `{ items, nextCursor }`, `{ error: { code, message } }`, `limit` <= 100, Zod 400 / session 401 / permission 403 / tenant-or-portfolio 404) | yes - read in full | none | - |
| `.specs/STATE.md` AD-014 (COMMERCIAL conversation filter: `assigneeId = me OR handler = QUEUE OR contact.ownerId = me OR contact.ownerId IS NULL`) | yes - read in full; matches `apps/server/src/shared/scope.ts:20-25` | none | - |
| `CLAUDE.md` (route: Zod `.strict()`, stable `operationId`, `requirePermission`; tests: real PostgreSQL, `withTwoTenants`, `withTwoSalespeople`) | yes - read in full | none | - |

## Checks

All proofs except C25 ran at `d560e80` in one invocation from `apps/server`: `pnpm exec vitest run src/shared/permissions.spec.ts src/shared/pagination.spec.ts src/modules/conversations/read.spec.ts src/modules/auth/me.spec.ts test/architecture.spec.ts --reporter=verbose -t "<the 29 names of C1-C24, C26>"` - exit 0, `29 passed | 19 skipped`, each of the 29 names listed individually as passed (the 19 skipped are the unnamed tests of those files). Every read.spec.ts name below is a new test from `e299078`; C1/C2/C24 tests were edited in `5239108`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | exact role matrix with `conversation:read` for the three roles; `PERMISSIONS` holds it | batch, "matches the role permission snapshot" passed | `apps/server/src/shared/permissions.spec.ts:6` - `expect(ROLE_PERMISSIONS).toEqual({ ADMIN: [..., 'portfolio:transfer', 'conversation:read'], MANAGER: ['organization:read', 'conversation:read'], COMMERCIAL: ['organization:read', 'conversation:read'] })`; `:18` - `expect(PERMISSIONS).toContain('conversation:read')` | PASS |
| C2 | default `id desc`; given `{ seq: 'desc' }` kept, `take: limit + 1`, cursor `{ id }` + `skip: 1` | batch, both names passed | `apps/server/src/shared/pagination.spec.ts:15` - `toEqual({ take: 3, orderBy: { id: 'desc' } })`; `:25` - `expect(pageArgs({ limit: 2 }, { seq: 'desc' })).toEqual({ take: 3, orderBy: { seq: 'desc' } })`; `:26-31` - with cursor `toEqual({ take: 3, orderBy: { seq: 'desc' }, cursor: { id: ids[0] }, skip: 1 })` | PASS |
| C3 | ADMIN gets all 3 in `id desc` (seeded out of insertion order), `nextCursor: null`; MANAGER gets the same | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:124` - `expect(idsOf(asAdmin)).toEqual([newest, middle, oldest])`; `:125` - `nextCursor` `toBeNull()`; `:127` - `expect(idsOf(asManager)).toEqual([newest, middle, oldest])`; seed order `[1, 2, 0]` at `:115` | PASS |
| C4 | exact summary keys at each level, literal enums, `WEB_CHAT`, ISO dates, `null` unset dates | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:146` - `expect(response.json().items).toEqual([{ id, status: 'WAITING', handler: 'HUMAN', assigneeId, contact: { id, phoneE164, ownerId }, channel: { id, kind: 'WEB_CHAT', name }, lastSeq: 0, lastMessageAt: null, closedAt: null, createdAt: seeded.createdAt.toISOString() }])`; `:170` - `toMatchObject({ status: 'CLOSED', closedAt: closedAt.toISOString(), lastMessageAt: lastMessageAt.toISOString() })` | PASS |
| C5 | COMMERCIAL A sees exactly {HUMAN of A, QUEUE, AI ownerless, HUMAN of B w/ contact of A}; not the other two | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:194` - `expect(new Set(idsOf(response))).toEqual(new Set([humanOfA.id, queueContactOfB.id, humanOfBContactOfA.id, aiOwnerless.id]))`; `:197` - `toHaveLength(4)`; `:198-199` - `not.toContain(humanOfBContactOfB.id)`, `not.toContain(aiOfB.id)` | PASS |
| C6 | other tenant never in the ADMIN list (`withTwoTenants`) | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:211` - `expect(idsOf(response)).toEqual([own.id])`; `:212` - `not.toContain(foreign.id)`; `withTwoTenants` at `:205` | PASS |
| C7 | `limit=2` pages 2, 2, 1; last `nextCursor: null`; concatenation = 5 ids desc, no repeat | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:234` - `expect(pages).toEqual([2, 2, 1])`; `:235` - `expect(seen).toEqual(ids)`; `:229` loop ends only on `next === null`; `:230` - `expect(next).toBe(seen.at(-1))` | PASS |
| C8 | empty tenant -> `200 { items: [], nextCursor: null }` | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:244` - `expect(response.json()).toEqual({ items: [], nextCursor: null })` | PASS |
| C9 | detail by ADMIN = the list's object for that id | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:257` - `toBe(200)`; `:260` - `expect(response.json()).toEqual(item)` | PASS |
| C10 | COMMERCIAL A reads HUMAN of B with contact of A -> 200 | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:276` - `toBe(200)`; `:277` - `toMatchObject({ id: humanOfBContactOfA.id, assigneeId: b })` | PASS |
| C11 | other tenant / outside portfolio / random UUID -> 404 on detail and messages, bodies deep-equal `{ error: { code: 'NOT_FOUND', message } }` | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:301` - `expect(response.statusCode, ...).toBe(404)` for each of the three, over `['', '/messages']` (`:293`); `:304` - `expect(bodies[0]).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } })`; `:305-306` - `bodies[1]`, `bodies[2]` `toEqual(bodies[0])` | PASS |
| C12 | id order reverse of seq order; response `seq` `[4, 3, 2, 1]` | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:317` - precondition: sorting by id yields seq `[4, 3, 2, 1]`; `:324` - `expect(response.json().items.map(item => item.seq)).toEqual([4, 3, 2, 1])` | PASS |
| C13 | 5 messages, `limit=2`: `[5,4]`, `[3,2]`, `[1]`; each `nextCursor` = last message id; last `null` | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:345` - `expect(pages).toEqual([[5, 4], [3, 2], [1]])`; `:341` - `expect(next).toBe(items.at(-1)?.id)`; ids disagree with seq by the `seedMessages` construction (`:75-79`, same seed C12 asserts at `:317`) | PASS |
| C14 | exact message keys; UNSUPPORTED inbound `text`/`deliveryStatus` null; TEXT inbound text + `deliveryStatus` null; HUMAN outbound `authorUserId` sender + `SENT` | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:381` - every item `expect(Object.keys(item).sort()).toEqual(keys)` (10 keys, `:369-380`); `:382` - outbound `toMatchObject({ authorUserId: host.userId, deliveryStatus: 'SENT', ... })`; `:392` - unsupported `toMatchObject({ kind: 'UNSUPPORTED', text: null, deliveryStatus: null })`; `:401` - inbound text `toMatchObject({ text: 'Quero cotar.', deliveryStatus: null })` | PASS |
| C15 | foreign conversation's messages -> 404; own page holds only own ids | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:422` - `expect(new Set(idsOf(ownPage))).toEqual(new Set(ownMessages.map(m => m.id)))`; `:423` - `expect(foreignPage.statusCode).toBe(404)`; `withTwoTenants` at `:415` | PASS |
| C16 | `findReadableConversation` exported by the index; returns in-portfolio, throws 404 `NOT_FOUND` outside | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:12` - imported from `./index.ts` (export at `apps/server/src/modules/conversations/index.ts:4`); `:446` - `expect(found.id).toBe(mine.id)`; `:447-449` - `rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })`; `withTwoSalespeople` at `:430` | PASS |
| C17 | each route declares `requirePermission('conversation:read')` and its `operationId`, read via `onRoute` | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:471` - `expect(Object.fromEntries(seen)).toEqual({ '/api/v1/conversations': { operationId: 'listConversations', permissions: ['conversation:read'] }, '/api/v1/conversations/:id': { operationId: 'getConversation', ... }, '/api/v1/conversations/:id/messages': { operationId: 'listConversationMessages', ... } })` | PASS |
| C18 | `?foo=1` -> 400 on each route, detail included | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:493` - `expect(response.statusCode, url).toBe(400)` over `routes(conversation.id)` (`:103-107`, all three) | PASS |
| C19 | `limit=0/101/abc`, `cursor=nao-uuid` -> 400 on list and messages; `:id=nao-uuid` -> 400 on detail and messages | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:505` - `toBe(400)` for 4 queries x 2 paged routes (`:500-503`); `:513` - `toBe(400)` for `/api/v1/conversations/nao-uuid` and `.../nao-uuid/messages` | PASS |
| C20 | no session -> `401 UNAUTHENTICATED` on each route | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:522` - `toBe(401)`; `:523` - `expect(response.json().error.code).toBe('UNAUTHENTICATED')` | PASS |
| C21 | pending terms + active org -> `403 TERMS_NOT_ACCEPTED` on each route | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:535` - `toBe(403)`; `:536` - `toBe('TERMS_NOT_ACCEPTED')`; onboarded without accepting terms at `:530-531` | PASS |
| C22 | accepted terms, no active org -> `403 NO_ACTIVE_ORGANIZATION` on each route | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:547` - `toBe(403)`; `:548` - `toBe('NO_ACTIVE_ORGANIZATION')` | PASS |
| C23 | deactivated member -> `404 NOT_FOUND` on each route | batch, passed | `apps/server/src/modules/conversations/read.spec.ts:562` - `toBe(404)`; `:563` - `toBe('NOT_FOUND')`; deactivation at `:556-558` | PASS |
| C24 | `GET /me` of a COMMERCIAL lists `conversation:read` | batch, passed | `apps/server/src/modules/auth/me.spec.ts:86` - `expect(response.json().permissions, role).toContain('conversation:read')` inside the loop over `['ADMIN', 'MANAGER', 'COMMERCIAL']` (`:70`); `:81-85` - `permissions: [...permissionsFor(role)]` | PASS |
| C25 | `pnpm api:generate` leaves no diff; `openapi.json` holds the three `operationId`s | from repo root: `pnpm api:generate` exit 0; `git add --all --intent-to-add apps/server/openapi.json apps/web/src/api && git diff --exit-code -- apps/server/openapi.json apps/web/src/api` exit 0; `grep -c ...` printed `3`; index reset afterwards, porcelain empty | `apps/server/openapi.json:1278` - `"operationId": "listConversations"`; `:1484` - `"operationId": "getConversation"`; `:1654` - `"operationId": "listConversationMessages"` | PASS |
| C26 | module boundary: routes in `modules/conversations`, reads only via `withTenant` + `scopeFor(ctx).conversation`, architecture spec green | batch, the 4 architecture names passed | `apps/server/test/architecture.spec.ts:279` - `expect(findBoundaryViolations(...)).toEqual([])`; `:373` - `expect(findModuleCycles(...)).toEqual([])`; `:391` - `expect(findForeignWrites(...)).toEqual([])`; `:264` - `expect(offenders).toEqual([])`; code read: `apps/server/src/modules/conversations/read.ts:43` (`AND: [{ id }, scopeFor(ctx).conversation]` in `withTenant`), `:53` (`where: scopeFor(ctx).conversation` in `withTenant`) | PASS |

Level: every claim naming a status, route or response shape (C3-C15, C18-C23) is proven over HTTP with `app.inject` against the real PostgreSQL. C16 sits at the use-case level and C17 at route registration, which is where their claims sit. C24 is over HTTP.

`Swept existing` rows: `checks.md` Swept has no row resolving to an existing constraint (validation, failure modes and authorization point to checks; the rest are `n/a`, approved policy). Nothing to re-read.

## Coverage

Recomputed from the authority of each set, not from the checks' table.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /api/v1/conversations` statuses (5) | plan Surface + real path: Zod querystring (`conversation.schema.ts:4`), `requireSession` (`session-context.ts:73`), `loadTenant` (`tenant-context.ts:37-44`), `requirePermission` (`tenant-context.ts:71`) | 200 C3, C5, C8 · 400 C18, C19 · 401 C20 · 403 C21, C22, C17 (`FORBIDDEN` declared) · 404 C23 | - |
| `GET /api/v1/conversations/:id` statuses (5) | same guards + Zod params/strict empty query (`conversation.schema.ts:9-11`) + `readable` (`read.ts:46`) | 200 C9, C10 · 400 C18, C19 · 401 C20 · 403 C21, C22, C17 · 404 C11, C23 | - |
| `GET /api/v1/conversations/:id/messages` statuses (5) | same guards + `messageListQuery` + `readable` (`read.ts:76`) | 200 C12, C13, C14, C15 · 400 C18, C19 · 401 C20 · 403 C21, C22, C17 · 404 C11, C15, C23 | - |
| 403 causes (3) | `tenant-context.ts:10-17` (`termsPending`, `noOrganization`, `forbidden`) | `TERMS_NOT_ACCEPTED` C21 · `NO_ACTIVE_ORGANIZATION` C22 · `FORBIDDEN` C17 (guard declared on all three; unreachable over HTTP since every role holds `conversation:read`, C1; the hook's 403 behaviour is proven over HTTP at `organization.spec.ts:169`; permission-swap mutant killed) | - |
| 404 causes on `:id` routes (4) | `loadTenant` `hidden` (`tenant-context.ts:44`) + `readable` (`read.ts:42-48`: RLS tenant, portfolio, absence) | inactive member C23 · other tenant C11, C15 · outside portfolio C11, C16 · nonexistent C11 | - |
| AD-014 COMMERCIAL conversation rules (4) | `apps/server/src/shared/scope.ts:20-25` | `assigneeId = me` C5 (HUMAN of A on contact of B) · `handler = QUEUE` C5 (QUEUE, contact of B, no assignee) · `contact.ownerId = me` C5, C10 (HUMAN of B, contact of A) · `contact.ownerId IS NULL` C5 (AI ownerless) - each seed admitted by exactly one rule; list-filter mutant killed | - |
| `scopeFor` branches through the list and `readable` (2 roles-branches x admit/reject) | `scope.ts:14-15` (non-COMMERCIAL `{}`) and `:16-25` | list: non-COMMERCIAL C3 (ADMIN, MANAGER), COMMERCIAL C5 · `readable` admit: non-COMMERCIAL C9, C12; COMMERCIAL C10, C16 · `readable` reject: COMMERCIAL C11, C16; other tenant C11, C15 | - |
| roles (3) | `Role` enum (`schema.prisma:42-46`) | list: ADMIN C3 · MANAGER C3 · COMMERCIAL C5; matrix C1; `/me` C24 over all three | - |
| invalid inputs (AC 11, 12) | Zod schemas `conversation.schema.ts:4-11`, `pagination.ts:7-10` | unknown query field x 3 routes C18 · `limit=0` / `limit=101` / `limit=abc` x 2 paged routes C19 · `cursor` not uuid x 2 C19 · `:id` not uuid x 2 C19 · unknown params field: unreachable (Fastify params carry only path segments; `.strict()` present at `conversation.schema.ts:11`) | - |
| Landing doors (3) | plan Landing | door 1 C1, C17 · door 2 C2, C12, C13 · door 3 C4, C9, C14 | - |
| ConversationSummary keys (10 + contact 3 + channel 3) | plan Surface | C4 `toEqual` over the full object (extra or missing key at any level fails) | - |
| Message keys (10) | plan Surface | C14 `Object.keys(item).sort()` equal to the 10 keys, for every item | - |
| message nullability (2) | AC 10 | `text` null for `UNSUPPORTED` C14 · `deliveryStatus` null for `INBOUND` C14 (UNSUPPORTED and TEXT inbound) | - |
| `pageArgs` callers (2) | `rg "pageArgs("` outside specs: `read.ts:55`, `read.ts:91` | default `id desc` C2, C3, C7 · `seq desc` C2, C12, C13 | - |
| `operationId`s (3) | plan Impact | C17 (registration) · C25 (`openapi.json`) | - |

- Sweep: response enums (`status`, `handler`, `channel.kind`, `direction`, `author`, `kind`, `deliveryStatus`) are not enumerated in the plan; compared statically, each `z.enum` in `conversation.schema.ts:16-45` equals its Prisma enum (`schema.prisma:273, 312, 318, 353, 358, 366, 371`), so no stored value can fail response serialization. No row owed.
- Sweep: `architecture.md` §9 also lists 402 (suspended org) and 409/422; no guard or handler on these routes produces them (read-only routes, no suspension check exists in `tenant-context.ts`), consistent with the plan's Surface.

## Test policy rows

`checks.md` carries no `Test policy` section and claims `CLAUDE.md` "Testes" answers the level question. Judgment: the claim holds. The feature adds two kinds of file, both named by that section (endpoint -> integration with real PostgreSQL, `withTwoTenants`, `withTwoSalespeople` where there is a portfolio; pure rule -> unit over every transition), so the repo convention decides. Rows below are that convention applied.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Endpoint: integration over real PostgreSQL via `app.inject`, with `withTwoTenants` | `conversation.routes.ts`, `read.ts`, `conversation.schema.ts` | `read.spec.ts` HTTP tests C3-C15, C18-C23; `withTwoTenants` at `read.spec.ts:205, 290, 415, 429` | yes |
| Endpoint with a portfolio: `withTwoSalespeople` | `read.ts` (`scopeFor`) | factory at `read.spec.ts:430` (C16); route tests seed the same shape with a signed-in COMMERCIAL A and a second COMMERCIAL B (`read.spec.ts:179-180, 265-266, 282-283`) because the factory returns contexts without a session cookie (`test/factories.ts:49-65`) | yes |
| Pure rule: unit over every transition | `shared/pagination.ts` (`pageArgs`) | `pagination.spec.ts:14-32`: default order with and without cursor, given order with and without cursor | yes |
| Do not mock the database | `read.spec.ts` | `grep "vi.mock\|vi.spyOn"` in `read.spec.ts` finds nothing; all seeds go through `deps.db` | yes |
| Test fails if the behaviour is removed (L-031..L-033) | `read.ts`, `pagination.ts`, `conversation.schema.ts`, `conversation.routes.ts` | C3 seeds out of insertion order; C5 single-rule seeds; C12 asserts its id/seq precondition; 5 of 5 injected faults killed | yes |

## Faults injected

Scratch: `git worktree add --detach <scratchpad>/wt HEAD`, `pnpm install --offline --frozen-lockfile`, `.env` symlinked; baseline run of `read.spec.ts` in the scratch 21/21 green. Each fault reverted (`git checkout -- .`, diff empty) before the next. Real tree porcelain before: empty; after `git worktree remove --force` + `prune`: empty (matched). No scratch run overlapped a real-tree run.

| Mutation | Location | Killed |
| --- | --- | --- |
| `readable` drops the portfolio filter: `where: { AND: [{ id }, scopeFor(ctx).conversation] }` -> `where: { id }` | `apps/server/src/modules/conversations/read.ts:43` | yes - C11 "answers not found outside the tenant or the portfolio" and C16 "finds a readable conversation for the portfolio only" failed |
| `pageArgs` ignores the given order: `orderBy: orderBy ?? { id: 'desc' }` -> `orderBy: { id: 'desc' }` | `apps/server/src/shared/pagination.ts:26` | yes - C2 "orders by the given field and keeps id as the cursor", C12 "orders messages by seq even when ids disagree", C13 "pages messages by seq without repeating" failed |
| list drops the portfolio filter: `where: scopeFor(ctx).conversation` -> `where: {}` | `apps/server/src/modules/conversations/read.ts:53` | yes - C5 "lists only the portfolio of a commercial" failed |
| detail query loses `.strict()`: `z.object({}).strict()` -> `z.object({})` | `apps/server/src/modules/conversations/conversation.schema.ts:9` | yes - C18 "rejects unknown query fields" failed (`expected 200 to be 400` on the detail route) |
| permission swapped: `requirePermission('conversation:read')` -> `requirePermission('organization:read')` | `apps/server/src/modules/conversations/conversation.routes.ts:23` | yes - C17 "guards every conversation route with conversation:read" failed |

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` (repo root, at `d560e80`) - exit 0: biome checked 186 files, no fixes; `tsc --noEmit` clean in `apps/server` and `apps/web`; vitest 38 files, 393 passed, 0 failed; `apps/server` `tsc -p tsconfig.build.json` and `apps/web` `vite build` done. Real tree porcelain empty afterwards.

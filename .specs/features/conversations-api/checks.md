# Conversations API checks

Profile: standard
Plan: `.specs/features/conversations-api/plan.md`

26 checks in 4 slices · 3 one-way doors · 0 open

Every proof runs from `apps/server` with `pnpm exec vitest run <file> -t "<name>"` against the real
PostgreSQL of the docker compose. The route tests use `buildTestApp` + `TestClient` (a real session
cookie), as `member.spec.ts` does. The route file is `src/modules/conversations/read.spec.ts`.

## Checks

### S1 - Permissão e paginação compartilhada · 4 files · ~4 KB · ~2k

**C1** - `ROLE_PERMISSIONS` is exactly `ADMIN: [organization:read, organization:update, invitation:create, member:update, portfolio:transfer, conversation:read]`, `MANAGER: [organization:read, conversation:read]`, `COMMERCIAL: [organization:read, conversation:read]`, and `PERMISSIONS` contains `conversation:read` (door 1, AC 16)
Proof: `src/shared/permissions.spec.ts -t "matches the role permission snapshot"`

**C2** - `pageArgs(query)` with no second argument still returns `orderBy: { id: 'desc' }`; `pageArgs(query, { seq: 'desc' })` returns `orderBy: { seq: 'desc' }`, `take: limit + 1`, and with a cursor `cursor: { id }` and `skip: 1` (door 2, Impact "shared")
Proof: `src/shared/pagination.spec.ts -t "orders by the given field and keeps id as the cursor"`
Proof: `src/shared/pagination.spec.ts -t "fetches one extra row and skips the cursor row"`

### S2 - Listar conversas pela carteira · 5 files · ~50 KB · ~13k

**C3** - With 3 conversations of the tenant seeded in an order unrelated to their ids, an ADMIN's `GET /api/v1/conversations` answers `200` with all 3 in descending `id` order and `nextCursor: null`, and a MANAGER of the same organization gets the same 3 ids (AC 1)
Proof: `src/modules/conversations/read.spec.ts -t "lists every conversation of the tenant for admin and manager"`

**C4** - An item of the list is exactly `{ id, status, handler, assigneeId, contact: { id, phoneE164, ownerId }, channel: { id, kind, name }, lastSeq, lastMessageAt, closedAt, createdAt }` - these keys and no others at each level - with the seeded values: `status`/`handler` as literal enum names, `channel.kind` `WEB_CHAT`, dates as ISO strings and `null` for an unset `lastMessageAt`/`closedAt` (door 3, AC 1)
Proof: `src/modules/conversations/read.spec.ts -t "returns the conversation summary shape"`

**C5** - For a COMMERCIAL A signed in, with the six conversations of `scope.spec.ts` C48 (HUMAN of A on a contact of B, HUMAN of B with contact of B, QUEUE with contact of B, AI with ownerless contact, AI with contact of B, HUMAN of B with contact of A), `GET /api/v1/conversations` returns exactly the ids {HUMAN of A, QUEUE, AI ownerless, HUMAN of B with contact of A} and not the HUMAN of B with contact of B nor the AI with contact of B (AC 2, ADR-016)
Proof: `src/modules/conversations/read.spec.ts -t "lists only the portfolio of a commercial"`

**C6** - A conversation of another organization (`withTwoTenants`) never appears in the list of an ADMIN of the tenant under test (AC 3)
Proof: `src/modules/conversations/read.spec.ts -t "hides the other tenant from the conversation list"`

**C7** - With 5 visible conversations, `?limit=2` returns 2 items and a `nextCursor`; following the cursor yields pages of 2, 2 and 1, the last with `nextCursor: null`, and the concatenated ids equal the 5 ids in descending order with no repeat (AC 4)
Proof: `src/modules/conversations/read.spec.ts -t "pages the conversation list without repeating"`

**C8** - A tenant with no conversation (a fresh onboarding) answers `200 { items: [], nextCursor: null }` (AC 5)
Proof: `src/modules/conversations/read.spec.ts -t "returns an empty conversation page"`

### S3 - Ler uma conversa e as mensagens · 3 files · ~40 KB · ~10k

**C9** - `GET /api/v1/conversations/:id` by an ADMIN answers `200` with the same object the list returns for that id (C4 shape and values) (AC 6)
Proof: `src/modules/conversations/read.spec.ts -t "reads one conversation"`

**C10** - `GET /api/v1/conversations/:id` by COMMERCIAL A for a conversation in A's portfolio (HUMAN of B with contact of A) answers `200` (AC 6, AC 2)
Proof: `src/modules/conversations/read.spec.ts -t "reads a conversation of the commercial portfolio"`

**C11** - For a conversation of another organization, one outside the portfolio of COMMERCIAL A (HUMAN of B with contact of B) and a random UUID, both `GET /api/v1/conversations/:id` and `GET /api/v1/conversations/:id/messages` answer `404` with bodies deep-equal to each other: `{ error: { code: 'NOT_FOUND', message } }` (AC 7)
Proof: `src/modules/conversations/read.spec.ts -t "answers not found outside the tenant or the portfolio"`

**C12** - With 4 messages seeded so that the order of their `id`s is the reverse of their `seq` order (seq 1 has the greatest id), `GET /api/v1/conversations/:id/messages` returns `seq` `[4, 3, 2, 1]` (door 2, AC 8)
Proof: `src/modules/conversations/read.spec.ts -t "orders messages by seq even when ids disagree"`

**C13** - With 5 messages whose `id` order differs from their `seq` order, `?limit=2` pages give `seq` `[5, 4]`, `[3, 2]`, `[1]`, the last with `nextCursor: null`, and every `nextCursor` is the `id` of the last message of its page (door 2, AC 9)
Proof: `src/modules/conversations/read.spec.ts -t "pages messages by seq without repeating"`

**C14** - A message item is exactly `{ id, seq, direction, author, authorUserId, kind, text, deliveryStatus, sentAt, createdAt }`; an `UNSUPPORTED` inbound has `text: null` and `deliveryStatus: null`, a `TEXT` inbound has its text and `deliveryStatus: null`, and a HUMAN outbound has `authorUserId` of the sender and `deliveryStatus: 'SENT'` (door 3, AC 10)
Proof: `src/modules/conversations/read.spec.ts -t "returns the message shape"`

**C15** - The messages of a conversation of another organization never appear: the route answers `404` for it (C11) and the page of the tenant's own conversation holds only its own message ids (AC 3)
Proof: `src/modules/conversations/read.spec.ts -t "hides the other tenant messages"`

**C16** - `findReadableConversation` is exported by `modules/conversations/index.ts` and, called with the context of COMMERCIAL A, returns the conversation for an id in A's portfolio and throws `404 NOT_FOUND` for one outside it (the function `realtime-events` authorizes rooms with, Flow 2)
Proof: `src/modules/conversations/read.spec.ts -t "finds a readable conversation for the portfolio only"`

### S4 - Contrato das rotas · 6 files · ~50 KB · ~13k

**C17** - Each route registers `requirePermission('conversation:read')` in its `preHandler` and the `operationId`s `listConversations`, `getConversation`, `listConversationMessages`, read from the route options that Fastify's `onRoute` hands the plugin (door 1, AC 16)
Proof: `src/modules/conversations/read.spec.ts -t "guards every conversation route with conversation:read"`

**C18** - An unknown query field (`?foo=1`) answers `400` on each of the three routes, including `GET /api/v1/conversations/:id`, which declares an empty strict query (AC 11)
Proof: `src/modules/conversations/read.spec.ts -t "rejects unknown query fields"`

**C19** - `limit=0`, `limit=101`, `limit=abc` and `cursor=nao-uuid` each answer `400` on the list and on the messages route, and `:id` = `nao-uuid` answers `400` on the detail and messages routes (AC 12)
Proof: `src/modules/conversations/read.spec.ts -t "rejects invalid paging and ids"`

**C20** - Without a session, each of the three routes answers `401 UNAUTHENTICATED` (AC 13)
Proof: `src/modules/conversations/read.spec.ts -t "requires a session for conversation routes"`

**C21** - A signed-in user with pending terms and an active organization gets `403 TERMS_NOT_ACCEPTED` on each of the three routes (AC 14)
Proof: `src/modules/conversations/read.spec.ts -t "blocks conversation routes while terms are pending"`

**C22** - A signed-in user with accepted terms and no active organization gets `403 NO_ACTIVE_ORGANIZATION` on each of the three routes (Surface `403`)
Proof: `src/modules/conversations/read.spec.ts -t "requires an active organization for conversation routes"`

**C23** - A member deactivated in the active organization gets `404 NOT_FOUND` on each of the three routes (AC 15)
Proof: `src/modules/conversations/read.spec.ts -t "hides conversation routes from an inactive member"`

**C24** - `GET /api/v1/me` of a COMMERCIAL lists `conversation:read` among its permissions (Impact "domain")
Proof: `src/modules/auth/me.spec.ts -t "reports role and permissions for the active membership"`

**C25** - After `pnpm api:generate`, `git diff --exit-code -- apps/server/openapi.json apps/web/src/api` exits 0 (the CI step), and `openapi.json` holds the three `operationId`s (AC 17)
Proof: `pnpm api:generate && git add --all --intent-to-add apps/server/openapi.json apps/web/src/api && git diff --exit-code -- apps/server/openapi.json apps/web/src/api` (from the repo root)
Proof: `grep -c '"operationId": "\(listConversations\|getConversation\|listConversationMessages\)"' apps/server/openapi.json` prints `3`

**C26** - The module boundary holds: the routes live in `modules/conversations`, read only through `withTenant` with `scopeFor(ctx).conversation`, and `architecture.spec` stays green (no new cross-module import, no write outside the module's tables)
Proof: `test/architecture.spec.ts -t "the source tree has no boundary violations|finds no import cycle between modules|lets each module write only its own tables|input schemas never accept an id"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/v1/conversations` statuses (5) | 200 C3, C5, C8 · 400 C18, C19 · 401 C20 · 403 C21, C22, C17 (`FORBIDDEN` via the declared guard) · 404 C23 | - |
| `GET /api/v1/conversations/:id` statuses (5) | 200 C9, C10 · 400 C18, C19 · 401 C20 · 403 C21, C22, C17 · 404 C11, C23 | - |
| `GET /api/v1/conversations/:id/messages` statuses (5) | 200 C12, C13, C14 · 400 C18, C19 · 401 C20 · 403 C21, C22, C17 · 404 C11, C23 | - |
| Landing doors (3) | door 1 C1, C17 · door 2 C2, C12, C13 · door 3 C4, C14 | - |
| roles reading the list (3) | ADMIN C3 · MANAGER C3 · COMMERCIAL C5 | - |
| COMMERCIAL conversation filter rules of AD-014 (4) | `assigneeId = me` C5 (HUMAN of A on a contact of B) · `handler = QUEUE` C5 (QUEUE with contact of B) · `contact.ownerId = me` C5, C10 (HUMAN of B with contact of A) · `contact.ownerId IS NULL` C5 (AI ownerless) | - |
| 404 causes on `:id` routes (3) | other tenant C11 · outside the portfolio C11 · nonexistent C11 | - |
| invalid inputs (6) | unknown query field C18 · `limit=0` C19 · `limit=101` C19 · `limit=abc` C19 · `cursor` not uuid C19 · `:id` not uuid C19 | - |
| `403` causes (3) | `TERMS_NOT_ACCEPTED` C21 · `NO_ACTIVE_ORGANIZATION` C22 · `FORBIDDEN` C17 | - |
| message nullability (2) | `text` null for `UNSUPPORTED` C14 · `deliveryStatus` null for `INBOUND` C14 | - |
| ConversationSummary keys (10) | C4, table-driven over all 10 (exact key set: `id`, `status`, `handler`, `assigneeId`, `contact`, `channel`, `lastSeq`, `lastMessageAt`, `closedAt`, `createdAt`) | - |
| Message keys (10) | C14, table-driven over all 10 (exact key set: `id`, `seq`, `direction`, `author`, `authorUserId`, `kind`, `text`, `deliveryStatus`, `sentAt`, `createdAt`) | - |
| `pageArgs` callers (2 orderings) | default `id desc` C2 · `seq desc` C2 | - |

- `403 FORBIDDEN` from `requirePermission` is unreachable over HTTP today (every role holds `conversation:read`); C17 proves the guard is declared on each route, and the boot already refuses a `/api/v1` route without one.
- Claims naming a status, route or response shape (C3–C15, C18–C24) are proven over HTTP with `app.inject`; C16 and C17 are proven at the use-case and route-registration level because that is where their claim sits.
- The per-rule proof of the portfolio filter at its own layer already exists (`conversation-core` C47, C48); C5 proves the route applies it.

Test policy: the repo answers both questions (`CLAUDE.md` "Testes": endpoint -> integration with real PostgreSQL, `withTwoTenants` and `withTwoSalespeople`; pure rule -> unit over every transition), so there is no `Test policy` section. The only decision this feature adds is the choice of ordering in `pageArgs`, proven at its own layer (C2); the portfolio filter it reuses is proven at its own layer by `conversation-core` C47/C48.

## Swept

- validation: C18, C19
- failure modes: C11, C23 (not found), C20–C22 (guards)
- idempotency: n/a - read-only routes
- authorization: C5, C10, C11, C16, C17, C20–C23
- concurrency: n/a - reads; the order of concurrent messages is settled by `seq` (C12)
- data lifecycle: n/a - nothing written or migrated
- dependency failure: n/a - no external dependency; PostgreSQL failure is the existing `500` path
- state transitions: n/a - no state changes
- observability: n/a - no new log or metric; request logging is existing

## Handoff

- S1 ~2k + S2 ~13k + S3 ~10k + S4 ~13k ≈ 38k tokens (≈ 100 KB read: `member.spec.ts` 34 KB as the route-test pattern, `openapi.json` 42 KB, `me.spec.ts` 11 KB, `app.ts`, `pagination`, `permissions`, `test/conversations.ts`; new `read.ts`, `conversation.schema.ts`, `conversation.routes.ts`, `read.spec.ts`; `apps/web/src/api` is generated, not read), under the 150k budget - one builder

- **Boundary:** C1-C26 closed at `e299078`
- **Settled mid-build:** C18 - `GET /api/v1/conversations/:id` declares an empty `.strict()` query, because Fastify ignores a query without a schema and AC 11 asks `400` on each route; `member.spec.ts` "lets an admin demote themself" fixed MANAGER's permission list literally and now lists `conversation:read` (the matrix change of Impact "domain", not a weakened assert)
- **Abandoned:** none

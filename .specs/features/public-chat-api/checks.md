# Public Chat API checks

Profile: standard
Plan: `.specs/features/public-chat-api/plan.md`

46 checks in 7 slices · 7 one-way doors · 1 open (blocks go-live, none blocks the build)

Every proof runs from `apps/server` with `pnpm exec vitest run <file> -t "<name>"` against the real
PostgreSQL of the docker compose. The route tests use `buildTestApp` + `app.inject` (no panel
session: the visitor has none) and give each test its own `remoteAddress`, so the per-IP limit
only fires where a check asks for it. The route file is `src/modules/channels/public-chat.spec.ts`.

## Checks

### S0 - Tenant pela chave, token e consentimento (fundação) · 8 files · ~90 KB · ~23k

**C1** - `db.withPublicChatKey(key, tx => tx.organization.findMany())` returns exactly the organization of that key among two seeded organizations; a key of no organization returns `[]`; inside it `tx.contact.findMany()` fails (no tenant set) (door 1)
Proof: `src/infrastructure/database.spec.ts -t "reads only the organization of the public chat key"`

**C2** - `app.public_chat_key` does not outlive the transaction: a `withoutTenant` transaction right after `withPublicChatKey` on the same pool reads no organization row (door 1)
Proof: `src/infrastructure/database.spec.ts -t "does not leak the public chat key to the next transaction"`

**C3** - The `Organization` policy still hides every other organization from `withUser` and `withTenant` after the new branch: `withTenant(A)` reads only A and `withUser(u)` reads only the organizations where `u` is a member (Impact "tenant")
Proof: `src/infrastructure/database.spec.ts -t "lists only the caller organizations"`
Proof: `test/schema.spec.ts -t "protects Organization with tenant_isolation"`

**C4** - `ConsentRecord` has row security `ENABLE` + `FORCE` and the `tenant_isolation` policy, its relations to `Contact`, `Conversation` and `Channel` are composite with `organizationId`, `onDelete: Restrict`, and the generic schema checks stay green (door 2)
Proof: `test/schema.spec.ts -t "every tenant table is protected by row security"`
Proof: `test/schema.spec.ts -t "every relation between tenant-scoped models uses a composite foreign key"`
Proof: `test/schema.spec.ts -t "protects the consent record with tenant_isolation"`

**C5** - `signVisitorToken` + `readVisitorToken` round-trip `{ organizationId, contactId, conversationId, fromSeq }`; the value has the literal shape `v1.<base64url>.<base64url>` (door 4)
Proof: `src/modules/channels/visitor-token.spec.ts -t "round-trips the visitor session"`

**C6** - `readVisitorToken` returns `null` for: a changed payload byte, a changed signature byte, a token signed with another secret, a `v2.` prefix, a token whose `exp` is 1 s in the past, and garbage; it accepts the same token 1 s before `exp` (door 4, L-012)
Proof: `src/modules/channels/visitor-token.spec.ts -t "rejects tampered, foreign, expired and malformed tokens"`
Proof: `src/modules/channels/visitor-token.spec.ts -t "accepts a token just inside its expiry"`

**C7** - `receiveInbound(..., { onReceived })` calls `onReceived` once with the transaction and `{ conversationId, messageId, created: true }` of the new message; for a duplicate `externalId` it is not called (door 3)
Proof: `src/modules/conversations/inbound.spec.ts -t "runs the received step inside the transaction of a new message only"`

**C8** - When `onReceived` throws, the message, the contact and the conversation of that call are not stored and the conversation's `lastSeq` is unchanged (door 3, AC 6)
Proof: `src/modules/conversations/inbound.spec.ts -t "rolls the message back when the received step fails"`

### S1 - Abrir o link e iniciar a sessão · 6 files · ~80 KB · ~20k

**C9** - `GET /api/public/chat/:key` answers `200` with exactly `{ name, brandColor, greeting, hasLogo, noticeVersion, turnstileSiteKey }`, with the seeded name, color and greeting of that organization (not of the other tenant's key), `hasLogo` true only after a logo was stored, `noticeVersion` `'2026-09-25'`, and `turnstileSiteKey` equal to `TURNSTILE_SITE_KEY` (or `null` without it) (AC 1)
Proof: `src/modules/channels/public-chat.spec.ts -t "describes the web chat of the key"`

**C10** - A well-formed key of no organization answers `404 NOT_FOUND` on each of the five routes (the two `POST` with a valid body, the cookie-bearing ones with a valid cookie of another key) (AC 2)
Proof: `src/modules/channels/public-chat.spec.ts -t "answers not found for an unknown key"`

**C11** - `POST /sessions` with phone `(11) 9xxxx-xxxx`, `consent: true`, the current `noticeVersion`, a Turnstile token and `text` answers `201 { message }`, and the stored message is `INBOUND`, author `CONTACT`, kind `TEXT`, with that text, on the `WEB_CHAT` channel of the key's organization, in a conversation of the contact whose `phoneE164` is the E.164 of the phone (AC 3)
Proof: `src/modules/channels/public-chat.spec.ts -t "starts a session with the first message"`

**C12** - The conversation created by `POST /sessions` is stored with `status = OPEN` and `handler = QUEUE` (AC 4)
Proof: `src/modules/channels/public-chat.spec.ts -t "opens the new conversation in the queue"`

**C13** - After `201`, exactly one `ConsentRecord` exists for that start, with the contact, conversation and `WEB_CHAT` channel of the message and `noticeVersion` `'2026-09-25'`; two starts from two browsers with the same phone store two records (AC 5, door 2)
Proof: `src/modules/channels/public-chat.spec.ts -t "records the consent of every session start"`

**C14** - The `201` of `POST /sessions` sets `bens_visitor=v1.…` with `HttpOnly`, `SameSite=Lax`, `Path=/api/public/chat/<key>`, `Max-Age=2592000`, and without `Secure` under `NODE_ENV=test`; `buildVisitorCookie` with `secure: true` adds `Secure` and `loadConfig` with `NODE_ENV=production` makes the route pass `secure: true` (AC 7, door 4)
Proof: `src/modules/channels/public-chat.spec.ts -t "sets the visitor cookie on the link path"`
Proof: `src/modules/channels/visitor-token.spec.ts -t "marks the cookie secure in production"`

**C15** - The message stored by `POST /sessions` produces one `message.created` event with that `organizationId`, `conversationId` and `messageId` (AC 8)
Proof: `src/modules/channels/public-chat.spec.ts -t "notifies the panel of the visitor message"`

**C16** - With tenants A and B (`withTwoTenants`), a start through A's key stores the contact, conversation, message and consent in A, and B's tables hold none of them; a start with the same phone through B's key creates B's own rows and never touches A's conversation (AC 9)
Proof: `src/modules/channels/public-chat.spec.ts -t "writes only in the organization of the key"`

### S2 - Recusar o início inválido · 4 files · ~40 KB · ~10k

**C17** - `consent: false` and a missing `consent` each answer `400` on `POST /sessions`, and no contact, conversation, message or consent is stored (AC 10)
Proof: `src/modules/channels/public-chat.spec.ts -t "refuses a start without consent"`

**C18** - `noticeVersion: '2020-01-01'` answers `422 NOTICE_OUTDATED` and nothing is stored (AC 11)
Proof: `src/modules/channels/public-chat.spec.ts -t "refuses an outdated notice"`

**C19** - phone `123` answers `422 INVALID_PHONE` and nothing is stored (AC 12)
Proof: `src/modules/channels/public-chat.spec.ts -t "refuses an invalid phone"`

**C20** - With `TURNSTILE_SECRET_KEY` set and a local siteverify that answers `success: false`, `POST /sessions` answers `403 TURNSTILE_FAILED` and nothing is stored (AC 13)
Proof: `src/modules/channels/public-chat.spec.ts -t "refuses a start the captcha rejects"`

**C21** - With a local siteverify that answers `success: true`, the start answers `201` and the siteverify received exactly one request carrying `secret` = `TURNSTILE_SECRET_KEY` and `response` = the body's `turnstileToken` (AC 14)
Proof: `src/modules/channels/public-chat.spec.ts -t "verifies the captcha token with the secret"`

**C22** - With `TURNSTILE_SECRET_KEY` set and the siteverify unreachable, `POST /sessions` answers `403 TURNSTILE_FAILED` and nothing is stored (fail closed; dependency failure)
Proof: `src/modules/channels/public-chat.spec.ts -t "fails closed when the captcha is unreachable"`

**C23** - `loadConfig` with `NODE_ENV=production` rejects a missing `TURNSTILE_SECRET_KEY` and a missing `TURNSTILE_SITE_KEY` under `SIGNUP_MODE=closed` and under `self_serve`, naming the variable; with both set it loads (AC 15)
Proof: `src/shared/config.spec.ts -t "requires turnstile keys in production in every signup mode"`

**C24** - An unknown body field, `text: ''`, `text` of 4 001 characters and `clientMessageId: 'x'` each answer `400` on `POST /sessions` and on `POST /messages`; `text` of exactly 4 000 characters is accepted; a key that is not 32 hex answers `400` on every route; an unknown query field and `after=-1` answer `400` on `GET /messages` (AC 16)
Proof: `src/modules/channels/public-chat.spec.ts -t "validates the public chat inputs"`

### S3 - Conversar dentro da sessão · 3 files · ~40 KB · ~10k

**C25** - With the cookie of a started session, `POST /messages` answers `201 { message }` and stores the message in the token's conversation, on the contact of the start's phone, with the next `seq` (AC 17)
Proof: `src/modules/channels/public-chat.spec.ts -t "sends a message within the session"`

**C26** - Sending the same `clientMessageId` twice answers `201` then `200` with the same message `id`, and the conversation holds one message for it (AC 18, door 7)
Proof: `src/modules/channels/public-chat.spec.ts -t "answers a repeated message with the original"`

**C27** - A visitor who sends a `clientMessageId` already stored in another visitor's conversation of the same organization gets `409 CONFLICT`, and the body carries neither that message's id nor its text (AC 19)
Proof: `src/modules/channels/public-chat.spec.ts -t "refuses a message id of another conversation"`

**C28** - After the token's conversation is closed (seeded `CLOSED`), `POST /messages` answers `201`, the same conversation id is `OPEN` again, and a following `GET /messages` with the same cookie answers `200` (AC 20)
Proof: `src/modules/channels/public-chat.spec.ts -t "reopens the closed conversation of the session"`

**C29** - `POST /messages` and `GET /messages` answer `401 VISITOR_SESSION_REQUIRED` for: no cookie, a cookie with one changed byte, a cookie whose `exp` passed, and a valid cookie of organization A sent to organization B's key path (AC 21)
Proof: `src/modules/channels/public-chat.spec.ts -t "requires a valid visitor session"`

### S4 - Ler só a própria sessão · 3 files · ~30 KB · ~8k

**C30** - `GET /messages` answers `200 { items }` in ascending `seq`, each item exactly `{ id, seq, direction, author, kind, text, sentAt }` (no `authorUserId`, `deliveryStatus`, `conversationId`, `externalId`, contact data) (AC 22, door 5)
Proof: `src/modules/channels/public-chat.spec.ts -t "lists the session messages in seq order"`
Proof: `src/modules/channels/public-chat.spec.ts -t "orders the session by seq, not by insertion"`

**C31** - A phone whose `WEB_CHAT` conversation already holds 3 messages (seq 1–3, one of them a HUMAN reply) starts a session: its message gets seq 4 and `GET /messages` returns only seq ≥ 4; a message sent by the earlier session afterwards (seq 5) is returned too, and none of seq 1–3 ever is (AC 23, door 5, decisão do usuário)
Proof: `src/modules/channels/public-chat.spec.ts -t "hides every message before the session start"`

**C32** - With 5 messages in the session, `after=2` returns only the ones with `seq > 2` and ≥ `fromSeq`; with 105 messages, one call returns 100 and `after=<last seq>` returns `[]` (AC 24)
Proof: `src/modules/channels/public-chat.spec.ts -t "reads the session after a seq, a hundred at a time"`

**C33** - A HUMAN reply through `sendMessage` (F2) appears in `GET /messages` with `author: 'HUMAN'`, `direction: 'OUTBOUND'` and no `authorUserId` key (AC 25)
Proof: `src/modules/channels/public-chat.spec.ts -t "shows a human reply to the visitor"`

### S5 - Limitar abuso · 3 files · ~30 KB · ~8k

**C34** - From one IP, 5 `POST /sessions` in a minute answer `201` and the 6th answers `429 { error: { code: 'RATE_LIMITED' } }` with nothing stored for it (AC 26, door 6)
Proof: `src/modules/channels/public-chat.spec.ts -t "limits session starts per ip"`

**C35** - 60 `POST /sessions` to one key from 60 different IPs answer non-`429`, the 61st from a new IP answers `429 RATE_LIMITED`, and a start to another organization's key from a new IP still answers `201` (AC 27)
Proof: `src/modules/channels/public-chat.spec.ts -t "limits session starts per key"`

**C36** - One visitor token gets `201` on 20 `POST /messages` in a minute and `429 RATE_LIMITED` on the 21st, while another token from the same IP still gets `201` (AC 28)
Proof: `src/modules/channels/public-chat.spec.ts -t "limits messages per visitor"`

**C37** - From one IP, 120 public `GET`s in a minute answer non-`429` and the 121st answers `429 RATE_LIMITED`, on each of `GET /:key`, `GET /logo` and `GET /messages` (AC 29)
Proof: `src/modules/channels/public-chat.spec.ts -t "limits public reads per ip"`

**C38** - After 121 public `GET`s and 6 starts from one IP, `GET /api/health` and an authenticated `GET /api/v1/me` from the same IP answer non-`429` (AC 30)
Proof: `src/modules/channels/public-chat.spec.ts -t "limits only the public chat routes"`

### S6 - Logo público e contrato · 5 files · ~60 KB · ~15k

**C39** - With a logo stored for the key's organization, `GET /logo` answers `200` with the same bytes and the stored `Content-Type`; the other tenant's key returns the other tenant's logo, never this one; without a logo it answers `404 NOT_FOUND` (AC 31)
Proof: `src/modules/channels/public-chat.spec.ts -t "serves the logo of the key"`

**C40** - A `POST /sessions` with `Origin` of another site answers `403 ORIGIN_NOT_ALLOWED` and stores nothing (Surface `403`, AD-004)
Proof: `src/modules/channels/public-chat.spec.ts -t "refuses a public write from another origin"`

**C41** - The public routes declare the `operationId`s `getPublicChat`, `getPublicChatLogo`, `startPublicChatSession`, `sendPublicChatMessage`, `listPublicChatMessages`, and `pnpm api:generate` leaves no diff in `apps/server/openapi.json` nor `apps/web/src/api`
Proof: `pnpm api:generate && git add --all --intent-to-add apps/server/openapi.json apps/web/src/api && git diff --exit-code -- apps/server/openapi.json apps/web/src/api` (from the repo root)
Proof: `grep -c '"operationId": "\(getPublicChat\|getPublicChatLogo\|startPublicChatSession\|sendPublicChatMessage\|listPublicChatMessages\)"' apps/server/openapi.json` prints `5`

**C42** - Module boundaries hold: `ConsentRecord` is owned by `contacts` in `TABLE_OWNERS`, `channels` writes it only through a `contacts` export, the organization read by key lives in `organizations`, no import cycle, and input schemas take no `id` (Flow, AD-017)
Proof: `test/architecture.spec.ts -t "the source tree has no boundary violations|finds no import cycle between modules|lets each module write only its own tables|input schemas never accept an id"`

**C43** - `@fastify/rate-limit` is a dependency of `apps/server` at `11.x` and is registered with `global: false` (door 6)
Proof: `src/modules/channels/public-chat.spec.ts -t "limits only the public chat routes"`
Proof: `grep -c '"@fastify/rate-limit": "11\.' apps/server/package.json` prints `1`

**C44** - `WEB_CHAT_NOTICE_VERSION` is `'2026-09-25'` and `GET /api/public/chat/:key` reports it (Impact "domain", AC 1)
Proof: `src/modules/channels/public-chat.spec.ts -t "describes the web chat of the key"`

**C46** - `GET /logo` answers with `Cache-Control: public, no-cache` and an `ETag` of 32 hex characters in quotes; the same `If-None-Match` answers `304` with an empty body, and another one answers `200` with the bytes (Surface `/logo`, added in round 2)
Proof: `src/modules/channels/public-chat.spec.ts -t "caches the public logo by its etag"`

**C45** - Repeating `POST /sessions` with the same body answers `201` with the same message, and the same `clientMessageId` with another phone answers `409` without that message's id or text; the organization keeps 1 contact, 1 conversation, 1 message and 1 consent (Surface `409`, added in build; door 7)
Proof: `src/modules/channels/public-chat.spec.ts -t "answers a repeated start with the same session"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/public/chat/:key` statuses (4) | 200 C9 · 400 C24 · 404 C10 · 429 C37 | - |
| `GET /api/public/chat/:key/logo` statuses (5) | 200 C39, C46 · 304 C46 · 400 C24 · 404 C10, C39 · 429 C37 | - |
| `GET /logo` headers (2) | `Cache-Control` C46 · `ETag` C46 | - |
| `POST /api/public/chat/:key/sessions` statuses (7) | 201 C11, C45 · 400 C17, C24 · 403 C20, C22, C40 · 404 C10 · 409 C45 · 422 C18, C19 · 429 C34, C35 | - |
| `POST /api/public/chat/:key/messages` statuses (8) | 200 C26 · 201 C25 · 400 C24 · 401 C29 · 403 C40 (same origin hook, asserted on `/sessions`; the hook is global, `app.spec` covers every path) · 404 C10 · 409 C27 · 429 C36 | - |
| `GET /api/public/chat/:key/messages` statuses (5) | 200 C30 · 400 C24 · 401 C29 · 404 C10 · 429 C37 | - |
| Landing doors (7) | 1 key tenant C1, C2, C3 · 2 ConsentRecord C4, C13 · 3 atomic consent C7, C8 · 4 visitor token C5, C6, C14 · 5 seq cut and ascending order C30, C31, C32 · 6 rate limit C34–C38, C43 · 7 externalId C26, C27 | - |
| Invalid-cookie causes (4) | missing C29 · tampered C29, C6 · expired C29, C6 · other organization C29 | - |
| Token rejections at its own layer (6) | payload byte C6 · signature byte C6 · other secret C6 · version C6 · expired C6 · garbage C6 | - |
| Start refusals (5) | no consent C17 · outdated notice C18 · invalid phone C19 · captcha rejected C20 · captcha unreachable C22 | - |
| Invalid inputs (8) | unknown body field C24 · empty text C24 · 4 001 chars C24 · bad `clientMessageId` C24 · bad key C24 · unknown query field C24 · `after=-1` C24 · `consent` missing C17 | - |
| Rate limits (7) | start/IP C34 · start/key C35 · messages/token C36 · reads/IP on `GET /:key` C37 · reads/IP on `GET /logo` C37 · reads/IP on `GET /messages` C37 · only public routes C38 | - |
| Cookie attributes (6) | `HttpOnly` C14 · `SameSite=Lax` C14 · `Path` C14 · `Max-Age` C14 · `Secure` in production C14 · value shape C5 | - |
| `PublicMessage` keys (7) | C30, table-driven over all 7 (exact key set: `id`, `seq`, `direction`, `author`, `kind`, `text`, `sentAt`) | - |
| Public chat description keys (6) | C9, table-driven over all 6 (exact key set: `name`, `brandColor`, `greeting`, `hasLogo`, `noticeVersion`, `turnstileSiteKey`) | - |
| Config: Turnstile in production (4) | `closed` secret C23 · `closed` site key C23 · `self_serve` secret C23 · `self_serve` site key C23 | - |
| startup config: rate limit plugin (2 assemblies) | `server.ts` via `buildApp` C43 · `buildTestApp` via `buildApp` C34, C38 | - |

- Claims naming a status, route or response shape (C9–C41) are proven over HTTP with `app.inject`; C1–C8 are proven at their own layer (database, token, use case) because that is where those decisions sit.
- `403 FORBIDDEN` does not exist on these routes: no `requirePermission` (public, outside `/api/v1`; `SESSION_ONLY` unchanged).

## Test policy

The repo answers the level for endpoints (integration with real PostgreSQL, `withTwoTenants`) and pure rules (unit). One decision here has no analogue, so it gets its own row:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| `visitor-token.ts` (sign/verify, expiry, cookie attributes) | one at its own layer **and** one at the boundary | each rejection cause at its own layer (C6), the cookie cause at the boundary (C29) |

Evidence:

- `visitor-token.ts`: version check, split, signature compare, JSON parse, expiry, cookie `Secure` flag - 6 decision points -> decides, reached across a boundary
- closest analogue: `src/shared/crypto.spec.ts` (round-trip + tampering at its own layer), and `invitation.spec.ts` for the token at the route

Cost: 3 unit proofs in 1 file. Without it, the 6 rejection causes would be proven only by the 4 the route test happens to send.

## Swept

- validation: C17, C18, C19, C24
- failure modes: C8 (consent and message roll back together), C22
- idempotency: C26, C27, C45 (dedupe by `webchat:<clientMessageId>`, door 7)
- authorization: C10, C16, C29, C31, C40 (the key is the capability; the cookie scopes the conversation)
- concurrency: existing - two first messages of one phone share one contact and one conversation (`conversation-core` C-series on `receiveInbound`); the start reuses it unchanged
- data lifecycle: C13 (one consent per start, never deleted); cookie expiry C6, C14; nothing to backfill (`ConsentRecord` starts empty)
- dependency failure: C22 (Turnstile unreachable fails closed)
- state transitions: C12 (new → `OPEN`/`QUEUE`), C28 (`CLOSED` → `OPEN` on the visitor's message)
- observability: n/a - no new log or metric requirement; request logs already carry `requestId`, and `pino.redact` keeps the body out

## Handoff

- S0 ~23k + S1 ~20k + S2 ~10k + S3 ~10k + S4 ~8k + S5 ~8k + S6 ~15k ≈ 94k tokens (≈ 375 KB read: `inbound.spec.ts` 15 KB, `schema.spec.ts` 43 KB, `database.spec.ts` 13 KB, `signup-gates.spec.ts` 14 KB for the siteverify fake, `branding.spec.ts` 17 KB, `openapi.json` ~45 KB, `app.ts`, `config.ts`, `database.ts`, migration SQL; new `public-chat.routes.ts`, `public-chat.ts`, `visitor-token.ts`, their specs, a migration), under the 150k budget - one builder

- **Boundary:** C1-C45 closed at the commit `feat(channels): serve the public web chat api`
- **Settled mid-build:**
  - C45 added (additive): a retried start is idempotent, and the plan's `Surface` gained `409` on `POST /sessions`.
  - C23 named `invite_only`, which the `SIGNUP_MODE` enum does not have (only `closed` and `self_serve`). In round 2 the text was corrected to `closed`, the real mode the proof already covered. The obligation did not change: every mode is covered.
  - C14 production half: the route builds the cookie through `visitorCookieFor(config, …)`, proven with `loadConfig(NODE_ENV=production)` at its own layer. An app with `NODE_ENV=production` in the test would call the real siteverify.
  - C2: outside every setting, the `Organization` policy fails closed (it throws), as it did before. "Reads no organization row" is proven by that rejection.
  - `@fastify/rate-limit` marks a request once any of its hooks has run (`rateLimitRan`), so stacking two `rateLimit()` hooks skips the second. The limits use `createRateLimit` in one `onRequest` per route.
  - `organizations/onboarding.spec.ts` stopped importing `channels`. That spec-only edge plus `channels → organizations` formed an import cycle in `architecture.spec`. The step now writes the channel directly.
  - Pre-existing CI break fixed first as its own feature, `openapi-export` (`1eaf414`, PASS): `pnpm api:generate` had been failing since `realtime-events`.
  - Local DB only: the `public` schema had lost the `bens_app` grants after the F1 `migrate reset`. They were re-applied from `docker/postgres/init/01-app-role.sh`, with no code change.
- **Abandoned:** two stacked `fastify.rateLimit()` hooks (see above)

**Round 2 fixes** (after verification round 1, FAIL):
- gap 1 (surviving mutant, `orderBy` removed): new proof on C30 that seeds seq 4, 2, 3 out of insertion order.
- gap 2 (C3 half proven): `lists only the caller organizations` now asserts `withTenant(A)` reads exactly A.
- gap 3 (read limit on one route): C37 now runs over each of the three public `GET`s.
- gap 4 (`/logo` headers and `304`): C46 added, and the plan's `Surface` gained `304` on `/logo`.
- precision: C24 now also proves 4 000 characters accepted on `POST /sessions`; C32 asserts the literal `after=2`; C31 now sends the other session's message through that session's cookie.
- ADR-014 now carries a revision note pointing to AD-018 (the seq cut and the cookie per link).


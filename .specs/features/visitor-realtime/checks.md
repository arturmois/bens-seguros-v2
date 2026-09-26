# Visitor realtime checks

Profile: standard
Plan: `.specs/features/visitor-realtime/plan.md`

18 checks in 3 slices · 3 one-way doors · 0 open

Every proof runs from `apps/server` with `pnpm exec vitest run <file> -t "<name>"` against the real
PostgreSQL of the docker compose. Socket proofs use `buildTestApp` listening on a random port and
`socket.io-client` on the `/visitor` namespace with `auth: { token }`, as `realtime.spec.ts` does for
the panel. **Negative proofs use a sentinel, never a sleep** (same rule as `realtime-events`).

## Checks

### S1 - Token no HTTP e conexão `/visitor` · `public-chat*`, `realtime.ts` + specs · ~40 KB · ~10k

**C1** - `POST /api/public/chat/:key/sessions` with a valid body answers `201` whose JSON has `message` (PublicMessage) and `token` (string matching `/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/`), and the `Set-Cookie` still includes `bens_visitor=`, `HttpOnly`, `SameSite=Lax`, `Path=/api/public/chat/<key>` and `Max-Age=2592000` (door 2, AC 1)
Proof: `src/modules/channels/public-chat.spec.ts -t "returns the visitor token beside the first message"`

**C2** - After a successful start, `GET /api/public/chat/:key/session` with that cookie answers `200 { token }` equal to the cookie value (door 2, AC 2)
Proof: `src/modules/channels/public-chat.spec.ts -t "returns the token from the visitor cookie"`

**C3** - `GET /session` answers `401` with `error.code === 'VISITOR_SESSION_REQUIRED'` when the cookie is missing, when it is tampered (`token` with a flipped last character), when it is expired (`exp` in the past), and when it was issued for another organization's key (`withTwoTenants`) (AC 3)
Proof: `src/modules/channels/public-chat.spec.ts -t "requires a valid visitor session for GET session"`

**C4** - `GET /session` with an unknown 32-hex key answers `404 NOT_FOUND`; with a key that is not 32 hex answers `400` (Surface)
Proof: `src/modules/channels/public-chat.spec.ts -t "rejects a bad key on GET session"`

**C5** - A Socket.IO client connecting to `/visitor` with `auth: { token }` from a fresh session connects successfully and the server-side socket is in room `conversation:<conversationId>` of that token (door 1, AC 4)
Proof: `src/modules/channels/visitor-realtime.spec.ts -t "connects a visitor into the conversation room"`

**C6** - Connecting to `/visitor` without `auth`, with `auth: { token: 'x' }`, with a token signed with another secret, and with an expired token each ends in `connect_error` whose `message` is `UNAUTHENTICATED` (door 1, AC 5)
Proof: `src/modules/channels/visitor-realtime.spec.ts -t "refuses a missing, invalid or expired visitor token"`

**C7** - Connecting to `/visitor` with a valid token but `Origin` other than `TEST_APP_URL` (e.g. `https://evil.example`) fails the handshake (does not reach `connect`) (AC 6)
Proof: `src/modules/channels/visitor-realtime.spec.ts -t "refuses a foreign origin on the visitor namespace"`

**C8** - A connected visitor socket is not in any `user:` or `org:` room of the default namespace; a panel socket that joined `conversation:<id>` does not receive an event emitted only on `/visitor` for that id (sentinel: the visitor receives it first) (AC 7)
Proof: `src/modules/channels/visitor-realtime.spec.ts -t "keeps the visitor namespace off the panel rooms"`

### S2 - `message.created` público e corte por `fromSeq` · `app.ts`, `realtime.ts` + spec · ~35 KB · ~9k

**C9** - A visitor connected on the conversation receives, after `receiveInbound` (or a second visitor message via `POST /messages`) and after a human `sendMessage` on that conversation, `message.created` with `{ conversationId, message }` where `message` has exactly the PublicMessage keys (`id`, `seq`, `direction`, `author`, `kind`, `text`, `sentAt`) and none of `authorUserId`, `deliveryStatus`, `createdAt`, each within 2000 ms of the write, with real HTTP + Socket.IO (door 3, AC 8)
Proof: `src/modules/channels/visitor-realtime.spec.ts -t "pushes PublicMessage to the visitor in under two seconds"`

**C10** - After seeding messages with `seq` 1..3 on the conversation, a visitor session whose `fromSeq` is 4 (start that creates seq 4) never receives a `message.created` whose `message.seq` is less than 4; a later message with `seq ≥ 4` arrives, and none of the earlier seqs arrived before it (door 3, AC 9)
Proof: `src/modules/channels/visitor-realtime.spec.ts -t "never pushes a message below fromSeq"`

**C11** - Two visitor sockets on the same conversation with `fromSeq` 5 and 10 (tokens signed for those values); when a message with `seq = 7` is committed, only the socket with `fromSeq === 5` receives `message.created`; a later message with `seq = 11` reaches both (sentinel order) (door 3, AC 10)
Proof: `src/modules/channels/visitor-realtime.spec.ts -t "filters by each socket fromSeq"`

**C12** - A visitor on conversation A does not receive `message.created` when a message is written on conversation B of the same organization, nor when one is written on another organization's conversation (`withTwoTenants`); a message on A arrives and the foreign ones did not arrive before it (AC 11)
Proof: `src/modules/channels/visitor-realtime.spec.ts -t "delivers only to the visitor conversation"`

**C13** - With a panel ADMIN socket joined on the default namespace and a visitor on `/visitor` for the same conversation, a new message yields: panel payload includes `authorUserId` (key present); visitor payload does not; visitor `message` deep-equals the item of that id from `GET /api/public/chat/:key/messages` (AC 12)
Proof: `src/modules/channels/visitor-realtime.spec.ts -t "gives Message to the panel and PublicMessage to the visitor"`

### S3 - Resync e montagem · `app.ts` + spec · ~15 KB · ~4k

**C14** - When the `LISTEN` connection is killed with `pg_terminate_backend`, a connected visitor socket receives `events:resync` with `{}` after reconnection (and a panel socket still does too) (AC 13)
Proof: `src/modules/channels/visitor-realtime.spec.ts -t "asks the visitor namespace to resync after a drop"`

**C15** - `GET /session` is covered by the same per-IP GET rate limit as the other public GETs: the 121st GET (mix of `/session` and describe) from one IP in a minute answers `429 RATE_LIMITED` (Surface `429`, Assumptions)
Proof: `src/modules/channels/public-chat.spec.ts -t "limits GET session with the other public GETs"`

**C16** - `POST /sessions` still answers every prior error status at the boundary (Surface members other than 201; L-015): unknown key → `404`; `consent` not true → `400`; Turnstile rejected → `403 TURNSTILE_FAILED`; `clientMessageId` of another phone → `409`; outdated notice → `422 NOTICE_OUTDATED`; 6th start from the same IP in a minute → `429 RATE_LIMITED`
Proof: `src/modules/channels/public-chat.spec.ts -t "answers not found for an unknown key"`
Proof: `src/modules/channels/public-chat.spec.ts -t "refuses a start without consent"`
Proof: `src/modules/channels/public-chat.spec.ts -t "refuses a start the captcha rejects"`
Proof: `src/modules/channels/public-chat.spec.ts -t "answers a repeated start with the same session"`
Proof: `src/modules/channels/public-chat.spec.ts -t "refuses an outdated notice"`
Proof: `src/modules/channels/public-chat.spec.ts -t "limits session starts per ip"`

**C17** - Connecting with `auth: { token, extra: 1 }` is refused (`UNAUTHENTICATED` or validation failure that does not connect): the auth object is `.strict()` with only `token` (door 1)
Proof: `src/modules/channels/visitor-realtime.spec.ts -t "refuses an auth payload with extra fields"`

**C18** - The visitor namespace is mounted by the same `buildApp` / `buildTestApp` assembly as the panel: a ready test app delivers C9; `architecture.spec` stays green on module boundaries (Impact)
Proof: `src/modules/channels/visitor-realtime.spec.ts -t "pushes PublicMessage to the visitor in under two seconds"`
Proof: `test/architecture.spec.ts -t "the source tree has no boundary violations|finds no import cycle between modules|lets each module write only its own tables"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `POST /api/public/chat/:key/sessions` statuses (7) | 201 C1 · 400 C16 · 403 C16 · 404 C16 · 409 C16 · 422 C16 · 429 C16 | - |
| `GET /api/public/chat/:key/session` statuses (5) | 200 C2 · 400 C4 · 401 C3 · 404 C4 · 429 C15 | - |
| `io('/visitor')` connect statuses (3) | 200 C5 · 401 C6, C17 · 403 C7 | - |
| server-pushed visitor events (2) | `message.created` C9 · `events:resync` C14 | - |
| Landing doors (3) | door 1 C5, C6, C8, C17 · door 2 C1, C2 · door 3 C9, C10, C11 | - |
| `GET /session` 401 causes (4) | missing C3 · tampered C3 · expired C3 · other org C3 | - |
| connect 401 causes (4) | missing auth C6 · garbage token C6 · wrong secret C6 · expired C6 | - |
| fromSeq filter cases (3) | below fromSeq never C10 · seq between two fromSeqs C11 · both above C11 | - |
| isolation targets (2) | other conversation same org C12 · other tenant C12 | - |
| payload shapes (2) | PublicMessage keys C9, C13 · panel Message has authorUserId C13 | - |
| startup config: visitor namespace (2 assemblies) | `buildApp` via test harness C18, C9 · architecture boundaries C18 | - |

- Claims naming a pushed event or connect outcome (C5–C14) are proven over a real HTTP server and a real Socket.IO client.
- `POST /sessions` statuses 403/409/422/429 were proven in `public-chat-api` and are unchanged by the body shape; C16 re-asserts 400 and 404 at the boundary so the Coverage row is not only inherited prose (L-015 for the members this feature still owns).
- No check claims more than the cases its proof exercises.

Test policy: the repo answers both questions (`CLAUDE.md` "Testes"), so there is no `Test policy` section. Decision tables this feature adds (connect refusal causes, fromSeq filter, GET /session 401 causes) each have one asserted case per Coverage member above.

## Swept

- validation: C4, C6, C17
- failure modes: C3, C6, C7
- idempotency: n/a - sockets do not write; message dedupe stays in `public-chat-api` / F2
- authorization: C3, C5, C6, C8, C12
- concurrency: C11 (two sockets, one emit filtered per fromSeq)
- data lifecycle: n/a - nothing persisted (plan `Relations`); token TTL covered by C3/C6 expired cases
- dependency failure: C14 (`LISTEN` drop → resync on `/visitor`)
- state transitions: n/a - no conversation state machine change
- observability: n/a - no new log line required; panel drop warn already in `realtime-events`

## Handoff

- S1 ~10k + S2 ~9k + S3 ~4k ≈ 23k tokens to write, plus ≈ 90 KB read (`public-chat.spec.ts` 34 KB, `conversation-events.spec.ts` 17 KB, `realtime.ts`/`realtime.spec.ts`, `public-chat.ts`/`routes`/`schema`, `app.ts`, `visitor-token.ts`) ≈ 23k → ≈ 46k, under the 150k budget — **one builder**

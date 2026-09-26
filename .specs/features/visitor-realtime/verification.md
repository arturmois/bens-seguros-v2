# Visitor realtime verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 8844773..415fe40
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

**Proof run (at 415fe40).** Postgres `bens-seguros-postgres-1` and Mailpit `bens-seguros-mailpit-1` were up. One batched invocation from `apps/server` over the real tree (via `docker run --network host` mounting HEAD, because this environment cannot reach Docker Desktop's published `127.0.0.1:5432` from the host namespace; the suite still hit the same containers and the same workspace files):

`pnpm exec vitest run src/modules/channels/public-chat.spec.ts src/modules/channels/visitor-realtime.spec.ts test/architecture.spec.ts --reporter=verbose -t "<25-name alternation from checks.md>"`

Exit 0. `Test Files 3 passed (3)` · `Tests 25 passed | 39 skipped (64)`. Every named proof appeared once as `✓`. No name matched zero tests.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| ADR-014 `docs/decisions/ADR-014-public-channel-identity-consent.md` | yes - full file, including 2026-09-25 revision note (lines 5–11) | none - revision + AD-018 fix cookie Path to `/api/public/chat/<key>` and cut by `fromSeq`; Decision § Identidade still has pre-revision prose (`Path=/api/public/chat`, “própria sessão”) but the header revision is the active text and matches the checks | - |
| ADR-006 `docs/decisions/ADR-006-jobs-and-realtime-in-process.md` | yes - lines 1–46 (revisão: `/widget` → namespace de visitante; Socket.IO in-process) | none | - |
| ADR-012 `docs/decisions/ADR-012-whatsapp-runtime.md` | yes - NOTIFY + LISTEN; lost events → client reload (lines 29–31, 66–67) | none | - |
| AD-018 `.specs/STATE.md:24` | yes - token in `POST /sessions` + `GET /session` → `/visitor` `auth.token`; Path cookie; `seq ≥ fromSeq` | none | - |
| handoff §30 `docs/handoff.md:730–741` | yes - “até 2 segundos”; no typing/presence/read receipts | none | - |

## Checks

`pc` = `apps/server/src/modules/channels/public-chat.spec.ts` · `vr` = `apps/server/src/modules/channels/visitor-realtime.spec.ts` · `ar` = `apps/server/test/architecture.spec.ts`

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `POST /sessions` 201 with `message` + `token` `/^v1\./` and cookie attrs | batch ✓ `returns the visitor token beside the first message` | `pc:335` - `toBe(201)`; `pc:337` - `toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)`; `pc:340-344` - `bens_visitor=`, `HttpOnly`, `SameSite=Lax`, `Path=…/<key>`, `Max-Age=2592000` | PASS |
| C2 | `GET /session` 200 `{ token }` equals cookie | batch ✓ `returns the token from the visitor cookie` | `pc:740` - `toBe(200)`; `pc:741` - `toEqual({ token: cookieToken })`; `pc:742` - equals POST token | PASS |
| C3 | `GET /session` 401 `VISITOR_SESSION_REQUIRED` for missing/tampered/expired/other org | batch ✓ `requires a valid visitor session for GET session` | `pc:775` - `toBe(401)` ×4; `pc:776` - `toBe('VISITOR_SESSION_REQUIRED')` | PASS |
| C4 | unknown key 404; bad key 400 | batch ✓ `rejects a bad key on GET session` | `pc:787` - `toBe(404)`; `pc:788` - `toBe('NOT_FOUND')`; `pc:789` - `toBe(400)` | PASS |
| C5 | `/visitor` connect + room `conversation:<id>` | batch ✓ `connects a visitor into the conversation room` | `vr:193` - `rooms.has(\`conversation:${session.conversationId}\`)` `toBe(true)` | PASS |
| C6 | missing/garbage/wrong secret/expired → `UNAUTHENTICATED` | batch ✓ `refuses a missing, invalid or expired visitor token` | `vr:210-213` - each `toEqual({ error: 'UNAUTHENTICATED' })` | PASS |
| C7 | foreign Origin refused | batch ✓ `refuses a foreign origin on the visitor namespace` | `vr:233` - evil handshake `toBe(403)`; `vr:250` - `result` `.not.toEqual({ connected: true })` | PASS |
| C8 | visitor off `user:`/`org:`; panel misses visitor-only emit | batch ✓ `keeps the visitor namespace off the panel rooms` | `vr:290-291` - no `user:`/`org:` rooms; `vr:293` - panel `.not.toContain('only-visitor')` | PASS |
| C9 | PublicMessage keys in < 2 s (inbound + human) | batch ✓ `pushes PublicMessage to the visitor in under two seconds` | `vr:310` / `vr:332` - `toBeLessThan(2000)`; `vr:335-340` - exact PublicMessage keys; no `authorUserId`/`deliveryStatus`/`createdAt` | PASS |
| C10 | never push `seq < fromSeq` | batch ✓ `never pushes a message below fromSeq` | `vr:372` - every seq `>= session.fromSeq`; `vr:373` - `.not.toContain(2)` | PASS |
| C11 | fromSeq 5 vs 10; seq 7 only to low; seq 11 to both | batch ✓ `filters by each socket fromSeq` | `vr:420` - low `toContain(7)`; `vr:421` - high `.not.toContain(7)`; `vr:422` - high `toContain(11)` | PASS |
| C12 | other conversation / other tenant isolated | batch ✓ `delivers only to the visitor conversation` | `vr:445-450` - foreign ids `.not.toContain`; `vr:444` - own arrives (`until` empty sentinel) | PASS |
| C13 | panel has `authorUserId`; visitor PublicMessage equals GET /messages | batch ✓ `gives Message to the panel and PublicMessage to the visitor` | `vr:488` - panel `toHaveProperty('authorUserId')`; `vr:489` - visitor `.not.toHaveProperty('authorUserId')`; `vr:492` - `toEqual(fromApi)` | PASS |
| C14 | LISTEN drop → `events:resync` `{}` on `/visitor` (and panel) | batch ✓ `asks the visitor namespace to resync after a drop` | `vr:523` - `visitor.resyncs` `toEqual([{}])`; `vr:524` - panel `toEqual([{}])` | PASS |
| C15 | 121st mixed GET → 429 `RATE_LIMITED` | batch ✓ `limits GET session with the other public GETs` | `pc:1006` - `toBe(429)`; `pc:1007` - `toBe('RATE_LIMITED')` | PASS |
| C16 | prior POST /sessions errors at boundary | batch ✓ ×6 (`answers not found…`, `refuses a start without consent`, `refuses a start the captcha rejects`, `answers a repeated start…`, `refuses an outdated notice`, `limits session starts per ip`) | `pc:231` 404; `pc:472-473` 400; `pc:565-566` 403 `TURNSTILE_FAILED`; `pc:396` 409; `pc:482-483` 422 `NOTICE_OUTDATED`; `pc:935-936` 429 | PASS |
| C17 | `auth` `.strict()` — extra field refused | batch ✓ `refuses an auth payload with extra fields` | `vr:220-222` - `toEqual({ error: 'UNAUTHENTICATED' })` | PASS |
| C18 | same `buildTestApp` assembly; architecture boundaries | batch ✓ C9; ✓ ×3 architecture names | `vr:332` / `vr:335` (C9 on harness); `ar:280` - `findBoundaryViolations(…)` `toEqual([])`; `ar:374` - cycles `toEqual([])`; `ar:392` - foreign writes `toEqual([])` | PASS |

## Coverage

Recomputed from plan `Surface` / `Landing` / claim enumerations (not copied from checks).

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `POST /api/public/chat/:key/sessions` statuses (7) | plan Surface | 201 C1 · 400 C16 · 403 C16 · 404 C16 · 409 C16 · 422 C16 · 429 C16 | - |
| `GET /api/public/chat/:key/session` statuses (5) | plan Surface | 200 C2 · 400 C4 · 401 C3 · 404 C4 · 429 C15 | - |
| `io('/visitor')` connect statuses (3) | plan Surface | 200 C5 · 401 C6, C17 · 403 C7 | - |
| server-pushed visitor events (2) | plan Surface | `message.created` C9 · `events:resync` C14 | - |
| Landing doors (3) | plan Landing | door 1 C5, C6, C8, C17 · door 2 C1, C2 · door 3 C9, C10, C11 | - |
| `GET /session` 401 causes (4) | plan Surface + AC 3 | missing C3 · tampered C3 · expired C3 · other org C3 | - |
| connect 401 causes (4) | plan Surface + AC 5 | missing auth C6 · garbage C6 · wrong secret C6 · expired C6 | - |
| fromSeq filter cases (3) | AC 9–10 / door 3 | below fromSeq C10 · between two fromSeqs C11 · both above C11 | - |
| isolation targets (2) | AC 11 | other conversation same org C12 · other tenant C12 | - |
| payload shapes (2) | AC 8, AC 12 / door 3 | PublicMessage keys C9, C13 · panel Message has `authorUserId` C13 | - |
| startup config: visitor namespace (2 assemblies) | plan Impact | `buildTestApp` via C9/C18 · architecture boundaries C18 | - |

Swept “existing” constraints re-read in code: `GET /session` shares `limitReads` (`max: 120` per IP) at `public-chat.routes.ts:72` and `:142`; `/visitor` mounted at `realtime.ts:104` with `visitorAuth` `.strict()` `:38`; `fromSeq` filter at `app.ts:145`; visitor `events:resync` at `app.ts:155`. Swept rows marked `n/a` are approved policy with nothing to locate.

## Test policy rows

checks.md has no `Test policy` section (repo conventions in `CLAUDE.md` “Testes” apply). No Test policy verdicts owed.

## Faults injected

Scratch worktree at `415fe40`; overlays only; main tree porcelain empty before and after. Cap 5, one per assertion surface.

| Mutation | Location | Killed |
| --- | --- | --- |
| omit `token` from `POST /sessions` body | `public-chat.routes.ts` send | yes - C1 failed (`expected 500 to be 201`; response schema requires `token`) |
| flip `message.seq < session.fromSeq` → `>=` | `app.ts` visitor emit loop | yes - C10 timed out waiting for seq ≥ fromSeq |
| emit panel `message` instead of `publicMessage` | `app.ts` visitor emit | yes - C9 failed (`not.toHaveProperty` / shape; assertion failed on received payload) |
| `/visitor` middleware always `next()` | `realtime.ts` visitor.use | yes - C6 `expected { connected: true } to equal { error: 'UNAUTHENTICATED' }` |
| drop `realtime.visitor.emit('events:resync')` | `app.ts` onReconnect | yes - C14 timed out (`visitor.resyncs` stayed `[]`) |

## Gate

`pnpm exec vitest run … -t "<25 names>"` (batched at HEAD) - 25 passed, 0 failed

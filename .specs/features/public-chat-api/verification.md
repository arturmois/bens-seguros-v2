# Public Chat API verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 8fb966f..486f211 (feature commits `98dacb3`, `a04a7c9`, `0900e14`, `a78a0f0`, fix `486f211`; `1eaf414` and `a41c339` belong to `openapi-export` and are out of scope). Fix diff for this round: `e5bfbd1..486f211`
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

**Round 1** (`a78a0f0`, FAIL): 43/45 PASS. C3 half proven, C30 order half unproven (the `orderBy` mutant survived), `429` on `/logo` and `GET /messages` unproven, `/logo` `Cache-Control`/`ETag`/`304` unproven, four precision gaps, ADR-014 not revised after AD-018.

**Scope of round 2.** The fix commit `486f211` touches only tests and documents: `public-chat.spec.ts` (+80/-14), `database.spec.ts` (+6), `checks.md`, `plan.md` (Surface `/logo`, Impact `config`), and `ADR-014` (revision note). It changes no production code: `git diff e5bfbd1..486f211 --stat` over `public-chat.ts`, `public-chat.routes.ts` and `prisma/` is empty. So every proof re-ran at `486f211`. Citations were refreshed in the two touched spec files. Faults were re-injected on the round-1 survivor and on the surfaces the fix created. The Coverage rows the fix touched were recomputed. Every round-1 non-PASS verdict and every ranked gap was re-judged. Everything else is marked `carried from a78a0f0`.

**Proof run (verified at 486f211).** All proofs ran in one invocation from `apps/server` on the real tree: `pnpm exec vitest run src/infrastructure/database.spec.ts src/modules/channels/public-chat.spec.ts src/modules/channels/visitor-token.spec.ts src/modules/conversations/inbound.spec.ts src/shared/config.spec.ts test/architecture.spec.ts test/schema.spec.ts --reporter=verbose -t "<52-name alternation from checks.md>"`, exit 0. It reported `Test Files 7 passed (7)` and `Tests 53 passed | 72 skipped (125)`. A per-name `grep -F` over the verbose output found every one of the 52 proof names at least once as `✓`, including the two new ones: `✓ reading the session > orders the session by seq, not by insertion` and `✓ public chat link > caches the public logo by its etag`. The 53rd pass is `inbound.spec.ts > receiveInbound > refuses an invalid phone`, which shares a name with C19. No name matched zero tests. The only zero-hit entry the extraction produced is the `<name>` placeholder in the header of `checks.md`, which is not a proof. The shell proofs ran from the repo root. C41: `pnpm api:generate` exit 0, and `git add --all --intent-to-add … && git diff --exit-code -- apps/server/openapi.json apps/web/src/api` exit 0. The `operationId` grep printed `5`. C43: the grep printed `1`. The real-tree porcelain was empty before and after.

## Binding sources

Verified at 486f211: the fix touched ADR-014 and the plan's Surface.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| ADR-014 `docs/decisions/ADR-014-public-channel-identity-consent.md` | yes - re-read at 486f211, including the new revision note at lines 5-11 | none | - |
| ADR-013 `docs/decisions/ADR-013-conversation-model.md` | yes (carried from a78a0f0; untouched by the fix) | none | - |
| AD-018 row `.specs/STATE.md:24` | yes - re-read | none | - |
| plan `Surface` `/logo` row `plan.md:61` | yes - re-read | none | - |

Notes:
1. Round-1 gap 6 is closed. ADR-014 now opens with "Revisão (2026-09-25, F3 `public-chat-api`, AD-018)". The note states the cut by `seq` (`seq ≥ fromSeq`), that two sessions of one phone see each other's new messages, and that the cookie is scoped to `/api/public/chat/<publicChatKey>` and carries `(organizationId, contactId, conversationId, fromSeq)`. This matches AD-018 (`STATE.md:24`) and C31 (`pc:785`, `pc:787`). ADR-014 and AD-018 no longer disagree.
2. The plan's Surface for `/logo` now lists `If-None-Match?` in, `Cache-Control: public, no-cache` and `ETag` out, and statuses `200, 304, 400, 404, 429`. These match `public-chat.routes.ts:103-105` and C46.
3. Observation, not gating and untouched by the fix: Surface's `POST /messages` status list (`plan.md:63`) does not list `409`. The plan names it at `plan.md:73` and AC 19 (`plan.md:127`), and C27 proves it (`pc:639`). The checks' Coverage row counts it.

## Checks

Verified at 486f211. All proofs re-ran at this commit. `pc` = `apps/server/src/modules/channels/public-chat.spec.ts` and `db` = `apps/server/src/infrastructure/database.spec.ts`: citations refreshed at 486f211. `vt` = `visitor-token.spec.ts`, `ib` = `conversations/inbound.spec.ts`, `sc` = `test/schema.spec.ts`, `ar` = `test/architecture.spec.ts`, `cfg` = `src/shared/config.spec.ts`: untouched by the fix, citations carried from a78a0f0 (re-run green at 486f211).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `withPublicChatKey` reads only the key's org, `[]` for unknown key, contact read fails | batch, `✓ reads only the organization of the public chat key` | `db:161` - `expect(byKey).toEqual([{ id: tenantA.organizationId }])`; `db:162` - `expect(unknown).toEqual([])`; `db:163-165` - contact read `.rejects.toThrow()` | PASS |
| C2 | `app.public_chat_key` does not outlive the transaction | batch, `✓ does not leak the public chat key to the next transaction` | `db:184` - `withoutTenant(tx => tx.organization.findMany())` `.rejects.toThrow()` after `withPublicChatKey` | PASS |
| C3 | `withTenant(A)` reads only A **and** `withUser(u)` reads only u's orgs | batch, `✓ lists only the caller organizations`, `✓ protects Organization with tenant_isolation` | `withTenant` half (round-1 gap 2, now closed): `db:208` - `expect(asTenant).toEqual([{ id: tenantA.organizationId }])` (fault 5 kills it); `withUser` half: `db:200-201` - `toContain(tenantA.organizationId)` / `.not.toContain(tenantB.organizationId)`; `sc:112` - `expect(rows).toEqual([{ protected: true }])` | PASS |
| C4 | `ConsentRecord` RLS + composite FKs Restrict | batch, 3 `✓` | `sc:1036` - `toEqual([{ table: 'ConsentRecord', forced: true }])`; `sc:1044-1050` - 4 FKs `ON UPDATE RESTRICT ON DELETE RESTRICT`; `sc:199` - `expect(unprotected).toEqual([])`; `sc:436` - `findSimpleTenantRelations(schema)` `toEqual([])` | PASS |
| C5 | token round-trip, shape `v1.<b64url>.<b64url>` | batch, `✓ round-trips the visitor session` | `vt:33` - `toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)`; `vt:34` - `toEqual(session)` | PASS |
| C6 | `null` for each tamper/foreign/version/expired/garbage; accepts 1 s before exp | batch, 2 `✓` | `vt:41-54` - each case `toBeNull()`; `vt:60` - `readVisitorToken(key, token, new Date(expiresAt - 1000))` `toEqual(session)` | PASS |
| C7 | `onReceived` once with tx and result; not for duplicate | batch, `✓ runs the received step ...` | `ib:452` - `repeated.created` `toBe(false)`; `ib:453-464` - `calls` `toEqual([{ result: {..., created: true ...}, seen: 1 }])` | PASS |
| C8 | `onReceived` throwing rolls everything back | batch, `✓ rolls the message back ...` | `ib:493` - `expect(await rowsOf(tenant)).toEqual(before)`; `ib:494` - `lastSeq` `toBe(1)` | PASS |
| C9 | `GET /:key` exact 6 keys, seeded values | batch, `✓ describes the web chat of the key` | `pc:184` - `toBe(200)`; `pc:185-192` - exact object (`hasLogo: false`, `noticeVersion: '2026-09-25'`, `turnstileSiteKey: null`); `pc:194` - `toEqual({ ...before.json(), hasLogo: true })`; `pc:199` - B's exact object | PASS |
| C10 | unknown key -> `404 NOT_FOUND` on 5 routes | batch, `✓ answers not found for an unknown key` | `pc:231` - `expect(response.statusCode, response.body).toBe(404)`; `pc:232` - `toBe('NOT_FOUND')` | PASS |
| C11 | start -> 201, INBOUND/CONTACT/TEXT on WEB_CHAT, E.164 | batch, `✓ starts a session with the first message` | `pc:301` - `toBe(201)`; `pc:306` - `phoneE164` `toBe(normalizePhone(phone))`; `pc:307` - `toBe('WEB_CHAT')`; `pc:308` - `toMatchObject({ direction: 'INBOUND', author: 'CONTACT', kind: 'TEXT', ... })`; `pc:316` - exact `{ message }` | PASS |
| C12 | new conversation `OPEN`/`QUEUE` | batch, `✓ opens the new conversation in the queue` | `pc:336` - `toBe('OPEN')`; `pc:337` - `toBe('QUEUE')` | PASS |
| C13 | one `ConsentRecord` per start; two starts -> two | batch, `✓ records the consent of every session start` | `pc:352` - `toHaveLength(1)`; `pc:353` - `toMatchObject({ contactId, conversationId, channelId, noticeVersion: '2026-09-25' })`; `pc:359` - `toHaveLength(2)` | PASS |
| C14 | cookie attributes; `Secure` only in production | batch, 2 `✓` | `pc:395` - `toMatch(/^bens_visitor=v1\..../)`; `pc:396-398` - attributes `toEqual(['HttpOnly','Max-Age=2592000','Path=/api/public/chat/<key>','SameSite=Lax'].sort())`; `vt:70` - `` toBe(`${plain}; Secure`) ``; `vt:82-85` - `visitorCookieFor(loadConfig(production))` `toBe(secure)` | PASS |
| C15 | one `message.created` event | batch, `✓ notifies the panel of the visitor message` | `pc:414` - `expect(events).toEqual([{ type: 'message.created', organizationId, conversationId, messageId }])` | PASS |
| C16 | A's start writes only in A; B's own rows | batch, `✓ writes only in the organization of the key` | `pc:436` - A `toEqual({ contacts: 1, conversations: 1, messages: 1, consents: 1 })`; `pc:437` - `expect(bAfterA).toEqual(empty)`; `pc:438` - B 1/1/1/1; `pc:440` - ids differ; `pc:441` - A `lastSeq` `toBe(1)` | PASS |
| C17 | `consent: false`/missing -> 400, nothing stored | batch, `✓ refuses a start without consent` | `pc:453-454` - `toBe(400)` twice; `pc:455` - `rowsOf` `toEqual(empty)` | PASS |
| C18 | outdated notice -> `422 NOTICE_OUTDATED` | batch, `✓ refuses an outdated notice` | `pc:463-465` - `toBe(422)`, `toBe('NOTICE_OUTDATED')`, `toEqual(empty)` | PASS |
| C19 | phone `123` -> `422 INVALID_PHONE` | batch, `✓ refuses an invalid phone` | `pc:473-475` - `toBe(422)`, `toBe('INVALID_PHONE')`, `toEqual(empty)` | PASS |
| C20 | siteverify false -> `403 TURNSTILE_FAILED` | batch, `✓ refuses a start the captcha rejects` | `pc:546-548` - `toBe(403)`, `toBe('TURNSTILE_FAILED')`, `toEqual(empty)` | PASS |
| C21 | siteverify got exactly `{secret, response}` | batch, `✓ verifies the captcha token with the secret` | `pc:567` - `toBe(201)`; `pc:568` - `expect(verify.calls).toEqual([{ secret: 'turnstile-secret', response: 'widget-token-123' }])` | PASS |
| C22 | siteverify unreachable -> 403 (fail closed) | batch, `✓ fails closed when the captcha is unreachable` | `pc:585-587` - `toBe(403)`, `toBe('TURNSTILE_FAILED')`, `toEqual(empty)` | PASS |
| C23 | production rejects a missing secret / site key under `closed` and `self_serve` | batch, `✓ requires turnstile keys in production in every signup mode` | `cfg:68` - `for (const mode of ['closed', 'self_serve'])`; `cfg:74-77` - `toThrow(ConfigError)`, `toThrow(/TURNSTILE_SECRET_KEY/)`, `toThrow(/TURNSTILE_SITE_KEY/)`; `cfg:78` - loads with both. Round-1 precision gap closed: the check text now names `closed` (`checks.md` C23), a real `SIGNUP_MODE` member, and plan Impact says `closed` too (`plan.md:37`) | PASS |
| C24 | 400 on unknown field, `''`, 4 001, bad uuid on both POSTs; 4 000 accepted on both; bad key on 5 routes; bad query | batch, `✓ validates the public chat inputs` | `pc:509-510` - each bad body `toBe(400)` on `/sessions` and `/messages`; `pc:513` - 4 000 on `/messages` `toBe(201)`; `pc:515` - 4 000 on `/sessions` `longestStart.response.statusCode` `toBe(201)` (round-1 precision gap closed); `pc:529` - `NAO-HEX` on 5 routes `toBe(400)`; `pc:532-533` - `?foo=1`, `?after=-1` `toBe(400)` | PASS |
| C25 | `POST /messages` 201, next `seq` | batch, `✓ sends a message within the session` | `pc:606` - `toBe(201)`; `pc:607` - `[[1, …], [2, 'Tenho um carro 2020']]`; `pc:611` - `toMatchObject({ id: stored[1]?.id, seq: 2, author: 'CONTACT' })` | PASS |
| C26 | repeat -> 201 then 200 same id | batch, `✓ answers a repeated message with the original` | `pc:623-625` - `toBe(201)`, `toBe(200)`, same id; `pc:626` - `messages` `toBe(2)` | PASS |
| C27 | other conversation's id -> `409 CONFLICT`, no leak | batch, `✓ refuses a message id of another conversation` | `pc:639-642` - `toBe(409)`, `toBe('CONFLICT')`, `not.toContain(id)`, `not.toContain('Segredo do primeiro')` | PASS |
| C28 | CLOSED reopens, same id, cookie still works | batch, `✓ reopens the closed conversation of the session` | `pc:660` - `toBe(201)`; `pc:662` - `reopened.id` `toBe(conversation.id)`; `pc:663` - `toBe('OPEN')`; `pc:664` - `listed.statusCode` `toBe(200)` | PASS |
| C29 | 401 `VISITOR_SESSION_REQUIRED` for 4 causes, both routes | batch, `✓ requires a valid visitor session` | `pc:688-693` - the 4 cases; `pc:705` - `expect(response.statusCode, name).toBe(401)`; `pc:706` - `toBe('VISITOR_SESSION_REQUIRED')`; `pc:709` - B `messages` `toBe(0)` | PASS |
| C30 | `GET /messages` 200, ascending `seq`, exact 7 keys | batch, `✓ lists the session messages in seq order`, `✓ orders the session by seq, not by insertion` | `pc:725` - `toBe(200)`; `pc:729` - `Object.keys(item).sort()` `toEqual([...7 keys].sort())`; order: `pc:766` - `expect(seqs(response)).toEqual([1, 2, 3, 4])` over rows inserted as seq 1, 4, 2, 3 (`pc:747`). Round-1 survivor now killed (fault 1: `expected [ 1, 4, 2, 3 ] to deeply equal [ 1, 2, 3, 4 ]`) | PASS |
| C31 | earlier seq 1-3 hidden; own seq 4; later seq 5 from the earlier session shown | batch, `✓ hides every message before the session start` | `pc:783` - `message.seq` `toBe(4)`; `pc:784` - `seqs(afterStart)` `toEqual([4])`; `pc:782` - `fromEarlier.statusCode` `toBe(201)` (seq 5 now sent through the earlier session's cookie, `pc:779`; round-1 precision gap closed); `pc:785` - `toEqual([4, 5])`; `pc:786` - `not.toContain('Antes')`; `pc:787` - earlier session reads `[1, 2, 3, 4, 5]` | PASS |
| C32 | `after=2` -> `seq > 2` and `≥ fromSeq`; 105 messages -> 100 per page; past end `[]` | batch, `✓ reads the session after a seq, a hundred at a time` | `pc:808` - `expect(seqs(afterTwo)).toEqual([3, 4, 5, 6, 7])` (literal `after=2`, `pc:799`; round-1 precision gap closed); `pc:809` - `?after=4` `toEqual([5, 6, 7])`; `pc:810` - 100 items `3..102` (the conversation holds 2 + 1 + 4 + 98 = 105 messages); `pc:811` - `?after=105` `toEqual({ items: [] })` | PASS |
| C33 | HUMAN reply, OUTBOUND, no `authorUserId` | batch, `✓ shows a human reply to the visitor` | `pc:823` - `toHaveLength(1)`; `pc:825` - `toMatchObject({ seq: 2, author: 'HUMAN', direction: 'OUTBOUND', text })`; `pc:831` - `not.toHaveProperty('authorUserId')` | PASS |
| C34 | 6th start per IP -> 429 | batch, `✓ limits session starts per ip` | `pc:855` - `toEqual([201, 201, 201, 201, 201])`; `pc:856-857` - `toBe(429)`, `toBe('RATE_LIMITED')`; `pc:858` - `messages` `toBe(5)` | PASS |
| C35 | 61st start per key -> 429; other key 201 | batch, `✓ limits session starts per key` | `pc:872` - every 201; `pc:873-874` - `toBe(429)`, `toBe('RATE_LIMITED')`; `pc:875` - `toBe(201)` | PASS |
| C36 | 21st message per token -> 429; other token 201 | batch, `✓ limits messages per visitor` | `pc:891-894` - 20x 201, `toBe(429)`, `toBe('RATE_LIMITED')`, other token `toBe(201)` | PASS |
| C37 | 120 non-429 then 429 on each of `GET /:key`, `/logo`, `GET /messages` | batch, `✓ limits public reads per ip` | `pc:899` - `routes = ['', '/logo', '/messages']`, own IP per route (`pc:903`); `pc:909` - `expect(statuses.includes(429), route).toBe(false)`; `pc:910` - `expect(next.statusCode, route).toBe(429)`; `pc:911` - `toBe('RATE_LIMITED')`. Round-1 gap 3 closed: faults 2 and 3 fail on `/logo` and on `/messages` | PASS |
| C38 | after exhausting, `/api/health` and `/api/v1/me` non-429 | batch, `✓ limits only the public chat routes` | `pc:928` - `publicRead` `toBe(429)`; `pc:929` - `health` `toBe(200)`; `pc:930` - `me` `toBe(200)` | PASS |
| C39 | logo bytes and `Content-Type`; other key its own; none -> 404 | batch, `✓ serves the logo of the key` | `pc:257-258` - `toBe(404)`, `toBe('NOT_FOUND')`; `pc:259-261` - `toBe(200)`, `toBe('image/png')`, `rawPayload.equals(PNG)`; `pc:262-263` - B `image/webp` and B's bytes | PASS |
| C40 | foreign `Origin` -> `403 ORIGIN_NOT_ALLOWED` | batch, `✓ refuses a public write from another origin` | `pc:484-486` - `toBe(403)`, `toBe('ORIGIN_NOT_ALLOWED')`, `toEqual(empty)` | PASS |
| C41 | 5 `operationId`s; `api:generate` no diff | shell at 486f211: generate exit 0, `git diff --exit-code` exit 0, grep printed `5` | `apps/server/src/modules/channels/public-chat.routes.ts:83` `getPublicChat`, `:97` `getPublicChatLogo`, `:118` `startPublicChatSession`, `:138` `sendPublicChatMessage`, `:161` `listPublicChatMessages` | PASS |
| C42 | module boundaries hold | batch, 4 `✓` in `test/architecture.spec.ts` | `ar:144` - `ConsentRecord: 'contacts'`; `ar:392` - `findForeignWrites(...)` `toEqual([])`; `ar:374` - `findModuleCycles(...)` `toEqual([])`; `ar:280` - `findBoundaryViolations(...)` `toEqual([])`; `ar:265` - `offenders` `toEqual([])` | PASS |
| C43 | `@fastify/rate-limit` 11.x, `global: false` | grep printed `1`; batch `✓ limits only the public chat routes` | `apps/server/package.json:19` - `"@fastify/rate-limit": "11.2.0"`; `apps/server/src/app.ts:71` - `app.register(fastifyRateLimit, { global: false })`; `pc:929-930` - non-public routes `toBe(200)` | PASS |
| C44 | `WEB_CHAT_NOTICE_VERSION` `'2026-09-25'` and reported | batch, `✓ describes the web chat of the key` | `pc:193` - `toBe('2026-09-25')`; `pc:190` - `noticeVersion: '2026-09-25'` in the exact body | PASS |
| C45 | repeated start idempotent; other phone -> 409; 1/1/1/1 | batch, `✓ answers a repeated start with the same session` | `pc:374-376` - `toBe(201)` twice, `repeated.json()` `toEqual(first.json())`; `pc:377` - `toBe(409)`; `pc:378-379` - no id, no text; `pc:380` - `rowsOf` `toEqual({ contacts: 1, conversations: 1, messages: 1, consents: 1 })` | PASS |
| C46 | `/logo` `Cache-Control: public, no-cache`, `ETag` 32 hex quoted; same `If-None-Match` -> `304` empty; other -> `200` bytes | batch, `✓ caches the public logo by its etag` | `pc:285` - `expect(first.headers['cache-control']).toBe('public, no-cache')`; `pc:286` - `expect(etag).toMatch(/^"[0-9a-f]{32}"$/)`; `pc:287-288` - `again.statusCode` `toBe(304)`, `rawPayload` `toHaveLength(0)`; `pc:289-290` - `stale` (`If-None-Match: "outro"`) `toBe(200)`, `rawPayload.equals(PNG)` `toBe(true)` | PASS |

46/46 PASS.

## Coverage

Recomputed at 486f211 for the rows whose authority the fix touched. Members come from the plan's `Surface` (`plan.md:58-64`, the contract), `public-chat.routes.ts:69-172` (what the code emits and where each limiter is attached) and `config.ts:28` (the `SIGNUP_MODE` enum). Rows the fix did not touch are carried from a78a0f0, where they were recomputed with no unproven member.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /:key/logo` statuses (5) - verified at 486f211 | Surface `plan.md:61`; `routes.ts:91-108` | 200 C39 (`pc:259`), C46 (`pc:289`) · 304 C46 (`pc:287`) · 400 C24 (`pc:529`) · 404 C10 (`pc:231`), C39 (`pc:257`) · 429 C37 (`pc:910`, route `/logo`; fault 2) | - |
| `GET /:key/logo` output (4) - verified at 486f211 | Surface Out; `routes.ts:103-106` | bytes C39 (`pc:261`) · `Content-Type` C39 (`pc:260`) · `Cache-Control` C46 (`pc:285`) · `ETag` C46 (`pc:286`, and used as `If-None-Match` for the 304 at `pc:287`) | - |
| `GET /messages` statuses (5) - verified at 486f211 | Surface `plan.md:64`; `routes.ts:153-172` | 200 C30 (`pc:725`) · 400 C24 (`pc:529,532-533`) · 401 C29 (`pc:705`) · 404 C10 (`pc:231`) · 429 C37 (`pc:910`, route `/messages`; fault 3) | - |
| `GET /:key` statuses (4) - verified at 486f211 | Surface `plan.md:60` | 200 C9 (`pc:184`) · 400 C24 (`pc:529`) · 404 C10 (`pc:231`) · 429 C37 (`pc:910`, route `''`) | - |
| Rate limits (door 6: 4 limits, 5 attachments) - verified at 486f211 | `routes.ts:69-74` (limiters), `:85,:99,:163` (`limitReads`), `:120` (`limitStarts`), `:140` (`limitMessages`) | start/IP C34 (`pc:856`) · start/key C35 (`pc:873`) · messages/token C36 (`pc:892`) · reads/IP on `GET /:key`, `/logo` and `GET /messages`, all C37 (`pc:909-911`, one iteration each) · only public routes C38 (`pc:929-930`) | - |
| Landing doors (7) - verified at 486f211 | plan `Landing` | 1 C1, C2, C3 (both halves, `db:200-201,208`) · 2 C4, C13 · 3 C7, C8 · 4 C5, C6, C14 · 5 C30 (order, `pc:766`; fault 1), C31, C32 · 6 C34-C38, C43 · 7 C26, C27, C45 | - |
| Turnstile in production (2 modes x 2 keys = 4) - verified at 486f211 | `config.ts:28` `z.enum(['closed', 'self_serve'])` | `closed` secret / site key, `self_serve` secret / site key: `cfg:68-77` (loop over both members, both keys) | - |
| `POST /sessions` statuses (7) | carried from a78a0f0 (citations refreshed) | 201 C11 `pc:301`, C45 · 400 C17, C24 · 403 C20, C22, C40 · 404 C10 · 409 C45 `pc:377` · 422 C18, C19 · 429 C34, C35 | - |
| `POST /messages` statuses (8) | carried from a78a0f0 | 200 C26 · 201 C25 · 400 C24 · 401 C29 · 403 the global origin hook `app.ts:131-137`, `app.spec.ts:218-232` · 404 C10 · 409 C27 · 429 C36 | - |
| Invalid-cookie causes (4) | carried from a78a0f0 | C29 `pc:688-706` | - |
| Token rejections at its own layer (6) | carried from a78a0f0 | `vt:41-54` | - |
| Start refusals (5) | carried from a78a0f0 | C17, C18, C19, C20, C22 | - |
| Invalid inputs (8) | carried from a78a0f0; 4 000-accepted member now proven on both POSTs | `pc:509-510,513,515,529,532-533`; missing `consent` `pc:454` | - |
| Cookie attributes (6) | carried from a78a0f0 | `pc:395-398`, `vt:33,70,82` | - |
| `PublicMessage` keys (7) | carried from a78a0f0 | `pc:729`; `authorUserId` absent `pc:831` | - |
| Description keys (6) | carried from a78a0f0 | `pc:185-192`, `pc:199` | - |
| Startup assemblies registering the limiter (2) | carried from a78a0f0 (the fix touched no assembly) | `src/server.ts:22` and `test/app.ts:42` both call `buildApp`, which registers at `app.ts:71` | - |
| `ConsentRecord` relations (4 FKs) | carried from a78a0f0 | `sc:1044-1050` | - |

Sweep for sets with no row: the fix created one new branch, the `304` at `routes.ts:105`. It now has a row and a proof. No other enumeration in `Landing`, `Relations` or `Surface` lacks a row.

## Test policy rows

Carried from a78a0f0. The row classifies `visitor-token.ts`, which the fix did not touch. Boundary citations were refreshed at 486f211.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| `visitor-token.ts` (sign/verify, expiry, cookie attributes): own layer **and** boundary | `apps/server/src/modules/channels/visitor-token.ts` | own layer: C5 `vt:33-34`, C6 `vt:41-54,60`, C14 `vt:67-85` · boundary: C29 `pc:688-706`, C14 `pc:395-398` | yes - each C6 cause at its own layer, the cookie cause at the route |

Swept `existing` (carried from a78a0f0): `Conversation_one_open` unique index at `prisma/migrations/20260924160000_conversation_core/migration.sql:150`, proven by `ib:268`. The fix touched neither.

## Faults injected

Verified at 486f211. Scratch worktree `git worktree add --detach <scratch>/wt 486f211` + `pnpm install --frozen-lockfile`, with the root `.env` copied in (not printed). A baseline run of the two new proofs was green. One vitest process at a time. `git checkout -- .` after each fault (porcelain empty each time). The worktree was removed with `git worktree remove --force`. Afterwards `git worktree list` showed only the main tree, and the real tree's `git status --porcelain` matched the empty baseline.

| Mutation | Location | Killed |
| --- | --- | --- |
| round-1 survivor re-injected: removed `orderBy: { seq: 'asc' }` from `listVisitorMessages` | `apps/server/src/modules/channels/public-chat.ts:245` | yes - C30 `orders the session by seq, not by insertion`: `expected [ 1, 4, 2, 3 ] to deeply equal [ 1, 2, 3, 4 ]` (the other 5 read proofs stayed green, as in round 1) |
| removed `onRequest: limitReads` from `GET /logo` | `apps/server/src/modules/channels/public-chat.routes.ts:99` | yes - C37 `/logo: expected 404 to be 429` |
| removed `onRequest: limitReads` from `GET /messages` | `public-chat.routes.ts:163` | yes - C37 `/messages: expected 401 to be 429` |
| dropped the `304` branch (`if (request.headers['if-none-match'] === logo.etag) return reply.status(304).send()`) | `public-chat.routes.ts:105` | yes - C46 `expected 200 to be 304` (C39 stayed green) |
| widened the `Organization` policy's tenant branch: `ELSE "id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid` -> `ELSE NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL` (any tenant sees every org) | `apps/server/prisma/migrations/20260925112553_public_chat/migration.sql:46` | yes - C3 `lists only the caller organizations`: `expected [ …(2) ] to deeply equal [ Array(1) ]`, the new `toEqual` at `db:208` (the `withUser` asserts at `db:200-201` passed first) |

Five faults (the cap). Every new assertion surface of the fix failed at least once: C30's order proof, C37 per route, C46 and C3's `withTenant` half. Not injected: the `cache-control` literal (`routes.ts:104`). Its assertion `pc:285` is a `toBe('public, no-cache')` on the exact header, so any other value fails it. The round-1 kills of the `fromSeq` cut (C31), the `sessionOf` org check (C29), the consent write (C13) and the key branch of the policy (C1) are carried from a78a0f0. The fix changed no production code. The killing assertions `pc:784` (`toEqual([4])`), `pc:705`, `pc:352` and `db:161` are unchanged in the fix diff apart from line shifts.

## Gate

Verified at 486f211, run once after the fault runs: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` from the repo root, exit 0. Biome `Checked 199 files … No fixes applied`. Typecheck clean. Vitest `Test Files 42 passed (42)`, `Tests 462 passed (462)` (round 1: 460, plus the two new proofs). Server and web builds done (`apps/web build: ✓ built`). The real tree stayed clean afterwards.

## Round-1 gaps re-judged

1. Surviving `orderBy` mutant: closed. The new proof `pc:740-766` seeds seq 4, 2, 3 out of insertion order, and fault 1 is killed.
2. C3 `withTenant(A)` half: closed. `db:208`, killed by fault 5.
3. Read limit on `/logo` and `GET /messages`: closed. `pc:899-911`, faults 2 and 3.
4. `/logo` `Cache-Control`/`ETag`/`304`: closed. C46 `pc:266-290` and plan Surface `plan.md:61`; fault 4.
5. Precision gaps: closed.
   - C23 now names `closed` (plan Impact too).
   - C24 proves 4 000 on `/sessions` (`pc:515`).
   - C32 asserts the literal `after=2` (`pc:808`), and the conversation holds 105 messages.
   - C31 sends seq 5 through the earlier session's cookie (`pc:779-782`).
6. ADR-014 not revised: closed. The revision note at `ADR-014…md:5-11` matches AD-018.

No new gaps. One non-gating observation: `plan.md:63` omits `409` from `POST /messages` statuses although the plan names it at line 73 and C27 proves it.

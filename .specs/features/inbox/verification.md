# Inbox verification

**Verdict**: PASS
**Profile**: ui
**Diff range**: d615dc2..HEAD (`1918b32`)
**Round**: 2 - scoped (fix diff `1918b32` + every non-PASS from round 1; proofs re-run in full at HEAD)
**Verifier**: independent sub-agent (author != verifier)

**Proof run (at 1918b32).** Postgres `bens-seguros-postgres-1` and Mailpit up; `pnpm dev` serving web `:3000` and API `:3001`.

Server (one batch, verbose):

`pnpm exec vitest run` (from `apps/server`) on
`inbox-list.spec.ts` `inbox-take.spec.ts` `inbox-close.spec.ts` `conversation-send.spec.ts` `read.spec.ts`
`-t "<C1–C20 named titles alternation>" --reporter=verbose`

Exit 0. `Tests 22 passed | 24 skipped`. Every named server proof appeared as `✓` (includes new `keeps the legacy list when view is absent` and `lets an admin close any readable conversation`).

Web e2e (one file):

`pnpm --filter @bens/web exec playwright test e2e/inbox.spec.ts --reporter=line`

Exit 0. `4 passed (11.9s)` then reconfirmed `4 passed (11.3s)` after fault restore. Titles: `links Inbox in the app nav`; `shows the inbox queue with four list states`; `shows a thread not-found state for an unknown conversation`; `commercial replies and visitor sees it then close removes it from inbox views`.

Static: `rg` for send schema/`operationId`, Orval send hook, nav `to="/inbox"` — hits below.

## Binding sources

verified at `1918b32`

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| ADR-016 `docs/decisions/ADR-016-roles-portfolio-assignment.md` | yes - full file (conditional take `AI`/`QUEUE`→409; claim owner; COMMERCIAL closes only as assignee; MANAGER/ADMIN any) | none | - |
| ADR-013 `docs/decisions/ADR-013-conversation-model.md` | yes - full file (`status`/`handler`, `close` → `CLOSED`, reopen out of scope) | none | - |
| AD-019 `.specs/STATE.md:25` | yes - fullstack panel slice `inbox` + Playwright | none | - |
| AD-020 `.specs/STATE.md:26` | yes - audit `conversation.take` / `conversation.close` without PII | none | - |
| architecture.md §9–10 | yes - `POST …/take` \| `/close`; `_app/inbox` | none | - |
| roadmap F3 `docs/roadmap.md:77–83` | yes - fila, minhas, assumir, responder, encerrar; fatia `inbox` | none | - |
| plan Surface / Observable / Landing | yes - plan.md | none | - |

Screen arrangement (selector-reachable, from plan Landing door 4 + UI):

| Region | Binding | Check |
| --- | --- | --- |
| app nav “Inbox” → `/inbox` | architecture §10 + AC 25 | C26 |
| list + view tabs Fila/Minhas (`view` search) | door 4 / AC 19–20 | C21, C22 |
| thread (messages, phone, WEB_CHAT badge) | AC 21, AC 23 | C23, C25 |
| actions Assumir / Encerrar + confirm | AC 22; assumption confirmação | C24, C23 |

Composition: header + two-column list/thread (`inbox-page.tsx:47` `md:grid-cols-[…]`) — matches door 4; no blanket visual-fidelity exemption.

**Round 1 gaps re-checked against `1918b32`:** absent-`view` legacy (C5); ADMIN close (C16); screen thread 404 (C21); `conversation:join` probe (C23); panel inbound &lt;2s (C28); C17 readable-but-not-assignee seed — all have located assertions below.

## Checks

`il` = `apps/server/src/modules/conversations/inbox-list.spec.ts` · `it` = `inbox-take.spec.ts` · `ic` = `inbox-close.spec.ts` · `cs` = `conversation-send.spec.ts` · `rd` = `read.spec.ts` · `e2e` = `apps/web/e2e/inbox.spec.ts` · `page` = `apps/web/src/features/inbox/inbox-page.tsx` · `routes` = `apps/server/src/modules/conversations/conversation.routes.ts` · `send` = `apps/server/src/modules/conversations/send.ts` · `app` = `apps/web/src/routes/_app.tsx` · `sock` = `apps/web/src/features/inbox/use-panel-socket.ts`

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `view=queue` → only `QUEUE` ≠`CLOSED`, `lastMessageAt` desc then `id` | batch ✓ `lists the queue by lastMessageAt` | `il:79` - `toBe(200)`; `il:80` - `toEqual([newer.id, older.id])`; `il:81-82` - not human/closed | PASS |
| C2 | `view=mine` → `assigneeId=me`, ≠`CLOSED`, same order | batch ✓ `lists mine by lastMessageAt` | `il:114` - `toBe(200)`; `il:115` - `[mineNewer, mineOlder]`; `il:116-117` - not theirs/queued | PASS |
| C3 | keyset page; last `nextCursor` null | batch ✓ `paginates the inbox list by keyset` | `il:138-139` - first page + cursor; `il:145-146` - second page + `toBeNull()` | PASS |
| C4 | tenant + COMMERCIAL portfolio | batch ✓ `scopes the inbox list by tenant and portfolio` | `il:166` - not `foreignQueue`; `il:170` - not `humanOfB` | PASS |
| C5 | invalid view 400; anon 401; no read 403; inactive 404; absent `view` keeps legacy list (`id` desc, all portfolio incl. CLOSED) | batch ✓ `rejects bad view…`; ✓ `keeps the legacy list when view is absent`; ✓ `hides conversation routes from an inactive member` | `il:177` - `toBe(400)`; `il:180` - `401`; `il:187` - `403`; `rd:564` - inactive list `404`; `il:213-215` - absent view `200` + `ids` id-desc + contains `closed` | PASS |
| C6 | take QUEUE → `HUMAN` + `assigneeId=me` 200 | batch ✓ `takes a conversation from the queue` | `it:56-60` - `200` + `handler`/`assigneeId`; `it:63` - DB match | PASS |
| C7 | null `ownerId` → claimed on take | batch ✓ `claims the contact owner on take when unset` | `it:74` - `contact.ownerId`; `it:78` - DB `ownerId` | PASS |
| C8 | already HUMAN → `409 ALREADY_ASSIGNED` | batch ✓ `conflicts when the conversation is already taken` | `it:91-92` - `409` / `ALREADY_ASSIGNED` | PASS |
| C9 | outside tenant/portfolio → `404` same body | batch ✓ `hides take outside the tenant or portfolio` | `it:117-118` - `404`/`NOT_FOUND`; `it:122` - `toEqual(hidden.json().error)` | PASS |
| C10 | audit `conversation.take` without PII | batch ✓ `audits take without pii` | `it:139` - length 1; `it:141-143` - no `+55`/`phoneE164`/`"text"` | PASS |
| C11 | take from `AI` | batch ✓ `takes a conversation from ai` | `it:152-153` - `200` + `HUMAN`/`assigneeId` | PASS |
| C12 | take 401/403/400 body | batch ✓ `guards take auth permission and body` | `it:161` - `401`; `it:171` - `403`; `it:179` - `400` | PASS |
| C13 | send signature/behaviour unchanged | batch ✓ `sends an outbound message…`; `rg` schema/`operationId` | `cs:63` - `201`; `cs:72` - auto-take; `send:11` - `sendConversationMessageInput`; `routes:95,98` - body + `operationId` | PASS |
| C14 | inbox uses Orval send hook | `rg` ✓ | `page:12` - import; `page:155` - `useSendConversationMessage()` | PASS |
| C15 | assignee close → `CLOSED` + `closedAt` | batch ✓ `closes an assigned conversation` | `ic:58-60` - `200`/`CLOSED`/`closedAt`; `ic:62-63` - DB | PASS |
| C16 | MANAGER or ADMIN closes another’s HUMAN | batch ✓ `lets a manager…`; ✓ `lets an admin…` | `ic:77-78` - manager `200`/`CLOSED`; `ic:91-92` - admin `200`/`CLOSED` | PASS |
| C17 | COMMERCIAL non-assignee → `404` (readable via owner, not assignee) | batch ✓ `hides close from a commercial who is not the assignee` | `ic:108` - GET readable `200`; `ic:112-113` - close `404`/`NOT_FOUND` | PASS |
| C18 | already CLOSED → `409 CONVERSATION_CLOSED` | batch ✓ `conflicts when the conversation is already closed` | `ic:127-128` - `409` / `CONVERSATION_CLOSED` | PASS |
| C19 | audit `conversation.close` without PII | batch ✓ `audits close without pii` | `ic:144` - length 1; `ic:146-148` - no PII keys | PASS |
| C20 | close 401/403/400 | batch ✓ `guards close auth permission and body` | `ic:159` - `401`; `ic:169` - `403`; `ic:177` - `400` | PASS |
| C21 | `/inbox` queue four list states; unknown `conversationId` → thread not-found | e2e ✓ `shows the inbox queue…`; ✓ `shows a thread not-found…` | `e2e:40` empty; `e2e:55` loading; `e2e:58-59` error + retry; `e2e:63` success empty; `e2e:73-74` - `inbox-thread-error` + `/não encontrada/i` | PASS |
| C22 | view `mine` only assigned | e2e ✓ smoke title | `e2e:107-108` - mine click + row count 1 | PASS |
| C23 | selected thread: messages, join, send, close+confirm | same e2e ✓ | `e2e:102` - inbound message; `e2e:103-105` - `__bensPanelJoined` truthy; `e2e:118-120` - reply; `e2e:126-128` - close confirm | PASS |
| C24 | QUEUE shows Assumir and takes | same e2e ✓ | `e2e:99-101` - take visible + click → reply input | PASS |
| C25 | WEB_CHAT badge copy | same e2e ✓ | `e2e:98` - `toHaveText('Telefone não verificado')` | PASS |
| C26 | nav link Inbox → `/inbox` | e2e ✓ `links Inbox…`; `rg` | `e2e:24-26` - link href `/inbox`; `app:79` - `to="/inbox"` | PASS |
| C27 | visitor → commercial sees queue row | same smoke e2e ✓ | `e2e:94-95` - list + conversation row | PASS |
| C28 | panel inbound &lt;2s; reply &lt;2s to visitor; close leaves queue/mine | same smoke e2e ✓ | `e2e:114-116` - panel follow-up `{ timeout: 2_000 }`; `e2e:122-124` - visitor reply `{ timeout: 2_000 }`; `e2e:131-133` - both views empty | PASS |

## Coverage

verified at `1918b32` — recomputed from plan `Surface` / `Landing` / ADR-016 roles / screen arrangement (not copied from checks).

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /api/v1/conversations` statuses (5) | plan Surface | 200 C1 · 400 C5 · 401 C5 · 403 C5 · 404 C5 | - |
| `POST …/take` statuses (6) | plan Surface | 200 C6 · 400 C12 · 401 C12 · 403 C12 · 404 C9 · 409 C8 | - |
| `POST …/close` statuses (6) | plan Surface | 200 C15 · 400 C20 · 401 C20 · 403 C20 · 404 C17 · 409 C18 | - |
| screen Inbox statuses (2) | plan Surface | 200 C21/C23 · 404 C21 | - |
| Landing doors (4) | plan Landing | door 1 C6–C12 · door 2 C15–C20 · door 3 C1–C5 · door 4 C21–C26 | - |
| screen Inbox arrangement (4 regions) | plan Observable + door 4 | nav C26 · list C21/C22 · thread C23 · Assumir/Encerrar C24/C23 | - |
| take handler sources (2) | ADR-016 / Landing 1 | QUEUE C6 · AI C11 | - |
| close roles (4) | ADR-016 / AC 15–16 | assignee C15 · MANAGER any C16 · ADMIN any C16 · COMMERCIAL non-assignee C17 | - |
| audit actions (2) | AD-020 | take C10 · close C19 | - |

Swept “existing” re-read: `sendConversationMessageInput` + `operationId` at `send.ts:11` / `conversation.routes.ts:95-98`; inactive list under `routes()` in `read.spec.ts:103-107`; `close()` in `conversation-state.ts:23-24`; assignee gate at `close.ts:19`; `showTake` / badge / confirm at `inbox-page.tsx:209` / `258-260` / `296`. Swept `n/a` rows are approved policy.

## Test policy rows

checks.md has no `Test policy` section (repo `CLAUDE.md` Testes / Web fullstack). No Test policy verdicts owed.

## Faults injected

verified at `1918b32` (surfaces from fix + round-1 survivor). Baseline porcelain: `?? .specs/features/inbox/verification.md` only. Scratch worktree `/tmp/inbox-verify-r2` at `1918b32` for server mutants; UI join mutant on the real tree (Vite serves it) then `git checkout --` restored. Real tree porcelain matched baseline after. Cap 5. Worktree removed.

| Mutation | Location | Killed |
| --- | --- | --- |
| remove COMMERCIAL assignee `throw notFound` | `close.ts:19` | yes - C17 expected 404 got 200 (`readable` still 200) |
| queue `viewWhere` drops `handler: 'QUEUE'` | `read.ts:53` | yes - C1 `idsOf` included HUMAN |
| take `updateMany` drops `handler IN (AI,QUEUE)` | `take.ts:30` | yes - C8 expected 409 got 200 |
| audit action `conversation.take` → `conversation.claim` | `take.ts:38` | yes - C10 `toHaveLength(1)` got 0 |
| skip `window.__bensPanelJoined = conversationId` on join ack | `use-panel-socket.ts:48` | yes - C23 poll `toBeTruthy()` timed out (undefined) |

## Gate

- Server proof batch: 22 passed, 0 failed (24 skipped by filter)
- Playwright `e2e/inbox.spec.ts`: 4 passed, 0 failed
- Static `rg` proofs: exit 0
- Post-fault e2e reconfirm: 4 passed, 0 failed

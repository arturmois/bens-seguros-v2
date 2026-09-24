# Conversation core verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: ce5f992..8633a73
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

One surviving mutant: plan Landing door 10 says a duplicate rolls back the whole transaction, and part of that is unproven. A duplicate `externalId` arriving from a different phone must not leave a new contact or conversation behind. Replacing the rollback with a commit keeps every proof green (fault 5). The checks' `Landing doors` row counts 9 doors, but the plan has 10. All 58 checks pass with located evidence.

## Binding sources

Profile is `standard`, so step 1 (`ui`) does not run. The plan marks no source as a UI binding source. I opened ADR-013, ADR-016 and ADR-004 only to recompute the Coverage rows.

## Checks

The proof run is one vitest invocation over 11 files, with a `-t` alternation of all 59 distinct proof names. It exited 0 with `Tests 59 passed | 78 skipped`, and each name appears once as `✓`. Every test file named in a proof was added or changed in `ce5f992..HEAD`. `rg` is unavailable in this shell (the rtk wrapper fails), so I did the lookups with `grep -n`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | onboarding creates exactly one `WEB_CHAT` `Web Chat` channel | batch, `creates the default web chat channel` ✓ | `apps/server/src/modules/organizations/onboarding.spec.ts:231` - `expect(channels).toEqual([{ kind: 'WEB_CHAT', name: 'Web Chat', organizationId }])` | PASS |
| C2 | failing setup step after the channel rolls back organization and channel | batch ✓ | `apps/server/src/modules/organizations/onboarding.spec.ts:266-274` - `expect(channelStepRan).toBe(true)`, `expect(await channelCount()).toBe(before)`, `expect(leftover.rowCount).toBe(0)` | PASS |
| C3 | backfill under a NOSUPERUSER NOBYPASSRLS owner: 1 channel per org (3) | batch ✓ | `apps/server/test/schema.spec.ts:712` - `expect(channels).toEqual([...organizations].sort().map(... ({ organizationId, kind: 'WEB_CHAT', name: 'Web Chat' })))`, where `{ owner: probeOwner() }` is at `:715` | PASS |
| C4 | backfill as the superuser owner: 1 channel per org | batch ✓ | `apps/server/test/schema.spec.ts:730` - same `toEqual` without an owner | PASS |
| C5 | Organization and Channel stay ENABLE+FORCE+`tenant_isolation` (probe and worker) | batch ✓ | `apps/server/test/schema.spec.ts:754-755` - `expect(probe).toEqual(expected)`, `expect(worker).toEqual(expected)` with `forced: true` | PASS |
| C6 | a second `WEB_CHAT` in the same org fails 23505; another org is accepted | batch ✓ | `apps/server/test/schema.spec.ts:836` - `toEqual({ second: '23505 Channel_one_web_chat', other: 'ok' })` | PASS |
| C7 | tenant B cannot see or update A's channel | batch ✓ | `apps/server/src/modules/channels/channel.spec.ts:27-29` - `not.toContain(channelA)`, `expect(renamedByB.count).toBe(0)` | PASS |
| C8 | 7 BR inputs normalize to the listed E.164 values | batch ✓ | `apps/server/src/shared/phone.spec.ts:7-15` - table plus `expect(normalizePhone(raw), raw).toBe(expected)` | PASS |
| C9 | an international number keeps its country | batch ✓ | `apps/server/src/shared/phone.spec.ts:19-20` - `toBe('+12024561111')`, `toBe('+351912345678')` | PASS |
| C10 | 9 invalid inputs, including the 3 that only `max` refuses, give `null` | batch ✓ | `apps/server/src/shared/phone.spec.ts:24-36` - `expect(normalizePhone(raw), raw).toBeNull()` | PASS |
| C11 | `abc` gives 422 `INVALID_PHONE` and writes nothing | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:57-61` - `rejects.toMatchObject({ status: 422, code: 'INVALID_PHONE' })`, `toEqual({ contacts: 0, conversations: 0, messages: 0 })` | PASS |
| C12 | two formats of one phone give 1 contact, 1 conversation, 2 messages | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:72-73` - `toEqual(['+5511987654321'])`, `toEqual({ contacts: 1, conversations: 1, messages: 2 })` | PASS |
| C13 | the same phone in A and B gives one contact each, isolated | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:87-88` - `toHaveLength(1)`, `found[0]?.organizationId).toBe(tenant.organizationId)` | PASS |
| C14 | non-E.164 phones fail 23514; a valid one is accepted | batch ✓ | `apps/server/test/schema.spec.ts:851` - `noPlus/leadingZero/tooLong: '23514 Contact_phoneE164_check', valid: 'ok'` | PASS |
| C15 | an owner from another org fails 23503; a member is accepted | batch ✓ | `apps/server/test/schema.spec.ts:874` - `toEqual({ outsider: '23503 Contact_organizationId_ownerId_fkey', member: 'ok' })` | PASS |
| C16 | a new contact has a null `ownerId` | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:110` - `expect(contact.ownerId).toBeNull()` | PASS |
| C17 | first inbound: OPEN/QUEUE/null/lastSeq 1 + INBOUND/CONTACT/seq 1/null delivery; `created: true` | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:98-122` - `result.created).toBe(true)`, `toMatchObject({ status: 'OPEN', handler: 'QUEUE', assigneeId: null, lastSeq: 1 })`, `toMatchObject({ id: result.messageId, direction: 'INBOUND', author: 'CONTACT', seq: 1, deliveryStatus: null, kind: 'TEXT' })` | PASS |
| C18 | lastSeq 7 becomes seq 8 and lastSeq 8; `lastMessageAt` newer | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:132-136` - `lastSeq).toBe(8)`, `lastMessageAt?.getTime()).toBeGreaterThan(old.getTime())`, `toEqual([8])`. Precision note: "igual ao da transação" is asserted only as newer than the seed | PASS |
| C19 | WAITING+HUMAN X becomes OPEN, still HUMAN X | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:152-156` - `toMatchObject({ status: 'OPEN', handler: 'HUMAN', assigneeId: salespersonA.userId })` | PASS |
| C20 | a repeated `wa-1` returns the original ids with `created: false` and changes nothing | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:172-184` - `toEqual({ conversationId: original.conversationId, messageId: original.messageId, created: false })`, `status).toBe('WAITING')`, `toMatchObject({ lastSeq: before.lastSeq, lastMessageAt: before.lastMessageAt, handler: before.handler })`, `toHaveLength(2)` | PASS |
| C21 | 10 parallel duplicates: 1 message, 1 `created: true`, same id | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:197-199` - `filter(created)).toHaveLength(1)`, `Set(messageId).size).toBe(1)`, `toMatchObject({ messages: 1 })` | PASS |
| C22 | 50 parallel inbounds give seq 1..50 and lastSeq 50 | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:212-213` - `toEqual(range(1, 50))`, `lastSeq).toBe(50)` | PASS |
| C23 | a locked conversation A does not block B (<2 s); A waits | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:245-251` - `elapsed).toBeLessThan(2000)`, `waitingDone).toBe(false)`, then `toBe(true)` after release | PASS |
| C24 | 10 parallel first messages give 1 contact, 1 conversation, seq 1..10 | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:264-267` - `toEqual({ contacts: 1, conversations: 1, messages: 10 })`, `toEqual(range(1, 10))` | PASS |
| C25 | `UNSUPPORTED` stores `text` null even when text is sent | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:276` - `toMatchObject({ kind: 'UNSUPPORTED', text: null })` | PASS |
| C26 | null/blank/65 537 give 422 and write nothing; 65 536 is accepted | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:283-292` - `rejects.toMatchObject({ status: 422, code: 'INVALID_MESSAGE' })`, zero rows, `toHaveLength(65_536)` | PASS |
| C27 | a foreign or unknown channel gives 404 and writes nothing | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:300-305` - `rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })`, zero rows | PASS |
| C28 | two inbounds without `externalId` give seq 1 and 2, both null | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:316-319` - `toEqual([[1, null], [2, null]])` | PASS |
| C29 | CLOSED reopens in place with history intact and new seq 4; 1 conversation | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:351-364` - `conversationId).toBe(closed.id)`, `toMatchObject({ status: 'OPEN', closedAt: null, lastSeq: 4 })`, history `toEqual`, `toMatchObject({ seq: 4, text: 'Voltei' })`, `toMatchObject({ conversations: 1 })` | PASS |
| C30 | a reopened HUMAN X conversation becomes QUEUE with a null assignee | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:355-356` - `handler: 'QUEUE', assigneeId: null` | PASS |
| C31 | reopen audit is SYSTEM with exact `changes` (both shapes); none on an open conversation | batch ✓ (2 proofs) | `apps/server/src/modules/conversations/inbound.spec.ts:379-389` - `toMatchObject({ actorType: 'SYSTEM', actorUserId: null })`, `changes).toEqual({ status: ['CLOSED','OPEN'], handler: ['HUMAN','QUEUE'], previousAssigneeId })`, `toEqual({ status: [...], handler: ['QUEUE','QUEUE'] })`; `:138` - `reopenAudits(...)).toEqual([])` | PASS |
| C32 | 5 parallel inbounds on CLOSED (lastSeq 2): 1 open, 1 reopen audit, seq 3..7 | batch ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:405-407` - `toEqual([{ id: closed.id }])`, `toHaveLength(1)`, `toEqual(range(1, 7))` | PASS |
| C33 | new and reopened conversations go to QUEUE; `aiAvailable()` is false | batch ✓ | `apps/server/src/modules/conversations/conversation-state.spec.ts:105` - `expect(aiAvailable()).toBe(false)`; QUEUE at `inbound.spec.ts:102` and `:355`. `inbound.ts:82,146` use `reopenHandler({ aiAvailable: aiAvailable() })` | PASS |
| C34 | the assignee sends: OUTBOUND/HUMAN/X/seq 5/SENT/null ext; WAITING, lastSeq 5 | batch ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:57-71` - `toMatchObject({ direction: 'OUTBOUND', author: 'HUMAN', authorUserId: userX, seq: 5, deliveryStatus: 'SENT', externalId: null })`, `toMatchObject({ status: 'WAITING', lastSeq: 5 })` | PASS |
| C35 | Y on X's conversation, or X on QUEUE, gives 409 `NOT_HANDLER` with nothing changed | batch ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:83-86` - `rejects.toMatchObject({ status: 409, code: 'NOT_HANDLER' })` inside `unchanged` (`:40-42` compares lastSeq, status and messages) | PASS |
| C36 | AI on QUEUE/HUMAN gives 409; AI on AI stores with a null user | batch ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:98-106` - `rejects.toMatchObject({ status: 409, code: 'NOT_HANDLER' })`, `toMatchObject({ author: 'AI', authorUserId: null })` | PASS |
| C37 | SYSTEM sends on AI/QUEUE/HUMAN; each becomes WAITING | batch ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:119-120` - `toMatchObject({ author: 'SYSTEM', seq: 1 })`, `status).toBe('WAITING')` | PASS |
| C38 | CLOSED gives 409 `CONVERSATION_CLOSED` for HUMAN, AI and SYSTEM; nothing written | batch ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:143-147` - `rejects.toMatchObject({ status: 409, code: 'CONVERSATION_CLOSED' })` inside `unchanged` | PASS |
| C39 | a foreign or unknown conversation gives 404 | batch ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:156-161` - `rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })`, `toEqual([])` | PASS |
| C40 | outbound text: blank or 65 537 gives 422; 65 536 is stored | batch ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:169-177` - `rejects.toMatchObject({ status: 422, code: 'INVALID_MESSAGE' })`, `toHaveLength(65_536)` | PASS |
| C41 | 20 in + 20 out in parallel give seq 1..40 | batch ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:191-194` - `toEqual(Array.from({ length: 40 }, (_, i) => i + 1))`, OUTBOUND `toHaveLength(20)` | PASS |
| C42 | status × {in, out, close}, 9 cases | batch ✓ | `apps/server/src/modules/conversations/conversation-state.spec.ts:34-41` - table plus `toEqual(expected[status])` | PASS |
| C43 | handler × event, 21 cases | batch ✓ | `apps/server/src/modules/conversations/conversation-state.spec.ts:48-86` - `toEqual(expected[handler][event])`, `cases).toBe(21)` | PASS |
| C44 | no automatic event leads to AI from QUEUE or HUMAN | batch ✓ | `apps/server/src/modules/conversations/conversation-state.spec.ts:93,96` - `not.toBe('AI')` | PASS |
| C45 | `reopenHandler` true gives AI; false gives QUEUE | batch ✓ | `apps/server/src/modules/conversations/conversation-state.spec.ts:100-101` - `toBe('AI')`, `toBe('QUEUE')` | PASS |
| C46 | `canSend`, 30 cases | batch ✓ | `apps/server/src/modules/conversations/conversation-state.spec.ts:119-141` - `toBe(expected)`, `cases).toBe(30)` | PASS |
| C47 | exact `scopeFor` for COMMERCIAL; `{}`/`{}` for ADMIN and MANAGER | batch ✓ | `apps/server/src/shared/scope.spec.ts:12-24` - `toEqual({ contact: { OR: [...] }, conversation: { OR: [4 clauses] } })`, `toEqual({ contact: {}, conversation: {} })` | PASS |
| C48 | the portfolio filter against a seeded database gives the exact sets | batch ✓ | `apps/server/src/modules/conversations/scope.spec.ts:52-69` - `toEqual(new Set([humanOfA, queueContactOfB, aiOwnerless, humanOfBContactOfA]))`, `toEqual(new Set([a.userId, null]))`, `toHaveLength(3)`, manager `toHaveLength(6)` | PASS |
| C49 | transfer moves X's 2 contacts to Y and returns `200 { transferred: 2 }` | batch ✓ | `apps/server/src/modules/organizations/member.spec.ts:724-726` - `statusCode).toBe(200)`, `toEqual({ transferred: 2 })`, owners `toEqual(new Map([...]))` | PASS |
| C50 | the other tenant's contact is untouched | batch ✓ | `apps/server/src/modules/organizations/member.spec.ts:754-756` - `toEqual({ transferred: 1 })`, `.get(foreign)).toBe(source.user.id)` | PASS |
| C51 | assignee FK 23503; assignee check and closed check 23514 | batch ✓ | `apps/server/test/schema.spec.ts:900` - `outsiderAssignee: '23503 Conversation_organizationId_assigneeId_fkey'`, two `'23514 Conversation_assignee_check'`, two `'23514 Conversation_closed_check'`. Precision note: only UPDATE is exercised, not INSERT | PASS |
| C52 | forbidden module edges: 0 in the tree, 5 synthetic | batch ✓ | `apps/server/test/architecture.spec.ts:352-353` - `toEqual([])` and the exact list of 5 edges | PASS |
| C53 | import cycles: 0 in the tree; `a->b->a` and `a->b->c->a` found | batch ✓ | `apps/server/test/architecture.spec.ts:373-380` - `toEqual([])`, `toEqual(['a -> b -> a'])`, `toEqual(['a -> b -> c -> a'])` | PASS |
| C54 | writes to another module's tables: 0 in the tree; 10 forms flagged once; reads and own writes not flagged | batch ✓ | `apps/server/test/architecture.spec.ts:391,404-405` - `toEqual([])`, `toHaveLength(1)` per form, negatives `toEqual([])` | PASS |
| C55 | the 5 unique indexes with literal columns and predicate | batch ✓ | `apps/server/test/schema.spec.ts:923-935` - 5 × `definitions.get(...)).toBe('CREATE UNIQUE INDEX ...')` | PASS |
| C56 | index enforcement: 23505 and accepted cases | batch ✓ | `apps/server/test/schema.spec.ts:981` - `toEqual({ secondOpen: '23505 Conversation_one_open', closedBesideOpen: 'ok', sameExternal: '23505 Message_channel_externalId', secondNull: 'ok', sameSeq: '23505 Message_organizationId_conversationId_seq_key', ... })` | PASS |
| C57 | 4 tables ENABLE+FORCE+policy with `app.tenant_id`; general RLS, composite-FK and cascade tests | batch ✓ (4 proofs) | `apps/server/test/schema.spec.ts:1006-1010` - `forced` `toEqual`, `qual`/`check` `toContain('app.tenant_id')`; `:199` `unprotected).toEqual([])`; `:436` `findSimpleTenantRelations(schema)).toEqual([])`; `:258` `real).toEqual([])` | PASS |
| C58 | Message CHECKs give 23514 (8 cases); a different channel gives 23503 | batch ✓ | `apps/server/test/schema.spec.ts:1092` - `toEqual({ inboundFromSystem: '23514 Message_direction_check', ..., otherChannel: '23503 Message_conversationId_channelId_organizationId_fkey', valid: 'ok' })` | PASS |

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| Landing doors (10, not 9) | `plan.md` Landing table (door 10 was added in the build and is absent from the checks' row) | doors 1-9 as in the checks (C1, C6 · C14, C15 · C29, C51, C56 · C20-C22, C58 · C42-C46 · C8-C10 · C3-C5 · C47, C48 · C1, C49, C53). Door 10: no seq burned or state changed by a duplicate (C20, C21). Rolling back a new contact or conversation has no proof | door 10: the transaction rollback of a new contact or conversation, when a duplicate `externalId` arrives from a different phone (`inbound.ts:78`); fault 5 survived |
| Relations constraints (18) | `migration.sql:86-193` | one Web Chat `:142` C6 · phone unique `:92` C12, C24, C55 · E.164 `:145` C14 · owner is a member `:113` C15 · one open conversation `:150` C56 · assignee iff HUMAN `:152` C51 · closedAt iff CLOSED `:154` C51 · assignee is a member `:125` C51 · seq unique `:104` C56 · externalId unique `:159` C56 · message channel = conversation channel `:131` C58 · direction `:161`, delivery `:163`, author user `:165`, text `:167` C58 · RLS ×4 `:171-193` C57 · composite FKs `:119,122,131` C57 · RESTRICT to Organization/User `:107,110,116,128,134` C57 | - |
| unique indexes, ADR-013 + channel (5) | ADR-013 "Ordem e idempotência" plus `migration.sql` | all 5 C55 (literal `indexdef`); enforced C6, C56 | - |
| `receiveInbound` outcomes (10, plus door 10) | `inbound.ts:50-160` branches | invalid phone `:51` C11 · invalid text `:52` C26 · channel missing `:61` C27 · new conversation `:140` C17 · open conversation `:131` C18 · WAITING to OPEN `:87` C19 · CLOSED reopens `:80-106` C29-C32 · duplicate `:78,110` C20, C21 · UNSUPPORTED `:52` C25 · null externalId `:53` C28 | duplicate from another phone rolled back (see door 10) |
| `sendMessage` author × outcome (9) | `outbound.ts:26-84` | the 9 as in the checks: C34-C40 | - |
| error codes (5) | `inbound.ts:17-18`, `message-text.ts:6`, `outbound.ts:9-15` | INVALID_PHONE C11 · INVALID_MESSAGE C26, C40 · NOT_FOUND C27, C39 · NOT_HANDLER C35, C36 · CONVERSATION_CLOSED C38 | - |
| status × event (9) | `conversation-state.ts:13-25` | C42, table-driven | - |
| handler × event (21) | `conversation-state.ts:27-51` (3 × 7) | C43, table-driven with `cases === 21` | - |
| `canSend` (30) | `conversation-state.ts:64-87` (5 senders × 3 × 2) | C46, table-driven with `cases === 30` | - |
| `normalizePhone` inputs (18) | AC 6-8 + checks C8-C10 | all 18 in `phone.spec.ts:7-35` | - |
| concurrency scenarios (6) | plan Criteria S3-S5 | C21, C22, C23, C24, C32, C41 | - |
| `scopeFor` roles (3) | `Role` = ADMIN, MANAGER, COMMERCIAL (`scope.ts:14`) | C47 (all 3), C48 (COMMERCIAL, MANAGER) | - |
| conversations visible to COMMERCIAL (4 clauses + 2 exclusions) | `scope.ts:18-23` | QUEUE, contact-owner and ownerless clauses are each discriminated by C48. The `assigneeId` clause is only discriminated by C47 (`scope.spec.ts:12`): C48's `humanOfA` is seeded with an ownerless contact (`scope.spec.ts:28`), so it stays visible if that clause is removed. Exclusions: C48 | - |
| architecture rules (3) | AC 49-50 | C52, C53, C54 | - |
| write forms (10) | AC 50 | the 10 forms in C54. The code regex also accepts `createManyAndReturn` and `updateManyAndReturn` (`architecture.spec.ts` `WRITE_METHODS`), which are outside the AC set and not exercised | - |
| backfill owners (2) | door 7 / AD-016 | non-superuser C3 · superuser C4 | - |
| startup config (1 assembly) | `app.ts:117,120` (`setupOrganization: [createDefaultChannel]`, `portfolioMoves: [moveContactOwner]`); `buildApp` is used by `server.ts:22`, `test/app.ts:42`, `scripts/export-openapi.ts:17` | C1, C49 via `buildTestApp`, which is the same `buildApp` | - |

Sets with no row in the checks: Landing door 10 (above). ADR-013 "Consequences" requires the test "evento só após commit" in F2. This feature emits no events (no socket or queue code in the diff), so the member does not exist yet. I record this as a note, not a gap.

## Test policy rows

`checks.md` adds no new rows and classifies three files under the repo's rules (CLAUDE.md "Testes"). Verdict on each:

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, pure: unit test of every transition | `conversations/conversation-state.ts` | own layer, one case per row: C42 (9), C43 (21), C46 (30), C44, C45, C33 | yes |
| Decides, reached across the use-case boundary: real PostgreSQL | `conversations/inbound.ts`, `conversations/outbound.ts` | real PostgreSQL through `receiveInbound`/`sendMessage`: C11-C41 | not met: the rollback branch at `inbound.ts:78` (door 10) survives a commit-instead-of-rollback mutant (fault 5); no proof sends a duplicate `externalId` from a new phone |
| Decides, delegated to library metadata | `shared/phone.ts` | own layer with discriminating inputs: C8-C10 (including 3 inputs that only `max` rejects) | yes |

Swept re-read: no `Swept` row cites an existing constraint; each resolves to a check id or to `n/a`, which is approved policy. The one startup-config claim was confirmed at `app.ts:117,120`.

## Faults injected

Scratch `git worktree add --detach <scratchpad>/wt HEAD`, with `pnpm install --frozen-lockfile --prefer-offline` and the root `.env` copied in. `git status --porcelain` of the real tree was empty before and empty after the worktree was removed (identical).

| Mutation | Location | Killed |
| --- | --- | --- |
| `QUEUE` + `requestHuman` returns `AI` | `apps/server/src/modules/conversations/conversation-state.ts:44` | yes - C43 `maps every handler transition` and C44 fail |
| HUMAN send guard drops the `assigneeId` condition | `apps/server/src/modules/conversations/outbound.ts:31` | yes - C35 `refuses a human who does not handle the conversation` fails |
| reopen keeps the previous handler and assignee | `apps/server/src/modules/conversations/inbound.ts:81-91` | yes - C29/C30 `reopens a closed conversation and keeps its history` fails |
| backfill replaced by the rejected naive `INSERT … SELECT FROM "Organization"` | `apps/server/prisma/migrations/20260924160000_conversation_core/migration.sql:199-213` | yes - C3 (forced row security) fails; C4 (superuser) passes, as intended |
| duplicate path returns the stored message inside the transaction (commit) instead of throwing `DuplicateInbound` (rollback) | `apps/server/src/modules/conversations/inbound.ts:78` | no - survived; all 26 tests of `inbound.spec.ts` + `outbound.spec.ts` pass. A scratch probe in the worktree (deleted with it) sent a duplicate `externalId` from a second phone: HEAD leaves `{ contacts: 1, conversations: 1 }` and the mutant leaves `{ contacts: 2, conversations: 2 }` |

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` at the repo root, at HEAD 8633a73. Exit 0: biome checked 182 files with no fixes; `tsc --noEmit` passed for server and web; vitest ran 37 files and 370 tests, all passed, 0 failed; server and web builds finished.

Proof batch: 11 files and 59 named tests, 59 passed, 0 failed.

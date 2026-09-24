# Conversation core verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: ce5f992..fc9cc70
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 1 (d5d58e8) failed for three reasons. First, a mutant on the duplicate path survived. Second, door 10 had no member in the Landing doors row. Third, C48's seed could not catch removal of the `assigneeId` clause. Commit fc9cc70 adds C59 ("rolls back a repeated external id from a new phone") and moves C48's `humanOfA` onto a contact owned by B. Both re-injected faults are now killed. All 59 checks pass at fc9cc70 with located evidence. The fix changed only tests and `checks.md`; no production source changed in `d5d58e8..fc9cc70`.

## Binding sources

carried from d5d58e8. The profile is `standard`, so step 1 (`ui`) does not run, and the plan marks no UI binding source. The fix did not touch the interface.

## Checks

Proofs verified at fc9cc70. The run was one vitest invocation from `apps/server`: 11 files, with a `-t` alternation of all 60 distinct proof names (59 checks, where C31 and C57 carry more than one proof and C16/C17 and C29/C30 share one). It exited 0 with `Test Files 11 passed (11)` and `Tests 60 passed | 78 skipped (138)`. Each of the 60 names appears individually as `✓` in the verbose output. The citations for C48 and C59 were verified at fc9cc70. The fix shifted line numbers in `inbound.spec.ts` (+14 from line 187) and `scope.spec.ts` (+1 from line 28), and I refreshed and re-read every citation into those two files at fc9cc70. All other citations are carried from d5d58e8: their files are unchanged in `d5d58e8..fc9cc70`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | onboarding creates exactly one `WEB_CHAT` `Web Chat` channel | batch fc9cc70 ✓ | `apps/server/src/modules/organizations/onboarding.spec.ts:231` - `expect(channels).toEqual([{ kind: 'WEB_CHAT', name: 'Web Chat', organizationId }])` (carried from d5d58e8) | PASS |
| C2 | a failing setup step after the channel rolls back the organization and the channel | batch fc9cc70 ✓ | `apps/server/src/modules/organizations/onboarding.spec.ts:266-274` - `expect(channelStepRan).toBe(true)`, `expect(await channelCount()).toBe(before)`, `expect(leftover.rowCount).toBe(0)` (carried) | PASS |
| C3 | backfill under a NOSUPERUSER NOBYPASSRLS owner: 1 channel per org (3) | batch fc9cc70 ✓ | `apps/server/test/schema.spec.ts:712` - `expect(channels).toEqual([...organizations].sort().map(... ({ organizationId, kind: 'WEB_CHAT', name: 'Web Chat' })))`, `{ owner: probeOwner() }` at `:715` (carried) | PASS |
| C4 | backfill as the superuser owner: 1 channel per org | batch fc9cc70 ✓ | `apps/server/test/schema.spec.ts:730` - same `toEqual`, no owner (carried) | PASS |
| C5 | Organization and Channel stay ENABLE+FORCE+`tenant_isolation` | batch fc9cc70 ✓ | `apps/server/test/schema.spec.ts:754-755` - `expect(probe).toEqual(expected)`, `expect(worker).toEqual(expected)` (carried) | PASS |
| C6 | a second `WEB_CHAT` in the same org gives 23505; another org is accepted | batch fc9cc70 ✓ | `apps/server/test/schema.spec.ts:836` - `toEqual({ second: '23505 Channel_one_web_chat', other: 'ok' })` (carried) | PASS |
| C7 | tenant B cannot see or update A's channel | batch fc9cc70 ✓ | `apps/server/src/modules/channels/channel.spec.ts:27-29` - `not.toContain(channelA)`, `expect(renamedByB.count).toBe(0)` (carried) | PASS |
| C8 | 7 BR inputs normalize to the listed E.164 values | batch fc9cc70 ✓ | `apps/server/src/shared/phone.spec.ts:7-15` - `expect(normalizePhone(raw), raw).toBe(expected)` (carried) | PASS |
| C9 | an international number keeps its country | batch fc9cc70 ✓ | `apps/server/src/shared/phone.spec.ts:19-20` - `toBe('+12024561111')`, `toBe('+351912345678')` (carried) | PASS |
| C10 | 9 invalid inputs give `null` | batch fc9cc70 ✓ | `apps/server/src/shared/phone.spec.ts:24-36` - `expect(normalizePhone(raw), raw).toBeNull()` (carried) | PASS |
| C11 | `abc` gives 422 `INVALID_PHONE` and writes nothing | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:57-61` - `rejects.toMatchObject({ status: 422, code: 'INVALID_PHONE' })`, `toEqual({ contacts: 0, conversations: 0, messages: 0 })` (lines unmoved) | PASS |
| C12 | two formats of one phone give 1 contact, 1 conversation, 2 messages | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:72-73` - `toEqual(['+5511987654321'])`, `toEqual({ contacts: 1, conversations: 1, messages: 2 })` | PASS |
| C13 | the same phone in A and B gives one contact each | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:87-88` - `toHaveLength(1)`, `found[0]?.organizationId).toBe(tenant.organizationId)` | PASS |
| C14 | non-E.164 phones give 23514 | batch fc9cc70 ✓ | `apps/server/test/schema.spec.ts:851` - `'23514 Contact_phoneE164_check'` ×3, `valid: 'ok'` (carried) | PASS |
| C15 | an owner from another org gives 23503 | batch fc9cc70 ✓ | `apps/server/test/schema.spec.ts:874` - `toEqual({ outsider: '23503 Contact_organizationId_ownerId_fkey', member: 'ok' })` (carried) | PASS |
| C16 | a new contact has a null `ownerId` | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:110` - `expect(contact.ownerId).toBeNull()` | PASS |
| C17 | first inbound: OPEN/QUEUE/null/lastSeq 1 + INBOUND/CONTACT/seq 1; `created: true` | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:98-122` - `result.created).toBe(true)`, `toMatchObject({ status: 'OPEN', handler: 'QUEUE', assigneeId: null, lastSeq: 1 })`, `toMatchObject({ direction: 'INBOUND', author: 'CONTACT', seq: 1, deliveryStatus: null, kind: 'TEXT' })` | PASS |
| C18 | lastSeq 7 becomes seq 8 and lastSeq 8; `lastMessageAt` newer | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:132-136` - `lastSeq).toBe(8)`, `lastMessageAt?.getTime()).toBeGreaterThan(old.getTime())`, `toEqual([8])`. Precision note carried from d5d58e8: "igual ao da transação" is asserted only as newer than the seed | PASS |
| C19 | WAITING+HUMAN X becomes OPEN, still HUMAN X | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:152-156` - `toMatchObject({ status: 'OPEN', handler: 'HUMAN', assigneeId: salespersonA.userId })` | PASS |
| C20 | a repeated `wa-1` returns the original ids with `created: false` and changes nothing | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:172-184` - `toEqual({ conversationId: original.conversationId, messageId: original.messageId, created: false })`, `toMatchObject({ lastSeq: before.lastSeq, lastMessageAt: before.lastMessageAt, handler: before.handler })`, `toHaveLength(2)` | PASS |
| C21 | 10 parallel duplicates: 1 message, 1 `created: true`, same id | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:211-213` - `filter(created)).toHaveLength(1)`, `Set(messageId).size).toBe(1)`, `toMatchObject({ messages: 1 })` (refreshed, was 197-199) | PASS |
| C59 | repeated `wa-2` from another phone: original ids, `created: false`, exactly 1 contact, 1 conversation, 1 message | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:193-197` - `expect(repeated).toEqual({ conversationId: original.conversationId, messageId: original.messageId, created: false })`; `:198` - `expect(await rowsOf(tenant)).toEqual({ contacts: 1, conversations: 1, messages: 1 })`. The second phone comes from the `inbound` helper default `randomPhone()` (`test/conversations.ts:29`), and `freshTenant()` isolates the counts | PASS |
| C22 | 50 parallel inbounds give seq 1..50 and lastSeq 50 | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:226-227` - `toEqual(range(1, 50))`, `lastSeq).toBe(50)` (refreshed) | PASS |
| C23 | a locked conversation A does not block B (<2 s); A waits | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:259-265` - `elapsed).toBeLessThan(2000)`, `waitingDone).toBe(false)`, then `toBe(true)` (refreshed) | PASS |
| C24 | 10 parallel first messages give 1 contact, 1 conversation, seq 1..10 | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:279-281` - `toEqual({ contacts: 1, conversations: 1, messages: 10 })`, `toEqual(range(1, 10))` (refreshed) | PASS |
| C25 | `UNSUPPORTED` stores `text` null | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:290` - `toMatchObject({ kind: 'UNSUPPORTED', text: null })` (refreshed) | PASS |
| C26 | null, blank or 65 537 characters give 422 and write nothing; 65 536 is accepted | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:297-306` - `rejects.toMatchObject({ status: 422, code: 'INVALID_MESSAGE' })`, `toHaveLength(65_536)` (refreshed) | PASS |
| C27 | a foreign or unknown channel gives 404 and writes nothing | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:314-319` - `rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })`, `toEqual({ contacts: 0, conversations: 0, messages: 0 })` (refreshed) | PASS |
| C28 | two inbounds without `externalId` give seq 1 and 2, both null | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:330-333` - `toEqual([[1, null], [2, null]])` (refreshed) | PASS |
| C29 | CLOSED reopens in place, history intact, new seq 4, 1 conversation | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:365-378` - `conversationId).toBe(closed.id)`, `toMatchObject({ status: 'OPEN', closedAt: null, lastSeq: 4 })`, `toMatchObject({ conversations: 1 })` (refreshed) | PASS |
| C30 | a reopened HUMAN X conversation becomes QUEUE with a null assignee | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:369-370` - `handler: 'QUEUE', assigneeId: null` (refreshed) | PASS |
| C31 | reopen audit is SYSTEM with exact `changes`; none on an open conversation | batch fc9cc70 ✓ (2 proofs) | `apps/server/src/modules/conversations/inbound.spec.ts:393-403` - `toMatchObject({ actorType: 'SYSTEM', actorUserId: null })`, `changes).toEqual({ status: ['CLOSED','OPEN'], handler: ['HUMAN','QUEUE'], previousAssigneeId })` (refreshed); `:138` - `reopenAudits(...)).toEqual([])` | PASS |
| C32 | 5 parallel inbounds on CLOSED: 1 open, 1 reopen audit, seq 3..7 | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/inbound.spec.ts:419-421` - `toEqual([{ id: closed.id }])`, `toHaveLength(1)`, `toEqual(range(1, 7))` (refreshed) | PASS |
| C33 | new and reopened conversations go to QUEUE; `aiAvailable()` is false | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/conversation-state.spec.ts:105` - `expect(aiAvailable()).toBe(false)`; QUEUE at `inbound.spec.ts:102` and `:369` (refreshed) | PASS |
| C34 | the assignee sends: OUTBOUND/HUMAN/X/seq 5/SENT; WAITING, lastSeq 5 | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:57-71` - `toMatchObject({ direction: 'OUTBOUND', author: 'HUMAN', authorUserId: userX, seq: 5, deliveryStatus: 'SENT', externalId: null })`, `toMatchObject({ status: 'WAITING', lastSeq: 5 })` (carried) | PASS |
| C35 | Y, or X on QUEUE, gives 409 `NOT_HANDLER` with nothing changed | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:83-86` - `rejects.toMatchObject({ status: 409, code: 'NOT_HANDLER' })` (carried) | PASS |
| C36 | AI on QUEUE/HUMAN gives 409; AI on AI stores with a null user | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:98-106` - `rejects.toMatchObject({ status: 409, code: 'NOT_HANDLER' })`, `toMatchObject({ author: 'AI', authorUserId: null })` (carried) | PASS |
| C37 | SYSTEM sends on AI/QUEUE/HUMAN; each becomes WAITING | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:119-120` - `toMatchObject({ author: 'SYSTEM', seq: 1 })`, `status).toBe('WAITING')` (carried) | PASS |
| C38 | CLOSED gives 409 `CONVERSATION_CLOSED` for every author | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:143-147` - `rejects.toMatchObject({ status: 409, code: 'CONVERSATION_CLOSED' })` (carried) | PASS |
| C39 | a foreign or unknown conversation gives 404 | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:156-161` - `rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })` (carried) | PASS |
| C40 | outbound text: blank or 65 537 characters give 422; 65 536 is stored | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:169-177` - `rejects.toMatchObject({ status: 422, code: 'INVALID_MESSAGE' })`, `toHaveLength(65_536)` (carried) | PASS |
| C41 | 20 in + 20 out in parallel give seq 1..40 | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/outbound.spec.ts:191-194` - `toEqual(Array.from({ length: 40 }, (_, i) => i + 1))` (carried) | PASS |
| C42 | status × event, 9 cases | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/conversation-state.spec.ts:34-41` - `toEqual(expected[status])` (carried) | PASS |
| C43 | handler × event, 21 cases | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/conversation-state.spec.ts:48-86` - `toEqual(expected[handler][event])`, `cases).toBe(21)` (carried) | PASS |
| C44 | no automatic event leads to AI | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/conversation-state.spec.ts:93,96` - `not.toBe('AI')` (carried) | PASS |
| C45 | `reopenHandler` true gives AI; false gives QUEUE | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/conversation-state.spec.ts:100-101` - `toBe('AI')`, `toBe('QUEUE')` (carried) | PASS |
| C46 | `canSend`, 30 cases | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/conversation-state.spec.ts:119-141` - `toBe(expected)`, `cases).toBe(30)` (carried) | PASS |
| C47 | exact `scopeFor` for COMMERCIAL; `{}`/`{}` for ADMIN and MANAGER | batch fc9cc70 ✓ | `apps/server/src/shared/scope.spec.ts:12-24` - `toEqual({ contact: { OR: [...] }, conversation: { OR: [4 clauses] } })` (carried) | PASS |
| C48 | the portfolio filter against a seeded database gives the exact sets | batch fc9cc70 ✓ | `apps/server/src/modules/conversations/scope.spec.ts:53-55` - `expect(commercial.conversations).toEqual(new Set([humanOfA.id, queueContactOfB.id, aiOwnerless.id, humanOfBContactOfA.id]))`; `:56-57` - `toEqual(new Set([a.userId, null]))`, `toHaveLength(2)`; `:60-70` - the manager sees all 6 conversations and all 6 contacts. The precondition the fix changed is at `:29`: `humanOfA` is seeded `HUMAN`/assignee A on a contact of B, so only the `assigneeId` clause admits it | PASS |
| C49 | transfer moves X's 2 contacts to Y, `200 { transferred: 2 }` | batch fc9cc70 ✓ | `apps/server/src/modules/organizations/member.spec.ts:724-726` - `statusCode).toBe(200)`, `toEqual({ transferred: 2 })` (carried) | PASS |
| C50 | the other tenant's contact is untouched | batch fc9cc70 ✓ | `apps/server/src/modules/organizations/member.spec.ts:754-756` - `toEqual({ transferred: 1 })`, `.get(foreign)).toBe(source.user.id)` (carried) | PASS |
| C51 | assignee FK 23503; assignee and closed checks 23514 | batch fc9cc70 ✓ | `apps/server/test/schema.spec.ts:900` - `'23503 Conversation_organizationId_assigneeId_fkey'`, `'23514 Conversation_assignee_check'`, `'23514 Conversation_closed_check'` (carried). Precision note carried: only UPDATE is exercised, not INSERT | PASS |
| C52 | forbidden module edges: 0 in the tree, 5 synthetic | batch fc9cc70 ✓ | `apps/server/test/architecture.spec.ts:352-353` - `toEqual([])` and the exact list of 5 edges (carried) | PASS |
| C53 | import cycles: 0 in the tree; 2 synthetic cycles found | batch fc9cc70 ✓ | `apps/server/test/architecture.spec.ts:373-380` - `toEqual([])`, `toEqual(['a -> b -> a'])`, `toEqual(['a -> b -> c -> a'])` (carried) | PASS |
| C54 | writes to other modules' tables: 0 in the tree; 10 forms flagged | batch fc9cc70 ✓ | `apps/server/test/architecture.spec.ts:391,404-405` - `toEqual([])`, `toHaveLength(1)` per form (carried) | PASS |
| C55 | the 5 unique indexes with literal columns and predicate | batch fc9cc70 ✓ | `apps/server/test/schema.spec.ts:923-935` - 5 × `definitions.get(...)).toBe('CREATE UNIQUE INDEX ...')` (carried) | PASS |
| C56 | index enforcement: 23505 and the accepted cases | batch fc9cc70 ✓ | `apps/server/test/schema.spec.ts:981` - `toEqual({ secondOpen: '23505 Conversation_one_open', closedBesideOpen: 'ok', sameExternal: '23505 Message_channel_externalId', secondNull: 'ok', ... })` (carried) | PASS |
| C57 | 4 tables ENABLE+FORCE+policy; general RLS, composite-FK and cascade tests | batch fc9cc70 ✓ (4 proofs) | `apps/server/test/schema.spec.ts:1006-1010` - `forced` `toEqual`, `toContain('app.tenant_id')`; `:199`, `:436`, `:258` - `toEqual([])` (carried) | PASS |
| C58 | Message CHECKs give 23514 (8 cases); a different channel gives 23503 | batch fc9cc70 ✓ | `apps/server/test/schema.spec.ts:1092` - `toEqual({ inboundFromSystem: '23514 Message_direction_check', ..., otherChannel: '23503 Message_conversationId_channelId_organizationId_fkey', valid: 'ok' })` (carried) | PASS |

## Coverage

Landing doors, `receiveInbound` outcomes and the COMMERCIAL-visible conversations row were verified at fc9cc70: the fix touched their authority or their proofs. The other rows are carried from d5d58e8. No production source changed, so their members are the same.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| Landing doors (10) - verified at fc9cc70 | `plan.md` Landing table, doors 1-10 (`plan.md:101` for door 10) | door 1 C1, C6 · door 2 C14, C15 · door 3 C29, C51, C56 · door 4 C20-C22, C58 · door 5 C42-C46 · door 6 C8-C10 · door 7 C3-C5 · door 8 C47, C48 · door 9 C1, C49, C53 · door 10: no seq or state change from a duplicate is C20, C21; a new contact and conversation rolled back is C59 (fault 1 killed). The door also names "reabertura e auditoria". At `inbound.ts:78-106` the reopen `update` and the `record` run only after the insert returned a row, so no single fault on the duplicate path can commit a reopen (see Notes) | - |
| `receiveInbound` outcomes (11) - verified at fc9cc70 | `inbound.ts:50-118` branches | invalid phone `:51` C11 · invalid text `:52` C26 · channel missing `:61` C27 · new conversation `:140` C17 · open conversation `:131` C18 · WAITING to OPEN `:87` C19 · CLOSED reopens `:80-106` C29-C32 · duplicate, same phone, `:78,110-117` C20, C21 · duplicate, new phone, rolled back `:78` C59 · UNSUPPORTED `:52` C25 · null externalId `:53` C28 | - |
| conversations visible to COMMERCIAL (4 clauses + 2 exclusions) - verified at fc9cc70 | `scope.ts:18-23` | assignee: `humanOfA` (`scope.spec.ts:29`, contact of B, HUMAN) is admitted only by this clause, so C48 fails without it (fault 2) · QUEUE `queueContactOfB` · contact owner `humanOfBContactOfA` · ownerless `aiOwnerless`, each admitted by one clause only · exclusions `aiOfB`, `humanOfBContactOfB` C48 | - |
| Relations constraints (18) - carried from d5d58e8 | `migration.sql:86-193` | as in round 1: C6, C12, C14, C15, C24, C51, C55, C56, C57, C58 | - |
| unique indexes, ADR-013 + channel (5) - carried | ADR-013 + `migration.sql` | C55 (literal), enforced C6, C56 | - |
| `sendMessage` author × outcome (9) - carried | `outbound.ts:26-84` | C34-C40 | - |
| error codes (5) - carried | `inbound.ts:17-18`, `message-text.ts:6`, `outbound.ts:9-15` | C11 · C26, C40 · C27, C39 · C35, C36 · C38 | - |
| status × event (9) - carried | `conversation-state.ts:13-25` | C42 | - |
| handler × event (21) - carried | `conversation-state.ts:27-51` | C43 | - |
| `canSend` (30) - carried | `conversation-state.ts:64-87` | C46 | - |
| `normalizePhone` inputs (18) - carried | AC 6-8 | `phone.spec.ts:7-35`, C8-C10 | - |
| concurrency scenarios (6) - carried | plan Criteria S3-S5 | C21, C22, C23, C24, C32, C41 | - |
| `scopeFor` roles (3) - carried | `scope.ts:14` | C47 (all 3), C48 (COMMERCIAL, MANAGER) | - |
| architecture rules (3) - carried | AC 49-50 | C52, C53, C54 | - |
| write forms (10) - carried | AC 50 | C54 (note carried: `createManyAndReturn`/`updateManyAndReturn` are accepted by `WRITE_METHODS` but are outside the AC set and not exercised) | - |
| backfill owners (2) - carried | door 7 / AD-016 | C3, C4 | - |
| startup config (1 assembly) - carried | `app.ts:117,120`, one `buildApp` for `server.ts`, `test/app.ts`, `export-openapi.ts` | C1, C49 | - |

Sets with no row: none new. The ADR-013 "evento só após commit" note is carried from d5d58e8. This feature still emits no events, so that member does not exist yet.

## Test policy rows

The row round 1 found unmet was re-judged at fc9cc70. The other two rows are carried from d5d58e8, and their files did not change.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, pure: unit test of every transition (carried from d5d58e8) | `conversations/conversation-state.ts` | C42 (9), C43 (21), C46 (30), C44, C45, C33 | yes |
| Decides, reached across the use-case boundary: real PostgreSQL (verified at fc9cc70) | `conversations/inbound.ts`, `conversations/outbound.ts` | real PostgreSQL through `receiveInbound`/`sendMessage`: C11-C41 plus C59. The duplicate branch `inbound.ts:78` and the rollback it relies on are now proven by C59 (fault 1 killed) and C20/C21 | yes |
| Decides, delegated to library metadata (carried from d5d58e8) | `shared/phone.ts` | C8-C10 | yes |

Swept re-read: carried from d5d58e8. The fix changed no `Swept` row; `idempotency` still resolves to C20, C21 and C28, and C59 adds to it.

## Faults injected

Verified at fc9cc70. I ran `git worktree add --detach <scratchpad>/wt HEAD`, then `pnpm install --frozen-lockfile --offline` in it, and symlinked the root `.env` into it. The real tree's `git status --porcelain` before was ` M .specs/LESSONS.md`, ` M .specs/lessons.json`. Those files were already modified before this round, and I did not touch them. After `git worktree remove --force` and `prune`, the porcelain was byte-identical (`diff` empty). No `git stash` was used. The fix created no production surface, only assertions. Fault 1 is aimed at the new C59 assertion and fault 2 at the changed C48 seed, and each also re-runs a round-1 surface.

| Mutation | Location | Killed |
| --- | --- | --- |
| duplicate path commits: `if (inserted.length === 0)` returns the stored message from `tx.message.findFirstOrThrow` inside the transaction instead of throwing `DuplicateInbound` (the round-1 surviving mutant, re-injected) | `apps/server/src/modules/conversations/inbound.ts:78` | yes - `inbound.spec.ts` + `outbound.spec.ts`: 1 failed, 26 passed. C59 fails at `inbound.spec.ts:198:34`, with `{ contacts: 2, conversations: 2, …}` expected to equal `{ contacts: 1, conversations: 1, …}` |
| `{ assigneeId: ctx.userId }` removed from the COMMERCIAL conversation filter | `apps/server/src/shared/scope.ts:19` | yes - C48 fails at `modules/conversations/scope.spec.ts:53:38` (`Set{ …(3) }` vs `Set{ …(4) }`); C47 also fails at `shared/scope.spec.ts:12:45` |

## Gate

Verified at fc9cc70. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` at the repo root exited 0:

- biome: `Checked 182 files`, no fixes
- `tsc --noEmit`: web and server Done
- vitest: `Test Files 37 passed (37)`, `Tests 371 passed (371)`, 0 failed (370 in round 1, plus C59)
- builds: server `tsc -p tsconfig.build.json` and web `vite build` Done

Proof batch: 11 files, 60 named tests, 60 passed, 0 failed.

## Notes

None of these fail the feature.

1. Door 10 "reabertura e auditoria": the plan says the rollback also undoes a reopen and its audit. No test sends a duplicate `externalId` to a CLOSED conversation. In the code, the reopen `update` (`inbound.ts:84-93`) and `record` (`:95-105`) run after the duplicate check at `:78`, so today a duplicate never writes them, rollback or not. A future reorder that put the check after the reopen would be caught only if it also dropped the rollback. A proof would be cheap: close the conversation that holds `wa-x`, repeat `wa-x`, and assert it is still `CLOSED` with no `conversation.reopen` row.
2. C59 does not assert that the second phone differs from the first. It relies on `randomPhone()` (`test/conversations.ts:10-14,29`), which has about 9×10^7 values, so a collision is negligible. Fault 1 shows the precondition holds in practice: the mutant left 2 contacts.
3. Carried from d5d58e8: C18 asserts `lastMessageAt` only as newer than the seed; C51 exercises only UPDATE, not INSERT; `WRITE_METHODS` has two forms outside the AC set.

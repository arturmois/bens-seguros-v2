# Inbox checks

Profile: ui
Plan: `.specs/features/inbox/plan.md`

28 checks in 6 slices · 4 one-way doors · 0 open

Proof prefixes (omitted below):
- server: `pnpm --filter @bens/server exec vitest run`
- web: `pnpm --filter @bens/web exec playwright test`

## Checks

### S1 - Lista fila e minhas · conversations · ~25 KB · ~8k

**C1** - `GET /api/v1/conversations?view=queue` returns only `handler=QUEUE` and `status≠CLOSED`, ordered by `lastMessageAt` descending (nulls last), then `id` desc; seeds placed so removing the sort fails (door 3, AC 1)
Proof: `src/modules/conversations/inbox-list.spec.ts -t "lists the queue by lastMessageAt"`

**C2** - `GET /api/v1/conversations?view=mine` returns only conversations with `assigneeId` equal to the caller and `status≠CLOSED`, same order (AC 2)
Proof: `src/modules/conversations/inbox-list.spec.ts -t "lists mine by lastMessageAt"`

**C3** - When more visible rows than `limit`, pages via keyset without repeat or skip; last page has `nextCursor` null (AC 3)
Proof: `src/modules/conversations/inbox-list.spec.ts -t "paginates the inbox list by keyset"`

**C4** - List never returns another tenant's conversations; COMMERCIAL never sees another commercial's HUMAN conversation outside portfolio (AC 4)
Proof: `src/modules/conversations/inbox-list.spec.ts -t "scopes the inbox list by tenant and portfolio"`

**C5** - Invalid `view` → `400`; without session → `401`; without `conversation:read` → `403`; inactive member → `404`; absent `view` keeps the legacy list (all portfolio rows, `id` desc) (Surface)
Proof: `src/modules/conversations/inbox-list.spec.ts -t "rejects bad view auth and permission on the inbox list"`
Proof: `src/modules/conversations/read.spec.ts -t "hides conversation routes from an inactive member"`

### S2 - Assumir · conversations · ~30 KB · ~10k

**C6** - `POST /api/v1/conversations/:id/take` on a readable `QUEUE` conversation sets `handler=HUMAN`, `assigneeId=me`, returns `200` with updated summary (door 1, AC 6)
Proof: `src/modules/conversations/inbox-take.spec.ts -t "takes a conversation from the queue"`

**C7** - When contact `ownerId` is null and take succeeds, `Contact.ownerId` becomes the taker in the same outcome (AC 7)
Proof: `src/modules/conversations/inbox-take.spec.ts -t "claims the contact owner on take when unset"`

**C8** - Take when handler is already `HUMAN` → `409 ALREADY_ASSIGNED` (AC 8)
Proof: `src/modules/conversations/inbox-take.spec.ts -t "conflicts when the conversation is already taken"`

**C9** - Take outside tenant or COMMERCIAL portfolio → `404 NOT_FOUND` with the same body as missing (AC 9)
Proof: `src/modules/conversations/inbox-take.spec.ts -t "hides take outside the tenant or portfolio"`

**C10** - Successful take writes `AuditLog` with `action=conversation.take` and no raw `text`/`phoneE164` in `changes` (door 1, AD-020, AC 10)
Proof: `src/modules/conversations/inbox-take.spec.ts -t "audits take without pii"`

**C11** - Take from `AI` succeeds the same way as from `QUEUE` (assumption take desde AI)
Proof: `src/modules/conversations/inbox-take.spec.ts -t "takes a conversation from ai"`

**C12** - Take without session → `401`; without `conversation:write` → `403`; unknown body field → `400` (Surface)
Proof: `src/modules/conversations/inbox-take.spec.ts -t "guards take auth permission and body"`

### S3 - Responder (reuso) · existing send + UI · ~15 KB · ~5k

**C13** - `POST /api/v1/conversations/:id/messages` signature and behaviour stay as delivered (auto-take + send); this feature does not change the route schema (AC 13)
Proof: `src/modules/conversations/conversation-send.spec.ts -t "sends an outbound message and takes from the queue"`
Proof: `rg -n "sendConversationMessageInput|operationId: 'sendConversationMessage'" apps/server/src/modules/conversations`

**C14** - Inbox thread uses the Orval hook for send (not a parallel client) (AC 11)
Proof: `rg -n "useSendConversationMessage|sendConversationMessage" apps/web/src/features/inbox apps/web/src/routes/_app`

### S4 - Encerrar · conversations · ~30 KB · ~10k

**C15** - Assignee calling `POST …/close` on a non-closed conversation sets `status=CLOSED`, non-null `closedAt`, returns `200` (door 2, AC 14)
Proof: `src/modules/conversations/inbox-close.spec.ts -t "closes an assigned conversation"`

**C16** - MANAGER closes another member's HUMAN conversation with `200` (AC 15)
Proof: `src/modules/conversations/inbox-close.spec.ts -t "lets a manager close any readable conversation"`

**C17** - COMMERCIAL closing a conversation whose `assigneeId` is not them → `404 NOT_FOUND` (AC 16)
Proof: `src/modules/conversations/inbox-close.spec.ts -t "hides close from a commercial who is not the assignee"`

**C18** - Close on already `CLOSED` → `409 CONVERSATION_CLOSED` (AC 17)
Proof: `src/modules/conversations/inbox-close.spec.ts -t "conflicts when the conversation is already closed"`

**C19** - Successful close writes `AuditLog` with `action=conversation.close` without PII (door 2, AD-020, AC 18)
Proof: `src/modules/conversations/inbox-close.spec.ts -t "audits close without pii"`

**C20** - Close without session → `401`; without `conversation:write` → `403`; unknown body field → `400` (Surface)
Proof: `src/modules/conversations/inbox-close.spec.ts -t "guards close auth permission and body"`

### S5 - Tela Inbox · web · ~80 KB · ~25k

**C21** - Authenticated user with active org opens `/inbox` and sees the queue list with empty, loading, error and success states reachable (door 4, AC 19, AC 24)
Proof: `e2e/inbox.spec.ts -g "shows the inbox queue with four list states"`

**C22** - Choosing view `mine` (search param) lists only conversations assigned to the signed-in user (AC 20)
Proof: `e2e/inbox.spec.ts -g "commercial replies and visitor sees it then close removes it from inbox views"`

**C23** - With `conversationId` selected, the page loads messages, joins the conversation room, offers send when allowed and close with confirm dialog (AC 21, assumption confirmação)
Proof: `e2e/inbox.spec.ts -g "commercial replies and visitor sees it then close removes it from inbox views"`

**C24** - A `QUEUE` conversation shows an Assumir action that takes it (AC 22)
Proof: `e2e/inbox.spec.ts -g "commercial replies and visitor sees it then close removes it from inbox views"`

**C25** - Web Chat conversation shows the badge "Telefone não verificado" next to the phone (AC 23)
Proof: `e2e/inbox.spec.ts -g "commercial replies and visitor sees it then close removes it from inbox views"`

**C26** - Layout nav includes link "Inbox" to `/inbox` (AC 25)
Proof: `e2e/inbox.spec.ts -g "links Inbox in the app nav"`
Proof: `rg -n 'to="/inbox"|to: "/inbox"' apps/web/src/routes/_app.tsx`

### S6 - Smoke visitante ↔ comercial · e2e · ~40 KB · ~12k

**C27** - Smoke: visitor starts Web Chat → commercial opens inbox → sees the conversation in the queue (AC 26)
Proof: `e2e/inbox.spec.ts -g "commercial replies and visitor sees it then close removes it from inbox views"`

**C28** - Smoke: commercial takes if needed and replies in the UI → visitor sees the reply within 2 s; commercial closes → conversation leaves queue and mine lists (AC 27, AC 28, AC 11, AC 12)
Proof: `e2e/inbox.spec.ts -g "commercial replies and visitor sees it then close removes it from inbox views"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/v1/conversations` statuses (5) | 200 C1 · 400 C5 · 401 C5 · 403 C5 · 404 C5 | - |
| `POST /api/v1/conversations/:id/take` statuses (6) | 200 C6 · 400 C12 · 401 C12 · 403 C12 · 404 C9 · 409 C8 | - |
| `POST /api/v1/conversations/:id/close` statuses (6) | 200 C15 · 400 C20 · 401 C20 · 403 C20 · 404 C17 · 409 C18 | - |
| screen Inbox statuses (2) | 200 C21, C23 · 404 C21 | - |
| Landing doors (4) | door 1 C6–C12 · door 2 C15–C20 · door 3 C1–C5 · door 4 C21–C26 | - |
| screen Inbox arrangement (4 regions) | nav C26 · list C21/C22 · thread C23 · actions Assumir/Encerrar C24/C23 | - |
| take handler sources (2) | QUEUE C6 · AI C11 | - |
| close roles (3) | assignee C15 · MANAGER any C16 · COMMERCIAL non-assignee 404 C17 | - |
| audit actions (2) | conversation.take C10 · conversation.close C19 | - |

- Binding sources (ui): plan Sources (ADR-016, ADR-013, AD-019, architecture §9–10, roadmap F3); screen copy/arrangement enumerated above.
- No Test policy section: repo `CLAUDE.md` answers level (endpoint integration + Playwright for UI surface).

## Swept

- validation: C5, C12, C20
- failure modes: C8, C18, C21
- idempotency: n/a - take/close are not retry-safe creates; second take/close returns 409
- authorization: C4, C5, C9, C12, C16, C17, C20
- concurrency: C8 (second take 409); full N-commercial stress is F5
- data lifecycle: n/a - CLOSED stays; reopen on inbound already exists
- dependency failure: C21 (list error state)
- state transitions: C6, C11, C15 (take/close via conversation-state)
- observability: C10, C19 (audit trail)

## Handoff

- S1 ~8k + S2 ~10k + S3 ~5k + S4 ~10k + S5 ~25k + S6 ~12k ≈ 70k write; read ≈ 120 KB (conversations routes/read/send, web-chat e2e, `_app`, Orval) ≈ 30k → ≈ 100k under 150k — **one builder**

- **Settled mid-build:** AC 5 — `view` ausente mantém lista legada (não 400); inválido → 400. Claim de `Contact.ownerId` via `contacts.claimContactOwnerIfUnset` (fronteira de módulo). E2e UI consolidado num smoke (rate limit público 5/IP/min).
- **Abandoned:** nenhuma

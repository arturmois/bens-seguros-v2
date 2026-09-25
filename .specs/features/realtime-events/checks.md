# Realtime events checks

Profile: standard
Plan: `.specs/features/realtime-events/plan.md`

26 checks in 4 slices (C22–C24 added in round 2, C25 in round 3, C26 after round 3 by the user's choice, for members the Verifier found unproven) · 3 one-way doors · 0 open

Every proof runs from `apps/server` with `pnpm exec vitest run <file> -t "<name>"` against the real
PostgreSQL of the docker compose. Socket proofs use `buildTestApp` listening on a random port and
`socket.io-client` with a real session cookie, as `src/infrastructure/realtime.spec.ts` does.

**Negative proofs use a sentinel, never a sleep.** PostgreSQL delivers notifications of different
transactions in commit order, and one socket receives in emission order. So "X never arrives" is
asserted as: a later event Y (committed after X, or emitted after X was delivered elsewhere) arrives,
and X did not arrive before it. A fixed wait that passes whether or not X is sent proves nothing.

## Checks

### S1 - Evento transacional e `LISTEN` · `infrastructure/events.ts` + spec · ~10 KB · ~3k

**C1** - A transaction that calls `notify` with `{ type: 'message.created', organizationId, conversationId, messageId }` (three fresh UUIDs) and commits delivers to a handler registered for `message.created` exactly that object - the same four values (door 1, AC 1)
Proof: `src/infrastructure/events.spec.ts -t "delivers a committed event with its ids"`

**C2** - While the transaction that called `notify` is held open, a sentinel event committed by another transaction arrives and the held event has not; after the held transaction commits, the held event arrives (AC 2)
Proof: `src/infrastructure/events.spec.ts -t "delivers nothing before the commit"`

**C3** - A transaction that calls `notify` and then throws is rolled back; a sentinel committed afterwards arrives and the rolled-back event never arrived before it (AC 3)
Proof: `src/infrastructure/events.spec.ts -t "never delivers a rolled back event"`

**C4** - `notify` with an extra field (`text: 'Olá'`), with a non-UUID `messageId`, and with an unknown `type` each throws inside the transaction, the transaction fails (a row written earlier in it does not exist afterwards), and a sentinel committed afterwards arrives with none of the three before it (door 1, AC 4)
Proof: `src/infrastructure/events.spec.ts -t "refuses an event outside the schema"`

**C5** - The channel is `app_events` for the `public` schema and `app_events_<schema>` otherwise: an event notified in this worker's schema reaches this worker's listener, and a `pg_notify` sent by a raw client on the channel of another schema (`app_events_other`) never reaches it (sentinel) (door 1, Impact "tests")
Proof: `src/infrastructure/events.spec.ts -t "listens only on the channel of its schema"`
Proof: `src/infrastructure/events.spec.ts -t "names the channel after the schema"`

**C6** - After the backend of the `LISTEN` connection is killed with `pg_terminate_backend` (as the table owner), an event committed after the reconnection is delivered, within the 20 s test timeout (door 2, AC 15)
Proof: `src/infrastructure/events.spec.ts -t "reconnects after the listen connection drops"`

**C7** - Each drop of the `LISTEN` connection logs exactly one `warn` entry, and no logged entry of the drop or the reconnection contains the `conversationId` or `messageId` of an event delivered before the drop (AC 17)
Proof: `src/infrastructure/events.spec.ts -t "warns once per drop without event data"`

**C8** - After `stop()`, the `LISTEN` connection is gone from `pg_stat_activity` and is not re-opened: 2 s later (past the first 1 s backoff) there is still no backend listening on the channel (door 2, data lifecycle)
Proof: `src/infrastructure/events.spec.ts -t "stops without reconnecting"`

**C9** - `pg` is in `dependencies` of `apps/server/package.json` at `8.23.0` and absent from its `devDependencies` (door 2, Impact "dependency")
Proof: `node -e "const p=require('./package.json');process.exit(p.dependencies.pg==='8.23.0'&&!p.devDependencies.pg?0:1)"`

### S2 - Os use cases emitem · `inbound.ts`, `outbound.ts` + specs · ~30 KB · ~8k

**C10** - `receiveInbound` of a new message emits exactly one `message.created` with the tenant's `organizationId` and the returned `conversationId`/`messageId`; the same for an inbound that reopens a closed conversation; counted up to a sentinel committed afterwards (AC 5)
Proof: `src/modules/conversations/conversation-events.spec.ts -t "emits one event per inbound message"`

**C11** - `sendMessage` by the assigned human emits exactly one `message.created` with the returned `conversationId`/`messageId`; a refused `sendMessage` (`409 NOT_HANDLER`) emits none; counted up to a sentinel (AC 5)
Proof: `src/modules/conversations/conversation-events.spec.ts -t "emits one event per outbound message"`

**C12** - The same `externalId` received twice in sequence, and another `externalId` received by 10 concurrent `receiveInbound` calls, emit exactly one `message.created` each (2 in total for the two ids), counted up to a sentinel (AC 6)
Proof: `src/modules/conversations/conversation-events.spec.ts -t "emits once for a duplicated external id"`

### S3 - Room da conversa · `realtime.ts`, `app.ts`, `read.ts` + spec · ~45 KB · ~12k

**C13** - An ADMIN socket that joined the room of a conversation receives, after `receiveInbound` on it, `message.created` with `{ conversationId, message }` where `message` deep-equals the item of that id in `GET /api/v1/conversations/:id/messages` (the `Message` of the API), less than 2000 ms after `receiveInbound` was called, with the HTTP server and the Socket.IO client real (AC 7)
Proof: `src/modules/conversations/conversation-events.spec.ts -t "pushes the message to the room in under two seconds"`

**C14** - `conversation:join` of a conversation the caller can read answers the ack `{ ok: true }` - for an ADMIN, and for a COMMERCIAL on a `QUEUE` conversation whose contact belongs to another commercial (`withTwoSalespeople`) (AC 9, AC 11)
Proof: `src/modules/conversations/conversation-events.spec.ts -t "lets a reader join the conversation room"`

**C15** - `conversation:join` answers `{ ok: false, status: 404, code: 'NOT_FOUND' }` for a conversation of another organization (`withTwoTenants`), for a `HUMAN` conversation of commercial B with a contact of B asked by commercial A, and for a random UUID; and after each refusal a message on that conversation does not reach the socket (sentinel: a message on a room it did join arrives first) (AC 10)
Proof: `src/modules/conversations/conversation-events.spec.ts -t "refuses the room outside the tenant or the portfolio"`

**C16** - `conversation:join` answers `{ ok: false, status: 404, code: 'NOT_FOUND' }` for a socket without an active organization, for a user with pending terms and an active organization, and for a member deactivated after the socket connected (authorized at each join, not at the handshake) (AC 12)
Proof: `src/modules/conversations/conversation-events.spec.ts -t "refuses the room without a tenant context"`

**C17** - `conversation:join` with `{ conversationId, extra: 1 }`, with `{ conversationId: 'nao-uuid' }` and with `{}` each answers `{ ok: false, status: 400, code: 'VALIDATION_ERROR' }`; `conversation:leave` with `{ conversationId: 'nao-uuid' }` answers the same (AC 13, Surface `leave 400`)
Proof: `src/modules/conversations/conversation-events.spec.ts -t "rejects an invalid room payload"`

**C18** - A socket of the same organization that did not join the room does not receive that conversation's `message.created`; a socket that joined and then emitted `conversation:leave` (ack `{ ok: true }`) does not receive the next one - in both cases a message on another room the socket joined arrives and the first did not arrive before it (AC 8, AC 14)
Proof: `src/modules/conversations/conversation-events.spec.ts -t "delivers only to sockets in the room"`

**C19** - When the `LISTEN` connection is killed with `pg_terminate_backend`, every connected socket (one with an organization, one without) receives `events:resync` with `{}` after the reconnection (door 2, AC 16)
Proof: `src/modules/conversations/conversation-events.spec.ts -t "asks every socket to resync after a drop"`

**C20** - A `message.created` whose message does not exist in the payload's organization (random ids, or the ids of a real message with another `organizationId`) emits nothing to the room, and the listener keeps delivering: a real message sent afterwards reaches the room (Flow 3, "não achou → ignora")
Proof: `src/modules/conversations/conversation-events.spec.ts -t "ignores an event whose message is not in the tenant"`

### S4 - Montagem e fronteiras · `app.ts`, `server.ts`, `test/app.ts`, architecture · ~25 KB · ~6k

**C21** - The listener is started by one assembly shared by the server and the tests: an app built by `buildTestApp()` with no option, once ready, delivers a committed event to the room (C13 runs on it); `server.ts` contains no call that starts the listener itself; and the module boundary holds: `realtime.ts` and `events.ts` import no module (the room authorization is injected by `app.ts`), `conversations` imports no `channels`/`ai`, and `architecture.spec` stays green (Flow 2, 4, Impact "runtime")
Proof: `src/modules/conversations/conversation-events.spec.ts -t "pushes the message to the room in under two seconds"`
Proof: `test/architecture.spec.ts -t "the source tree has no boundary violations|finds no import cycle between modules|lets each module write only its own tables"`
Proof: `! grep -nE "events\.(start|listen)" src/server.ts`
Proof: `test/architecture.spec.ts -t "forbids the conversation module dependencies the adr rules out"`

Round 2 note: "with no option" means no option that starts the listener; the proof's `buildTestApp({ workers: true })` only starts the queue, which the sign-up e-mail needs.

### Round 2 - membros sem prova na rodada 1

**C22** - When the injected `authorizeJoin` throws, `conversation:join` answers `{ ok: false, status: 500, code: 'INTERNAL_ERROR' }` (Surface, appended in the build)
Proof: `src/infrastructure/realtime.spec.ts -t "answers an internal error when the room authorization fails"`

**C23** - When a reconnection attempt fails (the listener's login role refused), the listener retries, and the attempt that works comes at least 1.9 s after the failed one (the wait doubled from 1 s to 2 s); an event committed after it is delivered (door 2)
Proof: `src/infrastructure/events.spec.ts -t "retries a failed reconnection with a doubled wait"`

**C24** - A payload that is not JSON, and one with a field outside the schema, sent with `pg_notify` on the listener's own channel reach no handler; a sentinel committed afterwards is the only event seen (door 1, the listening side)
Proof: `src/infrastructure/events.spec.ts -t "ignores a payload outside the schema on its channel"`

**C25** - Starting from 1 s, the wait before each next reconnection attempt is 1, 2, 4, 8, 16, 30 and 30 s: it doubles and is capped at 30 s (door 2)
Proof: `src/infrastructure/events.spec.ts -t "doubles the retry wait up to thirty seconds"`

**C26** - The listener waits what its `retryDelay` answers: with an injected function that returns 100 ms, it is asked with 1000, 100, 100 and the third failed attempt comes less than 900 ms after the second (the default would wait 4 s); with no function given, the listener's `retryDelay` is `nextRetryDelay` (door 2; user's choice after round 3: inject the wait function)
Proof: `src/infrastructure/events.spec.ts -t "waits what the retry delay answers between failed attempts"`
Proof: `src/infrastructure/events.spec.ts -t "doubles the retry wait up to thirty seconds"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `emit conversation:join` statuses (4) | 200 C14 · 400 C17 · 404 C15, C16 · 500 C22 | - |
| `emit conversation:leave` statuses (2) | 200 C18 · 400 C17 | - |
| server-pushed events (2) | `message.created` C13 · `events:resync` C19 | - |
| Landing doors (3) | door 1 C1, C4, C5 · door 2 C6, C8, C9, C19 · door 3 C14, C15, C16 | - |
| `notify` outcomes (4) | committed C1 · held open C2 · rolled back C3 · refused by the schema C4 | - |
| payloads received on the channel (2) | outside the schema C24 · not JSON C24 | - |
| invalid event fields (3) | extra field C4 · non-UUID id C4 · unknown `type` C4 | - |
| emitting use cases (4 paths) | inbound new C10 · inbound reopening C10 · outbound sent C11 · outbound refused (none) C11 | - |
| duplicate inbound (2) | sequential C12 · 10 concurrent C12 | - |
| join refusal causes (6) | other tenant C15 · outside the portfolio C15 · nonexistent C15 · no active organization C16 · pending terms C16 · inactive member C16 | - |
| join acceptance by role (2) | ADMIN C14 · COMMERCIAL on `QUEUE` of another's contact C14 | - |
| invalid room payloads (3) | extra field C17 · non-UUID C17 · missing id C17 | - |
| sockets that must not receive (3) | not joined C18 · left C18 · refused C15 | - |
| `LISTEN` lifecycle (7) | drop -> reconnect C6 · drop -> `warn` C7 · drop -> resync C19 · stop -> no reconnect C8 · failed attempt -> doubled retry C23 · 30 s cap C25 · listener applies the schedule C26 | - |
| event whose message is not found (2) | random ids C20 · other organization C20 | - |
| startup config: listener started (2 assemblies) | `server.ts` C21 (no own start; uses `buildApp`) · test harness C21, C13 | - |
| channel naming (2 schemas) | `public` -> `app_events` C5 · worker schema -> `app_events_<schema>` C5 | - |

- Claims naming an ack shape or a pushed event (C13–C19) are proven over a real HTTP server and a real Socket.IO client; C1–C8 are proven at the `events.ts` layer, where the transaction semantics live; C10–C12 at the use-case layer, counted on the listener.
- The portfolio rule behind the room is proven at its own layer by `conversation-core` C47/C48 and `conversations-api` C16 (`findReadableConversation`); C14/C15 prove the room applies it.
- No check claims more than the cases its proof exercises: C5's "public" member is proven by the naming function (second proof), since the test database has no listener on `public`.

Test policy: the repo answers both questions (`CLAUDE.md` "Testes": endpoint -> integration with real PostgreSQL, `withTwoTenants` and `withTwoSalespeople`; pure rule -> unit over every transition), so there is no `Test policy` section. The decisions this feature adds - the event schema (3 refusal rows), the channel name (2 rows), the join guard (6 refusal causes + 3 payload rows) and the listener lifecycle (4 rows) - each have one asserted case per row above.

## Swept

- validation: C4, C17
- failure modes: C3, C4, C15, C16, C20
- idempotency: C12 (a duplicated inbound emits once)
- authorization: C14, C15, C16, C18
- concurrency: C12 (10 concurrent duplicates), C2 (event held by an open transaction)
- data lifecycle: C8 (the listener stops and stays stopped); nothing persisted (plan `Relations`)
- dependency failure: C6, C7, C19 (the `LISTEN` connection drops)
- state transitions: n/a - no conversation state changes; the events only report messages the existing transitions write
- observability: C7

## Handoff

- S1 ~3k + S2 ~8k + S3 ~12k + S4 ~6k ≈ 29k tokens to write, plus ≈ 100 KB read (`inbound.spec.ts` 15 KB, `read.spec.ts` 20 KB for the socket/session helpers, `realtime.spec.ts` 5 KB, `inbound.ts`, `outbound.ts`, `read.ts`, `app.ts`, `dependencies.ts`, `queue.ts`, `test/app.ts`, `test/conversations.ts`, `architecture.spec.ts` 15 KB) ≈ 25k → ≈ 55k, under the 150k budget - one builder

- **Boundary:** C1-C9 closed at `72c4928`; C10-C21 closed at the commit that adds this line
- **Settled mid-build:** `notify` is a stateless function (channel from the transaction's `current_schema()`), not a method of an injected `events` dependency, so the 36 call sites of `receiveInbound`/`sendMessage` keep `{ db }` (door 1's shape: `pg_notify` on `app_events`/`app_events_<schema>` in the transaction); the listener starts in `buildApp`'s `onReady` instead of `server.ts` (C21's shared assembly; `Impact` updated); `conversation:join` answers `500 INTERNAL_ERROR` when the authorization itself fails (appended to `Surface`)
- **Abandoned:** none
- **Round 2:** C12's count went from the stored message ids to the conversation (an event of a rolled-back duplicate carries an id never stored; Verifier gap 3); C22–C24 added for the members found unproven; C21 gained the forbidden-edge proof and a note on "no option"
- **Round 3:** the retry wait moved into the pure `nextRetryDelay` so the 30 s cap is provable without waiting (C25; Verifier round 2 gap 1)
- **After round 3 (user's choice):** `createEventListener` takes `retryDelay` (default `nextRetryDelay`, exposed on the listener), so a test proves the listener applies the schedule (C26)

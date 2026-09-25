# Realtime events verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 6a53bf5..f5235ab (rodada 4 escopada pelo fix d8357c1..f5235ab)
**Round**: 4 - scoped (authorized by the user after round 3)
**Verifier**: independent sub-agent (author != verifier)

O fix `f5235ab` injeta a função de espera no listener: `createEventListener` recebe `retryDelay` (padrão `nextRetryDelay`, `events.ts:55-57`), usa-a na chamada (`events.ts:129`) e a expõe (`events.ts:137`). O C26 prova as duas pontas: com uma função injetada que responde 100 ms, o listener pergunta por ela e espera o que ela responde; sem função, a do listener é `nextRetryDelay`. O mutante sobrevivente da rodada 3 (F12) e uma falha no padrão (F13) agora são mortos. As 26 provas passam em `f5235ab` e o gate está verde. Nenhum membro de cobertura ficou sem prova.

## Binding sources

carried from efa85c0 - o fix não tocou a interface (Surface, Landing) nem as fontes.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-012-whatsapp-runtime.md` | sim - rodada 1, lido inteiro | nenhuma | - |
| `docs/decisions/ADR-006-jobs-and-realtime-in-process.md` | sim - rodada 1, linhas 1-46 | nenhuma | - |
| `docs/handoff.md` §30 ("até 2 segundos", linha 734) | sim - rodada 1, trecho | nenhuma | - |

## Checks

verified at f5235ab - provas rodadas de novo por inteiro. Uma invocação a partir de `apps/server`: `pnpm exec vitest run src/infrastructure/events.spec.ts src/modules/conversations/conversation-events.spec.ts src/infrastructure/realtime.spec.ts test/architecture.spec.ts -t "<os 29 nomes em alternância>" --reporter=verbose`, exit 0, `Tests 29 passed | 18 skipped`, cada nome com `✓`. C9 `node -e` exit 0; C21 `grep` negado exit 0. As citações de `events.spec.ts` foram atualizadas (+8 linhas pelo helper `listening`); as dos outros specs não mudaram desde 2e24f0b.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | commit entrega o evento com os 4 valores | `-t "delivers a committed event with its ids"` ✓ | `apps/server/src/infrastructure/events.spec.ts:127` - `expect(events.seen).toEqual([sent])` | PASS |
| C2 | nada antes do commit, entregue depois | `-t "delivers nothing before the commit"` ✓ | `events.spec.ts:154` - `…not.toContain(held.messageId)`; `events.spec.ts:160` - `…toEqual(held)` | PASS |
| C3 | rollback nunca entrega | `-t "never delivers a rolled back event"` ✓ | `events.spec.ts:180` - `expect(events.ids()).not.toContain(rolledBack.messageId)` | PASS |
| C4 | eventos inválidos lançam, transação falha, nada emitido | `-t "refuses an event outside the schema"` ✓ | `events.spec.ts:209` - `expect(stored).toEqual([])`; `events.spec.ts:216` - `expect(before).toEqual([])` | PASS |
| C5 | canal por schema; `public` -> `app_events` | `-t "listens only on the channel of its schema"` ✓, `-t "names the channel after the schema"` ✓ | `events.spec.ts:233` - `expect(before).toEqual([])`; `events.spec.ts:241` - `toBe('app_events')`; `events.spec.ts:260` - `toContainEqual(event)` | PASS |
| C6 | reconecta depois de `pg_terminate_backend` | `-t "reconnects after the listen connection drops"` ✓ | `events.spec.ts:272` - `expect(events.seen).toContainEqual(after)` | PASS |
| C7 | um `warn` por queda, sem ids no log | `-t "warns once per drop without event data"` ✓ | `events.spec.ts:289` - `expect(warnings).toHaveLength(1)`; `events.spec.ts:291-292` - `not.toContain(...)` | PASS |
| C8 | `stop()` não reabre | `-t "stops without reconnecting"` ✓ | `events.spec.ts:307` - `expect(await listenerPids()).toEqual([])` | PASS |
| C9 | `pg` 8.23.0 em `dependencies` | `node -e "…"` exit 0 | `apps/server/package.json:29` - `"pg": "8.23.0",` | PASS |
| C10 | um evento por inbound novo e por reabertura | `-t "emits one event per inbound message"` ✓ | `apps/server/src/modules/conversations/conversation-events.spec.ts:155` - `expect(events).toEqual([…])` | PASS |
| C11 | um evento por `sendMessage`; recusado não emite | `-t "emits one event per outbound message"` ✓ | `conversation-events.spec.ts:194` - `toMatchObject({ status: 409, code: 'NOT_HANDLER' })`; `:199` - `expect(forMine).toEqual([…])`; `:207` - `expect(forRefused).toEqual([])` | PASS |
| C12 | duplicados: 2 eventos no total na conversa | `-t "emits once for a duplicated external id"` ✓ | `conversation-events.spec.ts:130` - filtro por `conversationId`; `:235` - `expect(events).toHaveLength(2)` | PASS |
| C13 | `Message` igual ao da API em < 2 s | `-t "pushes the message to the room in under two seconds"` ✓ | `conversation-events.spec.ts:254` - `expect(elapsed).toBeLessThan(2000)`; `:261` - `expect(pushed).toEqual({ conversationId: conversation.id, message: item })` | PASS |
| C14 | ADMIN e COMMERCIAL em `QUEUE` de outro entram | `-t "lets a reader join the conversation room"` ✓ | `conversation-events.spec.ts:268` e `:279` - `toEqual({ ok: true })` | PASS |
| C15 | 404 fora do tenant, da carteira, inexistente; nada chega | `-t "refuses the room outside the tenant or the portfolio"` ✓ | `conversation-events.spec.ts:298-300` - `toEqual(notFound)`; `:308` - `expect(before).toEqual([])` | PASS |
| C16 | 404 sem organização, termos pendentes, membro desativado | `-t "refuses the room without a tenant context"` ✓ | `conversation-events.spec.ts:321`, `:331`, `:340` - `toEqual(notFound)` | PASS |
| C17 | payload inválido -> 400 no join e no leave | `-t "rejects an invalid room payload"` ✓ | `conversation-events.spec.ts:349-352` - `toEqual(invalid)` ×4 | PASS |
| C18 | quem não entrou e quem saiu não recebem | `-t "delivers only to sockets in the room"` ✓ | `conversation-events.spec.ts:374` - `toEqual([])`; `:375` - `…toEqual([inSecond.messageId])` | PASS |
| C19 | `events:resync` `{}` para todos os sockets | `-t "asks every socket to resync after a drop"` ✓ | `conversation-events.spec.ts:402` - `expect(socket.resyncs).toEqual([{}])` | PASS |
| C20 | evento fora do tenant ignorado, listener segue | `-t "ignores an event whose message is not in the tenant"` ✓ | `conversation-events.spec.ts:429` - `toEqual([])`; `:430` - `…toEqual([after.messageId])` | PASS |
| C21 | listener pelo `buildApp` compartilhado; fronteiras | C13 ✓; `architecture.spec.ts` com os quatro nomes ✓ ×4; `grep` negado exit 0 | `apps/server/src/app.ts:123-125` - `onReady` -> `deps.events.start()`; `apps/server/test/architecture.spec.ts:279` - `findBoundaryViolations(…)).toEqual([])`; `:352` - `findForbiddenModuleEdges(…)).toEqual([])` | PASS |
| C22 | `authorizeJoin` lança -> ack `500 INTERNAL_ERROR` | `realtime.spec.ts -t "answers an internal error when the room authorization fails"` ✓ | `apps/server/src/infrastructure/realtime.spec.ts:167` - `expect(ack).toEqual({ ok: false, status: 500, code: 'INTERNAL_ERROR' })` | PASS |
| C23 | reconexão que falha é tentada de novo com a espera dobrada | `-t "retries a failed reconnection with a doubled wait"` ✓ 3124 ms | `events.spec.ts:340` - `…toBeGreaterThanOrEqual(1900)`; `:341` - `toContainEqual(after)` | PASS |
| C24 | payload não JSON ou fora do schema no próprio canal ignorado | `-t "ignores a payload outside the schema on its channel"` ✓ | `events.spec.ts:361` - `toEqual([])`; `:362` - `expect(events.seen).toEqual([sentinel])` | PASS |
| C25 | a espera é 1, 2, 4, 8, 16, 30, 30 s | `-t "doubles the retry wait up to thirty seconds"` ✓ | `events.spec.ts:374` - `expect(waits).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000])` | PASS |
| C26 | o listener espera o que o `retryDelay` responde; sem função, o dele é `nextRetryDelay` | `-t "waits what the retry delay answers between failed attempts"` ✓ 1393 ms, `-t "doubles the retry wait up to thirty seconds"` ✓ | `events.spec.ts:413` - `expect(asked.slice(0, 3)).toEqual([1000, 100, 100])`; `events.spec.ts:415` - `expect((failed[2]?.time ?? 0) - (failed[1]?.time ?? 0)).toBeLessThan(900)`; `events.spec.ts:382` - `expect(listener.retryDelay).toBe(nextRetryDelay)` | PASS |

Re-julgamento do gap da rodada 3 (o listener aplicar o teto de 30 s): **fechado.** A ligação listener -> função tem duas metades:

- **O listener usa a função que tem:** C26 em `:413` e `:415`. O F12 é morto porque `asked` fica vazio.
- **A função padrão é a que tem o teto:** C26 em `:382`, somado a C25 em `:374`. O F13 é morto por `Object.is`.

Uma nota que não altera o veredito: `:382` afirma a propriedade exposta (`events.ts:137`), que é a mesma constante da chamada (`events.ts:57`, `:129`). Um mutante que expusesse uma e chamasse outra precisaria de duas edições incoerentes, e não é uma implementação errada plausível.

## Coverage

Linha `LISTEN` lifecycle: verified at f5235ab. Demais linhas: carried from 2e24f0b / d8357c1 (o fix só mexeu em `events.ts:53-57,129,137` e no spec).

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `emit conversation:join` statuses (4) | plan `Surface` + `realtime.ts:60,63,65,68` | 200 C14 · 400 C17 · 404 C15, C16 · 500 C22 | - |
| `emit conversation:leave` statuses (2) | plan `Surface` + `realtime.ts:74,76` | 200 C18 · 400 C17 | - |
| server-pushed events (2) | plan `Surface` + `app.ts:116-118,121` | `message.created` C13 · `events:resync` C19 | - |
| `notify` outcomes (4) | `events.ts` `notify` | committed C1 · held open C2 · rolled back C3 · refused C4 | - |
| payloads received on the channel (3) | `events.ts` `parse`/`dispatch`, plan Flow 2 | não JSON C24 · fora do schema C24 · válido C1 | - |
| invalid event fields (3) | `events.ts:7-14` | extra field C4 · non-UUID C4 · unknown `type` C4 | - |
| emitting use cases (4 paths) | `inbound.ts:70,108`, `outbound.ts:69,85` | inbound new C10 · reopening C10 · outbound sent C11 · outbound refused C11 | - |
| duplicate inbound (2) | AC 6 + `inbound.ts:79` | sequential C12 · 10 concurrent C12 | - |
| join refusal causes (6) | `tenant-context.ts:35,40,42` + `findReadableConversation` | other tenant C15 · portfolio C15 · nonexistent C15 · no organization C16 · pending terms C16 · inactive member C16 | - |
| join acceptance by role (2) | AC 9, AC 11 | ADMIN C14 · COMMERCIAL em `QUEUE` C14 | - |
| invalid room payloads (3) | `realtime.ts:27` | extra field C17 · non-UUID C17 · missing id C17 | - |
| sockets that must not receive (3) | AC 8, AC 10, AC 14 | not joined C18 · left C18 · refused C15 | - |
| `LISTEN` lifecycle (7) | plan `Landing` door 2 ("nova tentativa com espera de 1 s dobrando até 30 s") + `events.ts:20-26,53-57,110-137,147-154` | drop -> reconnect C6 · drop -> `warn` C7 · drop -> resync C19 · stop -> no reconnect C8 · failed attempt -> doubled retry C23 · schedule 1…30 s C25 · listener applies its schedule, default `nextRetryDelay` C26 | - |
| event whose message is not found (2) | plan Flow 3 + `app.ts:114-115` | random ids C20 · other organization C20 | - |
| startup config: listener started (2 assemblies) | `server.ts:22,38`, `test/app.ts:42`, `app.ts:123-125`; `dependencies.ts` cria o listener sem `retryDelay` (fica o padrão) | `server.ts` C21 · test harness C21, C13 | - |
| channel naming (2 schemas) | `events.ts` `eventChannel` | `public` C5 · worker schema C5 | - |
| Landing doors (3) | plan `Landing` | door 1 C1, C4, C5, C24 · door 2 C6-C9, C19, C23, C25, C26 · door 3 C14-C16, C22 | - |

## Test policy rows

carried from efa85c0 - o `checks.md` não tem seção `Test policy`; vale a convenção de `CLAUDE.md` "Testes". O C26 usa PostgreSQL real (login recusado por um role real), sem mock do banco. A função injetada é só a espera, não o banco.

## Faults injected

F12-F13 verified at f5235ab. F1-F11 carried from efa85c0 / 2e24f0b / d8357c1. Worktree descartável a partir de `f5235ab` (`pnpm install --frozen-lockfile --prefer-offline`), cada mutante revertido antes do seguinte. `git status --porcelain` da árvore real vazio antes e depois (idêntico), worktree removida.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 (carried from efa85c0): `.strict()` removido do schema | `apps/server/src/infrastructure/events.ts:14` | yes - C4 |
| F2 (carried from efa85c0): handlers de reconexão não chamados | `apps/server/src/infrastructure/events.ts:124` | yes - C19 |
| F3 (carried from efa85c0): resultado do `authorizeJoin` ignorado | `apps/server/src/infrastructure/realtime.ts:63` | yes - C15, C16 |
| F5 (carried from efa85c0): sem `retry` depois de uma queda | `apps/server/src/infrastructure/events.ts:115` | yes - C6 |
| F6 (carried from 2e24f0b): falha da autorização responde 404 | `apps/server/src/infrastructure/realtime.ts:65` | yes - C22 |
| F7 (carried from 2e24f0b): espera sem dobrar | `apps/server/src/infrastructure/events.ts:25` | yes - C23 |
| F8 (carried from 2e24f0b): listener valida sem `.strict()` | `apps/server/src/infrastructure/events.ts` `parse` | yes - C24 |
| F9 (carried from 2e24f0b): `notify` do inbound fora da transação | `apps/server/src/modules/conversations/inbound.ts:108` | yes - C12 |
| F11 (carried from d8357c1): `Math.min` removido de `nextRetryDelay` | `apps/server/src/infrastructure/events.ts:25` | yes - C25 |
| F12: a chamada ignora a função (`retry(retryDelay(delayMs))` -> `retry(delayMs * 2)`) | `apps/server/src/infrastructure/events.ts:129` | yes - C26 (`expected [] to deeply equal [ 1000, 100, 100 ]`) |
| F13: padrão sem teto (`options.retryDelay ?? ((ms: number) => ms * 2)`) | `apps/server/src/infrastructure/events.ts:57` | yes - C26 (`expected [Function] to be [Function nextRetryDelay] // Object.is equality`) |

## Gate

verified at f5235ab - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` na raiz, exit 0: Biome `Checked 190 files`, typecheck limpo, `Test Files 40 passed (40)`, `Tests 418 passed (418)`, build do web `✓ built`.

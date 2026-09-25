# Realtime events verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 6a53bf5..d8357c1 (rodada 3 escopada pelo fix 2e24f0b..d8357c1)
**Round**: 3 - scoped
**Verifier**: independent sub-agent (author != verifier)

O fix `d8357c1` extrai a espera entre reconexões para a função pura `nextRetryDelay` (`events.ts:24-26`), e o C25 prova a sequência 1, 2, 4, 8, 16, 30, 30 s. As 25 provas passam em `d8357c1` e o gate está verde. O mutante da rodada 2, reinjetado dentro da função (F11), agora é morto pelo C25.

O veredito continua FAIL. O mesmo defeito, reinjetado na chamada do listener, onde o F10 original estava (`events.ts:126`, `retry(nextRetryDelay(delayMs))` -> `retry(delayMs * 2)`), passa os 12 testes de `events.spec.ts` (F12). O C25 prova a função, mas nada prova que o listener a usa: o C23 só observa uma dobra, de 1 s para 2 s, e essa dobra a versão sem teto também faz. Esta é a terceira rodada, e o limite de três do procedimento manda escalar ao usuário em vez de abrir uma quarta.

## Binding sources

carried from efa85c0 - o fix não tocou a interface (Surface, Landing) nem as fontes.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-012-whatsapp-runtime.md` | sim - rodada 1, lido inteiro | nenhuma | - |
| `docs/decisions/ADR-006-jobs-and-realtime-in-process.md` | sim - rodada 1, linhas 1-46 | nenhuma | - |
| `docs/handoff.md` §30 ("até 2 segundos", linha 734) | sim - rodada 1, trecho | nenhuma | - |

## Checks

verified at d8357c1 - provas rodadas de novo por inteiro. Uma invocação a partir de `apps/server`: `pnpm exec vitest run src/infrastructure/events.spec.ts src/modules/conversations/conversation-events.spec.ts src/infrastructure/realtime.spec.ts test/architecture.spec.ts -t "<os 28 nomes em alternância>" --reporter=verbose`, exit 0, `Tests 28 passed | 18 skipped`, cada nome com `✓`. C9 `node -e` exit 0; C21 `grep` negado exit 0. As citações de `events.spec.ts` foram atualizadas (+6 linhas pelo import novo); as dos outros specs não mudaram desde 2e24f0b.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | commit entrega o evento com os 4 valores | `-t "delivers a committed event with its ids"` ✓ | `apps/server/src/infrastructure/events.spec.ts:119` - `expect(events.seen).toEqual([sent])` | PASS |
| C2 | nada antes do commit, entregue depois | `-t "delivers nothing before the commit"` ✓ | `events.spec.ts:146` - `…not.toContain(held.messageId)`; `events.spec.ts:152` - `…toEqual(held)` | PASS |
| C3 | rollback nunca entrega | `-t "never delivers a rolled back event"` ✓ | `events.spec.ts:172` - `expect(events.ids()).not.toContain(rolledBack.messageId)` | PASS |
| C4 | eventos inválidos lançam, transação falha, nada emitido | `-t "refuses an event outside the schema"` ✓ | `events.spec.ts:201` - `expect(stored).toEqual([])`; `events.spec.ts:208` - `expect(before).toEqual([])` | PASS |
| C5 | canal por schema; `public` -> `app_events` | `-t "listens only on the channel of its schema"` ✓, `-t "names the channel after the schema"` ✓ | `events.spec.ts:225` - `expect(before).toEqual([])`; `events.spec.ts:233` - `toBe('app_events')`; `events.spec.ts:252` - `toContainEqual(event)` | PASS |
| C6 | reconecta depois de `pg_terminate_backend` | `-t "reconnects after the listen connection drops"` ✓ | `events.spec.ts:264` - `expect(events.seen).toContainEqual(after)` | PASS |
| C7 | um `warn` por queda, sem ids no log | `-t "warns once per drop without event data"` ✓ | `events.spec.ts:281` - `expect(warnings).toHaveLength(1)`; `events.spec.ts:283-284` - `not.toContain(...)` | PASS |
| C8 | `stop()` não reabre | `-t "stops without reconnecting"` ✓ | `events.spec.ts:299` - `expect(await listenerPids()).toEqual([])` | PASS |
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
| C23 | reconexão que falha é tentada de novo com a espera dobrada | `-t "retries a failed reconnection with a doubled wait"` ✓ 3074 ms | `events.spec.ts:316-317` - `NOLOGIN` + `pg_terminate_backend`; `events.spec.ts:332` - `…toBeGreaterThanOrEqual(1900)`; `:333` - `toContainEqual(after)` | PASS |
| C24 | payload não JSON ou fora do schema no próprio canal ignorado | `-t "ignores a payload outside the schema on its channel"` ✓ | `events.spec.ts:345` - `pg_notify(… 'nao-json')`; `events.spec.ts:353` - `toEqual([])`; `:354` - `expect(events.seen).toEqual([sentinel])` | PASS |
| C25 | a espera é 1, 2, 4, 8, 16, 30, 30 s | `-t "doubles the retry wait up to thirty seconds"` ✓ | `events.spec.ts:366` - `expect(waits).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000])` (sobre `nextRetryDelay`, `events.ts:24-26`) | PASS |

O claim do C25 fala da espera "before each next reconnection attempt", mas a prova só exercita a função pura. Que o listener chame `nextRetryDelay` (`events.ts:126`) não é afirmado por nenhuma prova. Isso não reprova o C25 como escrito, porque a sequência da função está provada. O efeito aparece no F12, em Faults.

Re-julgamento do gap da rodada 2 (teto de 30 s): **fechado em parte.** O teto dentro da função está provado (F11 morto). O teto no comportamento do listener não está (F12 sobreviveu): a chamada pode deixar de passar pela função sem que nenhum teste falhe.

## Coverage

Linha `LISTEN` lifecycle: verified at d8357c1. Demais linhas: carried from 2e24f0b (o fix só mexeu em `events.ts:23-26,126` e no teste novo).

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
| `LISTEN` lifecycle (6) | plan `Landing` door 2 ("nova tentativa com espera de 1 s dobrando até 30 s") + `events.ts:20-26,107-130` | drop -> reconnect C6 · drop -> `warn` C7 · drop -> resync C19 · stop -> no reconnect C8 · failed attempt -> doubled retry C23 · teto de 30 s: na função C25, no listener sem prova | teto de 30 s aplicado pelo listener (`events.ts:126`, `retry(nextRetryDelay(delayMs))`): nenhuma prova liga o listener à função; `retry(delayMs * 2)` passa C23 e C25 (F12) |
| event whose message is not found (2) | plan Flow 3 + `app.ts:114-115` | random ids C20 · other organization C20 | - |
| startup config: listener started (2 assemblies) | `server.ts:22,38`, `test/app.ts:42`, `app.ts:123-125` | `server.ts` C21 · test harness C21, C13 | - |
| channel naming (2 schemas) | `events.ts` `eventChannel` | `public` C5 · worker schema C5 | - |
| Landing doors (3) | plan `Landing` | door 1 C1, C4, C5, C24 · door 2 C6-C9, C19, C23, C25 · door 3 C14-C16, C22 | - (o membro da door 2 sem prova está na linha `LISTEN` lifecycle) |

## Test policy rows

carried from efa85c0 - o `checks.md` não tem seção `Test policy`; vale a convenção de `CLAUDE.md` "Testes" ("Regra pura: teste unitário cobrindo todas as transições"). O C25 atende a essa regra para a função `nextRetryDelay` isolada.

## Faults injected

F11-F12 verified at d8357c1. F1-F9 carried from efa85c0 / 2e24f0b. F10 é o mutante sobrevivente da rodada 2, reinjetado como F11 (onde o `Math.min` vive agora) e como F12 (onde o F10 estava). Worktree descartável a partir de `d8357c1` (`pnpm install --frozen-lockfile --prefer-offline`), cada mutante revertido antes do seguinte. `git status --porcelain` da árvore real vazio antes e depois (idêntico), worktree removida.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 (carried from efa85c0): `.strict()` removido do schema | `apps/server/src/infrastructure/events.ts:14` | yes - C4 |
| F2 (carried from efa85c0): handlers de reconexão não chamados | `apps/server/src/infrastructure/events.ts:121` | yes - C19 |
| F3 (carried from efa85c0): resultado do `authorizeJoin` ignorado | `apps/server/src/infrastructure/realtime.ts:63` | yes - C15, C16 |
| F5 (carried from efa85c0): sem `retry` depois de uma queda | `apps/server/src/infrastructure/events.ts:112` | yes - C6 |
| F6 (carried from 2e24f0b): falha da autorização responde 404 | `apps/server/src/infrastructure/realtime.ts:65` | yes - C22 |
| F7 (carried from 2e24f0b): espera sem dobrar | `apps/server/src/infrastructure/events.ts:126` | yes - C23 |
| F8 (carried from 2e24f0b): listener valida sem `.strict()` | `apps/server/src/infrastructure/events.ts` `parse` | yes - C24 |
| F9 (carried from 2e24f0b): `notify` do inbound fora da transação | `apps/server/src/modules/conversations/inbound.ts:108` | yes - C12 (e C13 na rodada 1) |
| F11: `Math.min` removido de `nextRetryDelay` (`return delayMs * 2`) | `apps/server/src/infrastructure/events.ts:25` | yes - C25 (`expected [ 1000, 2000, 4000, 8000, 16000, …(2) ] to deeply equal …`) |
| F12: o listener deixa de usar a função (`retry(delayMs * 2)`) | `apps/server/src/infrastructure/events.ts:126` | survived - `Tests 12 passed (12)` em `events.spec.ts`, C23 e C25 incluídos |

## Gate

verified at d8357c1 - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` na raiz, exit 0: Biome `Checked 190 files`, typecheck limpo, `Test Files 40 passed (40)`, `Tests 417 passed (417)`, build do web `✓ built`.

## Ranked gaps

1. Mutante sobrevivente F12 / membro sem prova: o listener aplicar o teto de 30 s. `apps/server/src/infrastructure/events.ts:126` pode trocar `nextRetryDelay(delayMs)` por `delayMs * 2` com todas as provas verdes. O C25 prova a função, o C23 prova uma única dobra no listener, e nada liga os dois. Rodada 3 de 3: pelo procedimento, isto vai ao usuário em vez de abrir uma rodada 4. As saídas possíveis:
   - Injetar a função no `createEventListener` como opção, testar que o listener consulta a espera por ela e afirmar a sequência que ele pede.
   - Provar o comportamento no listener com timers falsos até o teto.
   - Aceitar o risco explicitamente, já que é uma linha a mais de uma função pura provada.

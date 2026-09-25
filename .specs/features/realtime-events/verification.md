# Realtime events verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 6a53bf5..2e24f0b (rodada 2 escopada pelo fix efa85c0..2e24f0b)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

O fix `2e24f0b` só mexe em testes e no `checks.md` (nenhum arquivo de `src/` fora de specs mudou). Ele fecha os gaps 1, 3 e 4 da rodada 1, a nota do payload inválido, e metade do gap 2. As 24 provas passam em `2e24f0b`, o gate está verde, e 4 dos 5 mutantes novos foram mortos. O veredito continua FAIL por um membro de `Landing` que o gap 2 já nomeava e que continua sem prova: o **teto de 30 s** da espera entre reconexões. Tirar o `Math.min(…, MAX_RETRY_MS)` de `events.ts:121` passa todo o `events.spec.ts` (F10).

## Binding sources

carried from efa85c0 - o fix não tocou a interface (Surface, Landing) nem o código de produção; as fontes não mudaram.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-012-whatsapp-runtime.md` | sim - rodada 1, lido inteiro | nenhuma | - |
| `docs/decisions/ADR-006-jobs-and-realtime-in-process.md` | sim - rodada 1, linhas 1-46 | nenhuma | - |
| `docs/handoff.md` §30 ("até 2 segundos", linha 734) | sim - rodada 1, trecho | nenhuma | - |

## Checks

verified at 2e24f0b - provas rodadas de novo por inteiro. Uma invocação a partir de `apps/server`: `pnpm exec vitest run src/infrastructure/events.spec.ts src/modules/conversations/conversation-events.spec.ts src/infrastructure/realtime.spec.ts test/architecture.spec.ts -t "<os 27 nomes em alternância>" --reporter=verbose`, exit 0, `Tests 27 passed | 18 skipped`, cada nome com `✓`. C9 `node -e` exit 0; C21 `grep` negado exit 0. As citações dos dois specs tocados (`events.spec.ts`, `conversation-events.spec.ts`) foram atualizadas; as de `events.spec.ts` até a linha 293 não se moveram.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | commit entrega o evento com os 4 valores | `-t "delivers a committed event with its ids"` ✓ | `apps/server/src/infrastructure/events.spec.ts:113` - `expect(events.seen).toEqual([sent])` | PASS |
| C2 | nada antes do commit (sentinela), entregue depois | `-t "delivers nothing before the commit"` ✓ | `events.spec.ts:140` - `…not.toContain(held.messageId)`; `events.spec.ts:146` - `…toEqual(held)` | PASS |
| C3 | rollback nunca entrega | `-t "never delivers a rolled back event"` ✓ | `events.spec.ts:166` - `expect(events.ids()).not.toContain(rolledBack.messageId)` | PASS |
| C4 | três eventos inválidos lançam, a transação falha, nada emitido | `-t "refuses an event outside the schema"` ✓ | `events.spec.ts:195` - `expect(stored).toEqual([])`; `events.spec.ts:202` - `expect(before).toEqual([])` | PASS |
| C5 | canal por schema; `public` -> `app_events` | `-t "listens only on the channel of its schema"` ✓, `-t "names the channel after the schema"` ✓ | `events.spec.ts:219` - `expect(before).toEqual([])`; `events.spec.ts:227` - `toBe('app_events')`; `events.spec.ts:246` - `toContainEqual(event)` | PASS |
| C6 | reconecta depois de `pg_terminate_backend` | `-t "reconnects after the listen connection drops"` ✓ | `events.spec.ts:258` - `expect(events.seen).toContainEqual(after)` | PASS |
| C7 | um `warn` por queda, sem ids no log | `-t "warns once per drop without event data"` ✓ | `events.spec.ts:275` - `expect(warnings).toHaveLength(1)`; `events.spec.ts:277-278` - `not.toContain(...)` | PASS |
| C8 | `stop()` não reabre | `-t "stops without reconnecting"` ✓ | `events.spec.ts:293` - `expect(await listenerPids()).toEqual([])` | PASS |
| C9 | `pg` 8.23.0 em `dependencies` | `node -e "…"` exit 0 | `apps/server/package.json:29` - `"pg": "8.23.0",` | PASS |
| C10 | um evento por inbound novo e por reabertura | `-t "emits one event per inbound message"` ✓ | `apps/server/src/modules/conversations/conversation-events.spec.ts:153` - `eventsFor([created.conversationId, closed.id])`; `:155` - `expect(events).toEqual([…created…, …reopened…])` | PASS |
| C11 | um evento por `sendMessage`; recusado não emite | `-t "emits one event per outbound message"` ✓ | `conversation-events.spec.ts:194` - `.rejects.toMatchObject({ status: 409, code: 'NOT_HANDLER' })`; `:199` - `expect(forMine).toEqual([…sent.messageId…])`; `:207` - `expect(forRefused).toEqual([])` | PASS |
| C12 | duplicados emitem um por id, 2 no total na conversa | `-t "emits once for a duplicated external id"` ✓ | `conversation-events.spec.ts:130` - `seen.filter((event) => conversationIds.includes(event.conversationId))`; `:229` - `expect(conversationIds).toHaveLength(1)`; `:235` - `expect(events).toHaveLength(2)` | PASS |
| C13 | `Message` igual ao da API em < 2 s | `-t "pushes the message to the room in under two seconds"` ✓ | `conversation-events.spec.ts:254` - `expect(elapsed).toBeLessThan(2000)`; `:261` - `expect(pushed).toEqual({ conversationId: conversation.id, message: item })` | PASS |
| C14 | ADMIN e COMMERCIAL em `QUEUE` de outro entram | `-t "lets a reader join the conversation room"` ✓ | `conversation-events.spec.ts:268` e `:279` - `toEqual({ ok: true })` | PASS |
| C15 | 404 fora do tenant, da carteira, inexistente; nada chega | `-t "refuses the room outside the tenant or the portfolio"` ✓ | `conversation-events.spec.ts:298-300` - `toEqual(notFound)` ×3; `:308` - `expect(before).toEqual([])`; `:309` - `…toEqual([readable.id])` | PASS |
| C16 | 404 sem organização, termos pendentes, membro desativado | `-t "refuses the room without a tenant context"` ✓ | `conversation-events.spec.ts:321`, `:331`, `:340` - `toEqual(notFound)` (`:336` `{ ok: true }` antes da desativação) | PASS |
| C17 | payload inválido -> 400 no join e no leave | `-t "rejects an invalid room payload"` ✓ | `conversation-events.spec.ts:349-352` - `toEqual(invalid)` ×4 | PASS |
| C18 | quem não entrou e quem saiu não recebem | `-t "delivers only to sockets in the room"` ✓ | `conversation-events.spec.ts:367` - leave `{ ok: true }`; `:374` - `toEqual([])`; `:375` - `…toEqual([inSecond.messageId])` | PASS |
| C19 | `events:resync` `{}` para todos os sockets | `-t "asks every socket to resync after a drop"` ✓ | `conversation-events.spec.ts:395` - `pg_terminate_backend`; `:402` - `expect(socket.resyncs).toEqual([{}])` no laço de `:397` | PASS |
| C20 | evento fora do tenant ignorado, listener segue | `-t "ignores an event whose message is not in the tenant"` ✓ | `conversation-events.spec.ts:429` - `toEqual([])`; `:430` - `…toEqual([after.messageId])` | PASS |
| C21 | listener pelo `buildApp` compartilhado; fronteiras | C13 ✓; `architecture.spec.ts` com os quatro nomes ✓ ×4; `grep` negado exit 0 | `apps/server/src/app.ts:123-125` - `onReady` -> `deps.events.start()`; `apps/server/src/server.ts:22` - `buildApp(deps)`; `apps/server/test/architecture.spec.ts:279` - `findBoundaryViolations(…)).toEqual([])`; `:352` - `expect(findForbiddenModuleEdges(readSourceTree(srcRoot))).toEqual([])` (agora na lista de provas) | PASS |
| C22 | `authorizeJoin` lança -> ack `500 INTERNAL_ERROR` | `realtime.spec.ts -t "answers an internal error when the room authorization fails"` ✓ | `apps/server/src/infrastructure/realtime.spec.ts:167` - `expect(ack).toEqual({ ok: false, status: 500, code: 'INTERNAL_ERROR' })` | PASS |
| C23 | reconexão que falha é tentada de novo com a espera dobrada (>= 1,9 s) e o evento seguinte chega | `events.spec.ts -t "retries a failed reconnection with a doubled wait"` ✓ 3108 ms | `events.spec.ts:310-311` - `ALTER ROLE … NOLOGIN` + `pg_terminate_backend`; `events.spec.ts:326` - `expect((reconnected?.time ?? 0) - (failed[0]?.time ?? 0)).toBeGreaterThanOrEqual(1900)`; `:327` - `expect(events.seen).toContainEqual(after)` | PASS |
| C24 | payload não JSON e com campo fora do schema no próprio canal não chegam a handler | `events.spec.ts -t "ignores a payload outside the schema on its channel"` ✓ | `events.spec.ts:339` - `pg_notify($1, $2)` com `'nao-json'`; `events.spec.ts:347` - `expect(await events.until(sentinel.messageId)).toEqual([])`; `:348` - `expect(events.seen).toEqual([sentinel])` | PASS |

Re-julgamento dos veredictos não-PASS da rodada 1:

- **Gap 1 (500 do join):** fechado por C22. A prova é de camada: um `createRealtime` com `authorizeJoin` que lança, server HTTP e `socket.io-client` reais, ack afirmado inteiro.
- **Gap 2 (reconexão que falha):** fechado em parte. C23 prova a nova tentativa e a espera dobrada (F7 morto: `expected 1006 to be greater than or equal to 1900`). O teto de 30 s do mesmo `Landing` continua sem prova (F10 sobreviveu). Ver Coverage.
- **Gap 3 / P1 (C12 conta "no total"):** fechado. `eventsFor` passou a filtrar por `conversationId` (`conversation-events.spec.ts:130`), e o mutante com o `notify` fora da transação agora é morto pelo C12 (F9: `expected [ …(12) ] to have a length of 2 but got 12`).
- **Gap 4 / P2 (C21):** fechado. O `checks.md` põe `forbids the conversation module dependencies the adr rules out` entre as provas e explica que "no option" quer dizer nenhuma opção que inicie o listener. O `workers` só inicia a fila (`test/app.ts:38-41`).
- **Nota do payload inválido no próprio canal:** fechada por C24 (F8 morto).

## Coverage

Linhas `emit conversation:join` statuses, `LISTEN` lifecycle e duplicate inbound: verified at 2e24f0b. Linha nova payloads received on the channel: verified at 2e24f0b. Demais linhas: carried from efa85c0 (o fix não tocou código de produção nem as provas delas além de deslocar linhas).

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `emit conversation:join` statuses (4) | plan `Surface` (linha 58) + `realtime.ts:60,63,65,68` | 200 C14 · 400 C17 · 404 C15, C16 · 500 C22 | - |
| `emit conversation:leave` statuses (2) | plan `Surface` + `realtime.ts:74,76` | 200 C18 · 400 C17 | - |
| server-pushed events (2) | plan `Surface` + `app.ts:116-118,121` | `message.created` C13 · `events:resync` C19 | - |
| `notify` outcomes (4) | `events.ts:31-38` | committed C1 · held open C2 · rolled back C3 · refused C4 | - |
| payloads received on the channel (3) | `events.ts:60-73` (`JSON.parse` em try, `appEvent.safeParse`), plan Flow 2 | não JSON C24 · fora do schema C24 · válido C1 | - |
| invalid event fields (3) | `events.ts:7-14` | extra field C4 · non-UUID C4 · unknown `type` C4 | - |
| emitting use cases (4 paths) | `inbound.ts:70,108`, `outbound.ts:69,85` | inbound new C10 · reopening C10 · outbound sent C11 · outbound refused C11 | - |
| duplicate inbound (2) | AC 6 ("no total") + `inbound.ts:79` | sequential C12 · 10 concurrent C12, contados por conversa (`:130`, `:235`) | - |
| join refusal causes (6) | `tenant-context.ts:35,40,42` + `findReadableConversation` | other tenant C15 · outside the portfolio C15 · nonexistent C15 · no active organization C16 · pending terms C16 · inactive member C16 | - |
| join acceptance by role (2) | AC 9, AC 11 | ADMIN C14 · COMMERCIAL em `QUEUE` de outro C14 | - |
| invalid room payloads (3) | `realtime.ts:27` | extra field C17 · non-UUID C17 · missing id C17 | - |
| sockets that must not receive (3) | AC 8, AC 10, AC 14 | not joined C18 · left C18 · refused C15 | - |
| `LISTEN` lifecycle (6) | plan `Landing` door 2 ("nova tentativa com espera de 1 s dobrando até 30 s") + `events.ts:20-21,102-125,144-151` | drop -> reconnect C6 · drop -> `warn` C7 · drop -> resync C19 · stop -> no reconnect C8 · failed attempt -> retry with doubled wait C23 · teto da espera em 30 s sem prova | teto de 30 s (`events.ts:121`, `Math.min(delayMs * 2, MAX_RETRY_MS)`; `MAX_RETRY_MS` em `events.ts:21`): C23 chega a uma única falha (1 s -> 2 s); nenhum spec cita `MAX_RETRY`, `30_000` ou `30 s` (`grep -rn` exit 1); o mutante F10 sem o teto passou os 11 testes de `events.spec.ts` |
| event whose message is not found (2) | plan Flow 3 + `app.ts:114-115` | random ids C20 · other organization C20 | - |
| startup config: listener started (2 assemblies) | `server.ts:22,38`, `test/app.ts:42`, `app.ts:123-125` | `server.ts` C21 · test harness C21, C13 | - |
| channel naming (2 schemas) | `events.ts:24-26,35-36` | `public` C5 · worker schema C5 | - |
| Landing doors (3) | plan `Landing` | door 1 C1, C4, C5, C24 · door 2 C6, C7, C8, C9, C19, C23 · door 3 C14, C15, C16, C22 | - (o teto de 30 s da door 2 está na linha `LISTEN` lifecycle) |

## Test policy rows

carried from efa85c0 - o `checks.md` não tem seção `Test policy`; vale a convenção de `CLAUDE.md` "Testes". As provas novas seguem a mesma convenção: PostgreSQL real, sem mock do banco (C23 recusa o login com um role real, C24 usa `pg_notify` real), socket real (C22).

## Faults injected

verified at 2e24f0b - mutantes nas superfícies que o fix criou ou mudou. Os 5 da rodada 1 (F1-F5) carried from efa85c0, e o F4 foi refeito como F9 contra o C12 novo. Worktrees descartáveis a partir de `2e24f0b` (`pnpm install --frozen-lockfile --prefer-offline`), cada mutante revertido antes do seguinte. `git status --porcelain` da árvore real vazio antes e depois (idêntico), worktrees removidas.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 (carried from efa85c0): `.strict()` removido do schema | `apps/server/src/infrastructure/events.ts:14` | yes - C4 |
| F2 (carried from efa85c0): handlers de reconexão não chamados | `apps/server/src/infrastructure/events.ts:116` | yes - C19 |
| F3 (carried from efa85c0): resultado do `authorizeJoin` ignorado | `apps/server/src/infrastructure/realtime.ts:63` | yes - C15, C16 |
| F4 (carried from efa85c0): `notify` do inbound fora da transação | `apps/server/src/modules/conversations/inbound.ts:108` | yes - C13 |
| F5 (carried from efa85c0): sem `retry` depois de uma queda | `apps/server/src/infrastructure/events.ts:107` | yes - C6 |
| F6: `authorizeJoin` que lança responde `hiddenRoom` (404) em vez de `failedRoom` | `apps/server/src/infrastructure/realtime.ts:65` | yes - C22 |
| F7: espera sem dobrar (`Math.min(delayMs, …)`) | `apps/server/src/infrastructure/events.ts:121` | yes - C23 (`expected 1006 to be greater than or equal to 1900`) |
| F8: listener valida com um `z.object(appEvent.shape)` sem `.strict()` | `apps/server/src/infrastructure/events.ts:62` | yes - C24 (`expected [ { type: 'message.created', …(3) } ] to deeply equal []`) |
| F9: F4 refeito, `notify` numa transação própria antes do `INSERT` | `apps/server/src/modules/conversations/inbound.ts:108` | yes - C12 (`expected [ …(12) ] to have a length of 2 but got 12`); C10 passou, como esperado (não há duplicados nele) |
| F10: teto da espera removido (`retry(delayMs * 2)`) | `apps/server/src/infrastructure/events.ts:121` | survived - os 11 testes de `events.spec.ts` passaram, C23 incluído |

## Gate

verified at 2e24f0b - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` na raiz, exit 0: Biome `Checked 190 files`, typecheck limpo, `Test Files 40 passed (40)`, `Tests 416 passed (416)`, build do web `✓ built`.

## Ranked gaps

1. Membro de `Landing` sem prova e mutante sobrevivente: o teto de 30 s da espera entre reconexões (`apps/server/src/infrastructure/events.ts:121`, `MAX_RETRY_MS` em `:21`). Nenhuma prova chega à quinta tentativa, e remover o `Math.min` passa a suíte (F10). Dá para provar sem esperar 31 s: extrair o cálculo da próxima espera numa função pura e testar a sequência 1, 2, 4, 8, 16, 30, 30 s, ou avançar o relógio com timers falsos.

# Realtime events verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 6a53bf5..efa85c0
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Todas as 21 provas nomeadas rodaram e passaram em `efa85c0`, e os 5 mutantes injetados foram mortos. O veredito é FAIL por dois membros de cobertura sem prova, ambos nomeados no próprio plano: o ack `500 INTERNAL_ERROR` do `conversation:join` (acrescentado ao `Surface` durante o build) e a nova tentativa com espera dobrando até 30 s depois de uma reconexão que falha (door 2 do `Landing`).

## Binding sources

Perfil `standard`: o passo 1 (ui) não roda e não há tela. As fontes que o plano nomeia foram abertas só para procurar contradição com os checks e para o recompute do Coverage.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-012-whatsapp-runtime.md` (`pg_notify('app_events', …)` na transação, payload só de ids, `LISTEN` na API, eventos perdidos na queda e o cliente refaz as consultas) | sim - lido o ADR inteiro | nenhuma: canal `app_events` no `public` (C5), só ids (C4), entregue só no commit (C1-C3), resync na volta (C19) | - |
| `docs/decisions/ADR-006-jobs-and-realtime-in-process.md` (Socket.IO no processo da API, rooms `org:*`, `user:*`, `conversation:*`) | sim - linhas 1-46 | nenhuma: room `conversation:<id>` (`realtime.ts:67`), `org:`/`user:` sem mudança (`realtime.ts:54-55`) | - |
| `docs/handoff.md` §30 ("até 2 segundos", linha 734) | sim - trecho | nenhuma: C13 afirma `< 2000` ms | - |

## Checks

Provas: uma invocação, `pnpm exec vitest run src/infrastructure/events.spec.ts src/modules/conversations/conversation-events.spec.ts test/architecture.spec.ts -t "<os 23 nomes em alternância>" --reporter=verbose` a partir de `apps/server`, exit 0, `Tests 23 passed | 11 skipped`. Cada teste nomeado aparece individualmente como `✓`. Mais as duas provas de comando (C9 `node -e` exit 0; C21 `! grep` exit 0) e um teste extra de arquitetura rodado para C21 (ver nota).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | commit entrega o evento com os 4 valores | `events.spec.ts -t "delivers a committed event with its ids"` ✓ 103 ms | `apps/server/src/infrastructure/events.spec.ts:113` - `expect(events.seen).toEqual([sent])` | PASS |
| C2 | nada antes do commit (sentinela), entregue depois | `-t "delivers nothing before the commit"` ✓ | `events.spec.ts:140` - `expect(before.map((event) => event.messageId)).not.toContain(held.messageId)`; `events.spec.ts:146` - `…find(… held.messageId)).toEqual(held)` | PASS |
| C3 | rollback nunca entrega (sentinela) | `-t "never delivers a rolled back event"` ✓ | `events.spec.ts:161` - `.rejects.toThrow('rollback')`; `events.spec.ts:166` - `expect(events.ids()).not.toContain(rolledBack.messageId)` | PASS |
| C4 | campo extra, id não UUID e `type` desconhecido lançam, a transação falha, nada emitido | `-t "refuses an event outside the schema"` ✓ | casos em `events.spec.ts:178-180`; `events.spec.ts:191` - `.rejects.toThrow()`; `events.spec.ts:195` - `expect(stored).toEqual([])`; `events.spec.ts:202` - `expect(before).toEqual([])` | PASS |
| C5 | canal por schema; `app_events_other` não chega; `public` -> `app_events` | `-t "listens only on the channel of its schema"` ✓, `-t "names the channel after the schema"` ✓ | `events.spec.ts:219` - `expect(before).toEqual([])`; `events.spec.ts:227` - `expect(eventChannel('public')).toBe('app_events')`; `events.spec.ts:228` - `toBe(\`app_events_${workerSchema()}\`)`; `events.spec.ts:246` - `expect(payloads.map(…JSON.parse…)).toContainEqual(event)` (notify com `search_path` `public`) | PASS |
| C6 | reconecta depois de `pg_terminate_backend` e entrega evento posterior | `-t "reconnects after the listen connection drops"` ✓ 1067 ms | `events.spec.ts:100` - `pg_terminate_backend($1)`; `events.spec.ts:258` - `expect(events.seen).toContainEqual(after)` | PASS |
| C7 | um `warn` por queda, sem ids de evento no log | `-t "warns once per drop without event data"` ✓ | `events.spec.ts:275` - `expect(warnings).toHaveLength(1)`; `events.spec.ts:277-278` - `expect(line.raw).not.toContain(delivered.conversationId / .messageId)` | PASS |
| C8 | `stop()` fecha e não reabre (2 s depois) | `-t "stops without reconnecting"` ✓ 2045 ms | `events.spec.ts:291` - `eventually(listenerPids, (pids) => pids.length === 0)`; `events.spec.ts:293` - `expect(await listenerPids()).toEqual([])` | PASS |
| C9 | `pg` 8.23.0 em `dependencies`, fora de `devDependencies` | `node -e "…"` exit 0 | `apps/server/package.json:29` - `"pg": "8.23.0",` (bloco `dependencies`; removido de `devDependencies` no diff) | PASS |
| C10 | um evento por inbound novo e por inbound que reabre | `conversation-events.spec.ts -t "emits one event per inbound message"` ✓ | `apps/server/src/modules/conversations/conversation-events.spec.ts:149` - `expect(reopened.conversationId).toBe(closed.id)`; `:153` - `expect(events).toEqual([{…created…}, {…closed.id, reopened.messageId}])` | PASS |
| C11 | um evento por `sendMessage`; recusado (`409 NOT_HANDLER`) não emite | `-t "emits one event per outbound message"` ✓ | `conversation-events.spec.ts:192` - `.rejects.toMatchObject({ status: 409, code: 'NOT_HANDLER' })`; `:197` - `expect(forMine).toEqual([{…messageId: sent.messageId}])`; `:205` - `expect(forRefused).toEqual([])` | PASS |
| C12 | `externalId` duplicado (sequencial e 10 em paralelo) emite um por id | `-t "emits once for a duplicated external id"` ✓ | `conversation-events.spec.ts:222` - `expect(messageIds).toHaveLength(2)`; `:226-228` - `toHaveLength(1)` por id e `expect(events).toHaveLength(2)` (ver precision gap P1) | PASS |
| C13 | socket na room recebe o `Message` igual ao da API em < 2 s, HTTP e Socket.IO reais | `-t "pushes the message to the room in under two seconds"` ✓ 228 ms | `conversation-events.spec.ts:247` - `expect(elapsed).toBeLessThan(2000)`; `:254` - `expect(pushed).toEqual({ conversationId: conversation.id, message: item })` | PASS |
| C14 | ack `{ ok: true }` para ADMIN e para COMMERCIAL em `QUEUE` de contato de outro | `-t "lets a reader join the conversation room"` ✓ | `conversation-events.spec.ts:261` - `expect(await admin.join(…)).toEqual({ ok: true })`; `:272` - `expect(await socket.join({ conversationId: queued.id })).toEqual({ ok: true })` (`withTwoSalespeople` em `:263`) | PASS |
| C15 | 404 para outro tenant, fora da carteira, UUID aleatório; nada chega (sentinela) | `-t "refuses the room outside the tenant or the portfolio"` ✓ | `conversation-events.spec.ts:291-293` - `toEqual(notFound)` ×3; `:301` - `expect(before).toEqual([])`; `:302` - `expect(socket.received.map(…conversationId)).toEqual([readable.id])` | PASS |
| C16 | 404 sem organização ativa, com termos pendentes, membro desativado depois de conectar | `-t "refuses the room without a tenant context"` ✓ | `conversation-events.spec.ts:314` e `:324` - `toEqual(notFound)`; `:329` - `toEqual({ ok: true })` antes; `:333` - `toEqual(notFound)` depois de `active: false` | PASS |
| C17 | payload inválido -> 400 no join (×3) e no leave | `-t "rejects an invalid room payload"` ✓ | `conversation-events.spec.ts:342-344` - `toEqual(invalid)` (`extra: 1`, `'nao-uuid'`, `{}`); `:345` - `expect(await socket.leave({ conversationId: 'nao-uuid' })).toEqual(invalid)` | PASS |
| C18 | quem não entrou e quem saiu não recebem (sentinela) | `-t "delivers only to sockets in the room"` ✓ | `conversation-events.spec.ts:360` - `expect(await leaver.leave(…)).toEqual({ ok: true })`; `:367` - `expect(await socket.until(inSecond.messageId)).toEqual([])`; `:368` - `…toEqual([inSecond.messageId])` | PASS |
| C19 | queda do `LISTEN` -> `events:resync` `{}` para todos os sockets (com e sem organização) | `-t "asks every socket to resync after a drop"` ✓ 1259 ms | `conversation-events.spec.ts:388` - `pg_terminate_backend`; `:395` - `expect(socket.resyncs).toEqual([{}])` no laço dos dois sockets (`:390`) | PASS |
| C20 | evento de mensagem fora do tenant é ignorado e o listener segue entregando | `-t "ignores an event whose message is not in the tenant"` ✓ | casos em `conversation-events.spec.ts:407-418`; `:422` - `expect(await socket.until(after.messageId)).toEqual([])`; `:423` - `…toEqual([after.messageId])` | PASS |
| C21 | listener iniciado pelo `buildApp` compartilhado; `server.ts` não o inicia; fronteiras | C13 ✓; `architecture.spec.ts` com os três nomes do checks.md ✓ ×3; o `grep -nE` de `events.start` ou `events.listen` em `src/server.ts` sem resultado, exit 0 negado | `apps/server/src/app.ts:123-125` - `app.addHook('onReady', … deps.events.start())`; `apps/server/src/server.ts:22` - `buildApp(deps)`, `:38` - `app.listen(…)`; `apps/server/test/app.ts:42` - `buildApp(deps)`; `apps/server/test/architecture.spec.ts:279` - `expect(findBoundaryViolations(readSourceTree(srcRoot))).toEqual([])` (regra `infrastructure/` -> `modules/` em `:64`); `:373` - `findModuleCycles(…)).toEqual([])`; `:391` - `findForeignWrites(…)).toEqual([])`; `conversations` sem `channels`/`ai`: `architecture.spec.ts:352` - `expect(findForbiddenModuleEdges(readSourceTree(srcRoot))).toEqual([])` (fora da lista de provas; rodado à parte, ✓) | PASS |

Notas sobre as provas:

- **P1 (precision gap, C12 / AC 6).** O AC 6 diz "exatamente um `message.created` **no total**"; o C12 estreitou para "um por id (2 no total para os dois ids)", e o teste só conta eventos cujo `messageId` está entre os ids gravados (`conversation-events.spec.ts:129`, `seen.filter((event) => messageIds.includes(event.messageId))`). Um evento emitido por uma tentativa duplicada que fez rollback carrega um `messageId` que nunca foi gravado e não é contado. O mutante F4 mostrou isso: com o `notify` numa transação própria antes do `INSERT`, C10 e C12 continuaram verdes; só o C13 o matou (por o handler reler a mensagem antes do commit). Filtrar por `conversationId` fecharia o buraco.
- **P2 (precision gap, C21).** O claim diz "`buildTestApp()` with no option", mas a prova usa `buildTestApp({ workers: true })` (`conversation-events.spec.ts:25`, com o comentário "No option" na linha 23). O `workers` só inicia o pg-boss (`test/app.ts:38-41`), não o listener, então a substância vale; e a cláusula "`conversations` imports no `channels`/`ai`" só é afirmada por um teste que não está na lista de provas do C21 (`architecture.spec.ts:351-352`). Rodei esse teste à parte e ele passa.
- O C8 usa uma espera fixa de 2 s, o que o próprio claim pede ("2 s later, past the first 1 s backoff"); o fim do backend é antes observado positivamente (`events.spec.ts:291`).

## Coverage

Recomputado do plano (`Surface`, `Landing`, `Flow`) e do código em `efa85c0`, não lido da tabela do `checks.md`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `emit conversation:join` statuses (4) | plan `Surface` (linha 58, "Adicionado no build") + `realtime.ts:60,63,65,68` | 200 C14 · 400 C17 · 404 C15, C16 · 500 `INTERNAL_ERROR` sem prova | 500 `INTERNAL_ERROR` (`realtime.ts:64-65`, `failedRoom`): o `checks.md` conta 3 status e nenhum check cobre o quarto; `grep -rn INTERNAL_ERROR` nos specs só acha `src/app.spec.ts:168,182` (HTTP, não o socket) |
| `emit conversation:leave` statuses (2) | plan `Surface` + `realtime.ts:74,76` | 200 C18 (`:360`) · 400 C17 (`:345`) | - |
| server-pushed events (2) | plan `Surface` + `app.ts:116-118,121` | `message.created` C13 · `events:resync` C19 | - |
| `notify` outcomes (4) | `events.ts:31-38` + semântica do `NOTIFY` | committed C1 · held open C2 · rolled back C3 · refused by the schema C4 | - |
| invalid event fields (3) | `events.ts:7-14` (`.strict()`, `z.uuid()`, `z.literal`) | extra field C4 · non-UUID C4 · unknown `type` C4 | - |
| emitting use cases (4 paths) | escritores de `Message` no código: `inbound.ts:70` (`INSERT`) e `outbound.ts:69` (`message.create`), notify em `inbound.ts:108`, `outbound.ts:85` | inbound new C10 · inbound reopening C10 · outbound sent C11 · outbound refused C11 | - |
| duplicate inbound (2) | AC 6 + `inbound.ts:79` (`DuplicateInbound`) | sequential C12 · 10 concurrent C12 | - (ver P1: a contagem "no total" do AC 6 não é a que o teste faz) |
| join refusal causes (6) | `loadTenant` (`tenant-context.ts:35,40,42`: termos, sem organização ativa, sem membro ativo) + `findReadableConversation` (tenant, carteira, inexistente) | other tenant C15 · outside the portfolio C15 · nonexistent C15 · no active organization C16 · pending terms C16 · inactive member C16 | - |
| join acceptance by role (2) | ADR-016 via plan AC 9, AC 11 | ADMIN C14 · COMMERCIAL em `QUEUE` de outro C14 (MANAGER também aceito em `:329`) | - |
| invalid room payloads (3) | `realtime.ts:27` (`.strict()`, `z.uuid()`) | extra field C17 · non-UUID C17 · missing id C17 | - |
| sockets that must not receive (3) | AC 8, AC 10, AC 14 | not joined C18 · left C18 · refused C15 | - |
| `LISTEN` lifecycle (5) | plan `Landing` door 2 ("em `error` ou `end`: log `warn`, nova tentativa com espera de 1 s dobrando até 30 s, `LISTEN` de novo e `io.emit('events:resync', {})`") + `events.ts:102-125,144-151` | drop -> reconnect C6 · drop -> `warn` C7 · drop -> resync C19 · stop -> no reconnect C8 · reconexão que falha -> nova tentativa com espera dobrada até 30 s sem prova | reconexão que falha -> nova tentativa com espera dobrada, teto 30 s (`events.ts:118-122`, `MAX_RETRY_MS` em `:21`): todas as provas de queda reconectam na primeira tentativa; `grep -rnE` por `backoff`, `reconnection failed`, `30_000`, `MAX_RETRY` e `FIRST_RETRY` nos specs não acha nada (exit 1). Tirar o `retry(...)` do ramo de erro passaria todas as provas |
| event whose message is not found (2) | plan Flow 3 + `app.ts:114-115` | random ids C20 · other organization C20 | - |
| startup config: listener started (2 assemblies) | lidos diretamente: `server.ts:22,38` (`buildApp` + `listen` -> `onReady`), `test/app.ts:42` (`buildApp`); `app.ts:123-125`; `dependencies.ts` `closeDependencies` -> `events.stop()` | `server.ts` C21 (grep sem `events.start`) · test harness C21, C13 | - |
| channel naming (2 schemas) | `events.ts:24-26,35-36` | `public` -> `app_events` C5 (`:227`, `:246`) · worker schema C5 (`:228`, `:219`) | - |
| Landing doors (3) | plan `Landing` | door 1 C1, C4, C5 · door 2 C6, C7, C8, C9, C19 (menos o membro de backoff acima) · door 3 C14, C15, C16 | - (o membro de door 2 sem prova está na linha `LISTEN` lifecycle) |

Observação fora da contagem: o listener valida o payload recebido e ignora com `warn` o que está fora do schema (`events.ts:69-72`, plan Flow 2 "Cada payload é validado"). Nenhuma prova manda um payload inválido no canal do próprio schema (o C5 manda num canal alheio). Flow não é uma superfície que o procedimento varre, então fica registrado sem mudar o veredito.

## Test policy rows

O `checks.md` não tem seção `Test policy`; vale a convenção de `CLAUDE.md` "Testes". Os endpoints (aqui, eventos do socket) são provados com PostgreSQL real, server HTTP real e `socket.io-client` real, com `withTwoTenants` (C15) e `withTwoSalespeople` (C14, C15); nada do banco é mockado; as negativas usam sentinela em vez de espera.

## Faults injected

Worktree descartável em `scratchpad/wt` a partir de `efa85c0` (`pnpm install --frozen-lockfile --prefer-offline`; o `--offline` falhou na checagem de supply-chain do pnpm). Cada mutante foi revertido com `git checkout -- .` antes do seguinte. `git status --porcelain` da árvore real vazio antes e depois (idêntico), worktree removida.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1: `.strict()` removido do schema do evento | `apps/server/src/infrastructure/events.ts:14` | yes - C4 (`promise resolved "undefined" instead of rejecting`) |
| F2: handlers de reconexão não chamados depois de reconectar | `apps/server/src/infrastructure/events.ts:116` | yes - C19 (`timed out; last value: []`) |
| F3: resultado do `authorizeJoin` ignorado (`&& false`) | `apps/server/src/infrastructure/realtime.ts:63` | yes - C15 e C16 |
| F4: `notify` do inbound numa transação própria, antes do `INSERT` (fora da transação do dado) | `apps/server/src/modules/conversations/inbound.ts:108` | yes - C13, 3 de 3 execuções; C10 e C12 passaram com o mutante (P1) |
| F5: sem `retry(FIRST_RETRY_MS)` depois de uma queda | `apps/server/src/infrastructure/events.ts:107` | yes - C6 (`timed out; last value: []`) |

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` na raiz - exit 0: Biome `Checked 190 files`, typecheck limpo, `Test Files 40 passed (40)`, `Tests 413 passed (413)`, build do web `✓ built`.

## Ranked gaps

1. Membro de cobertura sem prova: ack `{ ok: false, status: 500, code: 'INTERNAL_ERROR' }` do `conversation:join` quando a autorização lança - acrescentado ao `Surface` no build, sem check - `apps/server/src/infrastructure/realtime.ts:64-65`, nenhuma prova.
2. Membro de cobertura sem prova: reconexão que falha -> nova tentativa com espera dobrando até 30 s (`Landing` door 2) - `apps/server/src/infrastructure/events.ts:118-122`, nenhuma prova.
3. Precision gap P1: C12 conta só os eventos dos ids gravados, não "no total" (AC 6); um evento emitido fora da transação passa por C10 e C12 - `conversation-events.spec.ts:129`.
4. Precision gap P2: C21 diz "no option" e a prova usa `{ workers: true }`; a cláusula `conversations` sem `channels`/`ai` depende de um teste fora da lista de provas - `conversation-events.spec.ts:25`, `architecture.spec.ts:352`.

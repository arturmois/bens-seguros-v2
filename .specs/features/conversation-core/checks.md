# Conversation core checks

Profile: standard
Plan: `.specs/features/conversation-core/plan.md`

Provas rodam em `apps/server` (`pnpm exec vitest run <arquivo> -t "<nome>"`). "Em paralelo" significa chamadas disparadas juntas com `Promise.all`/`Promise.allSettled` sobre o pool real do Prisma (conexões distintas), nunca um laço sequencial.

58 checks in 8 slices · 9 one-way doors · 0 open

## Checks

### S1 - Canal Web Chat padrão · 7 files · ~60 KB · ~15k

**C1** - `POST /api/v1/onboarding` cria exatamente um `Channel` na nova organização, com `kind` `WEB_CHAT` e `name` `Web Chat` (door 1, door 9, AC 1)
Proof: `src/modules/organizations/onboarding.spec.ts -t "creates the default web chat channel"`

**C2** - Se a transação do onboarding falha depois do passo do canal (o `record` de auditoria lança), nenhuma `Organization` nem `Channel` fica gravado (mesma transação) (door 9, AC 1)
Proof: `src/modules/organizations/onboarding.spec.ts -t "rolls the default channel back with the organization"`

**C3** - Num schema construído pelas migrations anteriores, com três organizações semeadas e o dono das tabelas trocado por um papel **não-superuser** (`SET ROLE` para um papel `NOSUPERUSER NOBYPASSRLS` dono do schema, de modo que o `FORCE` vale para ele), aplicar a migration da F2 deixa exatamente um `Channel` `WEB_CHAT` `Web Chat` por organização (3 linhas, 3 `organizationId` distintos) (door 7, AC 2)
Proof: `test/schema.spec.ts -t "backfills one web chat channel per organization under forced row security"`

**C4** - A mesma migration, aplicada como o dono superuser, também deixa um canal por organização (door 7, AC 2)
Proof: `test/schema.spec.ts -t "backfills one web chat channel per organization as a superuser owner"`

**C5** - Depois da migration, `Organization` e `Channel` têm `relrowsecurity` e `relforcerowsecurity` verdadeiros e a política `tenant_isolation`, no schema do worker e no schema do teste de backfill não-superuser (door 7, AC 3)
Proof: `test/schema.spec.ts -t "keeps organization and channel row security forced after the backfill"`

**C6** - Um segundo `INSERT` de `Channel` `WEB_CHAT` na mesma organização falha com `23505` no índice `Channel_one_web_chat`; o `WEB_CHAT` de outra organização é aceito (door 1, AC 4)
Proof: `test/schema.spec.ts -t "allows one web chat channel per organization"`

**C7** - Dentro de `withTenant(B)`, `channel.findMany` não devolve o canal de A, e `channel.updateMany` pelo `id` do canal de A muda 0 linhas (AC 5)
Proof: `src/modules/channels/channel.spec.ts -t "hides the channel from the other tenant"`

### S2 - Contato por telefone E.164 · 6 files · ~40 KB · ~10k

**C8** - `normalizePhone` devolve `+5511987654321` para cada um de `(11) 98765-4321`, `11987654321`, `011 98765-4321`, `0 11 98765-4321` e `5511987654321`; `+5521987654321` para `(21) 98765-4321`; e `+551134567890` para o fixo `(11) 3456-7890` (door 6, AC 6)
Proof: `src/shared/phone.spec.ts -t "normalizes brazilian numbers without a country code"`

**C9** - `normalizePhone('+1 202 456 1111')` devolve `+12024561111` e `normalizePhone('+351 912 345 678')` devolve `+351912345678`, mesmo com o Brasil como padrão (door 6, AC 7)
Proof: `src/shared/phone.spec.ts -t "keeps the country of an international number"`

**C10** - `normalizePhone` devolve `null` para `123`, `abc`, `+55 11 1234`, `(11) 98765-4321 ramal 2`, a string vazia e `(11) 2345-678`; e também para `(11) 1234-5678`, `(11) 0876-4321` e `98765-4321` (sem DDD), que a metadata `min` aceitaria e só a `max` recusa (door 6, AC 8)
Proof: `src/shared/phone.spec.ts -t "rejects what is not a valid phone"`

**C11** - `receiveInbound` com `fromPhone` `abc` lança `422 INVALID_PHONE` e não grava `Contact`, `Conversation` nem `Message` (AC 9)
Proof: `src/modules/conversations/inbound.spec.ts -t "refuses an invalid phone"`

**C12** - Duas entradas no mesmo canal com `(11) 98765-4321` e `+55 11 98765-4321` produzem um `Contact` (`phoneE164` `+5511987654321`), uma `Conversation` e duas mensagens (AC 10)
Proof: `src/modules/conversations/inbound.spec.ts -t "uses one contact for the same phone in two formats"`

**C13** - O mesmo telefone chegando nas organizações A e B cria um `Contact` em cada, e dentro de `withTenant(B)` a busca pelo telefone devolve só o de B (AC 11)
Proof: `src/modules/conversations/inbound.spec.ts -t "keeps the same phone apart in two organizations"`

**C14** - `INSERT` de `Contact` com `phoneE164` `5511987654321` (sem `+`), `+0511987654321` e `+55119876543210123` falha com `23514` em `Contact_phoneE164_check`; `+5511987654321` é aceito (door 2, AC 12)
Proof: `test/schema.spec.ts -t "stores contact phones only in e164"`

**C15** - `INSERT` de `Contact` com `ownerId` de um usuário que só é membro de outra organização falha com `23503`; com o `userId` de um membro da mesma organização é aceito (door 2, AC 13)
Proof: `test/schema.spec.ts -t "requires the contact owner to be a member of the organization"`

**C16** - O contato criado pela primeira entrada tem `ownerId` nulo (AC 14)
Proof: `src/modules/conversations/inbound.spec.ts -t "opens a queued conversation for a new phone"`

### S3 - Entrada ordenada e idempotente · 3 files · ~45 KB · ~12k

**C17** - A primeira entrada de um telefone novo cria `Conversation` `{ status: OPEN, handler: QUEUE, assigneeId: null, lastSeq: 1 }` e `Message` `{ direction: INBOUND, author: CONTACT, seq: 1, deliveryStatus: null, kind: TEXT, text }`, e devolve `{ conversationId, messageId, created: true }` com esses ids (door 3, door 4, AC 15)
Proof: `src/modules/conversations/inbound.spec.ts -t "opens a queued conversation for a new phone"`

**C18** - Numa conversa com `lastSeq` 7 e `lastMessageAt` antigo (semeados), a próxima entrada grava `seq` 8, deixa `lastSeq` 8 e `lastMessageAt` igual ao da transação (mais novo que o semeado), na mesma conversa (door 4, AC 16)
Proof: `src/modules/conversations/inbound.spec.ts -t "appends the next seq to the open conversation"`

**C19** - Numa conversa `WAITING` + `HUMAN` com `assigneeId` X, uma entrada deixa `status` `OPEN`, `handler` `HUMAN` e `assigneeId` X (door 5, AC 17)
Proof: `src/modules/conversations/inbound.spec.ts -t "moves a waiting conversation back to open"`

**C20** - Com a mensagem `externalId` `wa-1` já gravada e a conversa depois disso em `WAITING` (uma saída posterior), repetir a entrada `wa-1` devolve `{ created: false }` com o `conversationId` e `messageId` originais, e mantém a contagem de mensagens, `lastSeq`, `lastMessageAt`, `status` `WAITING` e `handler` (door 4, AC 18)
Proof: `src/modules/conversations/inbound.spec.ts -t "ignores a repeated external id"`

**C21** - 10 entradas com o mesmo `externalId` em paralelo gravam exatamente 1 mensagem e exatamente 1 resultado `created: true`; todos os 10 devolvem o mesmo `messageId` (door 4, AC 19)
Proof: `src/modules/conversations/inbound.spec.ts -t "stores one message for concurrent duplicates"`

**C22** - 50 entradas com `externalId` distintos em paralelo na mesma conversa gravam 50 mensagens com `seq` ordenado igual a `[1..50]` e `lastSeq` 50 (door 4, AC 20)
Proof: `src/modules/conversations/inbound.spec.ts -t "numbers fifty concurrent messages without gaps"`

**C23** - Com a linha da conversa A travada por uma transação aberta (`SELECT … FOR UPDATE` numa conexão própria), uma entrada na conversa B termina em menos de 2 s, e a entrada em A continua pendente até a trava ser liberada e então conclui (door 4, AC 21)
Proof: `src/modules/conversations/inbound.spec.ts -t "does not make another conversation wait for a locked one"`

**C24** - 10 primeiras entradas de um telefone novo em paralelo, com `externalId` distintos, criam 1 `Contact`, 1 `Conversation` e 10 mensagens com `seq` `[1..10]` (door 2, door 3, AC 22)
Proof: `src/modules/conversations/inbound.spec.ts -t "creates one contact and conversation for a concurrent first contact"`

**C25** - Uma entrada `UNSUPPORTED` grava `kind` `UNSUPPORTED` e `text` nulo, mesmo que o chamador mande texto (AC 23)
Proof: `src/modules/conversations/inbound.spec.ts -t "stores an unsupported message without content"`

**C26** - Uma entrada `TEXT` sem `text`, com `text` `'   '` e com 65 537 caracteres lança `422 INVALID_MESSAGE` e não grava nada; com exatamente 65 536 caracteres é gravada (AC 24)
Proof: `src/modules/conversations/inbound.spec.ts -t "bounds the inbound text"`

**C27** - Uma entrada com o `channelId` do canal de outra organização, e com um UUID que não existe, lança `404 NOT_FOUND` e não grava `Contact`, `Conversation` nem `Message` no tenant (AC 25)
Proof: `src/modules/conversations/inbound.spec.ts -t "refuses a channel outside the tenant"`

**C28** - Duas entradas `TEXT` sem `externalId`, iguais, viram duas mensagens com `externalId` nulo e `seq` 1 e 2 (AC 26)
Proof: `src/modules/conversations/inbound.spec.ts -t "stores messages without an external id every time"`

### S4 - Reabertura · 2 files · ~30 KB · ~8k

**C29** - Numa conversa `CLOSED` (semeada com três mensagens, `lastSeq` 3 e `closedAt`), uma entrada devolve o mesmo `conversationId`, deixa `status` `OPEN`, `closedAt` nulo, as três mensagens anteriores intactas (mesmos ids e textos) e a nova com `seq` 4; o total de conversas do contato no canal continua 1 (door 3, AC 27)
Proof: `src/modules/conversations/inbound.spec.ts -t "reopens a closed conversation and keeps its history"`

**C30** - A conversa `CLOSED` com `handler` `HUMAN` e `assigneeId` do comercial X é reaberta com `handler` `QUEUE` e `assigneeId` nulo (door 5, AC 28)
Proof: `src/modules/conversations/inbound.spec.ts -t "reopens a closed conversation and keeps its history"`

**C31** - A reabertura grava uma linha `conversation.reopen` com `actorType` `SYSTEM`, `actorUserId` nulo, `entityId` da conversa e `changes` exatamente `{ status: ['CLOSED', 'OPEN'], handler: ['HUMAN', 'QUEUE'], assigneeId: [X, null] }`, sem as chaves `text` e `phoneE164`; uma entrada numa conversa aberta não grava auditoria (door 5, AC 29)
Proof: `src/modules/conversations/inbound.spec.ts -t "records the reopen as a system action"`
Proof: `src/modules/conversations/inbound.spec.ts -t "appends the next seq to the open conversation"`

**C32** - 5 entradas em paralelo numa conversa `CLOSED` com `lastSeq` 2 deixam 1 conversa não encerrada (a mesma), 1 linha `conversation.reopen` e `seq` `[3..7]` (door 3, door 4, AC 30)
Proof: `src/modules/conversations/inbound.spec.ts -t "reopens once under concurrent messages"`

**C33** - A conversa nova (C17) e a reaberta (C30) ficam `QUEUE`, e `aiAvailable()` do `conversations` devolve `false` (AC 31)
Proof: `src/modules/conversations/conversation-state.spec.ts -t "has no ai before F4"`

### S5 - Saída · 2 files · ~30 KB · ~8k

**C34** - Numa conversa `OPEN` + `HUMAN` com `assigneeId` X e `lastSeq` 4, `sendMessage` por X grava `{ direction: OUTBOUND, author: HUMAN, authorUserId: X, seq: 5, deliveryStatus: SENT, externalId: null }` e deixa `status` `WAITING`, `lastSeq` 5 (door 4, AC 32)
Proof: `src/modules/conversations/outbound.spec.ts -t "sends as the assigned human"`

**C35** - `sendMessage` como `HUMAN` por um usuário Y (membro, não o `assigneeId`), e por X numa conversa `QUEUE`, lança `409 NOT_HANDLER`, sem mensagem nova e com `lastSeq` e `status` inalterados (door 4, AC 33)
Proof: `src/modules/conversations/outbound.spec.ts -t "refuses a human who does not handle the conversation"`

**C36** - `sendMessage` como `AI` numa conversa `QUEUE` e numa `HUMAN` lança `409 NOT_HANDLER` sem gravar; numa `AI` grava com `author` `AI` e `authorUserId` nulo (AC 34)
Proof: `src/modules/conversations/outbound.spec.ts -t "lets the ai send only while it handles the conversation"`

**C37** - `sendMessage` como `SYSTEM` grava em conversas `AI`, `QUEUE` e `HUMAN` (três conversas), cada uma ficando `WAITING` (AC 35)
Proof: `src/modules/conversations/outbound.spec.ts -t "lets the system send with any handler"`

**C38** - Numa conversa `CLOSED`, `sendMessage` como `HUMAN` (o próprio `assigneeId`), `AI` e `SYSTEM` lança `409 CONVERSATION_CLOSED`, sem mensagem nova e com `lastSeq` inalterado (AC 36)
Proof: `src/modules/conversations/outbound.spec.ts -t "refuses to send on a closed conversation"`

**C39** - `sendMessage` numa conversa de outra organização e num UUID inexistente lança `404 NOT_FOUND` (AC 37)
Proof: `src/modules/conversations/outbound.spec.ts -t "does not send outside the tenant"`

**C40** - `sendMessage` com texto `'  '` e com 65 537 caracteres lança `422 INVALID_MESSAGE` sem gravar; com 65 536 grava (AC 38)
Proof: `src/modules/conversations/outbound.spec.ts -t "bounds the outbound text"`

**C41** - 20 entradas e 20 saídas `SYSTEM` em paralelo na mesma conversa deixam 40 mensagens com `seq` `[1..40]` sem repetição (AC 39)
Proof: `src/modules/conversations/outbound.spec.ts -t "keeps seq contiguous across concurrent inbound and outbound"`

### S6 - Máquina de estados pura · 2 files · ~15 KB · ~4k

**C42** - A tabela de `status` × {entrada, saída, encerrar} (9 casos) dá exatamente: entrada → `OPEN` para os três; saída → `WAITING` de `OPEN` e `WAITING`, `FORBIDDEN_TRANSITION` de `CLOSED`; encerrar → `CLOSED` de `OPEN` e `WAITING`, `FORBIDDEN_TRANSITION` de `CLOSED` (door 5, AC 40)
Proof: `src/modules/conversations/conversation-state.spec.ts -t "maps every status transition"`

**C43** - A tabela `handlerAfter` com as 21 combinações de `handler` (3) × evento (7) dá exatamente o resultado de AC 41, caso a caso (door 5, AC 41)
Proof: `src/modules/conversations/conversation-state.spec.ts -t "maps every handler transition"`

**C44** - Para `QUEUE` e `HUMAN` e cada evento automático (`requestHuman`, `aiFailure`, `aiLimit`) o resultado nunca é `AI`; `reopenHandler({ aiAvailable: false })` nunca é `AI` (door 5, AC 42)
Proof: `src/modules/conversations/conversation-state.spec.ts -t "never hands a queued or human conversation to the ai automatically"`

**C45** - `reopenHandler({ aiAvailable: true })` = `AI`, `reopenHandler({ aiAvailable: false })` = `QUEUE` (door 5, AC 43)
Proof: `src/modules/conversations/conversation-state.spec.ts -t "reopens to the ai only when it is available"`

**C46** - `canSend` para autor (`CONTACT`, `AI`, `HUMAN` assignee, `HUMAN` outro, `SYSTEM`) × `handler` (3) × `status` (`OPEN`, `CLOSED`), 30 casos, dá exatamente a regra de AC 44 (door 5, AC 44)
Proof: `src/modules/conversations/conversation-state.spec.ts -t "decides who may send"`

### S7 - Carteira por dono · 4 files · ~45 KB · ~12k

**C47** - `scopeFor` para COMMERCIAL `u1` devolve `{ contact: { OR: [{ ownerId: 'u1' }, { ownerId: null }] }, conversation: { OR: [{ assigneeId: 'u1' }, { handler: 'QUEUE' }, { contact: { ownerId: 'u1' } }, { contact: { ownerId: null } }] } }`; para ADMIN e MANAGER `{ contact: {}, conversation: {} }` (door 8, AC 45)
Proof: `src/shared/scope.spec.ts -t "scopes contacts and conversations of the commercial role"`

**C48** - Os filtros de C47, aplicados com `withTenant` a um banco semeado com contatos de A, de B e sem dono, e conversas `HUMAN` de A, `HUMAN` de B com contato de B, `QUEUE` com contato de B, `AI` com contato sem dono, `AI` com contato de B e `HUMAN` de B com contato de A, devolvem ao COMMERCIAL A exatamente os contatos {A, sem dono} e as conversas {HUMAN de A, QUEUE, AI sem dono, HUMAN de B com contato de A}, e ao MANAGER todos (door 8, AC 45)
Proof: `src/modules/conversations/scope.spec.ts -t "filters contacts and conversations by portfolio"`

**C49** - `POST /api/v1/members/:id/transfer-portfolio` de X para Y, com X dono de 2 contatos, Z dono de 1 e 1 sem dono, responde `200 { transferred: 2 }`, deixa os 2 com `ownerId` Y e não muda o de Z nem o sem dono (door 9, AC 46)
Proof: `src/modules/organizations/member.spec.ts -t "moves the contacts of the portfolio"`

**C50** - Com o usuário de X também membro da organização B e dono de 1 contato em B, a transferência em A não muda o contato de B (AC 47)
Proof: `src/modules/organizations/member.spec.ts -t "does not move contacts of the other tenant"`

**C51** - `INSERT`/`UPDATE` de `Conversation.assigneeId` com um usuário sem `Member` na organização falha com `23503`; e `assigneeId` com `handler` diferente de `HUMAN`, ou `HUMAN` sem `assigneeId`, falha com `23514` em `Conversation_assignee_check`; `closedAt` sem `CLOSED` ou `CLOSED` sem `closedAt` falha com `23514` em `Conversation_closed_check` (door 3, AC 48)
Proof: `test/schema.spec.ts -t "ties the conversation assignee and closing to its state"`

### S8 - Fronteiras dos módulos e schema · 3 files · ~60 KB · ~15k

**C52** - O `architecture.spec` acha 0 violações na árvore atual e acha, em fontes sintéticas: `modules/conversations/x.ts` importando `../ai/index.ts` e `../channels/index.ts`; `modules/contacts/x.ts` importando `../conversations/index.ts`, `../channels/index.ts` e `../ai/index.ts` (uma violação cada) (AC 49)
Proof: `test/architecture.spec.ts -t "forbids the conversation module dependencies the adr rules out"`

**C53** - O `architecture.spec` acha um ciclo em fontes sintéticas `a → b → a` e `a → b → c → a` (via `index.ts`) e nenhum na árvore atual (door 9, AC 49)
Proof: `test/architecture.spec.ts -t "finds no import cycle between modules"`

**C54** - O `architecture.spec` acha 0 escritas em tabela alheia na árvore atual e acha exatamente uma violação em cada fonte sintética fora do módulo dono: `tx.conversation.create`, `tx.contact.createMany`, `tx.message.update`, `tx.conversation.updateMany`, `tx.channel.upsert`, `tx.contact.delete` e `tx.message.deleteMany`, e SQL cru `INSERT INTO "Message"`, `UPDATE "Contact"` e `DELETE FROM "Channel"`; `tx.channel.findUnique` em `modules/conversations/` e `tx.message.create` dentro de `modules/conversations/` não são violação (AC 50)
Proof: `test/architecture.spec.ts -t "lets each module write only its own tables"`

**C55** - No catálogo do worker: `Message` tem único `(organizationId, conversationId, seq)`; `Message_channel_externalId` é único em `(organizationId, channelId, externalId)` com predicado contendo `"externalId" IS NOT NULL`; `Conversation_one_open` é único em `(organizationId, contactId, channelId)` com predicado `status <> 'CLOSED'`; `Contact` tem único `(organizationId, phoneE164)`; `Channel_one_web_chat` é único em `(organizationId)` com predicado `kind = 'WEB_CHAT'` (conferido por `pg_get_indexdef`, colunas e predicado) (doors 1–4, AC 51)
Proof: `test/schema.spec.ts -t "has the conversation unique indexes of adr-013"`

**C56** - Os índices de C55 funcionam: duas conversas não encerradas do mesmo contato e canal → `23505`; uma `CLOSED` e uma `OPEN` → aceitas; duas mensagens com o mesmo `externalId` no mesmo canal → `23505`; duas com `externalId` nulo → aceitas; o mesmo `seq` na mesma conversa → `23505` (doors 3–4, AC 51)
Proof: `test/schema.spec.ts -t "enforces the conversation unique indexes"`

**C57** - `Channel`, `Contact`, `Conversation` e `Message` têm RLS `ENABLE` + `FORCE` + `tenant_isolation` com `app.tenant_id` no `USING` e no `WITH CHECK`, e o teste geral "every tenant table is protected by row security" continua verde (AC 52)
Proof: `test/schema.spec.ts -t "protects the conversation tables with tenant_isolation"`
Proof: `test/schema.spec.ts -t "every tenant table is protected by row security"`
Proof: `test/schema.spec.ts -t "every relation between tenant-scoped models uses a composite foreign key"`
Proof: `test/schema.spec.ts -t "foreign keys to unguarded tables never cascade"`

**C58** - As `CHECK`s de `Message`: `INBOUND` com autor ≠ `CONTACT`, `OUTBOUND` com autor `CONTACT`, `INBOUND` com `deliveryStatus`, `OUTBOUND` sem `deliveryStatus`, `HUMAN` sem `authorUserId`, `SYSTEM` com `authorUserId`, `TEXT` sem texto e `UNSUPPORTED` com texto falham com `23514`; e uma `Message` cujo `channelId` difere do da conversa falha com `23503` (door 4)
Proof: `test/schema.spec.ts -t "keeps a message consistent with its direction, author, kind and conversation"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| Landing doors (9) | door 1 C1, C6 · door 2 C14, C15 · door 3 C29, C51, C56 · door 4 C20, C21, C22, C58 · door 5 C42, C43, C44, C45, C46 · door 6 C8, C9, C10 · door 7 C3, C4, C5 · door 8 C47, C48 · door 9 C1, C49, C53 | - |
| Relations constraints (18) | um WEB_CHAT C6 · telefone único C12 · telefone E.164 C14 · dono é membro C15 · uma conversa aberta C56 · assignee ⇔ HUMAN C51 · closedAt ⇔ CLOSED C51 · assignee é membro C51 · seq único C56 · externalId único C56 · canal da mensagem = da conversa C58 · INBOUND ⇔ CONTACT C58 · INBOUND ⇔ sem deliveryStatus C58 · authorUserId ⇔ HUMAN C58 · TEXT ⇔ texto C58 · RLS nas 4 tabelas C57 · FKs compostas C57 · FK para tabela sem RLS sem cascade C57 | - |
| unique indexes of ADR-013 + canal (5) | `Message (org, conversation, seq)` C55 · `Message_channel_externalId` C55 · `Conversation_one_open` C55 · `Contact (org, phoneE164)` C55 · `Channel_one_web_chat` C55 | - |
| `receiveInbound` outcomes (10) | telefone novo C17 · conversa aberta C18 · WAITING → OPEN C19 · CLOSED → reabre C29 · duplicado C20 · telefone inválido C11 · texto inválido C26 · canal fora do tenant C27 · UNSUPPORTED C25 · sem externalId C28 | - |
| `sendMessage` author × outcome (9) | HUMAN assignee C34 · HUMAN outro C35 · HUMAN em QUEUE C35 · AI em AI C36 · AI em QUEUE/HUMAN C36 · SYSTEM qualquer handler C37 · CLOSED qualquer autor C38 · fora do tenant C39 · texto inválido C40 | - |
| error codes (5) | `INVALID_PHONE` C11 · `INVALID_MESSAGE` C26, C40 · `NOT_FOUND` C27, C39 · `NOT_HANDLER` C35, C36 · `CONVERSATION_CLOSED` C38 | - |
| status × event (9) | C42, table-driven over all 9 | - |
| handler × event (21) | C43, table-driven over all 21 | - |
| `canSend` cases (30) | C46, table-driven over all 30 | - |
| `normalizePhone` inputs (18) | `(11) 98765-4321` C8 · `11987654321` C8 · `011 98765-4321` C8 · `0 11 98765-4321` C8 · `5511987654321` C8 · `(21) 98765-4321` C8 · `(11) 3456-7890` C8 · `+1 202 456 1111` C9 · `+351 912 345 678` C9 · `123` C10 · `abc` C10 · `+55 11 1234` C10 · `ramal 2` C10 · vazio C10 · `(11) 2345-678` C10 · `(11) 1234-5678` C10 · `(11) 0876-4321` C10 · `98765-4321` C10 | - |
| concurrency scenarios (6) | duplicados C21 · 50 na mesma conversa C22 · conversas diferentes C23 · primeiro contato C24 · reabertura C32 · entrada + saída C41 | - |
| `scopeFor` roles (3) | ADMIN C47 · MANAGER C47, C48 · COMMERCIAL C47, C48 | - |
| conversa visível ao COMMERCIAL (6) | assignee C48 · QUEUE C48 · dono do contato C48 · contato sem dono C48 · HUMAN de B com contato de B excluída C48 · AI com contato de B excluída C48 | - |
| architecture rules (3) | arestas proibidas C52 · ciclos C53 · escrita em tabela alheia C54 | - |
| write forms (10) | `create` C54 · `createMany` C54 · `update` C54 · `updateMany` C54 · `upsert` C54 · `delete` C54 · `deleteMany` C54 · `INSERT` C54 · `UPDATE` C54 · `DELETE` C54 | - |
| migration backfill owners (2) | não-superuser (FORCE vale) C3 · superuser C4 | - |
| startup config: `setupOrganization` e `portfolioMoves` (1) | `buildApp` em `app.ts` (usado pelo `server.ts`, pelo `buildTestApp` e pelo `export-openapi.ts`) C1, C49 | - |

- No check claims a route status: the plan's Surface is `None`; `receiveInbound`/`sendMessage` are use cases, and every claim about them is proven at the use-case boundary against real PostgreSQL.

## Test policy

The repo answers both questions, so no new rows: CLAUDE.md fixes "regra pura: teste unitário cobrindo todas as transições" and "endpoint: integração com PostgreSQL real", and `shared/money.spec.ts` / `permissions.spec.ts` (pure, table-driven) and `member.spec.ts` (races against real PostgreSQL) are the precedents. Evidence for this feature:

- `conversation-state.ts`: 3 decision tables (status 9 cases, handler 21, `canSend` 30) -> decides, pure -> proven at its own layer, one case per row (C42, C43, C46)
- `inbound.ts` / `outbound.ts`: branch on channel, phone, text, conversation state, dedupe -> decides, reached across the use-case boundary -> proven against real PostgreSQL (C11–C41)
- `shared/phone.ts`: validity decision delegated to the library metadata -> decides -> proven at its own layer with discriminating inputs (C8–C10)

## Swept

- validation: C8, C9, C10, C11, C14, C26, C40
- failure modes: C2 (rollback leva o canal junto), C11, C26, C27 (nada gravado)
- idempotency: C20, C21, C28
- authorization: C7, C13, C27, C39 (tenant); C47, C48, C49, C50 (carteira); rotas n/a nesta feature
- concurrency: C21, C22, C23, C24, C32, C41
- data lifecycle: C3, C4, C5 (backfill do canal)
- dependency failure: n/a - nenhuma dependência externa; `libphonenumber-js` roda no processo, sem rede
- state transitions: C19, C29, C30, C42, C43, C44, C45, C46
- observability: C31 (a reabertura fica na trilha com autor `SYSTEM`)

## Handoff

- S1 15k + S2 10k + S3 12k + S4 8k + S5 8k + S6 4k + S7 12k + S8 15k ≈ 84k tokens (≈ 335 KB entre `schema.prisma`, a migration nova, `schema.spec.ts` 30 KB, `architecture.spec.ts` 11 KB, os módulos novos `channels`/`contacts`/`conversations` e seus specs, `onboarding`, `member`, `scope`, `phone`, `app.ts`), under the 150k budget - one builder

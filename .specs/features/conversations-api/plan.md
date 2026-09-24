# Conversations API

> F2, feature 3 de 4. Depende da `conversation-core` (tabelas, `scopeFor` por entidade). Perfil: standard (carteira em toda rota).

## Problem

Depois da `conversation-core`, as conversas existem no banco mas ninguém do painel consegue vê-las: não há rota de leitura. A F3 precisa dessa leitura para montar o inbox, e o critério da F2 pede a mensagem no socket do painel, que por sua vez só pode ser assinada por quem pode ler a conversa. Sem uma regra de leitura única, cada tela da F3 reimplementaria a carteira, e basta uma delas esquecer o filtro para um comercial ler o atendimento de outro (ADR-016: carteira alheia → 404).

Quando isso for entregue, o painel lista conversas e lê as mensagens de uma conversa, e cada papel vê só o que a carteira permite.

## Flow

Reusa `requireSession`, `requireTenant`, `requirePermission` e `currentTenant` do `organizations`, o `pageQuery`/`pageArgs`/`toPage` de `shared/pagination.ts` e o `scopeFor` da `conversation-core`.

1. `GET /api/v1/conversations` -> `conversations` (exists após a `conversation-core`) - `withTenant` + `scopeFor(ctx).conversation`, página por `id` decrescente; inclui contato e canal
2. `GET /api/v1/conversations/:id` -> `conversations` - `findReadableConversation(deps, ctx, id)`: a mesma consulta com `id`; fora do tenant ou da carteira → `404 NOT_FOUND`. É a função que a `realtime-events` usa para autorizar a room
3. `GET /api/v1/conversations/:id/messages` -> `conversations` - `findReadableConversation` e, se passar, as mensagens por `seq` decrescente com cursor pelo `id` (door 2)
4. out: `{ items, nextCursor }` ou o recurso; `pnpm api:generate` atualiza o Orval do web (sem tela nesta fase)

## Impact

| Front | What changes |
| --- | --- |
| domain | permissão nova `conversation:read`, dada a ADMIN, MANAGER e COMMERCIAL; muda o snapshot da matriz (`permissions.spec.ts`) e o `GET /me` (lista de permissões) |
| API | três `operationId` novos (`listConversations`, `getConversation`, `listConversationMessages`); o único consumidor é o web deste repo, regenerado pelo Orval |
| shared | `pageArgs` ganha a ordenação como parâmetro opcional; o padrão continua `id` decrescente, e os chamadores atuais não mudam |
| stored data | nada a migrar |

## Relations

`None - leitura das tabelas da conversation-core, sem mudança de forma`.

## Surface

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `GET /api/v1/conversations` | query `cursor?` (uuid), `limit?` (1–100, padrão 50) | `{ items: ConversationSummary[], nextCursor }`; `ConversationSummary` = `id` · `status` · `handler` · `assigneeId` · `contact { id, phoneE164, ownerId }` · `channel { id, kind, name }` · `lastSeq` · `lastMessageAt` · `closedAt` · `createdAt` | `200`, `400`, `401`, `403`, `404` |
| `GET /api/v1/conversations/:id` | params `id` (uuid) | `ConversationSummary` | `200`, `400`, `401`, `403`, `404` |
| `GET /api/v1/conversations/:id/messages` | params `id` (uuid); query `cursor?` (uuid da mensagem), `limit?` (1–100, padrão 50) | `{ items: Message[], nextCursor }`; `Message` = `id` · `seq` · `direction` · `author` · `authorUserId` · `kind` · `text` · `deliveryStatus` · `sentAt` · `createdAt` | `200`, `400`, `401`, `403`, `404` |

Status tirados do caminho real de cada handler: `400` do Zod (`.strict()` em query e params); `401` do `requireSession`; `403` do `requireTenant` (`TERMS_NOT_ACCEPTED`, `NO_ACTIVE_ORGANIZATION`) e do `requirePermission`; `404` do `requireTenant` quando o membro está inativo (`loadTenant` → `hidden`), e nas rotas com `:id` também da carteira ou do tenant.

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. Permissão de leitura | `'conversation:read'` em `PERMISSIONS` e nos três papéis; a carteira decide o que cada um vê | uma permissão por papel (`conversation:read-any`): duplicaria o que o `scopeFor` já decide, e a F3 usaria duas rotas para a mesma tela |
| 2. Ordem das mensagens | `orderBy: { seq: 'desc' }` com `cursor: { id }` (o cursor é o `id` da última mensagem da página anterior, como no resto da API); `pageArgs(query, orderBy?)` | cursor pelo `id` com ordem por `id`: o `id` (UUID v7) é gerado antes da trava da conversa, então duas entradas concorrentes podem ter `id` e `seq` em ordens diferentes; cursor pelo `seq`: um formato de cursor novo só para esta rota |
| 3. Formato de saída | `ConversationSummary` e `Message` acima, sem envelope, datas em ISO, nomes de enum literais | incluir as mensagens no detalhe da conversa: o detalhe cresceria sem limite, e a paginação já existe na rota de mensagens |

- Nada mais nesta mudança é difícil de reverter.

## Criteria

### S1: Listar conversas pela carteira (P1)

**Acceptance Criteria**

1. WHEN um ADMIN ou MANAGER chama `GET /api/v1/conversations` THEN the system SHALL devolver todas as conversas da organização ativa, com contato e canal, em `id` decrescente
2. WHEN um COMMERCIAL A chama `GET /api/v1/conversations` THEN the system SHALL devolver exatamente as conversas em que A é `assigneeId`, as em `QUEUE`, as de contato cujo dono é A e as de contato sem dono, e SHALL omitir a conversa `HUMAN` de B cujo contato é de B e a conversa `AI` de um contato de B
3. The system SHALL nunca devolver conversa de outra organização (`withTwoTenants`)
4. WHEN há mais conversas visíveis que o `limit` THEN the system SHALL devolver `limit` itens e um `nextCursor`, e a página seguinte SHALL continuar sem repetir nem pular item; na última página `nextCursor` SHALL ser `null`
5. WHEN a organização não tem conversas visíveis THEN the system SHALL devolver `{ items: [], nextCursor: null }`

### S2: Ler uma conversa e as mensagens (P1)

**Acceptance Criteria**

6. WHEN quem pode ler a conversa chama `GET /api/v1/conversations/:id` THEN the system SHALL devolver o `ConversationSummary` dela
7. IF a conversa é de outra organização ou está fora da carteira do COMMERCIAL THEN `GET /api/v1/conversations/:id` e `GET /api/v1/conversations/:id/messages` SHALL responder `404 NOT_FOUND`, com o mesmo corpo de uma conversa que não existe
8. WHEN `GET /api/v1/conversations/:id/messages` é chamado THEN the system SHALL devolver as mensagens da conversa em `seq` decrescente, mesmo quando a ordem dos `id` difere da ordem dos `seq`
9. WHEN há mais mensagens que o `limit` THEN the system SHALL paginar pelo cursor sem repetir nem pular mensagem, e a última página SHALL ter `nextCursor` `null`
10. The system SHALL devolver `text` nulo para a mensagem `UNSUPPORTED` e `deliveryStatus` nulo para a de entrada

### S3: Contrato das rotas (P1)

**Acceptance Criteria**

11. IF a query ou os params têm um campo desconhecido THEN cada uma das três rotas SHALL responder `400`
12. IF `limit` é 0, 101 ou não numérico, ou `cursor` ou `:id` não é UUID THEN the system SHALL responder `400`
13. IF não há sessão THEN as três rotas SHALL responder `401`
14. IF o usuário não aceitou os termos vigentes THEN as três rotas SHALL responder `403 TERMS_NOT_ACCEPTED`
15. IF o membro está inativo na organização ativa THEN as três rotas SHALL responder `404`
16. The system SHALL dar `conversation:read` a ADMIN, MANAGER e COMMERCIAL, e as três rotas SHALL declarar `requirePermission('conversation:read')` e um `operationId` estável
17. WHEN o contrato muda THEN `pnpm api:generate` SHALL gerar os hooks do Orval sem diff pendente no web

## Out of scope

| Excluded | Why |
| --- | --- |
| filtros (`status`, `handler`, "minhas", "fila") e ordem por `lastMessageAt` | F3, com o inbox que os consome; são parâmetros novos, sem quebrar o contrato |
| enviar mensagem, assumir, encerrar pelo painel | F3/F5 |
| tela do inbox | F3 |
| nome do contato | a coluna nasce na F4/F6 |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| telefone na resposta | `contact.phoneE164` sai para quem pode ler a conversa | é o identificador do cliente no painel (§9); os usuários são da própria corretora | y (usuário, 2026-09-24) |
| ordem da lista | `id` decrescente (conversa mais nova primeiro) | é o padrão de `shared/pagination.ts`; a F3 decide a ordem do inbox junto com os filtros | y (usuário, 2026-09-24) |

**Open questions:** none - all resolved or logged above.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| API `GET /api/v1/conversations*` | response shape | Surface; AC 1, AC 6, AC 8 |
| API `GET /api/v1/conversations*` | error shape and codes | existing - `{ error: { code, message } }` de `shared/errors.ts`; AC 7, AC 11–15 |
| API `GET /api/v1/conversations*` | who may call it | AC 2, AC 3, AC 16 |
| API `GET /api/v1/conversations*` | empty state | AC 5 |
| all new `GET /api/v1/conversations*` | versioning | existing - prefixo `/api/v1` |
| all new `GET /api/v1/conversations*` | rate limit | n/a - rotas autenticadas do painel; o MVP limita só `/api/auth/*` e o chat público (architecture.md §5) |

## Sources

- ADR-016 - carteira: COMMERCIAL vê a própria carteira + a fila; alheia → 404
- architecture.md §9 - prefixos, `{ items, nextCursor }`, erros, cursor com `limit` ≤ 100
- decisão do usuário (2026-09-24) - filtro de conversa do COMMERCIAL

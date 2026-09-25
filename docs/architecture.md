# Bens Seguros — Arquitetura do MVP

> Status: **aprovada** (pivot para o MVP, 2026-09-23).
> Requisitos: [`handoff.md`](./handoff.md). Análise e alternativas: [`architecture-analysis.md`](./architecture-analysis.md).
> Decisões: [`decisions/`](./decisions/) (ADR-011 a ADR-017 são as do MVP; onde um ADR e este doc divergirem, vale o ADR). Fases: [`roadmap.md`](./roadmap.md).

Princípio: **Complexity must be earned.** Cada processo, módulo, tabela ou abstração abaixo responde a
um requisito do handoff. Se não houver requisito, não entra.

**Como ler:** tudo marcado **[existe]** está no código hoje; **[Fx]** é alvo e nasce na fase `x` do
roadmap. Não crie pasta, tabela ou rota marcada [Fx] antes da fase.

---

## 0. Premissas de produto

- **Produto:** captura de leads + atendimento com IA + handoff humano + acompanhamento comercial de
  propostas, para corretoras de seguros (ADR-011). Não é um ERP: sem apólice, cotação, seguradoras,
  comissão, sinistro, documentos ou billing automatizado.
- **Escala:** 10–50 corretoras, até ~10 usuários cada, dezenas de conversas simultâneas.
- **Canais:** Web Chat (um link público por corretora) e WhatsApp via Baileys (N números por
  corretora).
- **Equipe:** 1 desenvolvedor + agentes. **Banco:** começa vazio, sem migração do legado.
- **Operação:** sem SLA; perda de dados e de mensagens não é aceitável.

## 1. Visão geral

```text
                   ┌──────────────────────── VPS (Docker Compose) ────────────────────────┐
 Painel (SPA) ─┐   │                                                                       │
 Web Chat     ─┼─▶ Caddy ── /api, /socket.io ──▶ api  (Fastify)                 [existe]  │
 (link público)│   │   └── /* ── SPA estática        ├── HTTP (REST + OpenAPI)             │
               │   │                                 ├── Socket.IO (painel [existe], visitantes [F3])
               │   │                                 ├── LISTEN app_events → socket [existe]│
               │   │                                 ├── pg-boss workers (e-mail [existe], IA [F4])
               │   │                                 └── modules/*                         │
 WhatsApp ◀────┼───┼──── whatsapp (mesma imagem, outro entrypoint)               [F9]      │
               │   │        ├── sessões Baileys (1 por canal), lock de dono único          │
               │   │        ├── recebe → persiste Message (+ NOTIFY) → enqueue            │
               │   │        └── workers `whatsapp.send` / `whatsapp.control`               │
               │   │                          PostgreSQL (RLS, pg-boss, eventos)  [existe] │
               │   └───────────────────────────────────────────────────────────────────────┘
               └── Provider de IA (1, atrás de adapter) [F4] · SMTP [existe] · Sentry [F11] · backup off-site [F11]
```

- **2 apps:** `apps/server` (toda a lógica) e `apps/web` (SPA estática, Vite + React + TanStack
  Router, ADR-009).
- **2 runtimes do mesmo código:** `api` [existe] e `whatsapp` [F9] (ADR-012). Não são serviços
  separados: mesma imagem, outro entrypoint.
- **1 banco:** PostgreSQL, também para filas (pg-boss) e eventos (`NOTIFY`). **Sem Redis.**
- **Mesma origem:** sem CORS em produção, cookie de sessão host-only.
- **Comunicação entre runtimes só pelo banco:** comandos por pg-boss, eventos por `NOTIFY`
  transacional (ADR-012). Nenhuma API HTTP interna.

---

## 2. Estrutura do repositório

```text
bens-seguros-v2/
├── apps/
│   ├── server/
│   │   ├── prisma/{schema.prisma, migrations/}
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/            # [existe] Better Auth, /me, org ativa, termos, gates de cadastro
│   │   │   │   ├── organizations/   # [existe] org, membros, convites, carteira, onboarding, branding; status [F10]
│   │   │   │   ├── audit/           # [existe] trilha sem PII
│   │   │   │   ├── billing/         # [existe, sai na F10] só o trial do onboarding (Plan/Subscription)
│   │   │   │   ├── contacts/        # [existe] contato por telefone E.164, dono; fila de leads [F5], consentimento [F3]
│   │   │   │   ├── conversations/   # [existe] conversa, mensagem, estado × responsável; handoff [F3/F5]
│   │   │   │   ├── channels/        # [existe] canal Web Chat padrão; conexão e adapters Web Chat [F3] e WhatsApp [F9]
│   │   │   │   ├── ai/              # [F4] provider, job ai.reply, tools, AiRun, limites
│   │   │   │   ├── sales/           # [F6] oportunidade, etapas do Kanban [F7]
│   │   │   │   ├── followups/       # [F8] próximo contato, pendências
│   │   │   │   └── metrics/         # [F11] consultas agregadas (sem tabela)
│   │   │   ├── infrastructure/
│   │   │   │   ├── database.ts      # [existe] PrismaClient (role da aplicação) + withTenant/withUser/withInvitation/withoutTenant
│   │   │   │   ├── queue.ts         # [existe] interface mínima sobre o pg-boss
│   │   │   │   ├── realtime.ts      # [existe] Socket.IO (auth por cookie, rooms)
│   │   │   │   ├── email.ts         # [existe] SMTP + render de React Email
│   │   │   │   └── events.ts        # [existe] notify(tx, …) + LISTEN app_events
│   │   │   ├── emails/              # [existe] templates React Email
│   │   │   ├── shared/              # [existe] config, errors, logger, request-context, permissions, scope, crypto, money, pagination, id
│   │   │   ├── app.ts               # [existe] buildApp(deps)
│   │   │   ├── dependencies.ts      # [existe] composição explícita
│   │   │   ├── workers.ts           # [existe] registro de workers e crons
│   │   │   ├── server.ts            # [existe] entrypoint `api`
│   │   │   └── whatsapp.ts          # [F9] entrypoint `whatsapp` (ADR-012)
│   │   ├── test/                    # [existe] app de teste, factories, withTwoTenants, schema e arquitetura
│   │   └── scripts/export-openapi.ts # [existe] openapi.json sem subir o server (base do `pnpm api:generate`)
│   └── web/
│       ├── src/{routes, features, components, api (Orval, gerado), lib, hooks}
│       └── e2e/                     # [existe] Playwright
├── docs/
├── docker-compose.yml               # dev: postgres, mailpit
├── docker-compose.prod.yml          # caddy, server, postgres, migrate (+ whatsapp [F9])
├── Caddyfile  .github/workflows/ci.yml  CLAUDE.md
```

### Anatomia de um módulo

O molde é o que `modules/organizations/` já faz:

```text
modules/organizations/
├── invitation.schema.ts    # Zod: inputs/outputs/params (fonte da verdade da API)
├── invitation.ts           # os use cases da entidade (1 use case = 1 função), Prisma inline no withTenant
├── invitation.routes.ts    # rotas Fastify: schema + permissão + chamada do use case
├── invitation.spec.ts      # integração com PostgreSQL real (app.inject)
├── membership.ts           # regra usada por mais de um arquivo do módulo
└── index.ts                # API pública para outros módulos
```

Arquivos que só aparecem quando o problema existe:

- `<entidade>.repository.ts`: quando a mesma query serve dois ou mais arquivos de use case. Recebe o
  `tx` de `db.withTenant` e aplica `scopeFor(ctx)` quando há carteira.
- `<entidade>.jobs.ts`: workers e crons do módulo.
- Regra rica ganha **só** o arquivo que pede, como função pura: `conversations/conversation-state.ts`
  [existe], `sales/opportunity-stages.ts` [F7].
- Uma integração usada por um só módulo mora no módulo: `ai/provider.ts` [F4] (único arquivo que
  importa o SDK do provider), `channels/whatsapp/baileys.ts` [F9].
- Um arquivo por use case só quando `<entidade>.ts` passar de ~300 linhas.

### Estilo de código do use case

```ts
// modules/contacts/contact.ts [F5]
export async function claimLead(deps: Deps, ctx: RequestContext, id: string) {
  return deps.db.withTenant(ctx, async (tx) => {                             // RLS: fora do withTenant a tabela falha
    const { count } = await tx.contact.updateMany({
      where: { id, ownerId: null },                                          // claim atômico (ADR-016)
      data: { ownerId: ctx.userId },
    })
    if (count === 0) throw await claimConflict(tx, id)                       // 409 se já tem dono; 404 se não existe no tenant
    await audit.record(tx, ctx, { action: 'lead.claim', entityId: id, changes: { ownerId: [null, ctx.userId] } })
    await notify(tx, { type: 'contact.updated', organizationId: ctx.organizationId, contactId: id })
  })                                                                         // o evento só sai se o commit acontecer
}
```

- Funções, não classes. `Deps` é um objeto simples montado em `dependencies.ts`. Sem container de DI.
- Regras que importam são **funções puras** testadas sem banco.
- O tipo de persistência é o tipo do Prisma. Sem mapper.
- Efeitos colaterais (job, evento) gravados **na mesma transação** (`enqueue(tx)`, `notify(tx)`).

---

## 3. Fronteiras dos módulos

| Módulo | Responsabilidade | Tabelas |
| --- | --- | --- |
| `auth` [existe] | Better Auth em `/api/auth/*` (e-mail/senha, verificação, reset, 2FA, rate limit persistido); sessão → contexto; `GET /me`; organização inicial da sessão (AD-010); termos do usuário do painel; Turnstile, e-mail temporário, `SIGNUP_MODE` | User, Session, Account, Verification, TwoFactor, TermsAcceptance, RateLimit |
| `organizations` [existe] | Org, membros, convites, quota de usuários, carteira, onboarding (ADMIN + `publicChatKey` + os passos que o `app.ts` injeta, como o canal Web Chat padrão, AD-017), troca da org ativa, papéis do MVP com "≥ 1 ADMIN ativo", branding (nome, logo, cor, saudação). [F10] `status`, `trialEndsAt`, `maxUsers` | Organization, Member, Invitation |
| `audit` [existe] | `record()` sem PII; ator usuário, `AI` ou `SYSTEM` (AD-013) | AuditLog |
| `billing` [existe, sai na F10] | Só `startTrial` do onboarding | Plan, Subscription |
| `contacts` [existe] | Contato por telefone E.164 (único por org), dono (`ownerId`) e a transferência de carteira; dados do lead, `leadStatus`, fila de leads, atribuição [F5/F6], consentimento [F3] | Contact, ConsentRecord [F3] |
| `conversations` [existe] | Conversa, mensagens, `status` × `handler`, `seq`, reabrir, `receiveInbound`/`sendMessage` (AD-015); handoff e encerrar [F3/F5] | Conversation, Message |
| `channels` [existe] | Canal Web Chat padrão de cada organização; canais `WHATSAPP`, status de conexão e adapters de entrada/entrega [F3/F9] | Channel, WhatsAppAuthState [F9] |
| `ai` [F4] | Orquestração (`ai.reply`), contexto, tools, adapter do provider, limites | AiRun |
| `sales` [F6] | Oportunidade (= proposta), etapas do Kanban [F7], ganho/perda | Opportunity |
| `followups` [F8] | Próximo contato, pendências por consulta | FollowUp |
| `metrics` [F11] | Consultas agregadas | — |

## 4. Regras de dependência

```text
routes ──▶ use cases ──▶ Prisma (tabelas do próprio módulo, inline ou repository)
                    ├──▶ modules/Y/index.ts (API pública de outro módulo)
                    └──▶ infrastructure/*, shared/*

shared/          não importa modules/ nem infrastructure/
infrastructure/  não importa modules/
modules/X        importa modules/Y apenas via modules/Y/index.ts

channels (adapters) ──▶ conversations ──▶ contacts
ai ──▶ conversations, contacts, sales (leitura)       sales ──▶ contacts
followups ──▶ contacts, sales                          todos ──▶ audit, organizations (leitura)
conversations NÃO importa ai (dispara o job `ai.reply`) nem o Baileys (o adapter chama conversations)
ai NÃO importa use cases de escrita de sales (ADR-015)
```

- **Um módulo só escreve nas próprias tabelas.** Leituras cruzadas simples (um `include` para
  exibição) são permitidas.
- **Sem ciclos.** Quem inicia um fluxo o orquestra.
- **Efeitos colaterais:** na mesma transação → chamada direta; repetíveis → job via
  `queue.enqueue(tx, …)`; aviso de realtime → `notify(tx, …)` de `infrastructure/events.ts` [existe]. Não há event bus.
- **Enforcement:** `test/architecture.spec.ts` falha em import profundo entre módulos, em import de
  `pg-boss` fora do `queue.ts`, em `app.tenant_id` fora do `database.ts`, em `id` num schema de
  entrada, em ciclo de imports entre módulos, nas arestas proibidas acima e em escrita numa tabela
  de outro módulo (AD-017).

---

## 5. Dados

### Modelo

```text
Organization [existe]  name, slug, publicChatKey, branding(logo bytea, cor, saudação)
                       [F4] aiEnabled, aiMonthlyTokenLimit · [F10] status, trialEndsAt, maxUsers
├─ Member [existe]      role ADMIN | MANAGER | COMMERCIAL
├─ Invitation, AuditLog [existe]
├─ Channel [existe]     kind: WEB_CHAT (WHATSAPP [F9]), name · [F9] phoneE164?, connectionStatus · [F4] aiEnabled
│    └─ WhatsAppAuthState [F9]  key, valueEncrypted
├─ Contact [existe]     phoneE164, ownerId? · [F4/F6] name?, email?, leadStatus, interest?, notes?   @@unique(org, phoneE164)
│    ├─ ConsentRecord [F3]  conversationId, channelId, noticeVersion, acceptedAt
│    ├─ Conversation [existe] channelId, status, handler, assigneeId?, lastSeq, lastMessageAt, closedAt?
│    │    └─ Message [existe] seq, direction, author: CONTACT|AI|HUMAN|SYSTEM, authorUserId?, kind, text?,
│    │                      deliveryStatus: PENDING|SENT|FAILED, externalId?, failureReason?
│    ├─ Opportunity [F6]    stage, title, estimatedValueCents?, ownerId, lostReason?, wonAt?, lostAt?
│    └─ FollowUp [F8]       opportunityId?, dueAt, note, assigneeId, doneAt?
└─ AiRun [F4]           conversationId, model, tokens, latencyMs, toolsCalled, outcome, errorCode
```

Toda tabela com `organizationId` segue o ADR-004: RLS `ENABLE` + `FORCE` e política
`tenant_isolation` na própria migration, FKs compostas `(id, organizationId)`, únicos incluindo
`organizationId`, FK para `Organization` `RESTRICT`, IDs UUID v7 gerados no server. O teste de schema
falha sem isso.

### Invariantes e mecanismos

| Invariante | Mecanismo |
| --- | --- |
| Telefone único por org | `@@unique([organizationId, phoneE164])`; normalização E.164 na borda (BR padrão) |
| Mensagem não duplica | único parcial `(org, channelId, externalId)` + `ON CONFLICT DO NOTHING` (ADR-013) |
| Ordem por conversa | `seq` via `UPDATE conversation SET lastSeq = lastSeq + 1 … RETURNING` |
| Uma conversa aberta por contato + canal | único parcial `(org, contactId, channelId) WHERE status <> 'CLOSED'` |
| Dois comerciais não assumem o mesmo lead/conversa | update condicional; 0 linhas → 409 (ADR-016) |
| Job/evento só existe se o dado existir | `enqueue(tx)` e `notify(tx)` na transação |
| Sempre ≥ 1 ADMIN ativo | checagem no use case com lock das linhas de `Member` (ADR-016) |
| Dinheiro | inteiros em centavos (`shared/money.ts`) |

### Máquina de estados da conversa (ADR-013)

```text
status:   OPEN ⇄ WAITING (WAITING = aguardando o cliente; automático)
          qualquer → CLOSED (ação humana)     CLOSED --mensagem do cliente--> OPEN (mesma conversa)
handler:  AI → QUEUE (request_human | falha | limite)      AI → HUMAN, QUEUE → HUMAN (assumir/atribuir)
          HUMAN → QUEUE (devolver à fila)                  HUMAN → AI (só ação explícita do humano)
          proibido: qualquer transição automática para AI a partir de QUEUE ou HUMAN
reabertura: AI se a IA estiver habilitada e no limite; senão QUEUE; nunca direto para o humano anterior
```

### Etapas da oportunidade (ADR-011) [F7]

`CAPTURE → QUOTE → PROTOCOL → INSPECTION → PAYMENT → POLICY_ISSUED | LOST`. Movimento livre;
`POLICY_ISSUED` = ganha; `LOST` exige motivo; reabrir permitido. Sem checklist, dados do bem ou cliente.

### Jobs e crons (pg-boss)

Todos os módulos usam **somente** `infrastructure/queue.ts`: `enqueue(tx, name, payload, { singletonKey?,
delaySeconds? })`, `registerWorker(name, handler, { concurrency, retries, backoff, dedupe })`,
`schedule(name, cron, { tz })`. A fila precisa de worker registrado antes do `enqueue`; `dedupe: true`
exige `singletonKey`. Handlers idempotentes (checam o estado antes de agir).

| Job | Runtime | Fase |
| --- | --- | --- |
| `email.send` | api | [existe] |
| `ai.reply` (dedupe por conversa) | api | [F4] |
| `whatsapp.send`, `whatsapp.control` | whatsapp | [F9] |

Jobs recebem `organizationId` no payload e abrem `withTenant` com ele. Follow-up não tem cron: a
pendência é uma consulta (`dueAt <= now AND doneAt IS NULL`).

### Rate limit (sem Redis)

- `/api/auth/*`: Better Auth com `storage: "database"` [existe].
- `/api/public/chat/*`: `@fastify/rate-limit` em memória por IP, por `publicChatKey` e por token de
  visitante; tamanho máximo de mensagem; Turnstile no início [F3] (ADR-014).

### Outros

- **Logo:** `bytea` ≤ 200 KB, tipo confirmado por magic bytes, servido com cache [existe]. Sem storage de
  objetos no MVP (ADR-011).
- **Encerramento de org:** `CLOSED` bloqueia sem apagar linhas (ADR-017). Anonimização LGPD depois.
- **Exportação futura:** o modelo relacional por tenant já permite; nada a construir agora.
- **Backup:** `pg_dump` diário cifrado off-site, 30 dias, restore testado [F11].

---

## 6. Runtimes

| Processo | Responsabilidade | Réplicas | Se cair |
| --- | --- | --- | --- |
| `caddy` [existe] | TLS, SPA, proxy `/api` e `/socket.io`, CSP | 1 | restart automático |
| `api` (`server.ts`) [existe] | HTTP, Socket.IO, `LISTEN` [F2], workers pg-boss (e-mail, IA) | 1 (stateless) | sessões WhatsApp seguem; mensagens seguem persistidas pelo runtime WhatsApp |
| `whatsapp` (`whatsapp.ts`) [F9] | Sessões Baileys, entrada, workers `whatsapp.*`, heartbeat | **exatamente 1** (advisory lock) | envios ficam `PENDING` e saem na volta |
| `migrate` [existe] | `prisma migrate deploy` one-shot | — | bloqueia o boot |
| `postgres` [existe] | dados, RLS, fila, eventos | 1 | backup + restore testado |

**Entrada (WhatsApp):** `messages.upsert` → `withTenant(org do canal)`: insere a mensagem
(idempotente), acha/reabre/cria a conversa, atribui `seq`; se `UNSUPPORTED`, grava a orientação e
enfileira o envio; se `handler = AI` (e consentimento dado), enfileira `ai.reply`; `notify` → COMMIT →
a API empurra pelo socket (≤ 2 s).

**Saída (humano ou IA):** `Message(PENDING)` + `enqueue(whatsapp.send)` + `notify` na mesma transação
→ o runtime envia → `SENT` ou `FAILED`. No Web Chat a mensagem vira `SENT` na própria transação.

Detalhes do runtime WhatsApp (lock, auth state, reconexão, QR, heartbeat, spike S1): ADR-012.

## 7. IA [F4]

Resumo do ADR-015: `ai/provider.ts` é o único arquivo com o SDK; job `ai.reply` fora da requisição;
contexto = instruções da org + campos do lead + últimas N mensagens (sem telefone); tools `get_lead`,
`update_lead_information` (allowlist, auditada com ator `AI`) e `request_human`, com
`ToolContext = { organizationId, conversationId, contactId }` fixado pelo sistema; nenhuma escrita em
`sales`; revalida `handler = AI` e mensagens novas antes de gravar; qualquer falha → `QUEUE`; `AiRun`
em todo desfecho; limite mensal por org.

---

## 8. Autenticação e autorização

### Autenticação (ADR-003) [existe]

```text
1. Cadastro   POST /api/auth/sign-up/email (Turnstile + e-mail temporário + SIGNUP_MODE) → verificação → sign-in
2. Onboarding POST /api/v1/onboarding → Organization (+ publicChatKey) + Member ADMIN + trial →
              Session.activeOrganizationId → termos + canal Web Chat padrão
3. Login      cookie httpOnly, Secure, SameSite=Lax, host-only; sessão em banco (3 dias, rotação 12 h)
4. Request    cookie → sessão → Member ativo em activeOrganizationId (requireTenant) → RequestContext
5. Troca org  POST /api/v1/me/active-organization → valida Member → atualiza a sessão (AD-010)
6. Socket     o handshake usa o mesmo cookie
7. Convite    e-mail → aceite pelo token (withInvitation, AD-007) → Member (checa a quota de usuários)
```

No web, `better-auth/react` só nas telas de auth; o resto vem de `GET /me`. **Quem autoriza é sempre o
server.**

### Isolamento de tenant (ADR-004) [existe]

1. O tenant vem só da sessão validada contra `Member`, nunca do request.
2. RLS forçado em toda tabela com `organizationId`; todo acesso passa por `db.withTenant(ctx, tx => …)`;
   as queries não filtram nem gravam `organizationId`. Registro de outro tenant → 404.
3. Runtime, testes e pg-boss conectam como `bens_app` (sem bypass); o boot recusa outro role.
4. Caminhos fora do tenant, cada um com AD: `withUser` (AD-006), `withInvitation` (AD-007),
   `withoutTenant` (identidade e fila). Novos no MVP: link público por `publicChatKey` [F3, ADR-014] e
   boot do runtime WhatsApp por função `SECURITY DEFINER` [F9, ADR-012].
5. `withTwoTenants()` obrigatório por endpoint; teste de schema.

### RBAC e carteira (ADR-005, ADR-016)

- `shared/permissions.ts`: `ROLE_PERMISSIONS` estático; toda rota declara `requirePermission(...)`
  (o boot falha sem ela em `/api/v1`); snapshot da matriz. Papéis: `ADMIN, MANAGER, COMMERCIAL` [existe], com "≥ 1 ADMIN ativo"
  garantido pelo use case (lock das linhas de ADMIN ativo, `422 LAST_ADMIN`).
- Carteira: COMMERCIAL vê a própria carteira **e a fila**; a carteira alheia → 404. MANAGER e ADMIN
  veem tudo. Aplicada por `scopeFor(ctx)` no repository [existe]: filtro por entidade, `ownerId` + fila
  (AD-014).
- Encerrar conversa: COMMERCIAL só as próprias; MANAGER e ADMIN qualquer uma.
- Organização suspensa ou trial expirado: escrita → 402, leitura liberada [F10, ADR-017].

### Controles de segurança

| Controle | Implementação |
| --- | --- |
| Validação | Zod `.strict()` em todo body, query e params |
| Mass assignment | mapeamento campo a campo para o Prisma |
| Headers | `@fastify/helmet` na API; CSP no Caddy para a SPA |
| CSRF | `SameSite=Lax` + checagem de `Origin` em todo método mutável (AD-004) |
| Canal público | tenant pelo `publicChatKey`, token de visitante, visitante só vê a própria sessão, rate limit, Turnstile (ADR-014) |
| Consentimento | `ConsentRecord` antes do atendimento: checkbox no Web Chat, opt-in "SIM" no WhatsApp (ADR-014) |
| IA | `ToolContext` fixo, allowlist de campos, sem SQL, sem escrita comercial, saída validada (ADR-015) |
| PII | `pino.redact`; auditoria sem PII (AD-013); telefone fora do prompt da IA |
| Auditoria | só ações sensíveis, lista fechada na AD-013 (ampliada por fase: atribuição, handoff, humano entra/sai, lead, oportunidade, etapa, follow-up) |
| Secrets | env validado no boot (`shared/config.ts`); chave própria para o auth state do WhatsApp [F9] |

---

## 9. API

- **Prefixos:** `/api/v1/*` (autenticado, com tenant), `/api/auth/*` (Better Auth),
  `/api/public/chat/*` [F3] (visitante do Web Chat). Sem webhooks no MVP.
- **REST com ações de domínio como sub-recursos**, por exemplo [F5–F7]:

  ```text
  POST /api/v1/contacts/:id/claim | /assign
  POST /api/v1/conversations/:id/take | /return-to-queue | /return-to-ai | /close
  POST /api/v1/opportunities/:id/move { stage } | /lose { reason } | /reopen
  ```

- **Rota:** schema Zod `.strict()`, `operationId` estável, `requirePermission(...)`.
- **Respostas:** o recurso direto, sem envelope. Listas: `{ items, nextCursor }`. Erros:
  `{ error: { code, message, details? } }`, mensagens em pt-BR, `code` estável.

  | Situação | Status |
  | --- | --- |
  | Zod | 400 |
  | Sem sessão | 401 |
  | Sem permissão | 403 |
  | Não encontrado / fora do tenant ou da carteira | 404 |
  | Conflito (P2002, já atribuído) | 409 |
  | Regra de negócio | 422 |
  | Organização suspensa / trial expirado | 402 |
  | Inesperado | 500 + `requestId` |

- **OpenAPI** gerado dos schemas Zod; `scripts/export-openapi.ts` sem subir o server; docs em
  `/api/docs` fora de produção. **Paginação por cursor**, `limit` máximo 100.

## 10. Frontend (ADR-009)

SPA Vite + React + TanStack Router (file-based), servida pelo Caddy.

```text
apps/web/src/routes/
├── (public)/        index, terms, privacy                                  [existe]
├── (auth)/          login, register, forgot/reset-password, verify-email, two-factor  [existe]
├── (onboarding)/    onboarding, select-org, accept-invitation              [existe]
├── terms-acceptance.tsx                                                    [existe]
├── _app.tsx         layout autenticado (beforeLoad: /me → redirect)        [existe]
├── _app/
│   ├── dashboard    [existe, placeholder] → métricas [F11]
│   ├── inbox        [F3] fila, minhas conversas, conversa
│   ├── contacts     [F6] leads com filtros (status, dono, fila)
│   ├── pipeline     [F7] Kanban (`dnd-kit`)
│   ├── followups    [F8] hoje / atrasados
│   └── settings/    organization (com link do Web Chat e branding), members, security [existe] · channels [F9]
└── c.$slug.tsx      [F3] Web Chat público (token de visitante, sem sessão do painel)
```

- **Contrato (ADR-007):** `pnpm api:generate` exporta o `openapi.json` e roda o Orval → hooks do
  TanStack Query + tipos em `src/api/` (gerado, não editar). O CI falha se estiver desatualizado.
- **Estado:** servidor → TanStack Query; filtros e paginação → search params validados com Zod;
  formulários → React Hook Form; sem store global.
- **Tempo real:** o socket entra nas rooms `org:*` e `user:*` [existe] e `conversation:*` (`conversation:join` com ack, autorizado a cada entrada) [existe]; eventos
  chamam `setQueryData`/`invalidateQueries`; ao reconectar, refaz as consultas (o banco é a fonte de
  verdade).
- **UI:** shadcn/ui + Tailwind 4; **4 estados** (vazio, carregando, erro, sucesso) em toda listagem.
- **Link público:** a API serve em `/c/:slug` um HTML mínimo com Open Graph (nome e logo da corretora)
  que carrega a SPA [F3].

## 11. Deploy e observabilidade (ADR-008)

```text
Local   docker compose up -d → postgres, mailpit
        pnpm dev             → server (tsx watch :3001) + web (vite :3000, proxy /api e /socket.io)
Build   apps/server/Dockerfile → uma imagem, dois entrypoints (server.js [existe], whatsapp.js [F9])
        apps/web → vite build → estáticos na imagem do Caddy
CI      install → biome → typecheck → vitest (postgres) → api:generate + diff → build → Playwright
CD      .github/workflows/deploy.yml [existe]: CI verde em main → imagens sha-<SHA> no GHCR → staging;
        tag vX.Y.Z → mesmas imagens → produção (aprovação); Run workflow → redeploy/rollback
VPS     caddy · server · whatsapp [F9] · postgres · migrate (one-shot), via scripts/deploy-remote.sh
        staging publicado: marco antes da F3 (tutorial em docs/runbooks/deploy.md)
```

- **Logs:** pino em JSON com `requestId` [existe], `organizationId` e `userId`; `conversationId` e
  `channelId` nos fluxos de mensagem [F2+].
- **Health:** `/api/health` [existe]; `/api/ready` (PG, pg-boss, heartbeat do WhatsApp) [F11].
- **Sentry** (api, whatsapp, web, sem PII), monitor externo, alertas (job esgotado, canal
  desconectado > 30 min, runtime WhatsApp sem heartbeat), backup + restore testado, runbooks [F11].
- **Fora até haver gatilho:** Redis, adapter do Socket.IO e 2+ réplicas da API, storage S3, vários
  providers de IA, Meta Cloud API, tracing distribuído (análise §6).

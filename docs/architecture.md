# Bens Seguros v2 — Arquitetura

> Status: **aprovada** (Fase 4, revisada após a sessão de decisões de 2026-09-21).
> Contexto: [`legacy-analysis.md`](./legacy-analysis.md). Decisões: [`decisions/`](./decisions/). Paridade: [`migration.md`](./migration.md).

Princípio: **Complexity must be earned.** Cada camada, pacote, serviço ou abstração abaixo resolve um problema concreto de hoje.

---

## 0. Premissas de produto

- **Escala:** dezenas de corretoras, cada uma com poucos usuários e 1 a 3 números de WhatsApp.
- **Equipe:** 1 desenvolvedor + agentes (Claude Code).
- **Banco:** começa vazio. Não há migração de dados do legado.
- **Escopo do 1º release:** paridade funcional com o legado, **exceto metas**.
- **Chat:** WhatsApp (Meta Cloud API **ou** Baileys, um tipo por canal) + widget web. Messenger, Instagram e Embedded Signup da Meta ficam adiados.
- **Billing no dia 1** (escopo núcleo, ver §5).

---

## 1. Visão geral

```text
                     ┌───────────────── VPS (Docker Compose) ─────────────────┐
 Browser ──HTTPS──▶ Caddy                                                      │
 (painel SPA,        :443   /api/*, /socket.io/*  ──▶ server (Fastify, :3001)  │
  widget, landing)          /*                    ──▶ arquivos estáticos do web │
                            │                          (build Vite, no Caddy)   │
                            │                                                   │
                            │   server ── Prisma ──▶ PostgreSQL                 │
                            │     ├── HTTP API (REST + OpenAPI)                 │
                            │     ├── Socket.IO (chat, notificações, widget)    │
                            │     ├── pg-boss (jobs + crons, no próprio PG)     │
                            │     ├── WhatsApp (sessões Baileys + Meta Cloud)   │
                            │     └── modules/* (regras de negócio)             │
                            └───────────────────────────────────────────────────┘
                                         │
   R2 (S3) · Resend · Anthropic · OpenAI · Meta Cloud API · WhatsApp Web (Baileys) · Asaas · ViaCEP · Consultar Placa · Sentry
```

- **2 apps:** `apps/server` (toda a lógica) e `apps/web` (SPA estática: Vite + React + TanStack Router).
- **1 banco:** PostgreSQL. **Sem Redis:** filas no pg-boss, rate limit em memória e no banco, cache de placa em tabela.
- **1 processo de runtime:** o `server`. O web não tem processo; é servido como arquivos estáticos pelo Caddy.
- **Mesma origem:** sem CORS em produção e com cookie de sessão host-only.

---

## 2. Estrutura do repositório

```text
bens-seguros-v2/
├── apps/
│   ├── server/
│   │   ├── prisma/{schema.prisma, migrations/, seed.ts}
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/            # Better Auth (identidade, sessão, 2FA), /me, org ativa, termos, gates de cadastro
│   │   │   │   ├── organizations/   # org, logo, membros, convites, transferência de carteira, onboarding
│   │   │   │   ├── contacts/        # leads (CHAT_ONLY → qualificado), identidade de canal, promoção a cliente
│   │   │   │   ├── clients/         # PF/PJ, CPF/CNPJ cifrado, LGPD, import/export
│   │   │   │   ├── insurers/
│   │   │   │   ├── proposals/       # funil, etapas, checklist, cotação (e-mail + PDF), CEP, placa, renovação automática
│   │   │   │   ├── policies/        # emissão (transacional), importação, cancelamento, expiração, endossos, PDF, export
│   │   │   │   ├── commissions/     # valores corretora/vendedor, workflow de repasse, estorno, export
│   │   │   │   ├── claims/          # sinistros + ocorrências
│   │   │   │   ├── assistances/
│   │   │   │   ├── documents/       # upload validado, download pré-assinado
│   │   │   │   ├── notifications/   # in-app + e-mail + push por socket + alertas diários
│   │   │   │   ├── dashboard/       # estatísticas + relatório PDF
│   │   │   │   ├── search/          # busca global
│   │   │   │   ├── audit/           # trilha de auditoria (sem PII) + listagem
│   │   │   │   ├── billing/         # planos, assinatura, faturas, Asaas, entitlements, uso de IA
│   │   │   │   ├── chat/            # canais, conversas, mensagens, fila, bot IA, whatsapp/, widget/
│   │   │   │   └── admin/           # super-admin: tenants, uso de IA, jobs com falha
│   │   │   ├── infrastructure/
│   │   │   │   ├── database.ts      # PrismaClient + guard de tenant
│   │   │   │   ├── queue.ts         # interface mínima sobre o pg-boss (enqueue/registerWorker/schedule)
│   │   │   │   ├── realtime.ts      # Socket.IO (auth por cookie, rooms)
│   │   │   │   ├── storage.ts       # S3/R2
│   │   │   │   ├── email.ts         # SMTP (Mailpit no dev, Resend em produção) + render de React Email
│   │   │   │   └── pdf.ts           # @react-pdf/renderer → Buffer
│   │   │   ├── emails/              # templates React Email (preview: pnpm email:dev)
│   │   │   ├── shared/
│   │   │   │   ├── config.ts  errors.ts  logger.ts  request-context.ts
│   │   │   │   ├── permissions.ts  crypto.ts  money.ts  pagination.ts
│   │   │   ├── app.ts               # buildApp(deps)
│   │   │   ├── dependencies.ts      # composição explícita
│   │   │   └── server.ts            # boot: config → deps → app → listen → workers
│   │   ├── test/                    # helpers: app de teste, factories, withTwoTenants, schema por worker
│   │   ├── scripts/export-openapi.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── routes/              # TanStack Router (file-based), ver §9
│       │   ├── features/<feature>/  # components/, hooks/ (wrappers de mutation), constants.ts, schemas.ts
│       │   ├── components/          # ui/ (shadcn), layout/, data-table/, form/, states/
│       │   ├── api/                 # GERADO pelo Orval (hooks + tipos), não editar
│       │   ├── lib/                 # http.ts (mutator do Orval), auth-client.ts, socket.ts, format.ts, zod-pt-br.ts
│       │   ├── hooks/               # use-me.ts, use-permission.ts
│       │   └── main.tsx
│       ├── public/widget.js         # loader do widget (injeta iframe)
│       ├── e2e/                     # Playwright
│       ├── orval.config.ts
│       ├── vite.config.ts
│       └── package.json
├── docs/
├── docker-compose.yml               # dev: postgres, minio, mailpit
├── docker-compose.prod.yml          # caddy (+ web estático), server, postgres, migrate
├── Caddyfile
├── .github/workflows/{ci,deploy}.yml
├── CLAUDE.md
├── biome.json  tsconfig.base.json  pnpm-workspace.yaml  package.json  .env.example
```

### Anatomia de um módulo

```text
modules/clients/
├── client.schema.ts        # Zod: inputs/outputs/params (fonte da verdade da API)
├── client.repository.ts    # funções Prisma; sempre recebem (db, ctx)
├── create-client.ts        # 1 use case = 1 função
├── update-client.ts  list-clients.ts  delete-client.ts  lgpd-delete-client.ts
├── client.presenter.ts     # mascaramento de PII por role (só onde há PII)
├── client.routes.ts        # rotas Fastify: schema + permissão + chamada do use case
├── client.jobs.ts          # workers/crons do módulo (quando houver)
├── index.ts                # API pública para outros módulos
└── client.spec.ts
```

- Regra rica ganha **somente** o arquivo que ela pede, como `proposals/proposal-stages.ts` e `commissions/commission-status.ts` (funções puras).
- O `chat/` tem subpastas (`channels/`, `conversations/`, `bot/`, `whatsapp/`, `widget/`) porque é o módulo mais complexo; a complexidade fica localizada ali.
- **Uma integração usada por um só módulo mora no módulo** (`billing/asaas.ts`, `chat/whatsapp/baileys.ts`, `proposals/vehicle-lookup.ts`).

### Estilo de código do use case

```ts
// modules/commissions/approve-commission.ts
export async function approveCommission(deps: Deps, ctx: RequestContext, id: string) {
  return deps.db.$transaction(async (tx) => {
    const commission = await commissionRepository.findById(tx, ctx, id)       // 404 fora do tenant/escopo
    const next = nextApprovalStatus(commission.status, ctx.permissions)       // puro; lança AppError
    const updated = await commissionRepository.setStatus(tx, ctx, id, next, { by: ctx.userId })
    await audit.record(tx, ctx, { action: 'commission.approve', entityId: id, changes: { status: [commission.status, next] } })
    if (next === 'APPROVED') await queue.enqueue(tx, 'notifications.commission-approved', { commissionId: id, organizationId: ctx.organizationId })
    return updated                                                            // o job só existe se o commit acontecer
  })
}
```

- Funções, não classes. `Deps` é um objeto simples montado em `dependencies.ts`. Não há container de DI nem decorators.
- As regras que importam são **funções puras** testadas sem banco.
- O tipo de persistência é o tipo do Prisma. Não há mapper.
- **Enfileiramento transacional:** `queue.enqueue(tx, …)` grava o job na mesma transação.

---

## 3. Fronteiras dos módulos

| Módulo | Responsabilidade | Tabelas |
| --- | --- | --- |
| `auth` | Better Auth em `/api/auth/*` (e-mail/senha, verificação, reset, 2FA, rate limit persistido); sessão → `RequestContext`; `GET /me`; troca de org ativa; aceite de termos versionado; Turnstile, bloqueio de e-mail temporário, `SIGNUP_MODE` | User, Session (+`activeOrganizationId`), Account, Verification, TwoFactor, TermsAcceptance, RateLimit |
| `organizations` | Org (nome, slug, logo), membros (role, ativo, `commissionSplitBp`), convites, OWNER único, limite de usuários do plano, **transferência de carteira**, onboarding (org + OWNER + trial) | Organization, Member, Invitation |
| `contacts` | Leads com `status: CHAT_ONLY \| QUALIFIED`; identidades de canal; atribuição de vendedor; promoção a cliente | Contact |
| `clients` | PF/PJ; `documentEncrypted` + `documentHash` (HMAC); endereço; soft delete; exclusão LGPD; import/export | Client |
| `insurers` | Seguradoras por org | Insurer |
| `proposals` | Funil (NEW_INSURANCE, RENEWAL, ENDORSEMENT); etapas; checklist por etapa+ramo com auto-complete por documento; detalhes do bem por ramo; cotação por e-mail com PDF; CEP; placa (cache em tabela); **renovação automática** | Proposal, ProposalChecklistItem, VehicleLookupCache |
| `policies` | Emissão transacional (apólice + comissão + proposta), **importação** (`origin: IMPORTED`, sem proposta), cancelamento, expiração, endossos, PDF, export | Policy, Endorsement |
| `commissions` | Valores da corretora e do vendedor congelados na emissão; workflow de repasse; estorno; export | Commission |
| `claims` | Sinistros (número sequencial por org), ocorrências | Claim, Occurrence, OrganizationCounter |
| `assistances` | Assistências | Assistance |
| `documents` | Upload (magic bytes), download pré-assinado, vínculo polimórfico, gatilho de auto-complete do checklist | Document |
| `notifications` | Criação, leitura, e-mail, push por socket, alertas diários | Notification |
| `dashboard` | Agregações e relatório PDF | — |
| `search` | Busca global | — |
| `audit` | `record()` sem PII; listagem | AuditLog |
| `billing` | Planos, assinatura, trial, faturas, métodos de pagamento, webhook/dunning Asaas, entitlements, quotas (usuários, números de WhatsApp), registro de uso de IA (sem cobrança) | Plan, Subscription, Invoice, PaymentMethod, WebhookEvent, AiUsageRecord |
| `chat` | Canais (Meta Cloud **ou** Baileys; widget), conversas, fila, mensagens, leituras, agentes de IA (Anthropic/OpenAI), tools do bot, webhooks da Meta | Channel, Conversation, Message, ConversationRead, AiAgent, WhatsAppAuthState |
| `admin` | Endpoints de super-admin (2FA obrigatório) | — |

## 4. Regras de dependência

```text
routes ──▶ use cases ──▶ repository do próprio módulo ──▶ Prisma
                    ├──▶ modules/Y/index.ts (API pública de outro módulo)
                    └──▶ infrastructure/*, shared/*

shared/          não importa modules/ nem infrastructure/
infrastructure/  não importa modules/
modules/X        importa modules/Y apenas via modules/Y/index.ts
```

- **Um módulo só escreve nas próprias tabelas.** Leituras cruzadas simples (um `include` para exibição) são permitidas no repository.
- **Sem ciclos.** Um fluxo que envolve vários módulos é orquestrado por quem o inicia. Exemplo: `policies.issuePolicy` chama `proposals.assertIssuable` e `commissions.createForPolicy`.
- **Efeitos colaterais:**
  - quando precisam da mesma transação: chamada direta;
  - quando podem ser repetidos: job via `queue.enqueue(tx, …)`, que também é transacional.
  - Não há event bus.
- **Enforcement:** `test/architecture.spec.ts` falha em import profundo entre módulos e em import direto de `pg-boss` fora de `infrastructure/queue.ts`.

## 5. Arquitetura de dados

### PostgreSQL (único serviço de dados)

O schema Prisma é derivado do legado, com estas decisões:

- **Chat no PG:** `Channel` (`provider: META_CLOUD | BAILEYS | WEB_WIDGET`), `Conversation`, `Message` (índice `(conversationId, createdAt DESC)`), `ConversationRead`, `AiAgent` (`provider: ANTHROPIC | OPENAI`, `model`), `WhatsAppAuthState` (jsonb cifrado).
- **Contato único:**
  - identidades `whatsappPhone` (E.164), `metaPsid`, `instagramId`, com índices únicos parciais por org;
  - `status: CHAT_ONLY | QUALIFIED`;
  - `salespersonId` opcional.
  - Um contato `CHAT_ONLY` não aparece no CRM. A qualificação acontece de 3 formas: tool `captureLead` do bot, ação do atendente, ou criação de proposta.
- **Client:** sem a coluna de documento em texto puro. `@@unique([organizationId, documentHash])`.
- **Policy:**
  - `proposalId` opcional + `origin: ISSUED | IMPORTED`;
  - `@@unique([organizationId, policyNumber])`;
  - `@@unique(proposalId)` quando não nulo.
- **Commission:**
  - `brokerageAmountCents`, `salespersonAmountCents`, `premiumCents`, `rateBp`, `splitBp`, todos congelados na criação;
  - índice único parcial `(policyId) WHERE isReversal = false`.
- **Proposal:** `renewalOfPolicyId` com índice único parcial (uma renovação ativa por apólice).
- **Organization:**
  - `renewalLeadDays` (padrão 45);
  - `billingManagedExternally`.
- **Claim:** número sequencial via `OrganizationCounter(organizationId, key, value)` com `UPDATE … RETURNING` na transação.
- **AuditLog:** `changes` jsonb **sem PII**. Campos de PII são registrados como `"[alterado]"`.
- **FKs compostas com `organizationId`** em toda relação entre models tenant-scoped (teste de schema, ADR-004).
- **IDs:** UUID v7 (ordenáveis, bons para cursor).
- **Removidos:** `Goal`, `AuditLogArchive`, contato duplicado.
- **Migrations:** `prisma migrate`. Em produção, o serviço one-shot `migrate` roda `migrate deploy` antes do server.
- **Retenção:** job semanal apaga `Message` com mais de 730 dias, `AuditLog` com mais de 5 anos e `VehicleLookupCache` expirado.

### Jobs e crons (pg-boss, no processo do server)

Todos os módulos usam **somente** `infrastructure/queue.ts`:

```ts
enqueue(tx, name, payload, { singletonKey?, delaySeconds? })
registerWorker(name, handler, { concurrency, retries, backoff, dedupe })
schedule(name, cron, { tz: 'America/Sao_Paulo' })
```

A interface expõe apenas o que o BullMQ também consegue fazer, então uma troca futura fica restrita a esse arquivo (ADR-006). Os handlers são **idempotentes**.

- A fila precisa ter worker registrado antes do `enqueue`/`schedule` (o `queue.ts` recusa fila desconhecida).
- `dedupe: true` declara a fila com a política `short` do pg-boss. Nela, o `singletonKey` é **obrigatório**: sem chave, a fila guardaria um único job e descartaria os outros em silêncio. Numa fila sem `dedupe`, passar `singletonKey` também é erro (não deduplicaria).

| Job | Tipo |
| --- | --- |
| `email.send` | on-demand, retry |
| `notifications.daily-alerts` | cron 08:00 |
| `policies.expire` | cron 02:00 |
| `proposals.create-renewals` | cron 06:00 (idempotente por apólice) |
| `clients.import`, `policies.import` | on-demand |
| `billing.trial-expiry`, `billing.subscriptions-expiry`, `billing.dunning`, `billing.webhook-reconcile` | cron horário |
| `chat.process-incoming`, `chat.send`, `chat.bot-reply` | on-demand |
| `chat.auto-close` | cron horário |
| `chat.meta-token-refresh` | cron diário |
| `retention.purge` | cron semanal |

Os jobs recebem `organizationId` no payload e rodam com um `RequestContext` de sistema, pelo mesmo caminho de repository (sem bypass).

### Rate limit (sem Redis)

- `/api/auth/*`: rate limit do Better Auth com `storage: "database"`. É persistido, então sobrevive a restart.
- Resto da API, widget e lookup de placa: `@fastify/rate-limit` em memória (uma instância).
- Com mais de 1 instância: store do `@fastify/rate-limit` no PG (ver ADR-006).

### Storage

- API S3: R2 em produção, **MinIO** no dev.
- Chaves `org/{organizationId}/{entity}/{id}/{uuid}-{filename}`.
- Download via URL pré-assinada de 5 min, depois de checar a permissão.
- A mídia do chat vai direto para o storage.

## 6. Autenticação

**Better Auth** cuida apenas de identidade, sessão e 2FA (ADR-003). Organizações, membros e convites são código próprio.

```text
1. Cadastro   POST /api/auth/sign-up/email  (preHandler: Turnstile + e-mail temporário + SIGNUP_MODE)
              → e-mail de verificação (React Email/Resend) → auto sign-in
2. Onboarding POST /api/v1/onboarding → Organization + Member(OWNER) + Subscription(TRIALING)
              → Session.activeOrganizationId = org → aceite de termos
3. Login      POST /api/auth/sign-in/email → cookie httpOnly, Secure, SameSite=Lax, host-only
4. Request    cookie → getSession() → Member ativo em session.activeOrganizationId → RequestContext
                 { userId, organizationId, role, permissions, entitlements, isSuperAdmin, requestId }
5. Troca org  POST /api/v1/me/active-organization { organizationId } → valida Member → atualiza a sessão
6. Socket     o handshake envia o mesmo cookie → a mesma resolução do passo 4
7. Convite    POST /api/v1/invitations → e-mail → /accept-invitation?token → cria Member (checa a quota de usuários)
```

- A sessão expira em 3 dias e rotaciona a cada 12h. `cookieCache` desligado, para revogação imediata.
- Um usuário pode pertencer a várias organizações (`MAX_ORGS_PER_USER`, padrão 3).
- Super-admin: `isSuperAdmin` + 2FA verificado.
- No web: `better-auth/react` só nas telas de login e cadastro. O resto vem de `GET /me`. O guard das rotas é `beforeLoad` do TanStack Router (§9). **Quem autoriza é sempre o server.**

## 7. Autorização

### RBAC

`shared/permissions.ts` define `ROLE_PERMISSIONS: Record<Role, readonly Permission[]>`, com permissões nomeadas por ação de negócio (ADR-005). Na rota: `preHandler: [requirePermission('proposal:write')]`. Um teste garante que toda rota declara permissão e que a matriz role × permissão bate com o snapshot.

### Carteira do vendedor (ADR-010)

- **COMMERCIAL** vê e edita **apenas a própria carteira**:
  - contatos e propostas com `salespersonId = ctx.userId`;
  - clientes ligados a esses contatos;
  - apólices, sinistros, assistências e comissões dessas apólices.
- Aplicado por `scopeFor(ctx)` em todos os repositories envolvidos. Registro fora da carteira retorna **404**.
- **Transferência de carteira** (ADMIN/OWNER): move contatos, propostas abertas e conversas de um membro para outro numa transação, com auditoria.
- **Chat:**
  - A fila `WAITING_HUMAN` é compartilhada entre quem tem `chat:attend`.
  - Contato com vendedor → a conversa vai para a fila desse vendedor.
  - Conversa assumida → visível para quem assumiu e para ADMIN/MANAGER/OWNER.
  - Quem assume a conversa de um contato sem vendedor vira o vendedor quando o lead é qualificado.

### Entitlements do plano

Checagem separada do RBAC:
- `requireFeature('ai')`;
- `assertQuota(ctx, 'users' | 'whatsappNumbers')`;
- bloqueio `402` quando a assinatura está `PAST_DUE`/`EXPIRED`, exceto se `billingManagedExternally`.

A assinatura é lida na mesma query da membership.

### Isolamento de tenant (ADR-004)

1. O tenant vem só da sessão validada contra `Member`.
2. Todo repository recebe `ctx` e filtra `organizationId` (+ `scopeFor`). Registro de outro tenant retorna 404.
3. **Guard do Prisma:** lança erro em operação sobre modelo tenant-scoped sem `organizationId` no `where`.
4. FKs compostas com `organizationId` em toda relação entre models tenant-scoped.
5. Referências vindas do input são carregadas com escopo antes do uso.
6. `withTwoTenants()`: teste cross-tenant obrigatório por endpoint.

Não há RLS. Os gatilhos para adotá-lo estão no ADR-004.

### Controles de segurança

| Controle | Implementação |
| --- | --- |
| Validação | Zod `.strict()` em todo body, query e params |
| Mass assignment | mapeamento campo a campo para o Prisma |
| Headers | `@fastify/helmet` na API. CSP e `X-Frame-Options` no Caddy para a SPA; `frame-ancestors *` só em `/embed/*` |
| CORS | desligado em produção; em dev, o proxy do Vite mantém a mesma origem |
| CSRF | `SameSite=Lax` + checagem de `Origin` em métodos mutáveis |
| Rate limit | ver §5 |
| Uploads | limite de tamanho, allowlist de MIME confirmada por magic bytes, `Content-Disposition: attachment` |
| PII | CPF/CNPJ cifrado; presenter por role; `pino.redact`; Sentry `beforeSend`; **redação de PII antes do provider de IA** (as tools recebem o dado real no server) |
| Auditoria | só ações sensíveis, **sem PII**: login, mudança de role, transferência de carteira, aprovação/pagamento/estorno de comissão, emissão/importação/cancelamento de apólice, exclusão LGPD, acesso a documento, mudanças de billing |
| Webhooks | Meta (`X-Hub-Signature-256`), Asaas (token com rotação); dedup em `WebhookEvent` |
| Secrets | env validado no boot. Chaves separadas: sessão, cifra de PII, HMAC de busca, cifra de credenciais de canal |

## 8. Arquitetura da API

- **Prefixos:** `/api/v1/*` (autenticado), `/api/auth/*` (Better Auth), `/api/public/*` (widget, convite, planos), `/api/webhooks/*`.
- **REST com ações de domínio como sub-recursos:**

  ```text
  GET    /api/v1/proposals?stage=QUOTE&cursor=…&limit=50
  POST   /api/v1/proposals
  PATCH  /api/v1/proposals/:id
  POST   /api/v1/proposals/:id/advance | /lose | /reopen | /send-quote
  PUT    /api/v1/proposals/:id/checklist/:itemKey
  POST   /api/v1/policies                 # emissão a partir de proposta
  POST   /api/v1/policies/import          # CSV → job
  POST   /api/v1/commissions/:id/approve | /reject | /pay | /reverse
  POST   /api/v1/members/:id/transfer-portfolio { toMemberId }
  ```

- **Rota:**

  ```ts
  app.post('/api/v1/proposals/:id/advance', {
    schema: { params: idParams, response: { 200: proposalOutput }, tags: ['Proposals'], operationId: 'advanceProposal' },
    preHandler: [requirePermission('proposal:write')],
  }, (req) => advanceProposal(deps, req.ctx, req.params.id))
  ```

- **Respostas:** o recurso direto, sem envelope. Listas: `{ items, nextCursor }`.
- **Erros:** `{ error: { code, message, details? } }`.

  | Situação | Status |
  | --- | --- |
  | Zod | 400 |
  | Sem sessão | 401 |
  | Sem permissão | 403 |
  | Não encontrado / fora do escopo | 404 |
  | P2002 | 409 |
  | Regra de negócio | 422 |
  | Plano / quota | 402 |
  | Inesperado | 500 + Sentry + `requestId` |

  Mensagens em pt-BR, `code` estável.
- **OpenAPI:** gerado pelos schemas Zod (`@fastify/swagger` + `fastify-type-provider-zod`). `operationId` obrigatório e estável, porque dá nome aos hooks do Orval. `scripts/export-openapi.ts` grava o `openapi.json` **sem subir o server**. Docs em `/api/docs` só fora de produção.
- **Paginação por cursor**, com `limit` máximo de 100. **Export CSV** em streaming síncrono.

## 9. Arquitetura do frontend (ADR-009)

**Vite + React + TanStack Router** (file-based), como SPA estática servida pelo Caddy.

```text
apps/web/src/routes/
├── __root.tsx
├── (public)/                  index (landing), terms, privacy, pricing   ← pré-renderizadas no build
├── (auth)/                    login, register, forgot-password, reset-password, verify-email
├── (onboarding)/              onboarding, select-org, select-plan, accept-invitation
├── _app.tsx                   layout autenticado (beforeLoad: ensureQueryData(/me) → redirect /login)
├── _app/
│   ├── dashboard  contacts  clients  proposals  policies  endorsements
│   ├── claims  assistances  commissions  insurers  chat  audit
│   └── settings/              organization, members, channels, ai-agents, billing
├── billing.expired.tsx
└── embed.chat.$channelId.tsx  # widget em iframe (sem sessão do painel, token de visitante)
```

- **Contrato (ADR-007):** `pnpm api:generate` exporta o `openapi.json` e roda o Orval, que gera em `src/api/` hooks do TanStack Query + tipos (**sem Zod**). O mutator em `lib/http.ts` usa `fetch` com `credentials: 'include'` e converte `{ error }` em `ApiError`. O CI falha se o código gerado estiver desatualizado.
- **Fluxo de dados:**
  - rota → `loader` com `queryClient.ensureQueryData` (prefetch) → componente com o hook do Orval;
  - mutations embrulhadas em `features/*/hooks` (toast + invalidação).
- **Estado:**
  - servidor → TanStack Query;
  - filtros e paginação → **search params do TanStack Router validados com Zod** (sem `nuqs`);
  - formulários → React Hook Form + schemas em `features/*/schemas.ts`;
  - local → `useState`.
  - Sem store global.
- **Tempo real:** o socket entra nas rooms `org:*` e `user:*`. Eventos de chat e notificação chamam `setQueryData`/`invalidateQueries`.
- **UI:**
  - shadcn/ui + Tailwind 4, com o design do legado (Inter, teal `#1f4b5f`, gold `#b98927`, oklch, dark mode);
  - TanStack Table; `dnd-kit` no Kanban; `recharts`;
  - os 4 estados em toda listagem.
- **Code splitting** por rota (automático no plugin do TanStack Router).
- **Páginas públicas:** pré-renderizadas no build em HTML estático, para SEO.
- **Widget:** `public/widget.js` (~1 KB) injeta `<iframe src="/embed/chat/{channelId}">`. A rota embed usa `/api/public/widget/*` + o namespace Socket.IO `/widget`.

## 10. Deploy (ADR-008)

```text
Local   docker compose up -d   → postgres, minio, mailpit
        pnpm dev               → server (tsx watch :3001) + web (vite :3000, proxy /api e /socket.io → :3001)

Build   apps/server/Dockerfile → node:24-slim, multi-stage (deps → prisma generate → tsc → runtime não-root)
        apps/web               → `vite build` → dist/ copiado para a imagem do Caddy (caddy + estáticos)

CI      install → biome → typecheck → vitest (service: postgres) → api:generate + checar diff
        → build → Playwright (5–6 fluxos) em main

Deploy  tag v* → imagens `server` e `caddy-web` no GHCR → SSH → pull → run --rm migrate → up -d
        → health check /api/ready → rollback = redeploy da tag anterior

VPS     caddy (TLS + SPA + proxy) · server · postgres · migrate (one-shot)
        backup: pg_dump diário → R2 (30 dias) + teste de restore mensal
```

### Observabilidade

- **Logs:** pino em JSON no stdout, com `requestId`, `organizationId` e `userId`; rotação do Docker.
- **Sentry** no server e no web, com alertas por e-mail/Telegram (erro novo, pico).
- **Monitor externo de uptime** em `/api/ready`, que checa o PG e se os workers do pg-boss estão ativos.
- **Alertas operacionais para o super-admin** (notificação + e-mail):
  - job falhou em todas as tentativas;
  - canal WhatsApp desconectado há mais de 30 min;
  - webhook do Asaas falhou.
- **Tela de admin:** jobs com falha, com opção de re-executar.

## 11. Mapeamento legado → v2

| Legado | v2 |
| --- | --- |
| `apps/server/src/routes/v1/<x>/*` | `modules/<x>/<x>.routes.ts` |
| `apps/server/src/routes/internal/*` (HMAC) | removido (chamadas diretas) |
| `apps/server/src/middlewares/*` | `modules/auth`, `shared/permissions.ts`, plugins no `app.ts` |
| `apps/server/src/pdf-templates/*` | `proposals/proposal-quote.pdf.tsx`, `policies/policy-summary.pdf.tsx`, `dashboard/dashboard-report.pdf.tsx` |
| `packages/core/.../sales/leads` | `modules/contacts` |
| `packages/core/.../sales/proposals` | `modules/proposals` |
| `packages/core/.../sales/policies` (+ endorsement) | `modules/policies` |
| `packages/core/.../client` | `modules/clients` |
| `packages/core/.../commission` | `modules/commissions` |
| `packages/core/.../servicing/{claims,occurrences}` | `modules/claims` |
| `packages/core/.../servicing/assistance` | `modules/assistances` |
| `packages/core/.../{document,insurer,notification,search}` | `modules/{documents,insurers,notifications,search}` |
| `packages/core/.../performance/dashboard` | `modules/dashboard` |
| `packages/core/.../performance/goals` | **removido** (fora do escopo) |
| `packages/core/.../workspace` | `modules/organizations` |
| `packages/core/.../billing` + `billing-port` + `asaas-adapter` | `modules/billing` (+ `asaas.ts`) |
| `packages/core/src/platform/audit` | `modules/audit` |
| `packages/core/src/platform/lookups/{cep,vehicle}` | `proposals/{cep-lookup,vehicle-lookup}.ts` |
| `packages/core/src/platform/storage` | `infrastructure/storage.ts` |
| `packages/auth` (Better Auth + CASL) | `modules/auth` + `shared/permissions.ts` |
| `packages/env` | `shared/config.ts` (server) + `import.meta.env` validado (web) |
| `packages/db` | `apps/server/prisma` (sem RLS) |
| `packages/db-chat` | modelos Prisma |
| `packages/shared`, `packages/ai` | server; `ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai` em `chat/bot` |
| `packages/aggilizador` | removido |
| `apps/chat-server` + `apps/chat-worker` | `modules/chat` + `infrastructure/realtime.ts` + jobs `chat.*` |
| `apps/worker` | `*.jobs.ts` por módulo + pg-boss |
| `apps/widget` (Vite) | rota `embed.chat.$channelId` + `public/widget.js` |
| `apps/web` (Next.js 16) | `apps/web` (Vite + TanStack Router) |
| `apps/web/src/api` (Orval) | `apps/web/src/api` (Orval enxuto, sem Zod) |
| Redis (BullMQ, adapter, pub/sub, cache) | removido: pg-boss, rate limit em memória/BD, cache em tabela |
| nginx, Vercel | Caddy (proxy + SPA) |

## 12. Complexidade removida

**Processos e infraestrutura:**

- `chat-server`, `chat-worker`, `worker`, `widget`, e o runtime Node do web.
- MongoDB (replica set, Mongoose, `mongo-init`).
- **Redis.**
- nginx, Vercel.
- Deploys separados.

**Dados:**

- RLS: `rls-policies.sql`, a role `app_user`, o `prismaAdmin` e o passo manual após `db:reset`.
- `AuditLogArchive` e particionamento.
- Migração de mídia do chat.
- Cache de assinatura + pub/sub de invalidação.
- Contato duplicado PG ↔ Mongo.
- Proposta sintética na importação.
- Metas.

**Código:**

- 11 packages.
- tsyringe, decorators, CASL.
- Entidades com construtor privado, mappers, ports/adapters.
- Rotas internas HMAC, JWT de socket.
- Envelope de resposta.
- Zod gerado pelo Orval.
- Zustand, framer-motion, `nuqs`.
- Wrapper de IA, port de billing, `aggilizador`.
- `"use client"` × Server Components.

**Tooling:** Turborepo, tsup, dependency-cruiser, jscpd, `.quality-gates`, testes de arquitetura extensos, Husky.

**Adiados até haver necessidade:** Messenger, Instagram, Embedded Signup, cobrança de excedente de IA, quotas além de usuários e números de WhatsApp, plano anual, worker separado para o Baileys, mais de 1 instância do server, RLS, OpenTelemetry, logs centralizados.

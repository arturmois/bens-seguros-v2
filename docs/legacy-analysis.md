> **Arquivado em 2026-09-23 (ADR-011):** análise feita para o rebuild do ERP. Continua valendo só como referência de comportamento do legado (etapas do Kanban, tools do bot, reconexão do Baileys); arquitetura e escopo do MVP estão em `docs/architecture.md` e `docs/roadmap.md`.

# Análise do sistema legado (Fases 1 e 2)

Fonte: `github.com/arturmois/bens-seguros`, commit `7166ab4`. Tratado como **implementação de referência**: vale como fonte de requisitos e regras de negócio, não como fonte de arquitetura.

Tamanho: ~138k LOC de TypeScript sem testes, 305 arquivos de teste, 6 apps, 11 packages, ~116 endpoints no `server` e ~47 no `chat-server`. Dos 88k LOC do `web`, ~37k são código gerado pelo Orval.

---

## Fase 1 — Mapeamento

### 1.1 Produto

**Objetivo:** ERP SaaS multi-tenant para corretoras de seguros brasileiras. Cobre o ciclo comercial (lead → cotação → proposta → apólice), o pós-venda (sinistros, assistências, endossos, renovações), a gestão financeira do corretor (comissões) e o atendimento via WhatsApp/web chat com bot de IA.

**Usuários (por organização/corretora):**

| Role | Quem é | Escopo no código atual |
| --- | --- | --- |
| OWNER | Dono da corretora | `manage all` |
| ADMIN | Gestão | tudo operacional, comissões, membros, auditoria, exclusão LGPD |
| MANAGER | Gerente | tudo operacional e comissões, sem LGPD e sem gestão de membros |
| COMMERCIAL | Vendedor | cria/edita contatos, clientes e propostas; lê apólices e sinistros; aprova comissão (etapa comercial) |
| VIEWER | Parceiro, leitura | leitura de tudo, exceto seguradoras |

Também existe o **super admin** da plataforma (`User.isSuperAdmin`, 2FA obrigatório), que lista tenants e uso de IA.

**Principais jornadas:**

1. **Onboarding:** cadastro (Turnstile, bloqueio de e-mail temporário, `SIGNUP_MODE`), verificação de e-mail, criação da organização com trial, escolha de plano, aceite de termos/privacidade (versionado).
2. **Convite de equipe:** convite por e-mail com role → aceite → membro.
3. **Funil comercial:** contato/lead (manual, WhatsApp, widget, import) → proposta em quadro Kanban (`CAPTURE → QUOTE → PROTOCOL → INSPECTION → PAYMENT → POLICY_ISSUED | LOST`) com checklist por etapa e ramo → envio de cotação por e-mail com PDF → promoção do contato a cliente (CPF/CNPJ) → emissão da apólice → comissão gerada automaticamente.
4. **Renovação e endosso:** propostas com `boardType` `RENEWAL` (a partir de apólice vencendo) e `ENDORSEMENT` (começa em `QUOTE`, guarda um snapshot da apólice de origem).
5. **Pós-venda:** sinistro com numeração sequencial por organização, prioridade, responsável e ocorrências (log); assistência (guincho etc.) com status e prestador.
6. **Comissões:** `PENDING_COMMERCIAL → PENDING_ADMIN → APPROVED → PAID`, rejeição nas duas etapas pendentes, estorno (cria um lançamento negativo e marca o original como `REVERSED`), export CSV.
7. **Atendimento:** conversa por canal (WhatsApp via Baileys ou Meta Cloud API, Messenger, Instagram, widget web). O bot de IA atende primeiro (`BOT_ACTIVE`), escala para humano (`WAITING_HUMAN → HUMAN_ACTIVE`), permite transferir, devolver ao bot ou à fila, e fechar. O bot tem ferramentas: listar produtos, buscar cliente, capturar lead (cria contato e proposta) e coletar dados do bem segurado.
8. **Gestão:** dashboard (propostas por etapa, apólices ativas e vencendo, sinistros por prioridade, comissões, conversão, tendência de 6 meses, export em PDF), metas mensais de prêmio por `boardType`, busca global, trilha de auditoria.
9. **Assinatura SaaS:** planos com quotas, trial, cobrança via Asaas (cartão, boleto, PIX), faturas, dunning, bloqueio por inadimplência, uso de IA medido com franquia e excedente.

**Regras de negócio relevantes (a preservar):**

- Valores monetários em **centavos** (int). Percentuais em **basis points** (`10000 = 100%`). Comissão = `prêmio × percentual × split` (`shared-kernel/money.ts`).
- **Proposta:**
  - Etapas lineares; `advance` só avança um passo. Endosso começa em `QUOTE`, os demais em `CAPTURE`.
  - Sair de `QUOTE` exige os detalhes do bem segurado preenchidos (JSON validado por ramo; o ramo dos detalhes deve bater com o da proposta).
  - Fora de `CAPTURE`, avançar exige todos os itens **obrigatórios** do checklist da etapa concluídos.
  - Sair de `PAYMENT` exige que o contato já tenha sido promovido a cliente.
  - `LOST` exige motivo; não é possível perder uma proposta em `POLICY_ISSUED`. Reabrir volta para a etapa inicial do tipo e limpa o motivo.
  - Datas de cobertura: fim > início.
  - O checklist é gerado por etapa + ramo (`checklist-config.ts`). Itens ligados a `documentType` são concluídos automaticamente quando um documento daquele tipo é anexado.
- **Apólice:**
  - Emitida a partir de uma proposta em `POLICY_ISSUED` (1:1).
  - Exige seguradora, contato promovido e cliente com endereço.
  - `policyNumber` é único por organização.
  - Cancelamento com motivo (não cancela duas vezes). Um job diário expira apólices com `endDate < now`.
- **Comissão:** criada na emissão da apólice, de forma idempotente (uma não-estorno por apólice) e apenas se o percentual for maior que 0. Transições estritas (ver acima). Só se estorna o que está `PAID`.
- **Cliente:**
  - CPF/CNPJ único por organização, via `documentHash`.
  - Soft delete.
  - Exclusão LGPD anonimiza os dados.
  - O documento aparece mascarado na listagem e completo no detalhe apenas para OWNER/ADMIN/MANAGER.
- **Contato → Cliente (promoção):** reaproveita um cliente existente com o mesmo documento; falha se o contato já estiver ligado a um cliente com outro documento; dispara o auto-complete do checklist.
- **Sinistro:** `claimNumber` sequencial por organização. Workflow `REGISTERED → IN_ANALYSIS → AWAITING_DOCUMENT → PENDING_INSPECTION → APPROVED/REJECTED → PAID → COMPLETED`.
- **Conversa:**
  - Com IA ativa no canal, começa em `BOT_ACTIVE`; sem IA, em `WAITING_HUMAN`.
  - Só se atribui a partir de `WAITING_HUMAN` e só se transfere em `HUMAN_ACTIVE`.
  - Há auto-close por inatividade e limite de respostas do bot por conversa.
- **Alertas diários (08:00):** apólice vencendo em 30 dias, sinistro parado, comissão pendente, proposta estagnada. São idempotentes por entidade e tipo.
- **Retenção:** auditoria por 5 anos; mensagens por 730 dias.

### 1.2 Entidades e relacionamentos

```text
Organization 1─* Member *─1 User            (Better Auth: User, Session, Account, Verification, TwoFactor)
Organization 1─* Invitation
Organization 1─* Contact ─*1 Client          (Contact = lead; promovido → Client com CPF/CNPJ)
Contact 1─* Proposal ─*1 Insurer, ─*1 User(salesperson)
Proposal 1─* ProposalChecklistItem
Proposal 1─1 Policy ─*1 Client
Policy 1─* Commission (self-ref: originalCommission ↔ reversals)
Policy 1─* Claim 1─* Occurrence
Policy 1─* Assistance *─1 Claim?
Policy 1─* Endorsement
Policy 1─* Proposal (renewalPolicy / sourcePolicy)
Document (polimórfico: entityType + entityId)
Notification, AuditLog, AuditLogArchive, Goal, TermsAcceptance
Plan 1─* Subscription 1─1 Organization; Subscription 1─* Invoice, PaymentMethod; WebhookEvent; AiUsageRecord

MongoDB (chat): Channel, Contact(chat), Conversation, Message, UnreadCount, AiAgent, BaileysAuthState
```

Existem **dois "Contact"**: um no PostgreSQL (lead do CRM) e outro no MongoDB (identidade no chat), ligados por `pgContactId`. Eles são sincronizados por HTTP interno com HMAC.

### 1.3 Multi-tenancy

- Tenant = `Organization`. A organização ativa vem de `Session.activeOrganizationId` (plugin organization do Better Auth).
- Cadeia: `authMiddleware → tenantMiddleware (valida Member ativo) → subscriptionMiddleware → requireAbility`.
- PostgreSQL com **RLS** (`SET LOCAL app.current_tenant`) em 23 tabelas, com políticas estritas e permissivas.
- Existe o `prismaAdmin` (superuser que ignora RLS), usado em **28 arquivos** (worker inteiro, billing, geração de PDF, aprovação de comissão, rotas internas).
- MongoDB usa o campo `tenantId` e um plugin Mongoose de escopo.

### 1.4 Integrações externas

| Integração | Uso |
| --- | --- |
| Better Auth | sessões, e-mail/senha, verificação, reset, organizações, 2FA |
| Resend | e-mails transacionais (verificação, reset, convite, cotação, alertas) |
| Cloudflare R2 (S3) | documentos, logo, mídia do chat; URLs pré-assinadas |
| Anthropic / OpenAI (Vercel AI SDK) | bot de atendimento com tools |
| Baileys | WhatsApp Web não oficial (QR code / pareamento) |
| Meta Graph API | WhatsApp Cloud API, Messenger e Instagram; OAuth / Embedded Signup; webhooks; refresh de token |
| Asaas | assinaturas, faturas, webhooks, dunning |
| ViaCEP | endereço por CEP |
| Consultar Placa | dados do veículo por placa/chassi (pago, com cache) |
| Cloudflare Turnstile | captcha no cadastro |
| Sentry | erros (todas as apps) |
| Aggilizador | SDK de cotação — **não é importado por nenhuma app (código morto)** |

### 1.5 Backend

- **`apps/server`** (Fastify 5 + tsyringe): ~116 endpoints REST em `routes/v1/*`, em arquivos por rota (`create-x.ts`, `list-x.ts`, `_schemas.ts`), com Zod via `fastify-type-provider-zod`, Swagger e Scalar. Tem também:
  - rotas internas HMAC (`routes/internal/*`) para o chat-worker;
  - webhook do Asaas;
  - Bull Board;
  - 3 templates de PDF (`@react-pdf/renderer`);
  - middlewares: auth, tenant, subscription, ability, super-admin, super-admin-2FA, rate limit, signup gate, tempmail gate, turnstile e security headers.
- **`packages/core`** (~16k LOC): módulos DDD (billing, client, commission, document, insurer, notification, performance, sales/{leads, proposals, policies, endorsement}, search, servicing/{claims, assistance, occurrences}, workspace/{organization, members, invitations}) e `platform/` (audit, lookups de CEP e veículo, storage). "DDD Full" (entidade com construtor privado, `create`/`restore`, mapper, repository port e adapter Prisma) em Proposal, Commission e Conversation. "DDD Light" nos demais.
- **`apps/chat-server`** (Fastify + Socket.IO + Mongoose): conversas, mensagens, canais, agentes de IA, webhooks da Meta, OAuth da Meta e namespace do widget. Autentica com um JWT emitido pelo `server` (`POST /api/v1/chat/token`, 24h).
- **`apps/chat-worker`** (BullMQ + Baileys + AI SDK):
  - processa mensagens recebidas, envio, bot de IA, auto-close, conexão e pareamento de canais, migração de mídia e refresh de token da Meta;
  - chama o `server` via HTTP interno com HMAC.
- **`apps/worker`** (BullMQ):
  - crons de expiração de apólices, trial, assinaturas, dunning, reconciliação de webhook, arquivo de auditoria e alertas;
  - filas de notificação, e-mail de cotação, import CSV e uso de IA.
- **Resposta:** `{ success, data, meta }` / `{ success: false, error: { code, message } }`. Paginação por cursor.

### 1.6 Frontend

- Next.js 16 + React 19, Tailwind 4, shadcn/ui (preset `@coss/style`), `@base-ui/react` e `radix-ui`.
- Organização por feature (`features/<nome>/{components,hooks,lib}`), 24 features.
- ~40 páginas em grupos: `(marketing)`, `(auth)`, `(onboarding)`, `(blocked)`, `(dashboard)`.
- Dados: hooks e tipos gerados pelo **Orval** a partir do OpenAPI (exige o server rodando para gerar); TanStack Query, TanStack Table e Virtual; RHF + Zod; `nuqs` (estado na URL); Zustand; `dnd-kit` (Kanban); `recharts`; `framer-motion`; `socket.io-client`.
- Importa `@repo/core/legal` só para usar constantes de versão dos termos.
- `apps/widget`: app Vite separada para o chat embutível.

### 1.7 Infraestrutura

| Item | Estado atual |
| --- | --- |
| PostgreSQL 18 | dados do ERP, RLS, role `app_user` criada manualmente |
| MongoDB 8 (replica set) | domínio do chat |
| Redis 8 | BullMQ, adapter do Socket.IO, pub/sub (invalidação de cache de assinatura, eventos do chat), cache |
| BullMQ | 2 workers (ERP e chat), ~20 filas/crons |
| Docker | 2 imagens (`server` / `chat`), cada uma com 2 entrypoints; nginx |
| Hospedagem | `web` na Vercel, backend numa VPS Hostinger (cookies cross-subdomain) |
| CI/CD | GitHub Actions: audit, db push + RLS, dependency-cruiser, testes de arquitetura, Biome, typecheck, build, testes, coverage, quality gates; deploy por tag, separado para server e chat |
| Observabilidade | Pino, Sentry, Bull Board, `/health` |
| Tooling | pnpm, Turborepo, Biome, Vitest, Playwright, Husky, lint-staged, dependency-cruiser, jscpd, `.quality-gates` |

### 1.8 Defeitos e lacunas encontrados no legado

Estes pontos devem ser **corrigidos** na nova versão, não portados:

1. **COMMERCIAL não é restrito aos próprios registros.** A especificação diz "limitado a próprios proposals/clients", mas não existe nenhum filtro por `salespersonId` associado à role.
2. **O CPF/CNPJ é gravado em texto puro** (`Client.document`) ao lado de `documentEncrypted` e `documentHash`, o que anula a criptografia.
3. **A emissão de apólice não é transacional:** cria a apólice e depois a comissão em operações separadas. Uma falha no meio deixa a apólice sem comissão.
4. **O split de comissão nunca é aplicado.** `Member.commissionSplitPercentage` existe, mas `CreateCommissionForPolicy` não o repassa, então o split é sempre 100%.
5. **O item de checklist `inspection_report`** aponta para `documentType: 'INSPECTION_REPORT'`, que não existe no enum `DocumentType`. Por isso o auto-complete por anexo nunca dispara para esse item.
6. **O RLS é contornado em 28 arquivos** via `prismaAdmin`. Além disso, `db:reset` não reaplica as políticas, o que faz o server entrar em crash loop e o login falhar silenciosamente (documentado no `CLAUDE.md` do legado).
7. **O import CSV de apólices cria uma proposta sintética** `POLICY_ISSUED` com comissão 0 (AD-004), em vez de modelar a apólice importada explicitamente.
8. **Existem duas fontes de verdade para "contato"** (PG e Mongo), sincronizadas por HTTP.
9. **O package `aggilizador` é código morto.**

---

## Fase 2 — Avaliação arquitetural

> **Revisões após a sessão de decisões (2026-09-21).** A tabela abaixo é a avaliação original. As decisões finais estão em `architecture.md` e nos ADRs. As linhas que mudaram:
> - **Redis:** removido de vez. Filas e crons no **pg-boss**, rate limit no banco/em memória, cache de placa em tabela (ADR-002, ADR-006).
> - **BullMQ** nos jobs do `server`/`chat-worker`: substituído por **pg-boss** no processo do server.
> - **Orval:** **mantido**, em versão enxuta (hooks + tipos, sem Zod, gerado do `openapi.json` exportado) (ADR-007).
> - **Next.js:** substituído por **Vite + React + TanStack Router**, como SPA estática no Caddy (ADR-009). O widget vira uma rota da SPA.
> - **Better Auth:** apenas identidade e sessão. Organizações, membros e convites em código próprio (ADR-003).
> - **Bull Board:** não se aplica (há uma tela de admin de jobs com falha).
> - **`nuqs`:** removido (search params do TanStack Router).

| Componente atual | Problema que resolve | Necessário? | Decisão nova | Justificativa |
| --- | --- | ---: | --- | --- |
| `apps/chat-server` | API e WebSocket do chat separados do ERP | não | **incorporar** ao `server` (`modules/chat` + Socket.IO no mesmo processo) | Não há necessidade de escala independente, e isso elimina um serviço, um JWT próprio e a duplicação de auth, CORS e headers |
| `apps/chat-worker` | Baileys, bot de IA, envio e recebimento | talvez | **BullMQ no `server`** | Com o bot chamando os módulos diretamente, somem o HTTP interno e o HMAC. O Baileys é stateful: roda no processo do server enquanto houver 1 instância (ver ADR-006) |
| `apps/worker` | Crons e filas do ERP | não | **BullMQ no `server`** | A carga é baixa (crons diários/horários, e-mails, CSV). Mesmo código e mesmo deploy |
| `apps/widget` (Vite) | Chat embutível em sites de clientes | sim (a funcionalidade) | **rota `/embed/chat` no `web`** + loader `public/widget.js` (iframe) | Remove uma app e um build. O iframe isola o CSS do site hospedeiro |
| `packages/core` | Domínio compartilhado entre server, worker e web | não | **`apps/server/src/modules`** | Só existia porque havia vários processos. O web usava apenas constantes de termos |
| `packages/db` | Prisma compartilhado | não | `apps/server/prisma` | Um único consumidor |
| `packages/db-chat` | Mongoose | não | **remover** | O chat vai para o PostgreSQL |
| `packages/auth` | Better Auth + CASL compartilhados com o web | não | `modules/auth` no server + `better-auth/client` no web | O client do web só precisa do `createAuthClient`. As permissões chegam pelo `/me` |
| `packages/env` | Env validado compartilhado | não | `shared/config.ts` em cada app | Cada app valida apenas o que usa. O web só tem `NEXT_PUBLIC_*` |
| `packages/shared` | Tipos de socket, enums, crypto | não | dentro do server; o web recebe tipos via OpenAPI | Os tipos cruzam a fronteira pelo contrato HTTP, não por import |
| `packages/ai` | Wrapper multi-provider | não | uso direto do `ai` + `@ai-sdk/anthropic` em `modules/chat` | Um único provider em uso. Um wrapper de ~300 LOC não se paga |
| `packages/billing-port` + `asaas-adapter` | Port/adapter para trocar de gateway no futuro | não | `modules/billing/asaas.ts` | YAGNI. Se o Stripe vier, extrai-se a interface nesse momento |
| `packages/aggilizador` | SDK de cotação | não | **remover** | Não é usado |
| `config/typescript-config` | tsconfig compartilhado | não | `tsconfig.base.json` na raiz | Um arquivo basta |
| MongoDB | Chat com esquema flexível e TTL | não | **PostgreSQL** | Os dados do chat são relacionais (tenant, canal, contato, conversa, mensagem). O TTL vira um job. Remove um banco, um replica set e um ODM (ADR-002) |
| Redis | Filas, pub/sub, adapter, cache | sim | **manter** apenas para BullMQ, rate limit e cache de lookup pago | O pub/sub de invalidação e o cache de assinatura saem. O adapter do Socket.IO entra só com mais de 1 instância |
| PostgreSQL RLS | Defesa em profundidade para o tenant | não (agora) | **isolamento na aplicação**: contexto obrigatório + guard do Prisma + testes cross-tenant | Na prática é contornado em 28 lugares, custa operação (role manual, reaplicação, crash loop) e dá falsa sensação de segurança (ADR-004) |
| tsyringe (DI) + decorators | Injeção de dependências | não | **composição explícita** em `dependencies.ts` | Decorators e tokens de string escondem o grafo. Funções recebendo `deps` são testáveis sem container |
| DDD Full (entity, mapper, port, adapter, presenter) | Proteger invariantes das máquinas de estado | parcialmente | **funções puras** de transição (`proposal-stages.ts`, `commission-status.ts`) + repository de funções Prisma | O que vale é a regra testável, não a cerimônia. Sem mapper domain↔persistence: o tipo do Prisma é o tipo |
| CASL | RBAC baseado em abilities | não | **mapa estático role → permissões** + escopo de dono para COMMERCIAL | 5 roles fixas e ações nomeadas. Um `Record<Role, Permission[]>` é explícito e auditável (ADR-005) |
| Rotas internas HMAC | chat-worker → server | não | **remover** | Chamada de função dentro do mesmo processo |
| JWT de socket (`SOCKET_JWT_SECRET`) | Autenticar no chat-server | não | Socket.IO autentica com o **mesmo cookie de sessão** | Mesmo processo e mesma origem |
| Orval (37k LOC gerados) | Hooks e tipos do OpenAPI | não | **`openapi-typescript` + `openapi-fetch`** (1 arquivo `.d.ts`) + queries escritas por feature | Tipos gerados sem gerar código de runtime. Não precisa do server rodando: o spec é exportado por script (ADR-007) |
| Envelope `{ success, data, meta }` | Resposta padronizada | não | **status HTTP + corpo direto**; erros `{ error: { code, message, details } }` | `success` repete o status HTTP |
| Subscription cache + pub/sub de invalidação | Evitar consulta de assinatura por request | não | **1 query indexada** por request (ou junto à membership) | Otimização prematura, com invalidação distribuída |
| AuditLogArchive + partição | Retenção de 5 anos | não | **tabela única** + job de expurgo acima de 5 anos | O volume de uma corretora não justifica particionar agora |
| Migração de mídia do chat para R2 (90d) | Tirar blobs do Mongo | não | **mídia vai para o storage desde o início** | O problema deixa de existir |
| Turborepo | Orquestrar builds de 17 workspaces | não | **`pnpm -r` / `--filter`** | Com 2 apps não há grafo a otimizar |
| dependency-cruiser, jscpd, `.quality-gates`, testes de arquitetura | Conter a erosão das fronteiras | não | **1 teste simples** que proíbe imports profundos entre módulos | Guardrail proporcional ao tamanho do projeto |
| tsup | Bundlar packages internos | não | `tsc` → `dist` | Sem packages para bundlar |
| Vercel (web) + VPS (api) | Deploy do front | não | **tudo na VPS** atrás do Caddy, **mesma origem** | Elimina cookies cross-subdomain e CORS em produção, e dá um único deploy (ADR-008) |
| nginx | Reverse proxy + TLS | sim | **Caddy** | TLS automático, config de ~10 linhas |
| Bull Board | Visualizar filas | talvez | adiar; montar sob super-admin quando operar os jobs | Não é necessário no primeiro dia |
| Sentry | Erros | sim | **manter** (server e web) | Barato e essencial |
| Zustand | Estado global | não | remover | TanStack Query + estado local + URL (`nuqs`) cobrem os casos |
| framer-motion | Animações | não | remover | Transições CSS / `tw-animate` |
| Messenger, Instagram, OAuth/Embedded Signup da Meta | Canais extras | a confirmar | **adiar** até existir uso real (pergunta aberta) | É a maior parte da complexidade do chat |
| Baileys | WhatsApp sem API oficial | a confirmar | manter atrás da mesma interface do Meta Cloud API | É um requisito de produto, mas tem risco de ToS/ban e é stateful (pergunta aberta) |
| Husky + lint-staged | Pre-commit | opcional | CI é o gate; o hook é opcional | Evita um hook lento no commit |

**Conclusão:** a complexidade do legado vem da **distribuição** (6 processos, 2 bancos, HTTP interno, JWT extra, 11 packages), não do domínio. O domínio em si (quatro máquinas de estado, checklist, cálculo de comissão, bot com tools) cabe confortavelmente num único processo com módulos bem delimitados.

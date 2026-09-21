# Roadmap de implementação (Fase 5)

> Base: [`architecture.md`](./architecture.md), ADRs 001–010 e a checklist de [`migration.md`](./migration.md).
> Cada fase termina com o CI verde (`lint`, `typecheck`, `test`, `build`) e com a pergunta: **"Existe alguma abstração que podemos remover?"**
> Staging na VPS a partir da Fase 3, para cada fase ser validada num ambiente real, e não só no final.
> **Processo:** no início de cada fase ou feature, o agente escolhe e declara o nível de spec (nenhum, `tlc-spec-lean` ou `tlc-spec-driven`), seguindo os critérios do `CLAUDE.md`. Expectativa: nenhum para as Fases 1–2 e 13; lean para as demais; driven só se a fase se mostrar grande e incerta (candidatas: 5 e 11).

```text
1 Foundation ─▶ 2 Infrastructure ─▶ [H1] ─▶ 3 Auth ─▶ 4 Tenancy & Orgs ─▶ [H2] ─▶ 5 Billing
                                                     │
                                                     ▼
                     6 Cadastros (insurers, contacts, clients, documents)
                                                     │
                                                     ▼
                     7 Proposals ─▶ 8 Policies & Commissions ─▶ 9 Claims & Assistances
                                                     │
                                                     ▼
                     10 Notifications, Dashboard, Search, Audit
                                                     │
                                                     ▼
                     11 Chat ─▶ 12 Admin & Observability ─▶ [H3] ─▶ 13 Production

[Hn] = checkpoint de avaliação do harness de agentes (skill `harness-eval`)
```

As fases 5 e 6 podem correr em paralelo depois da 4. A fase 11 depende da 6 (contatos) e da 7 (a tool `captureLead` cria proposta).

---

## Fase 1 — Foundation

- **Objetivo:** repositório com os dois apps rodando e o CI verde.
- **Arquivos principais:**
  - `package.json`, `pnpm-workspace.yaml`, `biome.json`, `tsconfig.base.json`, `.env.example`;
  - `apps/server/{package.json, tsconfig.json, src/{server.ts, app.ts, dependencies.ts}, src/shared/{config,errors,logger,request-context}.ts}`;
  - `apps/web/{vite.config.ts, src/main.tsx, src/routes/__root.tsx, src/routes/(public)/index.tsx}`;
  - `docker-compose.yml` (postgres, minio, mailpit);
  - `.github/workflows/ci.yml`;
  - `test/architecture.spec.ts`.
- **Dependências:** nenhuma.
- **Implementação:**
  - git init;
  - Node 24, pnpm, Biome, Vitest;
  - Fastify com pino (`requestId`), error handler global (`AppError`/Zod → formato `{ error }`), `GET /api/health`;
  - config validada com Zod;
  - Vite + TanStack Router + Tailwind 4 + shadcn (tokens do design do legado, dark mode);
  - proxy do Vite `/api` → `:3001`.
- **Testes:** error handler (400/404/422/500), config inválida falha no boot, teste de fronteira de imports.
- **Critérios de aceite:** `pnpm dev` sobe os dois apps; o web chama `/api/health` pelo proxy; o CI roda lint, typecheck, test e build.
- **Riscos:** baixo. Não deixar o tooling crescer além do necessário.

## Fase 2 — Infrastructure

- **Objetivo:** as peças técnicas que todos os módulos usam, prontas e testadas.
- **Arquivos principais:**
  - `infrastructure/{database,queue,storage,email,pdf,realtime}.ts`;
  - `prisma/schema.prisma` (base);
  - `test/{setup-db.ts, app.ts, factories.ts}`;
  - `scripts/export-openapi.ts`;
  - `apps/web/{orval.config.ts, src/lib/http.ts}`;
  - `shared/{money,crypto,pagination}.ts`.
- **Dependências:** Fase 1.
- **Implementação:**
  - Prisma com UUID v7 e **guard de tenant** (extensão);
  - pg-boss atrás de `queue.ts` (`enqueue(tx)`, `registerWorker`, `schedule`);
  - S3 client (MinIO/R2) com presigned URLs;
  - Resend + React Email (layout base + preview);
  - `@react-pdf/renderer` → Buffer;
  - Socket.IO anexado ao servidor;
  - harness de testes com um schema por worker do Vitest;
  - `@fastify/swagger` + type provider Zod + export do OpenAPI + Orval (`pnpm api:generate`, checagem de diff no CI);
  - money (bp, arredondamento) e crypto (AES-256-GCM + HMAC).
- **Testes:**
  - o guard lança erro sem `organizationId`;
  - `enqueue` dentro de uma transação com rollback não gera job;
  - cron com timezone;
  - money (tabela de casos);
  - crypto (round-trip, HMAC determinístico);
  - upload/download no MinIO.
- **Critérios de aceite:** um módulo "exemplo" descartável prova o ciclo completo schema → rota → OpenAPI → Orval → hook no web.
- **Riscos:**
  - ~~Enfileiramento transacional pg-boss ↔ Prisma~~: **validado** no spike de 2026-09-21 (ver ADR-006). Atenção: a deduplicação exige `policy` na fila.
  - **Versões:** o dist-tag `latest` do Prisma aponta para `8.0.0-rc`. Fixar a última estável (7.10.x) até o 8 sair em GA.
  - Guard do Prisma com operações aninhadas (`include`, `connect`).

- **Remover o módulo exemplo** (quando o primeiro modelo tenant-scoped real existir, na Fase 4 ou 6):
  1. apagar `apps/server/src/modules/examples/`, o registro `app.register(exampleRoutes)` em `app.ts` e `src/emails/example.tsx`;
  2. apagar `apps/web/src/routes/(public)/example.tsx`;
  3. remover o modelo `Example` (e a relação `examples` em `Organization`) do `schema.prisma` e gerar a migration de `DROP` com `pnpm --filter @bens/server db:migrate`;
  4. portar para o modelo real os testes de `infrastructure/database.spec.ts` que usam `Example` (guard com `include`/`connect`, FK composta) e o teste de P2002 em `app.spec.ts`;
  5. `pnpm api:generate` e commitar o `openapi.json` e o `src/api` atualizados.

## Checkpoint H1 — Avaliação do harness (após a Fase 2)

- **Objetivo:** garantir que o harness de agentes (`CLAUDE.md`, `.claude/skills` → `.agents/skills`) está correto, enxuto e útil **antes** das fases de domínio. A partir da Fase 3, cada fase é implementada por agentes seguindo esse harness, então um erro aqui se multiplica.
- **Por que depois da Fase 2 e não da Fase 1:** o `CLAUDE.md` cita caminhos e convenções que só existem ao fim da Fase 2 (`infrastructure/queue.ts`, `shared/money.ts`, `shared/config.ts`, harness de testes). Avaliar antes geraria "BROKEN" esperados, sem valor.
- **Como:** rodar a skill `harness-eval` numa **sessão nova**, com a Fase 2 commitada e o CI verde.
  - Q1 (docs opcionais): incluir `docs/architecture.md`, `docs/roadmap.md` e `docs/migration.md`. Os ADRs ficam fora por regra da skill.
  - Q2 (tracks): **`B+C`**. É a primeira avaliação e a mais importante; o custo em tokens se justifica.
- **O que observar:**
  - caminhos e comandos do `CLAUDE.md` que não batem com o código (Track A);
  - regras do `CLAUDE.md` que um agente descobriria sozinho lendo o código (Track B → cortar);
  - skills instaladas que não mudam comportamento neste projeto (Track C). Candidatas óbvias: `vercel-react-best-practices` (foco em Next.js, que saiu da stack pelo ADR-009) e skills de processo sobrepostas (`tlc-spec-driven` × `tlc-spec-lean` × superpowers).
- **Saída:** relatório com Ship/Review/Hold/Slim/Keep-core. As mudanças no harness são aplicadas **só depois da sua revisão**, num commit `chore(harness): …`.
- **Critério de aceite:** Track A sem BROKEN; decisões de Slim/Ship aplicadas ou registradas como mantidas com justificativa.

## Fase 3 — Authentication

- **Objetivo:** cadastro, login e sessão ponta a ponta.
- **Arquivos principais:**
  - `modules/auth/{auth.ts, auth.routes.ts, session-context.ts, signup-gates.ts, terms.ts, me.ts}`;
  - `emails/{verify-email,reset-password}.tsx`;
  - web `routes/(auth)/*`, `lib/auth-client.ts`, `hooks/use-me.ts`;
  - `docker-compose.prod.yml` + `Caddyfile` (staging).
- **Dependências:** Fase 2.
- **Implementação:**
  - Better Auth (e-mail/senha, verificação, reset, `twoFactor`, rate limit com `storage: "database"`);
  - `Session.activeOrganizationId`;
  - preHandler que monta o `RequestContext`;
  - Turnstile, bloqueio de e-mail temporário, `SIGNUP_MODE`;
  - termos versionados;
  - checagem de `Origin` em métodos mutáveis;
  - `@fastify/helmet`;
  - **deploy do staging** (Caddy + SPA + server + PG).
- **Testes:**
  - cadastro → verificação → login → `/me`;
  - sessão expirada → 401;
  - `Origin` inválido → 403;
  - rate limit de login persiste após restart;
  - e2e de login.
- **Critérios de aceite:** login funcionando no staging em HTTPS e na mesma origem.
- **Riscos:** configuração de cookie e Origin atrás do Caddy (`trustProxy`). Validar cedo, no staging.

## Fase 4 — Tenancy & Organizations

- **Objetivo:** multi-tenant e RBAC completos. Todo módulo seguinte herda isso.
- **Arquivos principais:**
  - `shared/permissions.ts`;
  - `modules/organizations/*` (org, logo, membros, convites, onboarding, `transfer-portfolio.ts`);
  - `modules/audit/{audit.ts, audit.repository.ts}`;
  - `test/{with-two-tenants,with-two-salespeople}.ts`;
  - web `routes/(onboarding)/*`, `routes/_app.tsx`, `settings/{organization,members}`.
- **Dependências:** Fase 3.
- **Implementação:**
  - `ROLE_PERMISSIONS` + `requirePermission` + `scopeFor(ctx)`;
  - onboarding (org + OWNER + trial, usando um `Plan` seed mínimo);
  - troca de org ativa e seletor no web;
  - convites por e-mail;
  - OWNER único;
  - auditoria sem PII;
  - guard `beforeLoad` no web;
  - `permissions[]` no `/me`.
- **Testes:**
  - matriz role × permissão (snapshot);
  - toda rota declara permissão;
  - cross-tenant nas rotas de org;
  - não é possível remover nem rebaixar o OWNER;
  - convite expirado;
  - transferência de carteira (usa fixtures de contatos simples).
- **Critérios de aceite:** um usuário com 2 orgs alterna entre elas e vê dados isolados; o helper cross-tenant está pronto para os próximos módulos.
- **Riscos:** a transferência de carteira depende de tabelas das Fases 6, 7 e 11. Implementar com o que existir e estender em cada fase (item na checklist de cada uma).

## Checkpoint H2 — Reavaliação leve do harness (após a Fase 4)

- **Objetivo:** confirmar que o harness continua correto depois que as convenções de tenancy (`scopeFor`, `withTwoTenants`, `withTwoSalespeople`, `requirePermission`) passaram a existir de verdade. São as regras mais críticas para os agentes nas fases de domínio.
- **Como:** `harness-eval` numa sessão nova, com Q2 = **`A only`** (determinístico, ~0 tokens de modelo). Rodar `C` só se o `CLAUDE.md` ou as skills mudaram muito desde o H1.
- **Critério de aceite:** Track A sem BROKEN.

## Fase 5 — Billing

- **Objetivo:** cobrança funcionando antes do lançamento.
- **Arquivos principais:**
  - `modules/billing/{asaas.ts, plans, subscription, invoices, webhook.routes.ts, entitlements.ts, billing.jobs.ts, ai-usage.ts}`;
  - web `routes/(onboarding)/select-plan`, `settings/billing`, `billing.expired`, `(public)/pricing`.
- **Dependências:** Fase 4.
- **Implementação:**
  - planos (seed) com quotas de usuários e números de WhatsApp;
  - trial;
  - assinatura mensal no Asaas (cartão, boleto, PIX);
  - faturas;
  - webhook com token e rotação, dedup em `WebhookEvent`;
  - crons (trial, expiração, dunning, reconciliação);
  - bloqueio 402;
  - `billingManagedExternally`;
  - `requireFeature` e `assertQuota` (usuários, já aplicado aos convites);
  - tabela `AiUsageRecord` (preenchida na Fase 11).
- **Testes:**
  - webhook duplicado é ignorado;
  - assinatura com assinatura digital inválida → 401;
  - transições de status da assinatura;
  - 402 ao expirar;
  - quota de usuários;
  - sandbox do Asaas num e2e manual documentado.
- **Critérios de aceite:** no staging, uma org sai do trial, paga via sandbox do Asaas e é bloqueada ao ficar inadimplente.
- **Riscos:** webhooks fora de ordem no Asaas (mitigado pela reconciliação horária); diferenças entre o sandbox e produção.

## Fase 6 — Cadastros: insurers, contacts, clients, documents

- **Objetivo:** as entidades de base do CRM.
- **Arquivos principais:** `modules/{insurers,contacts,clients,documents}/*` + as features correspondentes no web.
- **Dependências:** Fase 4.
- **Implementação:**
  - seguradoras;
  - contatos (`CHAT_ONLY`/`QUALIFIED`, atribuição de vendedor, identidades de canal);
  - clientes (documento cifrado + HMAC, presenter por role, soft delete, LGPD, import CSV via job, export em streaming);
  - promoção de contato a cliente;
  - documentos (magic bytes, presigned URL, delete no storage);
  - lookup de CEP;
  - estender a transferência de carteira para contatos.
- **Testes:**
  - unicidade do documento;
  - mascaramento por role;
  - regras de promoção (documento igual e divergente);
  - LGPD;
  - import com linhas inválidas;
  - upload com MIME forjado → 400;
  - `withTwoTenants` + `withTwoSalespeople`.
- **Critérios de aceite:** checklist "Contacts / Clients" da `migration.md` completa.
- **Riscos:** busca por nome de cliente com o documento cifrado. A busca continua por nome (texto) e por documento (HMAC exato).

## Fase 7 — Commercial flow: proposals

- **Objetivo:** o funil completo até `POLICY_ISSUED`.
- **Arquivos principais:**
  - `modules/proposals/{proposal.schema, proposal-stages, checklist, insured-object, create/advance/lose/reopen/update-proposal, send-quote, proposal-quote.pdf.tsx, vehicle-lookup, proposal.routes, proposal.jobs}.ts`;
  - web `features/proposals` (Kanban + tabela).
- **Dependências:** Fase 6.
- **Implementação:**
  - máquina de etapas pura;
  - checklist por etapa + ramo com auto-complete por documento (hook em `documents`);
  - detalhes do bem por ramo;
  - cotação por e-mail com PDF (job);
  - lookup de placa com cache em tabela e rate limit;
  - Kanban com `dnd-kit`.
- **Testes:**
  - todas as transições e bloqueios (detalhes, checklist, promoção);
  - checklist gerado para cada combinação etapa × ramo;
  - auto-complete ao anexar documento;
  - e-mail enfileirado só no commit;
  - carteira;
  - e2e criar → avançar até `POLICY_ISSUED`.
- **Critérios de aceite:** checklist "Proposals" (exceto renovação automática, que vai na Fase 8).
- **Riscos:** o volume de regras do checklist. Portar o `checklist-config.ts` literalmente e cobri-lo com testes de tabela.

## Fase 8 — Policies & Commissions

- **Objetivo:** emissão, carteira de apólices, comissões e renovação automática.
- **Arquivos principais:**
  - `modules/policies/{issue-policy, import-policies, cancel-policy, endorsements, policy-summary.pdf.tsx, policy.jobs}.ts`;
  - `modules/commissions/{commission-status, calculate-commission, approve/reject/pay/reverse, export}.ts`;
  - `modules/proposals/create-renewals.ts`.
- **Dependências:** Fase 7.
- **Implementação:**
  - emissão transacional (apólice + comissão + auditoria);
  - importação `origin: IMPORTED` (cria/casa cliente e seguradora; sem comissão);
  - cancelamento;
  - cron de expiração;
  - endossos;
  - comissão com os dois valores congelados e split do membro;
  - workflow de repasse e estorno atômico;
  - renovação automática (`renewalLeadDays`, idempotente).
- **Testes:**
  - emissão falha no meio → nada persiste;
  - comissão idempotente (índice);
  - tabela de casos de cálculo (arredondamento);
  - todas as transições da comissão;
  - estorno;
  - importação não gera comissão;
  - renovação criada uma vez só e nunca para apólice cancelada;
  - e2e proposta → apólice → comissão paga.
- **Critérios de aceite:** checklists "Policies" e "Commissions" + item de renovação.
- **Riscos:** a regra de split com arredondamento, que precisa ser validada com um caso real de corretora antes de fechar a fase.

## Fase 9 — Claims & Assistances

- **Objetivo:** pós-venda.
- **Arquivos principais:** `modules/{claims,assistances}/*`, `OrganizationCounter`, features no web.
- **Dependências:** Fase 8.
- **Implementação:** sinistros (número sequencial, workflow, prioridade, responsável, ocorrências automáticas), assistências, vínculo com documentos.
- **Testes:**
  - número sequencial sob concorrência (N inserts paralelos, sem colisão);
  - transições;
  - carteira;
  - e2e de abertura de sinistro.
- **Critérios de aceite:** checklist "Claims / Assistances".
- **Riscos:** baixo.

## Fase 10 — Notifications, Dashboard, Search, Audit UI

- **Objetivo:** fechar o ERP operacional.
- **Arquivos principais:** `modules/{notifications,dashboard,search}/*`, `modules/audit/list-audit.ts`, templates de e-mail dos alertas, features no web.
- **Dependências:** Fases 8 e 9.
- **Implementação:**
  - notificações in-app com push por socket;
  - e-mails críticos;
  - cron dos 4 alertas diários (idempotentes);
  - dashboard (agregações + PDF);
  - busca global respeitando a carteira;
  - tela de auditoria.
- **Testes:**
  - alerta não duplica no mesmo dia;
  - agregações contra fixtures conhecidas (conversão sem apólices importadas);
  - busca não vaza fora da carteira nem do tenant.
- **Critérios de aceite:** checklist "Notifications / Dashboard / Search / Audit".
- **Riscos:** performance das agregações do dashboard. Medir com dados sintéticos de uma corretora grande; se preciso, adicionar índices ou uma materialized view (e só isso).

## Fase 11 — Chat

- **Objetivo:** atendimento via WhatsApp e widget, com bot.
- **Arquivos principais:**
  - `modules/chat/{channels, conversations, messages, queue-routing, bot/{agent, tools/*, pii-redaction}, whatsapp/{provider, meta-cloud, baileys, session-manager}, widget/*, chat.routes, chat.jobs}.ts`;
  - web `features/chat`, `settings/{channels,ai-agents}`, `routes/embed.chat.$channelId.tsx`, `public/widget.js`.
- **Dependências:** Fases 6 e 7 (e 5, para as quotas de números e o registro de uso de IA).
- **Implementação, em fatias:**
  1. Conversas e mensagens com o widget: namespace `/widget`, token de visitante, máquina de estados, fila compartilhada e roteamento por carteira, não-lidas.
  2. Meta Cloud API: webhook assinado, envio, mídia no storage, refresh de token.
  3. Baileys: pareamento por QR/código, `WhatsAppSessionManager`, estado cifrado no PG, alerta de desconexão.
  4. Bot: AI SDK com Anthropic/OpenAI por agente, tools como chamadas diretas, redação de PII, limite de respostas, `escalateToHuman`, registro de uso de IA.
  5. Contato `CHAT_ONLY` → `QUALIFIED`; auto-close; expurgo após 730 dias; estender a transferência de carteira para conversas.
- **Testes:**
  - todas as transições da conversa;
  - roteamento da fila (contato com e sem vendedor);
  - webhook Meta com assinatura inválida → 401;
  - redação de PII (o provider é fake e o teste checa o payload enviado);
  - tools do bot contra um DB real;
  - quota de números;
  - e2e com o widget.
- **Critérios de aceite:** checklist "Chat". Um número Baileys real conectado no staging.
- **Riscos:**
  - **Baileys:** instabilidade da lib, banimento de número e mudanças do protocolo do WhatsApp. Usar números de teste no staging e fixar a versão da lib.
  - **Meta:** aprovação do app e dos templates. Iniciar o processo de verificação da Meta **na Fase 5**, porque é demorado.
  - Qualidade do bot: prompts e tools precisam de iteração com conversas reais.

## Fase 12 — Admin & Observability

- **Objetivo:** operar o sistema sem abrir o banco.
- **Arquivos principais:** `modules/admin/*`, integração do Sentry (server e web), `GET /api/ready`, alertas operacionais.
- **Dependências:** Fases 5 e 11.
- **Implementação:**
  - super-admin com tenants, uso de IA, jobs com falha (re-executar) e canais desconectados;
  - Sentry com `beforeSend` sem PII e alertas;
  - `/api/ready` checando o PG e os workers do pg-boss;
  - alertas operacionais (job esgotado, canal com mais de 30 min fora, webhook com falha);
  - monitor externo de uptime.
- **Testes:**
  - rotas de admin exigem super-admin + 2FA;
  - o `beforeSend` remove PII;
  - `/ready` retorna 503 com o PG fora.
- **Critérios de aceite:** um erro forçado no staging chega ao Sentry com alerta; derrubar o PG dispara o monitor.
- **Riscos:** baixo.

## Checkpoint H3 — Avaliação do harness antes da produção (após a Fase 12)

- **Objetivo:** limpar o harness acumulado ao longo de 12 fases antes do lançamento, que é quando o projeto passa a ser mantido (e não construído) por agentes.
- **Como:** `harness-eval` numa sessão nova, com Q2 = **`B`**. O foco é redundância: regras que viraram óbvias pelo código existente e instruções de fases já concluídas.
- **Critério de aceite:** Track A sem BROKEN; o `CLAUDE.md` descreve o sistema pronto, sem instruções de construção.

## Fase 13 — Production deployment

- **Objetivo:** lançar.
- **Arquivos principais:** `.github/workflows/deploy.yml`, `docker-compose.prod.yml`, `Caddyfile` (CSP final), `docs/runbooks/{deploy,rollback,restore}.md`.
- **Dependências:** todas as anteriores.
- **Implementação:**
  - deploy por tag (GHCR → SSH → migrate → up → health check);
  - backup diário para o R2 + **teste de restore**;
  - CSP final e headers;
  - chaves de produção (sessão, PII, HMAC, canais);
  - Asaas e Meta em produção;
  - DNS e TLS;
  - suíte Playwright completa (6 fluxos) contra o staging;
  - revisão de segurança (`/security-review`).
- **Testes:** restore de backup num ambiente limpo; rollback de uma tag; e2e completo.
- **Critérios de aceite:**
  - a checklist inteira da `migration.md` está marcada;
  - o restore foi testado;
  - a primeira corretora foi criada em produção.
- **Riscos:**
  - chaves de cifra perdidas = dados ilegíveis. Guardá-las em cofre, com backup separado e documentado no runbook;
  - aprovação da Meta pendente (ver Fase 11).

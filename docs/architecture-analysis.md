# Bens Seguros — Análise, Arquitetura e Roadmap do MVP

> Resposta ao [`handoff.md`](./handoff.md). Data: 2026-09-23.
> **Nenhum código foi alterado.** Este documento é a entrada para revisão; a implementação só começa após aprovação.
> Fontes analisadas: **v1** (`arturmois/bens-seguros`) e **v2** (`arturmois/bens-seguros-v2`, último commit 2026-09-23).
> **Validação contra o código do v2 e decisões (2026-09-23):** as divergências encontradas e as decisões da §15 viraram os ADR-011 a ADR-017 em [`decisions/`](./decisions/). Onde este documento e um ADR divergirem, vale o ADR.

---

## 1. Executive Summary

**Estado atual.** A análise foi escrita fora do repositório (num diretório só com o handoff) e depois trazida para o v2. O codebase avaliado é o par v1/v2:

- **v1** (~138k LOC, 6 apps, 11 packages, PostgreSQL + MongoDB + Redis): ERP completo. A complexidade vem da distribuição (HTTP interno com HMAC, dois bancos, contato duplicado, 3 workers). Serve como **referência de comportamento** (etapas do Kanban, tools do bot, reconexão do Baileys), não como base de código.
- **v2** (~9,5k LOC no server incl. testes, 38 arquivos de teste, 9 migrations): modular monolith Fastify + SPA Vite, **Fases 1–4 concluídas e verificadas**: auth (Better Auth, 2FA, rate limit persistido), organizações, convites, carteira, **RLS forçado no PostgreSQL**, auditoria sem PII, fila transacional (pg-boss), Socket.IO autenticado, termos versionados, staging em Docker + Caddy. O escopo alvo do v2 ainda é o ERP inteiro.

**Direção recomendada.**

1. **Continuar no repositório do v2** (decidido em 2026-09-23), aproveitando a fundação (Fases 1–4) e **podando** o que é ERP. É a maior alavanca: tenancy, auth, RBAC, auditoria e jobs já existem com testes que provam isolamento entre tenants.
2. **Arquitetura:** monólito modular com **dois runtimes do mesmo código** — `api` (HTTP + realtime + jobs + IA) e `whatsapp` (dono das sessões Baileys) — mais SPA estática e **um PostgreSQL**. Sem Redis, sem microsserviços, sem event bus.
3. **Comunicação entre runtimes pelo próprio PostgreSQL:** fila transacional (pg-boss) para comandos e `NOTIFY` transacional para eventos de realtime. Nenhuma API HTTP interna.
4. **Frontend:** manter **Vite + TanStack Router** (v2) em vez de Next.js full-stack. A análise da §5 mostra que o Next.js não resolve nenhum requisito que a stack atual não resolva, e piora realtime e jobs.
5. **Ordem do roadmap ajustada:** o atendimento humano (fila/inbox) vem **antes** da IA, porque é o caminho de falha obrigatório da IA (§25 do handoff). Um **spike do runtime WhatsApp** entra cedo para reduzir o maior risco técnico, embora a feature completa fique no fim.

---

## 2. AS-IS Architecture

### 2.1 Diretório original da análise

A análise foi produzida num diretório sem código (só o handoff e skills de agentes). Desde 2026-09-23 o trabalho segue no repositório v2 (§15, item 1).

### 2.2 v1 — ERP legado

```text
web (Next.js 16, Vercel) ─┐
widget (Vite)            ─┤ Socket.IO + JWT próprio
                          ├──▶ chat-server (Fastify + Socket.IO + Mongoose)
server (Fastify+tsyringe)─┤         │ Redis pub/sub
worker (BullMQ)          ─┤    chat-worker (BullMQ + Baileys + AI SDK) ──HTTP/HMAC──▶ server
                          │
PostgreSQL (RLS c/ bypass em 28 arquivos) · MongoDB (chat) · Redis (filas, pub/sub, cache)
```

| Área | O que existe | Observação relevante para o MVP |
| --- | --- | --- |
| Kanban | `ProposalStage`: `CAPTURE → QUOTE → PROTOCOL → INSPECTION → PAYMENT → POLICY_ISSUED \| LOST` | **Fonte das etapas do MVP** (§32 do handoff) |
| Conversa | status único `BOT_ACTIVE \| WAITING_HUMAN \| HUMAN_ACTIVE \| CLOSED` | mistura estado e responsável; o handoff pede separá-los (§18) |
| Mensagem | Mongo, `externalId` com índice **não único**; dedup por `findOne` + `create` | condição de corrida → duplicação possível |
| Baileys | `BaileysBroker`: backoff exponencial com jitter, máx. 20 tentativas, QR e código de pareamento | lógica de reconexão reaproveitável; **auth em arquivo** (`useMultiFileAuthState`), frágil em container |
| Bot | tools `captureLead`, `collectInsuredAssetData`, `escalateToHuman`, `listProducts`, `searchClient`; escala quando não há agente/provider | boa referência de prompts/tools; acesso direto a Mongo dentro das tools |
| Handoff | `transferConversationToHuman`: update condicional `BOT_ACTIVE → WAITING_HUMAN` | padrão de update condicional é o correto; notificação fora da transação |

### 2.3 v2 — fundação atual

```text
Browser ──HTTPS──▶ Caddy ── /api/*, /socket.io/* ──▶ server (Fastify :3001)
                    └── /* ──▶ SPA estática (Vite)        ├── Better Auth
                                                          ├── modules/{auth, organizations, audit, billing(trial)}
                                                          ├── Socket.IO (cookie, rooms user:/org:)
                                                          ├── pg-boss (enqueue transacional)
                                                          └── Prisma ─▶ PostgreSQL (role bens_app, RLS forçado)
```

| Área | Estado | Qualidade |
| --- | --- | --- |
| Tenancy | `db.withTenant(ctx, tx => …)` + RLS `ENABLE/FORCE` por tabela; boot recusa role com bypass; FKs compostas; teste de schema | **alta** — melhor ativo do v2 |
| Auth | Better Auth (e-mail/senha, verificação, reset, 2FA, rate limit em BD), Turnstile, bloqueio de e-mail temporário | alta |
| Orgs | onboarding (org + OWNER + trial), troca de org ativa, convites, membros, transferência de carteira | alta |
| RBAC | `ROLE_PERMISSIONS` estático, `requirePermission` obrigatório por rota (boot falha sem), `scopeFor(ctx)` para carteira | alta; 5 papéis (OWNER, ADMIN, MANAGER, COMMERCIAL, VIEWER) |
| Auditoria | `audit.record(tx, ctx, …)` sem PII, lista fechada de ações | alta |
| Jobs | `infrastructure/queue.ts` sobre pg-boss: `enqueue(tx)` transacional, dedupe por `singletonKey`, crons em `America/Sao_Paulo` | alta |
| Realtime | Socket.IO no mesmo processo, auth por cookie, checagem de Origin | alta; sem adapter (1 instância) |
| Termos | `TermsAcceptance` versionado (usuário do painel) | reaproveitável como padrão para o aceite do cliente final |
| Infra | Dockerfiles multi-stage, `docker-compose.prod.yml`, Caddy com CSP, `migrate` one-shot | pronto para staging |
| Testes | Vitest com PG real (schema por worker), `withTwoTenants`, `withTwoSalespeople`, teste de arquitetura | alta |
| Web | Auth, onboarding, seleção de org, settings (org, membros, segurança) | base de UI reaproveitável |
| Não existe | contatos, conversas, mensagens, canais, IA, comercial, Kanban, follow-up, WhatsApp | — |

**Decisões do v2 que conflitam com o handoff:**
- ADR-006 põe o **Baileys no processo do server**; o handoff (§14) exige ciclo de vida independente.
- Escopo ERP (apólices, comissões, sinistros, Asaas, Meta Cloud, documentos, PDF) está fora do MVP (§3).
- Papéis `OWNER` e `VIEWER` não existem no handoff (§7).

---

## 3. Requirements Summary

### Funcionais

| # | Requisito | Seção do handoff |
| --- | --- | --- |
| F1 | Cadastro self-service → org → usuário ADMIN → Web Chat disponível | 36, 37 |
| F2 | RBAC ADMIN / MANAGER / COMMERCIAL; carteira do COMMERCIAL | 7 |
| F3 | Contato identificado por telefone normalizado, único por org; várias conversas por contato | 9 |
| F4 | Canais Web Chat (link público estável por org) e WhatsApp (Baileys, N números por org) | 10–13 |
| F5 | Personalização do Web Chat: nome, logo, mensagem inicial, cor | 12 |
| F6 | Conversa: estado `OPEN/WAITING/CLOSED` × responsável `AI/QUEUE/HUMAN`; reabre ao receber mensagem | 17, 18, 21 |
| F7 | Handoff manual (humano assume a qualquer momento) e automático (IA pede); só humano devolve para IA | 19, 20 |
| F8 | Fila de leads: ADMIN/MANAGER atribui, COMMERCIAL assume; sem round-robin | 8 |
| F9 | IA conversa, coleta dados, resume, usa tools, pede handoff; não executa operação crítica | 22–24 |
| F10 | Oportunidade/proposta em Kanban com etapas do v1; ganha/perdida | 31, 32 |
| F11 | Follow-up com indicação de pendência no painel | 33 |
| F12 | Auditoria de lead, oportunidade, etapa, atribuição, handoff, follow-up | 35 |
| F13 | Aceite de termos pelo cliente final, persistido com versão e momento | 41 |
| F14 | Trial, suspensão e reativação sem perda de dados | 38–40 |
| F15 | Métricas comerciais básicas | 48 |
| F16 | Mídia não textual recebe orientação, não é processada | 16 |

### Não funcionais

| # | Requisito | Seção |
| --- | --- | --- |
| N1 | Isolamento absoluto entre tenants, garantido no servidor/banco | 6 |
| N2 | Nenhuma mensagem perdida; persistência durável; ordem por conversa; sem duplicação; reprocessável | 5, 15 |
| N3 | Estados de envio `PENDING/SENT/FAILED` | 15 |
| N4 | Mensagem visível em ≤ ~2 s para cliente e corretor | 30 |
| N5 | IA assíncrona; indisponibilidade da IA → fila humana | 25, 27 |
| N6 | Uso de IA atribuível e limitável por org | 29 |
| N7 | Runtime do WhatsApp independente do web/API; reconexão; alerta de novo QR | 13, 14 |
| N8 | Consistência transacional na atribuição (dois comerciais nunca assumem o mesmo lead) | 8, 50 |
| N9 | Rate limiting em canais públicos | 43 |
| N10 | Logs estruturados, correlação por tenant/conversa, erros, métricas básicas, health checks | 44 |
| N11 | Backup automático e restauração | 5 |
| N12 | VPS + Docker, custo baixo | 46 |
| N13 | Provider de IA trocável sem contaminar o domínio | 26 |
| N14 | Escala: 10–50 orgs, ~10 usuários/org, dezenas de conversas simultâneas | 4 |

---

## 4. Gap Analysis

Base de comparação: **v2** (a fundação a reaproveitar). Onde o v1 é relevante, está indicado.

| Requisito | Estado atual | Gap | Ação |
| --- | --- | --- | --- |
| Monorepo, CI, lint, typecheck, Docker, Caddy | v2 pronto | nenhum (continua no repo v2) | **manter** |
| N1 Tenancy (RLS + `withTenant`) | v2 pronto e testado | acesso público (Web Chat) e runtime WhatsApp precisam de resolução de tenant fora de sessão | **manter** + **criar** 2 caminhos de entrada documentados (AD) |
| F1 Onboarding | v2: org + OWNER + trial | usuário vira ADMIN; criar canal Web Chat padrão no onboarding | **adaptar** |
| F2 Papéis | v2: 5 papéis | reduzir para ADMIN/MANAGER/COMMERCIAL; invariante "sempre ≥ 1 ADMIN ativo" substitui "OWNER único" | **refatorar** (pequeno) |
| F2 Carteira | v2: `scopeFor`, `withTwoSalespeople`, transferência | aplicar a contatos, conversas, oportunidades | **manter** |
| Auth, 2FA, Turnstile, termos do usuário | v2 pronto | — | **manter** |
| Auditoria | v2 pronto, lista fechada de ações | acrescentar ações do MVP | **manter** + estender |
| Jobs | v2 `queue.ts` (pg-boss) | precisa rodar também no runtime WhatsApp (mesmo `queue.ts`) | **manter** |
| Realtime | v2 Socket.IO no processo da API | eventos gerados no runtime WhatsApp precisam chegar ao socket → `LISTEN/NOTIFY` | **adaptar** |
| Billing / Asaas | v2 parcial (trial); Asaas planejado | fora do MVP; manter só trial + status da org | **remover** Asaas do plano; **adaptar** trial |
| Storage S3/MinIO, PDF | v2 pronto | único uso no MVP seria o logo | **remover** (logo pequeno no PG) — ver §10 |
| E-mail (SMTP, React Email) | v2 pronto | necessário para auth e convites | **manter** |
| `money.ts` | v2 pronto | valor estimado da oportunidade | **manter** |
| F3 Contato por telefone | inexistente no v2; v1 tem Contact duplicado PG/Mongo | modelo único no PG, `phoneE164` único por org | **criar** |
| F4/F5 Web Chat | v1 widget (app Vite separada); v2 planejado como rota `/embed` | página pública por org, token de visitante, branding | **criar** (referência v1) |
| F6 Conversa | v1 status único | separar `status` × `handler` | **criar** |
| N2 Mensagens | v1 sem índice único, sem ordem garantida | `seq` por conversa, único `(channelId, externalId)`, outbox | **criar** |
| F7 Handoff | v1 update condicional | mesmo padrão, na transação, com auditoria e evento | **criar** (referência v1) |
| F8 Fila de leads / atribuição | inexistente | claim atômico por update condicional | **criar** |
| F9 IA + tools | v1: AI SDK, tools com acesso direto ao banco | boundary do provider, tools → use cases, `AiRun` | **criar** (referência v1 para prompts/tools) |
| N6 Uso de IA | v1 `AiUsageRecord` via fila | contabilizar em `AiRun`, limite por org | **criar** |
| F10 Kanban | v1 etapas + checklist por ramo + promoção a cliente | só as etapas; sem checklist/ramo/cliente | **criar** (etapas do v1) |
| F11 Follow-up | inexistente | entidade simples, pendência por query | **criar** |
| N7 Runtime WhatsApp | v1 no chat-worker; v2 planejava in-process | processo próprio, auth state cifrado no PG, lock de dono | **criar** (reconexão do v1) |
| F13 Aceite do cliente final | v2 só para usuário do painel | `ConsentRecord` por contato/conversa | **criar** |
| F14 Trial / suspensão | v2 `Subscription(TRIALING)` | `Organization.status` + `trialEndsAt`, bloqueio de escrita | **adaptar** |
| N9 Rate limit público | v2 rate limit do Better Auth em BD | `@fastify/rate-limit` nas rotas públicas | **criar** |
| N10 Observabilidade | v2 pino com `requestId`; Sentry planejado | `organizationId`/`conversationId` no log, `/ready`, heartbeat do runtime WhatsApp | **adaptar** |
| N11 Backup | v2 planejado (Fase 13) | `pg_dump` diário off-site + teste de restore | **criar** |
| F15 Métricas | v1 dashboard ERP | consultas SQL sobre as tabelas do MVP | **criar** |
| Meta Cloud API, Messenger, Instagram, ERP (apólice, comissão, sinistro, documentos, renovação) | v1 implementado / v2 planejado | fora do MVP | **remover** do escopo |

---

## 5. Architecture Options

### 5.1 Pergunta central do handoff: Next.js full-stack?

Todas as opções compartilham: PostgreSQL, runtime WhatsApp separado, VPS + Docker. A diferença é **onde vive a lógica de aplicação e como o frontend é entregue**.

- **Opção A** — Next.js full-stack (UI + Route Handlers/Server Actions + domínio) + runtime WhatsApp + PostgreSQL.
- **Opção B** — Next.js (UI) + backend separado + runtime WhatsApp + PostgreSQL.
- **Opção B′** — igual à B, mas com SPA Vite no lugar do Next.js (é o que o v2 já tem).

| Critério | A: Next.js full-stack | B: Next.js + backend | B′: SPA Vite + backend (v2) |
| --- | --- | --- | --- |
| **Complexidade** | 1 app web + 1 runtime. Porém fronteira `"use client"`/RSC/Server Actions; Server Actions são endpoints implícitos, autorização precisa ser lembrada em cada uma | 2 apps web com runtime Node + 1 runtime; Next usado quase como SPA (painel logado) | 1 app de backend + SPA estática + 1 runtime; um modelo mental no front |
| **Deploy** | 1 container Node + worker + WhatsApp | 2 containers Node + WhatsApp | Caddy (estáticos) + api + WhatsApp — **já pronto no v2** |
| **Realtime (≤ 2 s)** | Route Handlers não suportam WebSocket; exige **custom server** (perde parte do modelo do Next) ou SSE; o evento vindo do runtime WhatsApp precisa de um canal até o processo Next | backend cuida; igual a B′ | Socket.IO no backend, **já autenticado por cookie e testado** |
| **Baileys** | processo separado em qualquer opção; A não ajuda nem atrapalha | idem | idem |
| **Jobs** | Next não hospeda workers de longa duração de forma natural → processo worker adicional (ou dentro do runtime WhatsApp, misturando responsabilidades) | backend hospeda pg-boss | backend hospeda pg-boss — **já pronto** |
| **Testes** | testar Server Actions/Route Handlers com banco real é mais trabalhoso; domínio tende a acoplar a `next/headers`, cookies, cache | backend testável com `app.inject` | `app.inject` + PG real + `withTwoTenants` — **já pronto** |
| **Domínio** | risco de regra de negócio espalhada em componentes/actions; exige disciplina extra para manter `Domain` sem Next (§50) | domínio isolado no backend | domínio isolado no backend |
| **Escalabilidade** | ok | ok | ok; API sem estado (Baileys fora dela) permite 2+ réplicas no futuro |
| **Observabilidade** | logs divididos entre runtime Node do Next, edge/middleware e worker | 3 processos Node | 2 processos Node + Caddy |
| **Manutenção** | upgrades do Next (mudanças frequentes em cache/RSC) afetam também o backend | dois frameworks de servidor | um framework de servidor |
| **DX** | um repo, um framework; bom para páginas públicas com SEO | bom front, custo de 2 servidores | Vite rápido; sem SSR (não é necessário no painel) |
| **Custo operacional** | médio | maior | **menor** |
| **Reaproveitamento do v2** | reescrever auth/tenancy/rotas (Better Auth funciona no Next, mas `withTenant`, rotas, testes e OpenAPI teriam de ser portados) | reaproveita backend, reescreve web | **reaproveita tudo** |

**Pontos onde o Next.js ganharia:** páginas públicas com SEO e metatags dinâmicas. No MVP, a única página pública relevante é o link do Web Chat, e o que importa ali é o **preview do link no WhatsApp** (nome/logo da corretora via Open Graph). Isso se resolve com a API servindo um HTML mínimo com as metatags em `/c/:slug` (≈ 20 linhas), sem trazer um framework SSR.

### 5.2 Outras decisões com opções

**Realtime**

| Opção | Prós | Contras |
| --- | --- | --- |
| Polling (1–2 s) | trivial, stateless | latência no limite do requisito; carga constante |
| SSE | simples, HTTP puro, unidirecional basta | reconexão/auth a implementar; seria novo código |
| **Socket.IO (recomendado)** | já existe no v2 com auth por cookie, Origin e rooms; bidirecional para o Web Chat | lib maior que SSE |

Decisão: **Socket.IO**, por reaproveitamento — não por necessidade técnica. Em projeto do zero, SSE seria igualmente válido.

**Comunicação API ↔ runtime WhatsApp**

| Opção | Prós | Contras |
| --- | --- | --- |
| HTTP interno (v1) | explícito | auth interna (HMAC), retry próprio, perde atomicidade com o banco |
| Redis pub/sub + BullMQ (v1) | rápido | +1 serviço sem requisito que o justifique |
| **PostgreSQL: pg-boss para comandos + `NOTIFY` para eventos (recomendado)** | comando e dado na **mesma transação** (outbox natural); `NOTIFY` só é entregue no commit; nenhum serviço novo | `NOTIFY` limita payload a 8 KB (enviar IDs); pg-boss faz polling (latência de segundos) — por isso não serve para realtime |

**Fila/jobs:** manter **pg-boss** (v2, ADR-006). Carga do MVP é baixa; a atomicidade com o dado é exatamente o que N2 exige.

---

## 6. Recommended Architecture

**Monólito modular, um repositório, uma imagem, dois entrypoints, um banco.**

```text
                   ┌──────────────────────── VPS (Docker Compose) ────────────────────────┐
 Painel (SPA) ─┐   │                                                                       │
 Web Chat     ─┼─▶ Caddy ── /api, /socket.io ──▶ api  (Fastify)                           │
 (link público)│   │   └── /* ── SPA estática        ├── HTTP (REST + OpenAPI)            │
               │   │                                 ├── Socket.IO (painel + visitantes)  │
               │   │                                 ├── LISTEN app_events → socket       │
               │   │                                 ├── pg-boss workers: IA, follow-up…  │
               │   │                                 └── modules/*                        │
               │   │                                          │                           │
 WhatsApp ◀────┼───┼──── whatsapp (mesma imagem, outro entrypoint)                         │
               │   │        ├── sessões Baileys (1 por canal), lock de dono               │
               │   │        ├── recebe → persiste Message (+ NOTIFY) → enqueue           │
               │   │        └── worker `whatsapp.send` / `whatsapp.control`               │
               │   │                                          │                           │
               │   │                          PostgreSQL (RLS, pg-boss, auth state cifrado)│
               │   └───────────────────────────────────────────────────────────────────────┘
               └── Provider de IA (1, atrás de adapter) · SMTP · Sentry · backup off-site
```

**Justificativa por requisito:**

| Decisão | Requisito que a justifica |
| --- | --- |
| Runtime `whatsapp` separado | N7 (ciclo de vida independente; deploy da API não derruba sessões) |
| Mesmo código/imagem, sem pacote compartilhado | §14 ("não significa microsserviço"); evita o problema de `packages/core` do v1 |
| Um PostgreSQL, sem Redis | N2 (durabilidade + atomicidade), N12 (custo); nenhum requisito pede Redis |
| RLS + `withTenant` | N1 |
| pg-boss com `enqueue(tx)` | N2, N5, §47 (retry, reprocessamento) |
| `NOTIFY` transacional | N4 com dois processos produzindo eventos |
| SPA + Caddy | §5.1 |
| Provider de IA atrás de adapter | N13 |

**O que fica explicitamente de fora (e o gatilho para entrar):**

| Fora | Gatilho |
| --- | --- |
| Redis / BullMQ | throughput de jobs que o pg-boss não sustente, medido |
| Adapter do Socket.IO / 2+ réplicas da API | CPU ou latência da API; `LISTEN` por instância já funciona para N réplicas |
| Storage S3 | anexos (fora do MVP) |
| Múltiplos providers de IA | requisito comercial |
| Meta Cloud API | requisito comercial (ex.: risco de banimento no Baileys) |
| Tracing distribuído | mais de 2 processos com chamadas entre si |

---

## 7. Domain / Module Boundaries

Mantém a anatomia do v2 (`apps/server/src/modules/<x>/`, use case = função `(deps, ctx, input)`, módulo só escreve nas próprias tabelas, importa outro só via `index.ts`, teste de arquitetura).

| Módulo | Responsabilidade | Tabelas | Origem |
| --- | --- | --- | --- |
| `auth` | identidade, sessão, 2FA, `/me`, termos do usuário | User, Session, Account, Verification, TwoFactor, TermsAcceptance, RateLimit | v2 **manter** |
| `organizations` | org, membros, convites, carteira, onboarding, branding, status/trial | Organization, Member, Invitation | v2 **adaptar** |
| `audit` | trilha sem PII | AuditLog | v2 **manter** |
| `contacts` | contato por telefone, dados do lead, dono (carteira), fila de leads, atribuição | Contact, ConsentRecord | **criar** |
| `conversations` | conversa, mensagens, estado × responsável, handoff, fechamento/reabertura, pipeline de entrada/saída | Conversation, Message | **criar** |
| `channels` | cadastro de canais (Web Chat, WhatsApp), status de conexão, **adapters** de canal | Channel, WhatsAppAuthState | **criar** |
| `ai` | orquestração da IA, contexto, tools, adapter do provider, `AiRun`, limites | AiRun (+ config no Channel/Organization) | **criar** |
| `sales` | oportunidade, etapas do Kanban, ganho/perda | Opportunity | **criar** |
| `followups` | próximo contato, pendências | FollowUp | **criar** |
| `metrics` | consultas agregadas (sem tabela própria) | — | **criar** |

**Regras de dependência (direção):**

```text
channels (adapters) ──▶ conversations ──▶ contacts
ai ──▶ conversations, contacts, sales   (via tools → use cases públicos)
sales ──▶ contacts
followups ──▶ contacts, sales
todos ──▶ audit, organizations (leitura), shared/, infrastructure/
conversations NÃO importa ai   (dispara job `ai.reply`; a IA é consumidora)
conversations NÃO importa baileys (o adapter chama conversations.receiveInbound)
```

**Fronteira de canal (§10):** um contrato pequeno, com os dois casos reais:

```ts
// entrada: todo canal converte para isto e chama o mesmo use case
receiveInbound(tx, { channelId, externalId, fromPhoneE164, kind: 'TEXT' | 'UNSUPPORTED', text?, sentAt })
// saída: conversations grava Message(PENDING); o canal entrega
deliver(message) → WebChat: marca SENT e emite evento · WhatsApp: job `whatsapp.send`
```

Não há interface genérica de "provider" além disso: duas implementações concretas, um `switch` sobre `channel.kind`.

---

## 8. Runtime Architecture

| Processo | Responsabilidade | Escala | Falha |
| --- | --- | --- | --- |
| `caddy` | TLS, SPA estática, proxy `/api` e `/socket.io`, headers/CSP | 1 | restart automático |
| `api` | HTTP, Socket.IO (painel e visitantes), `LISTEN app_events`, workers pg-boss (IA, e-mail, follow-up), crons | 1 (stateless; pode virar N) | sessões WhatsApp **não** caem; mensagens seguem sendo persistidas pelo runtime WhatsApp |
| `whatsapp` | sessões Baileys; entrada (persiste + enfileira + NOTIFY); worker `whatsapp.send` e `whatsapp.control` (conectar, parear, desconectar); heartbeat | **exatamente 1** (lock) | mensagens enviadas ficam `PENDING` no banco e saem quando voltar; entrada do WhatsApp fica no servidor do WhatsApp até reconectar |
| `migrate` | `prisma migrate deploy` one-shot | — | bloqueia o boot |
| `postgres` | dados, RLS, filas, eventos | 1 | ponto único; mitigado por backup + restore testado |

**Detalhes do runtime `whatsapp`:**

- **Dono único:** ao subir, adquire `pg_advisory_lock(<constante>)` numa conexão dedicada. Um segundo processo (ex.: sobreposição num deploy) fica esperando em vez de abrir sessões duplicadas.
- **Boot:** lista os canais WhatsApp ativos de todas as orgs. Isso exige leitura cross-tenant → **uma função `SECURITY DEFINER` que devolve só `(channelId, organizationId)`** e uma AD própria (regra do v2: leitura fora do tenant pede AD e política).
- **Auth state:** no PostgreSQL, cifrado (chave dedicada), implementando `SignalKeyStore` (`get`/`set`) com `makeCacheableSignalKeyStore` e serialização via `BufferJSON` — em vez do `useMultiFileAuthState` do v1, que a própria documentação trata como exemplo e que se perde com o container.
- **Reconexão:** `connection: 'close'` com `DisconnectReason.loggedOut` (401) → canal `NEEDS_PAIRING`, alerta à org, sem retry. Outros códigos → backoff exponencial com jitter (reaproveitar `calculateBackoffDelay` do v1); após N tentativas → `DISCONNECTED` + alerta.
- **QR/código de pareamento:** gravado no canal (TTL curto) + `NOTIFY` → a API empurra para o ADMIN pelo socket.
- **Heartbeat:** atualiza `whatsapp_runtime.lastSeenAt` a cada 30 s; `/api/ready` e o painel mostram "runtime WhatsApp fora" quando atrasado.

**Fluxo de mensagem recebida (WhatsApp):**

```text
Baileys messages.upsert
  → withTenant(org): INSERT Message ON CONFLICT (channelId, externalId) DO NOTHING   ← idempotência
      ├─ conversa aberta do contato+canal (ou reabre / cria); seq = conversation.lastSeq + 1 (UPDATE … RETURNING = lock da linha)
      ├─ se kind = UNSUPPORTED: grava resposta de orientação (PENDING) + enqueue whatsapp.send
      ├─ se handler = AI: enqueue ai.reply { conversationId } (dedupe por conversationId)
      └─ pg_notify('app_events', { org, conversationId, messageId })
  COMMIT  → evento entregue à API → Socket.IO (≤ 2 s)
```

**Fluxo de resposta (humano ou IA):** use case grava `Message(PENDING)` + `enqueue(tx, 'whatsapp.send', { messageId })` + `NOTIFY` na mesma transação → worker no runtime WhatsApp envia → `SENT` (com `externalId`) ou, esgotadas as tentativas, `FAILED` + `NOTIFY`. No Web Chat, a mensagem vira `SENT` na própria transação.

---

## 9. AI Architecture

### 9.1 Fluxo

```text
ai.reply { conversationId }   (job, dedupe por conversationId, retries com backoff)
  1. withTenant: SELECT conversation FOR UPDATE
     └─ handler ≠ AI → termina (humano assumiu no meio)          ← nunca responde por cima do humano
  2. checa limite de uso da org → excedido: handoff para QUEUE
  3. monta contexto: branding/instruções da org + dados do lead + últimas N mensagens (sem telefone)
  4. provider.generate({ system, messages, tools })   ← fora da transação
  5. executa tool calls validadas (Zod) → use cases, com ToolContext fixado pelo sistema
  6. withTenant: revalida handler = AI e que não chegou mensagem mais nova que a última considerada
     └─ se chegou: descarta a resposta e reenfileira (evita responder a contexto velho)
     └─ grava Message(AI) + AiRun + NOTIFY (+ whatsapp.send)
  falha final (provider fora, timeout, erro de schema) → handoff automático para QUEUE + mensagem ao cliente
```

### 9.2 Boundary do provider (N13)

```ts
// modules/ai/provider.ts — único arquivo que importa o SDK do provider
type AiModel = {
  generate(input: { system: string; messages: ChatTurn[]; tools: ToolSpec[] }):
    Promise<{ text: string | null; toolCalls: ToolCall[]; usage: { inputTokens: number; outputTokens: number }; model: string }>
}
```

- `ToolSpec` e `ChatTurn` são tipos próprios (Zod + dados simples). O adapter os traduz para o SDK.
- Uma implementação agora. A recomendação é usar um modelo Claude (ex.: `claude-sonnet-5`; `claude-haiku-4-5` se custo pesar), com a escolha registrada no ADR.
- Teste: um `FakeAiModel` roteirizado cobre o fluxo inteiro sem rede (handoff, tool calls, falha).

### 9.3 Tools do MVP

| Tool | Tipo | Efeito | Autorização |
| --- | --- | --- | --- |
| `update_lead_information` | escrita de baixo risco | nome, e-mail, interesse/ramo, observações no Contact | só o contato da conversa; campos em allowlist; auditado como ator `AI` |
| `request_human` | controle | `handler: AI → QUEUE` + motivo | só a conversa atual |
| `get_lead` | leitura | dados do próprio contato | só o contato da conversa |

- **`ToolContext = { organizationId, conversationId, contactId }` é injetado pelo sistema.** A IA nunca recebe nem informa IDs, tenant ou telefone como parâmetro — isso elimina a classe "IA acessa outro tenant" por construção.
- Futuras (`get_proposal_status` etc.) entram como novas entradas no registro, sem mudar o fluxo.
- **Não existem** tools para mover etapa, marcar ganho, alterar valor ou qualquer escrita em `sales` (§24).

### 9.4 Handoff e human-in-the-loop

| Gatilho | Resultado |
| --- | --- |
| IA chama `request_human` (cliente pediu, assunto sensível, não sabe responder) | `QUEUE` |
| Falha definitiva do provider / limite de uso / erro de validação da saída | `QUEUE` |
| Limite de respostas da IA por conversa (v1 tinha) | `QUEUE` |
| Humano assume | `HUMAN` (IA para imediatamente; passo 1/6 do fluxo garante) |
| Humano devolve explicitamente | `HUMAN → AI` (única transição para AI a partir de HUMAN) |

A IA **nunca** sai de `QUEUE` sozinha.

### 9.5 Uso e observabilidade

`AiRun(organizationId, conversationId, model, inputTokens, outputTokens, latencyMs, toolsCalled[], outcome: REPLIED|HANDOFF|FAILED|SKIPPED, errorCode)` — atende §29 (atribuição, base para quota/cobrança) e §51 (observabilidade da IA) com uma tabela. Limite mensal por org em `Organization.aiMonthlyTokenLimit`, checado antes da chamada.

**Contexto (§28):** janela das últimas N mensagens + campos estruturados do lead. Resumo e recuperação seletiva ficam para quando houver evidência de conversas longas.

---

## 10. Data Architecture

### 10.1 Modelo (novo; tabelas do v2 mantidas)

```text
Organization ─┬─ Member(role: ADMIN|MANAGER|COMMERCIAL)
  status, trialEndsAt, slug, publicChatKey, branding(name, logo, color, greeting), aiEnabled, aiMonthlyTokenLimit
              ├─ Channel(kind: WEB_CHAT|WHATSAPP, name, phoneE164?, connectionStatus, aiEnabled)
              │     └─ WhatsAppAuthState(channelId, key, valueEncrypted)
              ├─ Contact(phoneE164, name?, email?, leadStatus, ownerId?, interest?, notes?)   @@unique(org, phoneE164)
              │     ├─ ConsentRecord(contactId, conversationId, channel, noticeVersion, acceptedAt)
              │     ├─ Conversation(channelId, status, handler, assigneeId?, lastSeq, lastMessageAt, closedAt?)
              │     │     └─ Message(seq, direction, author: CONTACT|AI|HUMAN|SYSTEM, authorUserId?, kind, text?,
              │     │                deliveryStatus: PENDING|SENT|FAILED, externalId?, failureReason?)
              │     │           @@unique(conversationId, seq)   @@unique(org, channelId, externalId) WHERE externalId IS NOT NULL
              │     ├─ Opportunity(stage, title, estimatedValueCents?, ownerId, lostReason?, wonAt?, lostAt?)
              │     └─ FollowUp(contactId, opportunityId?, dueAt, note, assigneeId, doneAt?)
              ├─ AiRun(...)
              └─ AuditLog (v2)
```

Todas as tabelas acima com `organizationId` seguem o ADR-004 do v2: RLS `ENABLE + FORCE`, política `tenant_isolation`, FKs compostas, únicos incluindo `organizationId`, IDs UUID v7 gerados no servidor.

### 10.2 Consistência

| Invariante | Mecanismo |
| --- | --- |
| Telefone único por org | `@@unique([organizationId, phoneE164])`; normalização E.164 na borda (lib `libphonenumber-js`, BR como padrão) |
| Mensagem não duplica | único parcial em `externalId` + `ON CONFLICT DO NOTHING` |
| Ordem por conversa | `seq` atribuído com `UPDATE conversation SET lastSeq = lastSeq + 1 … RETURNING` (lock de linha serializa entradas concorrentes da mesma conversa; conversas diferentes seguem em paralelo) |
| Uma conversa aberta por contato+canal | índice único parcial `(org, contactId, channelId) WHERE status <> 'CLOSED'` |
| Dois comerciais não assumem o mesmo lead | `UPDATE contact SET ownerId = $me WHERE id = $id AND ownerId IS NULL` → 0 linhas = `409 ALREADY_ASSIGNED` |
| Dois humanos não assumem a mesma conversa | `UPDATE conversation SET handler='HUMAN', assigneeId=$me WHERE id=$id AND handler IN ('AI','QUEUE')` → 0 linhas = 409 |
| Job/evento só existe se o dado existir | `enqueue(tx)` e `pg_notify` dentro da transação |
| Reprocessamento | mensagens ficam no banco; jobs são idempotentes (checam estado antes de agir); "reprocessar" = reenfileirar pelo ID |

### 10.3 Máquina de estados da conversa

```text
status:   OPEN ⇄ WAITING      qualquer → CLOSED     CLOSED --nova mensagem--> OPEN (mesma conversa)
handler:  AI → QUEUE (request_human | falha | limite)
          AI → HUMAN (humano assume)     QUEUE → HUMAN (assumir/atribuir)
          HUMAN → AI (ação explícita)    HUMAN → QUEUE (devolver à fila)
          proibido: QUEUE → AI automático; HUMAN → AI automático
```

Transições como **funções puras** (`conversation-state.ts`) com teste unitário de todas as combinações (padrão do v2), e o use case aplica com update condicional.

### 10.4 Outros pontos

- **Logo:** `bytea` ≤ 200 KB no PG, validado por magic bytes, servido com cache. Remove MinIO/R2 do MVP; volta quando anexos entrarem.
- **Retenção/encerramento (§40):** `Organization.status = CLOSED` bloqueia acesso sem apagar linhas; FKs com `RESTRICT` (v2) já impedem cascade acidental. Anonimização LGPD fica para depois.
- **Exportação futura (§49):** modelo relacional simples por tenant já permite export por consulta; nada a construir agora.
- **Backup:** `pg_dump` diário cifrado para storage off-site (R2/B2), retenção 30 dias, **restore testado mensalmente** num container limpo. Opcional depois: WAL archiving se o RPO de 24 h for inaceitável.

---

## 11. Security Architecture

| Camada | Decisão |
| --- | --- |
| **Autenticação (painel)** | Better Auth do v2: cookie httpOnly, host-only, SameSite=Lax; sessão em banco; 2FA; Turnstile no cadastro |
| **Tenant (painel)** | vem só da sessão validada contra `Member`; RLS no banco (v2) |
| **Tenant (Web Chat público)** | resolvido pelo `publicChatKey` do link → função/política dedicada (como `withInvitation` do v2) → daí em diante `withTenant`. O visitante recebe um **token de visitante** (cookie httpOnly escopado a `/api/public/chat`, assinado) vinculado a `(org, contactId, conversationId)` |
| **Tenant (runtime WhatsApp)** | `organizationId` vem da linha do `Channel`, nunca do conteúdo da mensagem |
| **Autorização** | `requirePermission` obrigatório por rota (v2); permissões novas: `lead:assign`, `lead:claim`, `conversation:attend`, `conversation:close-any`, `conversation:return-to-ai`, `opportunity:write`, `channel:manage`, `org:branding` |
| **Carteira** | `scopeFor(ctx)` do v2: COMMERCIAL vê contatos/oportunidades/conversas próprios **e a fila**; MANAGER/ADMIN veem tudo; fora do escopo = 404 |
| **Encerramento** | COMMERCIAL só encerra conversa em que é `assigneeId`; MANAGER/ADMIN qualquer uma (regra no use case + teste) |
| **Web Chat e identidade por telefone** | o telefone digitado **não é verificado**. Por isso o visitante **só vê as mensagens da conversa criada na própria sessão** (token), nunca o histórico anterior do contato. O comercial vê o histórico completo, com indicação de canal |
| **Rate limiting** | `@fastify/rate-limit` em memória: início de conversa por IP e por `publicChatKey`; mensagens por token de visitante; tamanho máximo de mensagem; Turnstile no formulário de início |
| **LGPD** | aviso/termos aceitos antes da primeira mensagem do Web Chat → `ConsentRecord(noticeVersion, acceptedAt)`; local storage só para UX. Sem documento pessoal. PII fora de logs (`pino.redact` do v2) e fora do prompt quando desnecessária (telefone) |
| **IA** | tools com `ToolContext` fixado pelo sistema; allowlist de campos; sem SQL; sem escrita comercial crítica; saída validada por schema antes de qualquer efeito |
| **Segredos** | chave separada para cifrar o auth state do WhatsApp |
| **Headers/CSRF** | mantidos do v2 (helmet, CSP no Caddy, checagem de Origin); a rota `/c/:slug` precisa de CSP própria se for embutível (não é requisito agora) |

---

## 12. Roadmap

Premissas: cada fase termina com `lint`, `typecheck`, `test`, `build` verdes; staging na VPS desde a Fase 0 (o v2 já tem o compose de produção); processo por feature via `tlc-spec-lean` (padrão do v2). Fases pequenas, com entrega testável.

```text
F0 Foundation ─▶ F1 Identity/Tenant ─▶ F2 Conversation core ─┬─▶ F3 Web Chat + Inbox humano ─▶ F4 IA ─▶ F5 Handoff + fila de leads
                                                              └─▶ S1 Spike WhatsApp runtime (paralelo, descartável)
F5 ─▶ F6 Leads/Comercial ─▶ F7 Kanban ─▶ F8 Follow-up ─▶ F9 WhatsApp ─▶ F10 SaaS/Trial ─▶ F11 Métricas + Produção
```

**Mudanças de ordem em relação ao handoff, e por quê:**
- **Inbox humano (F3) antes da IA (F4):** a indisponibilidade da IA cai na fila humana (§25). Sem fila e sem inbox, a IA não tem caminho de falha seguro. Também permite testar o produto ponta a ponta sem custo de IA.
- **Spike S1 cedo:** o runtime WhatsApp é o maior risco técnico (lib não oficial, processo separado, auth state em banco). Validar a fronteira PG (fila + NOTIFY) entre processos em F2 evita descobrir um problema de arquitetura na F9.

---

### F0 — Foundation (pivot do repo v2)

- **Objetivo:** o repo v2 com o escopo ERP podado e a documentação descrevendo o MVP.
- **Requisitos:** N1, N10 (parcial), N12.
- **Dependências:** roadmap aprovado; ADRs do pivot escritos.
- **Mudanças arquiteturais:** no próprio v2, manter `auth`, `organizations`, `audit`, `shared`, `infrastructure/{database,queue,realtime,email}`, `test/`, web (auth, onboarding, settings), CI, Dockerfiles, Caddy e compose. Remover storage/MinIO, PDF, o plano do Asaas e as rotas/módulos planejados do ERP. Reescrever `CLAUDE.md`, `docs/architecture.md`, `docs/roadmap.md` e `.specs/STATE.md`; aposentar `docs/migration.md`; marcar os ADRs do v2 revisados ou substituídos (§13).
- **Entregáveis:** commit de pivot; `pnpm dev` sobe api + web; staging acessível.
- **Testes:** suíte herdada do v2 verde (inclusive schema de RLS e `withTwoTenants`).
- **Critério de conclusão:** CI verde; nenhum código referencia recursos removidos; docs descrevem o MVP, não o ERP.

### F1 — Identity / Tenant / RBAC

- **Objetivo:** papéis e onboarding do MVP.
- **Requisitos:** F1, F2, N1.
- **Dependências:** F0.
- **Mudanças:** papéis `ADMIN | MANAGER | COMMERCIAL`; invariante "≥ 1 ADMIN ativo" (substitui OWNER único); onboarding cria org + ADMIN + trial + `publicChatKey` (o **canal Web Chat padrão** ficou para a F2, com a tabela `Channel`); branding (nome, logo, cor, saudação); `Organization.status`.
- **Entregáveis:** telas de onboarding e settings/branding; matriz de permissões nova.
- **Testes:** snapshot da matriz role × permissão; toda rota com permissão; último ADMIN não pode ser rebaixado/removido; onboarding cria canal; cross-tenant em todas as rotas novas.
- **Critério:** cadastro → org → ADMIN → link do Web Chat visível em settings (ainda sem chat).

### S1 — Spike: runtime WhatsApp (paralelo a F2/F3, descartável)

- **Objetivo:** validar, com um número de teste, o que a F9 assume.
- **Validar:** (1) segundo entrypoint da mesma imagem; (2) auth state cifrado no PG sobrevive a restart do container; (3) `enqueue` na API → worker no runtime WhatsApp; (4) `NOTIFY` do runtime → socket da API em < 2 s; (5) advisory lock impede duas instâncias; (6) comportamento em `loggedOut`; (7) se o Baileys aceita `messageId` próprio no envio (reduziria duplicidade em retry).
- **Entregável:** relatório curto + ADR confirmado ou revisado. Código não entra em `main`.

### F2 — Conversation core

- **Objetivo:** domínio de contato, conversa e mensagem, independente de canal.
- **Requisitos:** F3, F6, N2, N3, N4.
- **Dependências:** F1.
- **Mudanças:** módulos `contacts` e `conversations`; normalização E.164; `receiveInbound`/`sendMessage`; `seq`; dedupe por `externalId`; máquina de estados pura; `infrastructure/events.ts` (`notify(tx, …)` + `LISTEN` na API → Socket.IO rooms `org:`, `user:`, `conversation:`).
- **Entregáveis:** use cases + API interna do painel para listar/ler conversas (sem canal real ainda; testes injetam mensagens).
- **Testes:** todas as transições (unitário); inbound duplicado não duplica; 50 inbounds concorrentes na mesma conversa → `seq` contíguo e ordenado; conversas diferentes em paralelo; conversa fechada reabre e preserva histórico; evento chega ao socket só após commit (rollback → nenhum evento); `withTwoTenants`, `withTwoSalespeople`.
- **Critério:** mensagem injetada aparece no socket do painel em < 2 s em teste de integração.

### F3 — Web Chat + Inbox humano

- **Objetivo:** primeiro fluxo real: cliente fala pelo link, humano responde.
- **Requisitos:** F4 (Web Chat), F5, F13, N4, N9; parte de F7 (assumir/responder/encerrar).
- **Dependências:** F2.
- **Mudanças:** rota pública `/c/:slug` (SPA) + HTML com Open Graph servido pela API; `/api/public/chat/*`; token de visitante; namespace Socket.IO de visitante; telefone + aceite (`ConsentRecord`) + Turnstile; rate limit; inbox no painel (fila, minhas conversas, responder, assumir, encerrar); sem IA → conversas nascem em `QUEUE`.
- **Testes:** link de org A nunca cria dado na org B; visitante não lê conversa anterior do mesmo telefone; aceite obrigatório (sem aceite → 4xx); rate limit dispara; COMMERCIAL só encerra as próprias; MANAGER encerra qualquer; e2e Playwright: cliente envia → comercial vê → responde → cliente vê.
- **Critério:** fluxo e2e verde no staging.

### F4 — IA

- **Objetivo:** IA atende primeiro, com tools e falha segura.
- **Requisitos:** F9, N5, N6, N13; handoff automático de F7.
- **Dependências:** F3.
- **Mudanças:** módulo `ai`: adapter do provider, `ai.reply` job, contexto em janela, tools `get_lead`/`update_lead_information`/`request_human`, `AiRun`, limite mensal por org, limite de respostas por conversa, `aiEnabled` por org/canal; conversas passam a nascer em `AI` quando habilitado.
- **Testes (com `FakeAiModel`):** resposta persistida e entregue; `request_human` → `QUEUE`; provider falha em todas as tentativas → `QUEUE` + mensagem ao cliente, nenhuma mensagem perdida; limite excedido → `QUEUE`, humano segue funcionando; humano assume durante a geração → resposta da IA descartada; mensagem nova durante a geração → reprocessa com o contexto novo; tool não recebe/aceita IDs; tentativa de escrever campo fora da allowlist → rejeitada; `AiRun` gravado em todos os desfechos. Teste manual com provider real no staging.
- **Critério:** conversa completa no staging com IA coletando nome/interesse e transferindo quando pedido.

### F5 — Handoff completo + fila de leads

- **Objetivo:** controle humano explícito e distribuição consistente.
- **Requisitos:** F7, F8, N8, F12 (parte).
- **Dependências:** F4.
- **Mudanças:** assumir conversa de `AI` a qualquer momento; devolver à IA (ação explícita, permissão própria); devolver à fila; fila de leads (contatos sem dono); ADMIN/MANAGER atribuem; COMMERCIAL assume; quem assume conversa de contato sem dono vira dono (regra do v2 ADR-010); auditoria de atribuição, handoff, entrada/saída de humano.
- **Testes:** **concorrência** — N comerciais assumem o mesmo lead/conversa em paralelo → exatamente 1 sucesso, demais 409; nenhuma transição automática para `AI` a partir de `QUEUE`/`HUMAN`; auditoria gravada em cada ação.
- **Critério:** testes de concorrência verdes contra PG real; trilha de auditoria visível.

### F6 — Leads / Comercial

- **Objetivo:** lead qualificado vira oportunidade.
- **Requisitos:** F10 (parte), F2 (carteira), F12.
- **Dependências:** F5.
- **Mudanças:** tela de contatos/leads (filtros por status, dono, fila); `leadStatus`; criar oportunidade a partir do contato ou da conversa; módulo `sales` com `Opportunity`; resumo do lead para outro corretor continuar (§34: dados estruturados + histórico; resumo por IA opcional como botão, não automático).
- **Testes:** carteira (`withTwoSalespeople`); oportunidade só no próprio contato para COMMERCIAL; auditoria de alterações.
- **Critério:** do chat ao lead e à oportunidade sem sair do painel.

### F7 — Kanban

- **Objetivo:** acompanhamento visual.
- **Requisitos:** F10, F12.
- **Dependências:** F6.
- **Mudanças:** etapas fixas do v1 (`CAPTURE, QUOTE, PROTOCOL, INSPECTION, PAYMENT, POLICY_ISSUED | LOST`, com rótulos de UI a confirmar); `POLICY_ISSUED` = ganha; `LOST` exige motivo; reabrir; transições como função pura; `dnd-kit`; atualização em tempo real.
- **Testes:** todas as transições; `LOST` sem motivo → 422; COMMERCIAL não move oportunidade alheia; auditoria de mudança de etapa; IA não tem caminho para mover etapa (teste de arquitetura: `ai` não importa use cases de escrita de `sales`).
- **Critério:** arrastar card persiste, audita e reflete em outra aba em < 2 s.

### F8 — Follow-up

- **Objetivo:** não perder acompanhamento.
- **Requisitos:** F11, F12.
- **Dependências:** F6 (F7 recomendado).
- **Mudanças:** `FollowUp` (criar, concluir, reagendar); pendências calculadas por consulta (`dueAt <= now AND doneAt IS NULL`) — **sem cron**; contador no menu, lista "Hoje/Atrasados", badge no card do Kanban.
- **Testes:** carteira; pendência aparece/desaparece corretamente; auditoria.
- **Critério:** comercial vê o que tem pendente ao abrir o painel.

### F9 — WhatsApp

- **Objetivo:** segundo canal real.
- **Requisitos:** F4 (WhatsApp), F16, N7, N2.
- **Dependências:** F2, S1; F4/F5 para IA e handoff funcionarem igual ao Web Chat.
- **Mudanças:** entrypoint `whatsapp`; `WhatsAppAuthState` cifrado; advisory lock; função `SECURITY DEFINER` de boot; pareamento por QR e código; status de conexão + alerta; reconexão com backoff; `whatsapp.send`/`whatsapp.control`; mídia → orientação; heartbeat; aviso LGPD no primeiro contato (conforme Open Question 3).
- **Testes:** adapter com socket Baileys falso: entrada idempotente, ordem, `UNSUPPORTED` responde orientação, `loggedOut` → `NEEDS_PAIRING` sem retry, erro transitório → backoff; envio `PENDING → SENT/FAILED`; runtime fora → mensagens do painel ficam `PENDING` e saem na volta; API reiniciada → sessões seguem. Teste manual com número real no staging.
- **Critério:** número de teste conectado no staging por 7 dias com reconexões automáticas registradas e zero mensagem perdida.

### F10 — SaaS / Trial / Suspensão

- **Objetivo:** ciclo comercial do SaaS sem cobrança automatizada.
- **Requisitos:** F14, §39–40.
- **Dependências:** F1.
- **Mudanças:** `Organization.status: TRIAL | ACTIVE | SUSPENDED | CLOSED` + `trialEndsAt`; bloqueio de escrita no painel (402) fora de `TRIAL`/`ACTIVE`, leitura liberada; comportamento dos canais conforme premissa P5; ativação/suspensão manual pelo super-admin.
- **Testes:** trial expirado bloqueia operações novas e preserva dados; reativação restaura acesso; mensagens recebidas nunca são descartadas.
- **Critério:** suspender e reativar uma org no staging sem perda.

### F11 — Métricas + Produção

- **Objetivo:** operar e medir.
- **Requisitos:** F15, N10, N11.
- **Dependências:** todas.
- **Mudanças:** dashboard com consultas SQL (leads recebidos/atendidos, oportunidades, ganhos/perdas, tempo até primeiro atendimento humano, conversão por etapa); Sentry (api, whatsapp, web) sem PII; logs com `organizationId`/`conversationId`/`channelId`; `/api/ready` (PG, pg-boss, heartbeat do WhatsApp); monitor externo; alertas (job esgotado, canal desconectado > 30 min, runtime WhatsApp sem heartbeat); backup diário + **restore testado**; runbooks (deploy, rollback, restore, re-pareamento).
- **Testes:** `/ready` 503 com PG fora; métricas com dados semeados que não passam por constante/ordem; restore num ambiente limpo.
- **Critério:** restore executado com sucesso; alerta de canal fora chega; go-live.

> **Observabilidade não é só a F11:** `requestId`/`organizationId`/`conversationId` no log e `/api/health` entram já em F0–F2; a F11 fecha alertas, Sentry e dashboards.

---

## 13. ADR Candidates

| # | Decisão | Status sugerido |
| --- | --- | --- |
| ADR-A | Pivot do repo v2 de ERP para o MVP (o que fica, o que sai) | novo |
| ADR-B | Frontend SPA Vite + TanStack Router em vez de Next.js full-stack (análise §5) | revisa ADR-009 do v2 |
| ADR-C | Runtime WhatsApp separado: mesmo código, outro entrypoint, dono único via advisory lock | **substitui** o trecho de Baileys do ADR-006 do v2 |
| ADR-D | Comunicação entre runtimes pelo PostgreSQL: pg-boss para comandos, `NOTIFY` transacional para eventos | novo |
| ADR-E | Modelo de conversa: `status` × `handler`, `seq` por conversa, idempotência por `externalId` | novo |
| ADR-F | Fronteira de canal (`receiveInbound` / `deliver`) com dois adapters concretos | novo |
| ADR-G | Arquitetura de IA: adapter do provider, tools com `ToolContext` injetado, `AiRun`, falha → fila | novo |
| ADR-H | Escolha do provider/modelo de IA inicial | novo |
| ADR-I | Identidade no Web Chat por telefone não verificado e visibilidade restrita à sessão | novo |
| ADR-J | Atribuição concorrente por update condicional (lead e conversa) | novo |
| ADR-K | Papéis ADMIN/MANAGER/COMMERCIAL e invariante de ≥ 1 ADMIN | revisa ADR-005 do v2 |
| ADR-L | Estado da organização (trial, suspensão, encerramento) sem billing automatizado | novo |
| ADR-M | Logo no PostgreSQL; storage de objetos adiado até anexos | novo |
| — | Herdados sem mudança: RLS (ADR-004), Better Auth (ADR-003), contrato OpenAPI/Orval (ADR-007), deploy (ADR-008), carteira (parte do ADR-010) | manter |

---

## 14. Risks

| Risco | Tipo | Impacto | Mitigação |
| --- | --- | --- | --- |
| Baileys: banimento de número, mudança de protocolo, instabilidade da lib | técnico/produto | alto | spike S1; versão fixada; números de teste; aviso ao cliente sobre o risco; Meta Cloud API como evolução documentada |
| Envio duplicado no WhatsApp após crash entre "enviou" e "gravou SENT" | técnico | médio | at-least-once aceito e documentado; verificar `messageId` próprio no S1 |
| Telefone não verificado no Web Chat (alguém usa o número de outra pessoa) | segurança/produto | médio | visitante não vê histórico; comercial vê o canal de origem; OTP como evolução |
| `NOTIFY` perdido se a API estiver reconectando ao PG | técnico | baixo | ao reconectar o socket/listener, o cliente refaz a consulta (`invalidateQueries`); o banco é a fonte de verdade, o evento é só aviso |
| Custo de IA fora de controle | produto | médio | limite por org + limite de respostas por conversa + `AiRun` |
| Qualidade da IA (respostas erradas sobre seguros) | produto | alto | prompt restrito à coleta e triagem; nenhuma tool que prometa preço/cobertura; handoff fácil |
| PostgreSQL é ponto único de falha | operacional | alto | backup diário + restore testado; RPO 24 h aceito no MVP (§5: sem SLA) — reavaliar WAL archiving |
| Poda do v2 incompleta deixa conceitos ERP no código/docs, confundindo agentes | processo | médio | F0 tem critério explícito de docs e código sem referências removidas |
| Conflito LGPD no WhatsApp (aceite antes do atendimento) | legal | médio | Open Question 3 |
| Um desenvolvedor + agentes: escopo crescendo | processo | alto | roadmap em fases pequenas com critério de conclusão; pergunta de §57 em cada fase |

---

## 15. Open Questions

Somente as que bloqueiam uma decisão ou uma fase.

1. ~~**Estratégia de repositório.**~~ **Decidido (2026-09-23):** continuar no repo `bens-seguros-v2`, com pivot de escopo e reescrita dos docs de ERP (ver `handoff.md` §0).
2. ~~**Semântica de `WAITING` (bloqueia F2).**~~ **Decidido (2026-09-23):** `WAITING` = aguardando o cliente, automático (ADR-013). Texto original: O handoff lista `OPEN / WAITING / CLOSED` sem definir `WAITING`. Proposta: `WAITING` = aguardando resposta do **cliente** (última mensagem foi nossa); volta a `OPEN` quando o cliente responde; base futura para auto-close por inatividade. Confirma?
3. ~~**Aceite LGPD no WhatsApp (bloqueia F9).**~~ **Decidido (2026-09-23):** opt-in por resposta, como proposto; validação jurídica antes do go-live (ADR-014). Texto original: No Web Chat o aceite é um checkbox antes da primeira mensagem. No WhatsApp o cliente já escreveu antes de ver qualquer aviso. Proposta: a primeira resposta envia o aviso com link e o pedido de confirmação ("responda SIM para continuar"); até a confirmação, a mensagem é persistida mas a IA não processa conteúdo. Isso precisa de validação jurídica ou de produto.

### Premissas assumidas

**Todas confirmadas em 2026-09-23:** P1 (ADR-013), P2 e P3 (ADR-011), P4 (ADR-016), P5 (ADR-017), P6 (ADR-014). Também decidido: o limite de usuários passa a `Organization.maxUsers` (ADR-017), e o staging publicado sai da F0 e vira um marco antes da F3 (ADR-011).

- **P1.** Conversa reaberta volta para `AI` se a IA estiver habilitada, senão `QUEUE`. Nunca volta direto para o humano anterior. Ele é notificado se for o dono do contato.
- **P2.** Etapas do Kanban do v1 sem as regras de ERP (checklist por ramo, detalhes do bem, promoção a cliente). Movimento livre entre etapas, `LOST` com motivo obrigatório.
- **P3.** "Lead" é o `Contact` com `leadStatus`. "Oportunidade/Proposta" é uma única entidade (`Opportunity`), e o Kanban representa o ciclo da proposta.
- **P4.** COMMERCIAL vê a fila inteira (para poder assumir) e só a própria carteira fora dela.
- **P5.** Org suspensa ou com trial expirado: mensagens recebidas continuam persistidas, a IA é desativada, o Web Chat mostra "atendimento indisponível" para novas conversas e o painel fica somente leitura.
- **P6.** Uma org tem um único link público de Web Chat (um canal Web Chat). Vários números são exclusividade do WhatsApp.

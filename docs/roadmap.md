# Roadmap do MVP

> Base: [`handoff.md`](./handoff.md) (requisitos), [`architecture.md`](./architecture.md), ADRs 001–017 (as do MVP são 011–017) e a análise em [`architecture-analysis.md`](./architecture-analysis.md) §12, com as decisões de 2026-09-23.
> Cada fase termina com o CI verde (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`) e com a pergunta: **"Qual requisito justifica essa complexidade?"**
> **Processo:** no início de cada fase ou feature, o agente declara o nível de spec (`tlc-spec-lean` ou `tlc-spec-driven`) segundo o `CLAUDE.md`. Expectativa: lean em todas; driven só se a fase se mostrar grande e incerta (candidatas: F4 e F9).
> O v2 (Fases 1–4 do roadmap anterior) está concluído e é a fundação: ver o *Apêndice — Histórico v2*.
> **Fullstack (AD-019, a partir de 2026-09-25):** toda feature com superfície de usuário (tela no painel, fluxo ou link público) entrega API **e** tela na mesma feature e prova o caminho feliz com Playwright (`apps/web/e2e/`). Isentas só as fatias de infraestrutura ou de domínio sem UI. Por isso cada fase a partir da F4 lista **Telas** e o smoke Playwright nos **Testes**. F0–F3 foram feitas backend-first; a auditoria de 2026-09-26 achou as 33 rotas com tela e 4 gaps de caso de uso, cada um com dono abaixo (F5, F6, F11).

```text
F0 Poda ─▶ [H3] ─▶ F1 Identity/Tenant ─▶ F2 Conversation core ─┬─▶ [Staging] ─▶ F3 Web Chat + Inbox ─▶ F4 IA ─▶ F5 Handoff + fila
                                                               └─▶ S1 Spike WhatsApp (paralelo, descartável)
F5 ─▶ F6 Leads/Comercial ─▶ F7 Kanban ─▶ F8 Follow-up ─▶ F9 WhatsApp ─▶ F10 SaaS/Trial ─▶ F11 Métricas + Produção

[H3] = checkpoint do harness de agentes (skill `harness-eval`) · [Staging] = marco de infraestrutura
```

**Ordem, e por quê:**
- **Inbox humano (F3) antes da IA (F4):** a indisponibilidade da IA cai na fila humana (handoff §25); sem fila e inbox, a IA não tem caminho de falha seguro.
- **Spike S1 cedo:** o runtime WhatsApp é o maior risco técnico; validar a fronteira PG (fila + `NOTIFY`) entre processos evita descobrir um problema de arquitetura na F9.
- **Staging publicado antes da F3:** é quando o primeiro critério "e2e no staging" aparece; fora da F0 para a poda não depender de VPS e DNS (ADR-011).
- **F10 depende só da F1** e pode ser antecipada se o go-live comercial pedir.

---

## F0 — Poda do ERP

- **Objetivo:** o repositório sem código, dependências e docs de ERP.
- **Requisitos:** N12 (custo, menos serviços); pré-condição de todas as fases.
- **Dependências:** este roadmap e os ADRs 011–017 aprovados.
- **Mudanças:** remover `infrastructure/storage.ts` e `pdf.ts` (+ specs), `@aws-sdk/*`, `@react-pdf/renderer`, `S3_*` do config, `ensureBucket` do boot, MinIO do compose de dev, do CI e dos `.env*`; `Member.commissionSplitBp` (schema, saída da API, web e testes); aposentar `prompts/prompt-0*.md`, `docs/legacy-analysis.md`, `docs/original-brief.md`; `S3_*` do runbook de staging. Plano: `.specs/features/erp-prune/`.
- **Testes:** suíte herdada verde (schema de RLS, `withTwoTenants`, arquitetura); `staging-smoke.mjs` local.
- **Critério:** CI verde; nenhum código, config ou doc vivo referencia storage, PDF, MinIO, comissão ou módulos do ERP. Exceção: o texto dos Termos de Uso, reescrito na revisão jurídica antes do go-live (F11).

## Checkpoint H3 — Harness depois da poda

- **Objetivo:** confirmar que `CLAUDE.md`, `architecture.md` e `roadmap.md` reescritos não citam caminhos inexistentes antes das fases de domínio.
- **Como:** `harness-eval` numa sessão nova, Q2 = `A only`.
- **Critério:** Track A sem BROKEN.
- **Resultado (2026-09-24):** rodado com Q1 = `docs/architecture.md` + `docs/roadmap.md` e Q2 = `A only`. Os relatórios ficam fora do git, em `.harness-eval/runs/2026-09-24-h3/`.
  - Track A: 19 BROKEN no script, todos falso positivo, das mesmas famílias do H2 (diretório checado como arquivo, exemplos genéricos das skills vendoradas, comando de outra stack, `scripts/export-openapi.ts` relativo a `apps/server`, `db:migrate` fora do `package.json` da raiz). Checagem manual: todo helper, caminho e comando do `CLAUDE.md` existe; todo [existe] do `architecture.md` existe e nenhum [Fx] nasceu antes da fase; nenhum doc vivo cita o que a F0 removeu (só a própria F0 e o Apêndice).
  - **Aplicado:** `scripts/export-openapi.ts`, único arquivo de `apps/server` sem marcação na árvore do `architecture.md`, ganhou `[existe]`. Fora do harness: o container órfão do MinIO saiu do ambiente local (`docker compose up -d --remove-orphans`).
  - **Mantido:** os exemplos genéricos das skills vendoradas (o dono é o upstream, `skills-lock.json`); o Apêndice, que ainda cita MinIO e o `migration.md` (os `plan.md` das Fases 1–4 citam essas seções); `scripts/export-openapi.ts` sem o prefixo `apps/server/` no texto do `architecture.md` e do Apêndice (o contexto é o server).

## F1 — Identity / Tenant / RBAC

- **Objetivo:** papéis e onboarding do MVP.
- **Requisitos:** F1, F2, N1 (análise §3); handoff §7, §36–37.
- **Dependências:** F0.
- **Mudanças:** papéis `ADMIN | MANAGER | COMMERCIAL` (recria o enum; sai `Member_one_owner`); invariante "≥ 1 ADMIN ativo" (ADR-016); onboarding cria org + ADMIN + trial + `publicChatKey`; branding (nome, logo `bytea`, cor, saudação). O canal do Web Chat nasce na F2, com a tabela `Channel` (feature `f1-identity`).
- **Testes:** snapshot da matriz; toda rota com permissão; último ADMIN não pode ser rebaixado ou desativado (não existe remoção de membro); `withTwoTenants` nas rotas novas.
- **Critério:** cadastro → org → ADMIN → link do Web Chat visível em settings (ainda sem chat).
- **Resultado (2026-09-24):** `f1-identity` PASS na rodada 3 (`c2df916`). O histórico de migrations virou uma só (`20260924120000_init`), já que não há produção.

## S1 — Spike: runtime WhatsApp (paralelo a F2/F3, descartável)

- **Objetivo:** validar com um número de teste o que a F9 e o ADR-012 assumem.
- **Validar:** segundo entrypoint da mesma imagem; auth state cifrado no PG sobrevive a restart; `enqueue` na API → worker no runtime; `NOTIFY` do runtime → socket da API em < 2 s; advisory lock impede duas instâncias; `loggedOut`; `messageId` próprio no envio.
- **Entregável:** relatório curto + ADR-012 confirmado ou revisado. O código não entra em `main`.

## F2 — Conversation core

- **Objetivo:** contato, conversa e mensagem, independentes de canal.
- **Requisitos:** F3, F6, N2, N3, N4.
- **Dependências:** F1.
- **Mudanças:** módulos `contacts`, `conversations`, `channels`; tabela `Channel` com o canal Web Chat padrão de cada organização (criado no onboarding e para as organizações existentes); E.164; `receiveInbound`/`sendMessage`; `seq`; dedupe por `externalId`; `conversation-state.ts` (ADR-013, `WAITING` = aguardando o cliente); `infrastructure/events.ts` (`notify(tx)` + `LISTEN` → rooms `org:`, `user:`, `conversation:`); ator não-usuário na auditoria (revisão da AD-008); `scopeFor` por `ownerId` + fila (revisão da AD-009).
- **Entregáveis:** use cases + API do painel para listar e ler conversas (testes injetam mensagens).
- **Testes:** todas as transições (unitário); inbound duplicado não duplica; 50 inbounds concorrentes → `seq` contíguo; conversas diferentes em paralelo; conversa fechada reabre e preserva o histórico; evento só após commit (rollback → nenhum evento); `withTwoTenants`, `withTwoSalespeople`.
- **Critério:** mensagem injetada aparece no socket do painel em < 2 s em teste de integração.

## Marco — Staging publicado (antes da F3)

> **Concluído em 2026-09-24:** `https://staging.bensseg.com` (domínio antigo; hoje `https://staging.bens360.com.br`, feature `domain-bens360`), deploy automático verde; cadastro, confirmação por e-mail e login feitos no navegador.

- **Objetivo:** a pilha do `docker-compose.prod.yml` numa VPS, pelo tutorial `docs/runbooks/deploy.md`. O deploy automático (staging a cada push verde em `main`, produção por tag) já existe: feature `.specs/features/cd-vps/`.
- **Dependências:** F0; VPS e DNS (ação do responsável pelo projeto).
- **Critério:** `https://staging.<domínio>` responde; `/api/health` ok; login e onboarding funcionam.

## F3 — Web Chat + Inbox humano

> **Concluída em 2026-09-26:** as quatro fatias com `verification.md` PASS e o fluxo cliente → comercial → cliente provado pelo e2e Playwright no CI (run `36250587672`, ci + e2e, 104 passed), com deploy verde no staging (run `36251067456`). O e2e no staging saiu do critério da fase por decisão do responsável (custo alto para o MVP) e virou item do go-live (F11).

- **Objetivo:** primeiro fluxo real: o cliente fala pelo link, um humano responde.
- **Requisitos:** F4 (Web Chat), F5, F13, N4, N9; parte de F7 (assumir, responder, encerrar).
- **Dependências:** F2, marco de staging.
- **Mudanças:** `/c/:slug` (SPA) + HTML Open Graph servido pela API; `/api/public/chat/*`; resolução do tenant por `publicChatKey` (AD nova); token de visitante; namespace de visitante no Socket.IO; telefone + aceite (`ConsentRecord`) + Turnstile; rate limit; inbox (fila, minhas conversas, responder, assumir, encerrar); sem IA → conversas nascem em `QUEUE` (ADR-014).
- **Fatias (ordem 2026-09-25, revista 2026-09-25):** `public-chat-api` → `visitor-realtime` → **`web-chat-ui`** (fecha gap de tela + smoke Playwright) → **`inbox`** (API + tela do painel + smoke Playwright, AD-019). O e2e no staging foi adiado para o go-live (2026-09-26). Não há fatia `inbox-api` / `inbox-web` isolada.
- **Testes:** link da org A nunca cria dado na org B; visitante não lê conversa anterior do mesmo telefone; sem aceite → 4xx; rate limit dispara; COMMERCIAL só encerra as próprias; MANAGER encerra qualquer; e2e: cliente envia → comercial vê → responde → cliente vê.
- **Critério:** fluxo e2e verde no CI (revisto em 2026-09-26; antes, "no staging", adiado para o go-live).
- **Andamento (2026-09-26):** `public-chat-api`, `visitor-realtime`, `web-chat-ui` e `inbox` com `verification.md` PASS; e2e verde no CI. Gaps de tela achados na auditoria e adiados de propósito: visão da equipe e lista em tempo real (F5), histórico de conversas encerradas (F6), dashboard (F11).

## F4 — IA

- **Objetivo:** a IA atende primeiro, com tools e falha segura.
- **Requisitos:** F9, N5, N6, N13; handoff automático de F7.
- **Dependências:** F3.
- **Mudanças:** módulo `ai` (ADR-015): `provider.ts` (modelo Claude escolhido na spec), `ai.reply`, contexto em janela, tools `get_lead`/`update_lead_information`/`request_human`, `AiRun`, limite mensal por org e de respostas por conversa, `aiEnabled` por org e canal; conversas nascem em `AI` quando habilitado; reabertura para `AI`/`QUEUE` (P1).
- **Telas:** Configurações da organização e do canal com o liga/desliga da IA (`aiEnabled`) e o consumo do mês contra o limite; no inbox, mensagem da IA identificada como tal, responsável `AI` visível na lista e na conversa, e o motivo da transferência quando a IA passa para a fila.
- **Testes (`FakeAiModel`):** resposta persistida e entregue; `request_human` → `QUEUE`; provider falha em todas as tentativas → `QUEUE` + mensagem ao cliente; limite excedido → `QUEUE`; humano assume durante a geração → resposta descartada; mensagem nova durante a geração → reprocessa; tool não aceita IDs; campo fora da allowlist rejeitado; `AiRun` em todos os desfechos; `ai` não importa escrita de `sales` (arquitetura). Smoke Playwright: visitante escreve no `/c/:key` → IA responde na tela do visitante → visitante pede humano → a conversa aparece na Fila do inbox; ADMIN desliga a IA e a próxima conversa nasce em `QUEUE`.
- **Critério:** conversa completa no staging com a IA coletando nome e interesse e transferindo quando pedido.

## F5 — Handoff completo + fila de leads

- **Objetivo:** controle humano explícito e distribuição consistente.
- **Requisitos:** F7, F8, N8, F12 (parte).
- **Dependências:** F4.
- **Mudanças:** assumir conversa de `AI` a qualquer momento; devolver à IA (ação explícita, permissão própria); devolver à fila; fila de leads (contatos sem dono); ADMIN/MANAGER atribuem; COMMERCIAL assume; quem assume conversa de contato sem dono vira o dono; auditoria de atribuição, handoff, entrada e saída de humano (ADR-016); na API, a visão `team` em `listConversations` (só ADMIN/MANAGER) e o evento de mudança de conversa para a lista do inbox respeitando a carteira.
- **Telas:** a **fila de leads** (contatos sem dono, 4 estados) com "Assumir" para COMMERCIAL e "Atribuir a…" para ADMIN/MANAGER; no inbox, as ações "Devolver à fila", "Devolver à IA" e "Atribuir a…" (seletor de membro ativo, só ADMIN/MANAGER); a visão **Equipe** (todas as conversas legíveis da organização, filtro por responsável em search param), só para ADMIN/MANAGER, que fecha o gap da F3 (hoje eles só alcançam Fila e Minhas, e não conseguem abrir para encerrar a conversa de outro membro, handoff §7/§21); **lista em tempo real**: a lista do inbox recebe as mudanças de conversa em < 2 s sem vazar ids fora da carteira (decidir o evento na spec); trilha de auditoria da conversa visível para ADMIN/MANAGER.
- **Testes:** N comerciais assumem o mesmo lead/conversa em paralelo → exatamente 1 sucesso, demais 409; nenhuma transição automática para `AI`; auditoria em cada ação; COMMERCIAL não vê a visão Equipe (UI e API). Smoke Playwright: MANAGER abre a visão Equipe, atribui uma conversa da fila a um COMMERCIAL, que a vê em Minhas sem recarregar; o COMMERCIAL devolve à fila; na fila de leads, um COMMERCIAL assume um lead sem dono e ele sai da fila.
- **Critério:** testes de concorrência verdes contra PG real; trilha de auditoria visível.

## F6 — Leads / Comercial

- **Objetivo:** lead qualificado vira oportunidade.
- **Requisitos:** F10 (parte), F2 (carteira), F12; handoff §34.
- **Dependências:** F5.
- **Mudanças:** tela de contatos/leads (filtros por status, dono, fila); `leadStatus`; criar oportunidade a partir do contato ou da conversa; módulo `sales` com `Opportunity` (= proposta, ADR-011); contexto para outro corretor continuar (dados estruturados + histórico; resumo por IA só como botão).
- **Telas:** lista de contatos/leads (filtros em search params, 4 estados); ficha do contato com dados, dono, `leadStatus`, oportunidades e o **histórico de conversas encerradas** (fecha o gap da F3: hoje uma conversa `CLOSED` some do inbox); "Criar oportunidade" a partir da ficha e da conversa no inbox; ADMIN/MANAGER atribuem o lead também a partir da ficha (a fila de leads é da F5).
- **Testes:** carteira (`withTwoSalespeople`, incluindo "sem dono"); COMMERCIAL só cria oportunidade no próprio contato; auditoria. Smoke Playwright: da conversa no inbox → ficha do contato → criar oportunidade → a oportunidade aparece na ficha; conversa encerrada visível no histórico.
- **Critério:** do chat ao lead e à oportunidade sem sair do painel.

## F7 — Kanban

- **Objetivo:** acompanhamento visual.
- **Requisitos:** F10, F12.
- **Dependências:** F6.
- **Mudanças:** etapas do v1 (`CAPTURE → QUOTE → PROTOCOL → INSPECTION → PAYMENT → POLICY_ISSUED | LOST`), movimento livre, `POLICY_ISSUED` = ganha, `LOST` com motivo, reabrir (ADR-011); rótulos de UI em pt-BR; `opportunity-stages.ts` puro; `dnd-kit`; tempo real.
- **Telas:** o Kanban (colunas por etapa, filtro por dono em search param, 4 estados), diálogo de motivo ao mover para `LOST`, reabrir, e o card levando à ficha do contato.
- **Testes:** todas as transições; `LOST` sem motivo → 422; COMMERCIAL não move oportunidade alheia; auditoria de etapa. Smoke Playwright: arrastar o card para outra etapa persiste após recarregar e aparece na outra aba; mover para `LOST` pede o motivo.
- **Critério:** arrastar o card persiste, audita e reflete em outra aba em < 2 s.

## F8 — Follow-up

- **Objetivo:** não perder acompanhamento.
- **Requisitos:** F11, F12.
- **Dependências:** F6 (F7 recomendado).
- **Mudanças:** `FollowUp` (criar, concluir, reagendar); pendência por consulta, **sem cron**; contador no menu, lista "Hoje/Atrasados", badge no card.
- **Telas:** criar, concluir e reagendar follow-up na ficha do contato e no card; contador no menu; lista "Hoje/Atrasados" (4 estados); badge no card do Kanban (se a F7 já estiver entregue; senão, entra na F7).
- **Testes:** carteira; pendência aparece e desaparece corretamente (datas semeadas que uma constante não satisfaz); auditoria. Smoke Playwright: criar um follow-up para hoje → contador e lista "Hoje" mostram → concluir → somem.
- **Critério:** o comercial vê o que tem pendente ao abrir o painel.

## F9 — WhatsApp

- **Objetivo:** segundo canal real.
- **Requisitos:** F4 (WhatsApp), F16, N7, N2.
- **Dependências:** F2, S1; F4/F5 para IA e handoff iguais ao Web Chat.
- **Mudanças:** entrypoint `whatsapp` (ADR-012); `WhatsAppAuthState` cifrado; advisory lock; função `SECURITY DEFINER` de boot (AD nova); pareamento por QR e código; status + alerta; reconexão com backoff; `whatsapp.send`/`whatsapp.control`; mídia → orientação; heartbeat; opt-in LGPD "SIM" (ADR-014; validação jurídica antes do go-live).
- **Telas:** Configurações → WhatsApp: parear por QR e por código, status da conexão (conectado, reconectando, `NEEDS_PAIRING`) com alerta no painel, desconectar; no inbox, o canal da conversa identificado (WhatsApp × Web Chat) e o estado do envio (`PENDING`/`SENT`/`FAILED`) na mensagem.
- **Testes:** socket Baileys falso: entrada idempotente, ordem, `UNSUPPORTED` responde orientação, `loggedOut` → `NEEDS_PAIRING` sem retry, erro transitório → backoff; `PENDING → SENT/FAILED`; runtime fora → envios ficam `PENDING` e saem na volta; API reiniciada → sessões seguem; sem "SIM" a IA não processa. Smoke Playwright com o runtime falso: a tela mostra o QR, o status muda para conectado, uma mensagem recebida aparece no inbox com o canal WhatsApp. Teste manual com número real.
- **Critério:** número de teste conectado no staging por 7 dias, reconexões registradas, zero mensagem perdida.

## F10 — SaaS / Trial / Suspensão

- **Objetivo:** ciclo comercial sem cobrança automatizada.
- **Requisitos:** F14; handoff §38–40.
- **Dependências:** F1.
- **Mudanças:** `Organization.status`, `trialEndsAt`, `maxUsers` (padrão 10) no lugar de `Plan`/`Subscription` e do módulo `billing`; trial expirado calculado na leitura; painel só leitura (402); IA desligada; Web Chat "indisponível" para conversas novas; mensagens sempre persistidas; ativação e suspensão pelo super-admin (ADR-017).
- **Telas:** aviso de trial (dias restantes) e de conta suspensa no painel, com o painel em só leitura (ações desabilitadas, sem erro genérico); Web Chat mostrando "indisponível" para conversa nova e a resposta automática fixa que o cliente recebe numa conversa em andamento (ADR-017); o limite de usuários refletido no convite. Ativação e suspensão pelo super-admin (ADR-017): tela ou comando operacional, a decidir na spec da F10 (o ADR não define); se for tela, entra no smoke.
- **Testes:** trial expirado bloqueia escrita e preserva dados; reativação restaura o acesso; mensagem recebida com a org suspensa é persistida; quota de usuários lida da organização. Smoke Playwright: org com trial expirado vê o aviso e não consegue responder no inbox; depois da reativação, a ação volta.
- **Critério:** suspender e reativar uma org no staging sem perda.

## F11 — Métricas + Produção

- **Objetivo:** operar e medir.
- **Requisitos:** F15, N10, N11.
- **Dependências:** todas.
- **Mudanças:** dashboard por consultas SQL (leads recebidos/atendidos, oportunidades, ganhos/perdas, tempo até o primeiro atendimento humano, conversão por etapa); Sentry sem PII; logs com `organizationId`/`conversationId`/`channelId`; `/api/ready`; monitor externo; alertas (job esgotado, canal fora > 30 min, runtime sem heartbeat); backup diário + restore testado; runbooks (deploy, rollback, restore, re-pareamento); deploy por tag.
- **Telas:** o dashboard real no lugar do placeholder de `dashboard.tsx` (hoje só "Olá, {nome}"): cartões e gráficos das métricas acima, com período em search param e 4 estados; visão por comercial para ADMIN/MANAGER e só a própria carteira para COMMERCIAL.
- **Testes:** `/ready` 503 com o PG fora; métricas com dados que não passam por constante ou ordem; restore num ambiente limpo. Smoke Playwright: o dashboard mostra os números de dados semeados e muda com o período.
- **Critério:** restore executado; alerta de canal fora chega; fluxo web chat + inbox da F3 verde no staging (adiado da F3 em 2026-09-26; Turnstile real exige clique humano no visitante); go-live (com o parecer jurídico do opt-in do WhatsApp e os Termos de Uso reescritos para o MVP, nova versão).

> **Observabilidade não é só a F11:** `requestId`/`organizationId`/`conversationId` no log e `/api/health` valem desde já; a F11 fecha alertas, Sentry e dashboards.

---

# Apêndice — Histórico v2 (concluído)

As seções abaixo são o roadmap anterior (ERP), mantidas **sem alteração** porque os `plan.md` e `verification.md` das Fases 1–4 as citam. Fases 1–4 e os checkpoints H1/H2 estão concluídos. As Fases 5–13 do ERP foram canceladas pelo pivot (ADR-011); o texto delas está no git (`git show d817950:docs/roadmap.md`).

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
  - `modules/audit/audit.ts`;
  - `test/factories.ts` (`withTwoTenants`, `withTwoSalespeople`);
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
- **Resultado (2026-09-23):** rodado com Q2 = `A + C` (o `CLAUDE.md` mudou com o RLS e o processo lean/driven obrigatório; não havia registro do H1). Os relatórios ficam fora do git, em `.harness-eval/runs/2026-09-23-h2/`.
  - Track A: 19 BROKEN no script, todos falso positivo (diretório checado como arquivo, exemplos genéricos da própria `harness-eval`, script fora do `package.json` da raiz, caminho relativo a `apps/server`). Todo caminho, helper e comando citado no `CLAUDE.md` existe.
  - Track C (os dois juízes em `claude-opus-5-5`; trap PASS com 1 erro, fan-in PASS): 10 Keep-core (`CLAUDE.md` entre eles), 6 Slim, 7 Mixed, 15 Hold.
  - **Aplicado:** o exemplo de use case do `architecture.md` usava `deps.db.$transaction` (falha sob RLS) e passou a usar `withTenant`; o `CLAUDE.md` diz quando valem `withUser`/`withInvitation`/`withoutTenant`, a organização ativa (AD-010) e a `SESSION_ONLY`, e ganhou a regra de teste que discrimina (lições L-031–L-033, que se repetiram em três features com ids diferentes e por isso nunca seriam promovidas); `vercel-react-best-practices` removida (quase só Next/RSC, e o conselho de SWR conflita com Orval + TanStack Query); caminhos da Fase 4 corrigidos.
  - **Mantido:** as skills vendoradas marcadas Slim/Mixed (`GLOSSARY`, `code-analysis`, `context-limits`, `domain-modeling`, `tlc-discover`, `ADR-FORMAT`, `coding-principles`, `tasks.md`), porque o dono é o upstream (`skills-lock.json`) e só custam contexto quando carregadas; `grill-me` (tem `disable-model-invocation`) e `agent-browser` (útil para testar a UI); `tlc-spec-driven` (o `CLAUDE.md` a nomeia; os juízes divergiram); o histórico das Fases 1–4 deste roadmap (Mixed pedia corte, mas os `plan.md` citam essas seções); as regras do `CLAUDE.md` que o `architecture.spec`, o `schema.spec`, o boot e o biome já garantem (os juízes marcaram Keep-core; tirá-las economiza ~60 tokens e custa uma rodada vermelha por agente); a sobreposição com o superpowers (plugin global, fora do repo; o `CLAUDE.md` prevalece).

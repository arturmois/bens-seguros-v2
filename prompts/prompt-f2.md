Vamos implementar a F2 (Conversation core) do MVP do Bens Seguros.

Antes de tudo, leia:
- CLAUDE.md;
- docs/roadmap.md: a seção "F2 — Conversation core", a "F3" (para saber o que **não** é desta fase) e o marco de staging (fechado em 2026-09-24);
- docs/architecture.md: §3, fronteiras de `contacts`, `conversations`, `channels`, `audit` e a direção das dependências; o modelo de dados; a tabela de invariantes; a API; o tempo real;
- ADR-013 (conversa: estado × responsável, `seq`, idempotência, fronteira de canal), ADR-016 (papéis, carteira, atribuição concorrente), ADR-004 (RLS), ADR-006 (jobs e realtime no mesmo processo) e ADR-012 (só a parte que a F2 prepara: `NOTIFY` entre processos);
- docs/handoff.md, nos requisitos que a F2 cobre: F3, F6, N2, N3, N4 e os §§ 5, 15, 16, 17, 20 e 21 citados no ADR-013;
- `.specs/STATE.md` (AD-001 a AD-012) e as lições confirmadas de `.specs/LESSONS.md`, em especial L-031 a L-033, L-036, L-038, L-043 a L-048.

As decisões já tomadas estão nos ADRs 011–017 e nas ADs do STATE. Não reabra nenhuma sem me perguntar. Duas revisões são **desta fase** e precisam entrar como AD nova que substitui a antiga:
- **AD-008 (auditoria):** ator não-usuário (`actorType: USER | AI | SYSTEM`, `actorUserId` opcional) e as ações novas que a F2 de fato grava;
- **AD-009 (carteira):** `scopeFor` passa a devolver o filtro por entidade, com `ownerId = eu OR ownerId IS NULL` para COMMERCIAL em contatos e fila em conversas (ADR-016). O `portfolioMoves` da transferência de carteira passa a mover `Contact.ownerId` de verdade.

O legado, só para consultar comportamento (estados do bot, tools, reconexão), está em `github.com/arturmois/bens-seguros`. Não copie arquitetura dele.

**Gate:** não comece se `git status` não estiver limpo ou se `pnpm lint && pnpm typecheck && pnpm test && pnpm build` não passar (com o `docker compose up -d` no ar).

**Processo:** declare lean ou driven **antes de codar**, em 1–2 linhas. Minha expectativa é `tlc-spec-lean` com perfil `standard`, dividido em features com ciclo e Verifier próprios, por exemplo:
1. `conversation-core`: tabelas, estados puros, `receiveInbound`/`sendMessage`, `seq`, dedupe, reabertura, canal Web Chat padrão;
2. `realtime-events`: `infrastructure/events.ts` com `notify(tx, …)` e `LISTEN`, e as rooms do socket;
3. `conversations-api`: listar e ler conversas no painel, com carteira;
4. `audit-actors`: a revisão da AD-008 (pode entrar na 1 se ficar pequena).

Use o driven só se aparecer decisão aberta que precise de registro entre sessões; justifique. Em qualquer caso, eu reviso o plano antes dos checks, e cada feature fecha com Verifier independente.

**Escopo:** exatamente o que a F2 do roadmap descreve:
- módulos `contacts`, `conversations` e `channels` (sem adapters reais; o Web Chat é da F3 e o WhatsApp da F9);
- tabelas `Channel`, `Contact`, `Conversation` e `Message`, e o canal Web Chat padrão de cada organização, criado no onboarding **e** para as organizações que já existem;
- telefone em E.164, normalizado na borda com o Brasil como padrão;
- `receiveInbound` e `sendMessage`, com `seq`, dedupe por `externalId`, `conversation-state.ts` e reabertura;
- `events.ts` e o evento no socket do painel;
- ator não-usuário na auditoria;
- `scopeFor` por `ownerId` + fila;
- API do painel para **listar e ler** conversas. As mensagens entram pelos testes.

**Fica fora:** rotas públicas do chat, visitante, token, `ConsentRecord` e Turnstile do chat (F3); as rotas `take`, `return-to-queue`, `return-to-ai` e `close` e a UI do inbox (F3/F5; as **transições** delas são puras e ficam prontas e testadas aqui); IA (F4); fila de leads e `claim`/`assign` (F5); WhatsApp (F9). Nada da F3 em diante.

**Pontos de atenção, a decidir no plano (me pergunte com recomendação quando for decisão minha):**
- **Canal padrão das organizações existentes:** é backfill numa migration, e as tabelas têm RLS `FORCE`, que vale também para o dono, que é quem roda as migrations. Decida como o `INSERT` do backfill passa pelo RLS sem abrir exceção permanente (ex.: `set_config` por organização dentro da migration, ou criação preguiçosa no primeiro uso) e prove com o banco de verdade que toda organização existente ganha exatamente um canal.
- **Índices do ADR-013 são portas de mão única:**
  - `(organizationId, conversationId, seq)`;
  - o único parcial `(organizationId, channelId, externalId) WHERE externalId IS NOT NULL`;
  - uma conversa aberta por contato e canal, `WHERE status <> 'CLOSED'`;
  - `(organizationId, phoneE164)` em `Contact`.

  O Prisma não expressa índice parcial: diga no plano como ele entra (SQL na migration) e como o `schema.spec` passa a conferi-lo.
- **`seq` e concorrência:** 50 inbounds concorrentes na mesma conversa → `seq` 1..50 sem buraco nem repetição; conversas diferentes em paralelo sem esperar uma pela outra. O teste usa conexões reais em paralelo, não um laço sequencial (L-047: aceite todo perdedor legítimo e afirme a invariante).
- **Dedupe:** `INSERT … ON CONFLICT DO NOTHING` no único parcial, nunca `findFirst` + `create`. Inbound repetido (sequencial **e** concorrente) grava uma mensagem só e não emite dois eventos.
- **Estados:** `status` × `handler` como funções puras em `conversation-state.ts`, com teste unitário de **todas** as combinações, incluindo as proibidas: nenhuma transição automática para `AI` a partir de `QUEUE` ou `HUMAN`. Aplicação por update condicional; 0 linhas → 409. `WAITING` é automático (saída → `WAITING`, entrada → `OPEN`). `CLOSED` + mensagem do cliente → `OPEN` na mesma conversa, preservando o histórico, e o `handler` segue o ADR-013: `AI` se a IA estiver habilitada, senão `QUEUE`. Sem a F4, diga no plano qual flag decide isso hoje.
- **Eventos:**
  - `NOTIFY` é transacional; prove que o rollback não emite nada e que o evento só chega depois do commit;
  - o payload leva só ids (limite de 8000 bytes e **sem PII**), e o socket relê o que precisar;
  - o `LISTEN` precisa de uma conexão dedicada fora do Prisma: diga qual cliente, como reconecta e o que acontece com eventos perdidos durante a queda (o cliente recarrega pela API; não invente fila);
  - a room `conversation:*` só pode ser assinada por quem pode ler a conversa (tenant **e** carteira).
- **Critério da fase:** a mensagem injetada aparece no socket do painel em menos de 2 s, num teste de integração com server e socket reais.
- **Carteira:** toda rota nova leva `withTwoTenants` **e** `withTwoSalespeople`, incluindo o caso "sem dono" e o de conversa em `QUEUE` visível ao COMMERCIAL (ADR-016). Fora da carteira ou de outro tenant → 404.
- **Rotas:**
  - Zod `.strict()` com a prova do campo desconhecido → 400 (L-043);
  - `operationId` estável e `requirePermission` com as permissões novas mínimas;
  - a lista de status de cada rota tirada do handler (L-048);
  - paginação por cursor com `shared/pagination.ts`;
  - rodar `pnpm api:generate` se o contrato mudar, mesmo sem UI nesta fase.
- **E.164:** se precisar de dependência (ex.: `libphonenumber-js`), use a versão estável mais recente, consultando a documentação atual pelo Context7. O pnpm 12 bloqueia pacote publicado há pouco (`minimumReleaseAge`) e scripts de build (`allowBuilds`); se abrir exceção no `pnpm-workspace.yaml`, me avise no resumo.
- **Módulos:** `conversations` não importa `ai` nem adapter; `channels` chama `conversations`; `conversations` chama `contacts` só pelo `index.ts`; cada módulo escreve só nas próprias tabelas. O `architecture.spec` deve continuar valendo e cobrir as fronteiras novas.
- **Auditoria** sem PII (AD-008): texto de mensagem e telefone nunca entram em `changes`.

**Testes** (CLAUDE.md): regra pura com teste unitário de todas as transições; endpoint com PostgreSQL real (`app.inject`); não mockar o banco; cada teste falha se o comportamento for removido, com a precondição criada no banco (a conversa `CLOSED`, o contato de outro comercial e a mensagem com o mesmo `externalId` existem de verdade).

**Blast radius:** commits locais pequenos (Conventional Commits). `git push` dispara o deploy automático no staging (`https://staging.bensseg.com`) e as migrations rodam lá: **só com o meu ok explícito**. O mesmo vale para qualquer ação na VPS.

**A fase termina quando:**
- os critérios da F2 do roadmap forem atendidos no stack local, incluindo a mensagem no socket em menos de 2 s;
- o Verifier de cada feature der PASS (`validate_verification.py` exit 0);
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passar;
- as ADs novas estiverem no `STATE.md`.

No final, resuma: o que foi feito; as ADs novas e as que foram substituídas; as decisões que você tomou sozinho; as exceções no `pnpm-workspace.yaml`; e o que ficou preparado para a F3.

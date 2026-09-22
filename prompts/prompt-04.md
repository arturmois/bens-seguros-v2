Vamos implementar a Fase 4 (Tenancy & Organizations) do Bens Seguros v2.

Antes de tudo, leia CLAUDE.md, docs/architecture.md (§3 organizações, §6 Autenticação passo 2–5 e 7, §7 Autorização, §8 API, §9 rotas `(onboarding)` e `settings`), a seção "Fase 4" de docs/roadmap.md, os ADRs 003 (sem plugin `organization`), 004 (RLS), 005 (RBAC), 007 e 010 (carteira), e a seção "Auth / Organizations" de docs/migration.md.
As decisões já estão tomadas nos ADRs e em `.specs/STATE.md` (AD-001 contexto de usuário vs tenant, AD-005 aceite pendente bloqueia rota de tenant). Não reabra nenhuma sem me perguntar.
O legado, só para consultar regras, está em /home/ixcsoft/www/bens-seguros.

Gate: não comece a Fase 4 se `signup-gates` e `terms` não tiverem `verification.md` com Verdict PASS (`validate_verification.py` exit 0). Esses planos já existem em `.specs/features/{signup-gates,terms}/plan.md`. Se ainda não passaram, feche-os primeiro (ciclo lean + Verifier) e só então este prompt.

Processo: tlc-spec-lean (obrigatório, perfil standard — isolamento e RBAC são código de segurança), com plano revisado por mim antes dos checks e Verifier independente ao final.
Se o plano ficar grande, divida em features (ex.: org-core, invitations, audit, org-web), cada uma com o seu ciclo e Verifier. Se achar que a fase pede tlc-spec-driven, justifique antes de começar.

Escopo: exatamente o que a Fase 4 do roadmap descreve e os itens de migration.md de Organizations
(onboarding org + OWNER + trial; `MAX_ORGS_PER_USER`; troca de org ativa; convites com role e expiração; OWNER único; transferência de carteira; `permissions[]` no `/me`; helpers `withTwoTenants` e `withTwoSalespeople`).
Nada da Fase 5: sem Asaas, sem webhook de billing, sem `requireFeature`/`assertQuota` completos — só o `Plan` seed mínimo e a `Subscription` em `TRIALING` que o onboarding precisa.
Nada da Fase 6: sem Contact/Client reais; a transferência de carteira implementa o que existir e deixa gancho para estender (roadmap).
A Fase 3 já está commitada: leia o código existente (`requireSession`, `UserContext`/`RequestContext`, `modules/auth`, guard `_app`, termos) e siga os padrões dele.
Use a versão estável mais recente de cada dependência nova, consultando a documentação atual pelo Context7.

Pendências da Fase 3 que entram aqui:
- montar `RequestContext` em `request.ctx` via `requireTenant`: membership ativa em `session.activeOrganizationId`, senão 403/404 conforme o contrato do plano; rota sem tenant (`/me`, aceite de termos, 2FA, o próprio onboarding) continua só com `requireSession`;
- `requireTenant` responde `403 TERMS_NOT_ACCEPTED` com aceite pendente (AD-005);
- `isSuperAdmin` só com flag do usuário **e** 2FA habilitado (AD-001);
- Socket.IO: rooms `org:*` e `user:*` quando houver tenant (ADR-006 / architecture §9);
- remover o módulo `examples` (Organization passa a ser o model tenant-scoped real): passos no roadmap da Fase 2, no bloco "Remover o módulo exemplo".

Pontos de atenção:
- **Sem o plugin `organization` do Better Auth** (ADR-003). `Organization`, `Member` e `Invitation` são tabelas e rotas do módulo `organizations`. Better Auth continua só identidade/sessão; `Session.activeOrganizationId` muda só por `POST /api/v1/me/active-organization`, validado contra `Member`. O tenant nunca vem do request;
- RLS (ADR-004): toda tabela nova com `organizationId` na própria migration: `ENABLE` + `FORCE` + política `tenant_isolation`; único inclui `organizationId`; FK para `Organization` é `Restrict`; `db.withTenant(ctx, tx => …)`; repository **não** filtra nem grava `organizationId` — só `scopeFor(ctx)` na carteira do COMMERCIAL; registro de outro tenant ou fora da carteira → 404;
- RBAC (ADR-005): `shared/permissions.ts` + `requirePermission(...)` em **toda** rota; teste que falha se alguma rota registrada não declarar permissão; snapshot da matriz role × permissão;
- `withTwoTenants` em todo endpoint de org; `withTwoSalespeople` onde houver carteira. Não mockar repositories;
- auditoria `audit.record(tx, ctx, …)` **sem PII** (mudança de role, transferência de carteira);
- onboarding: `POST /api/v1/onboarding` → Organization + Member(OWNER) + Subscription(TRIALING) com Plan seed mínimo; fluxo na web: login → termos (já existe) → onboarding se não houver org → `_app`. Não inverta termos e tenant;
- convite: e-mail pelo job `email.send` (AD-003); aceite checa quota de usuários do plano (mesmo com seed mínimo);
- logo da org: storage já existe (`createStorage`); MIME por magic bytes, como a architecture §7;
- staging: a VPS (Hostinger) e o runbook (`docs/runbooks/staging.md`) existem. Subir ou alterar a caixa, `git push` e qualquer ação remota **só com o meu ok explícito**. Sem esse ok, prove no stack local (`scripts/staging-smoke.mjs`) e nos testes;
- o pnpm 12 bloqueia pacotes publicados recentemente (`minimumReleaseAge`) e scripts de build (`allowBuilds`); ao abrir exceções no `pnpm-workspace.yaml`, me avise no resumo.

A fase termina quando os critérios de aceite dela forem atendidos (usuário com 2 orgs alterna e vê dados isolados; helper cross-tenant pronto para os próximos módulos), o Verifier de cada feature der PASS (`validate_verification.py` exit 0) e `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passar (com o docker compose no ar).
Faça commits pequenos (Conventional Commits) e, no final, resuma o que foi feito, as decisões que você tomou e o que ficou para o checkpoint H2 e para a Fase 5.

Vamos rodar o Checkpoint H2 (reavaliação do harness depois da Fase 4) do Bens Seguros v2.

Antes de tudo, leia a seção "Checkpoint H2" e a "Checkpoint H1" de docs/roadmap.md, o CLAUDE.md e o `.specs/STATE.md` (AD-001 a AD-010).
A Fase 4 está fechada: `org-core`, `invitations`, `audit` e `org-web` com `verification.md` PASS (`validate_verification.py` exit 0). As convenções de tenancy agora existem de verdade no código: `db.withTenant`, `withUser`, `withInvitation`, `requireTenant`, `requirePermission`, `scopeFor`, `audit.record`, `withTwoTenants`, `withTwoSalespeople`. São as regras mais críticas para os agentes das fases de domínio (6 a 11).

Gate: não comece se `git status` não estiver limpo ou se `pnpm lint && pnpm typecheck && pnpm test && pnpm build` não passar (com o docker compose no ar).

Processo: skill `harness-eval`, nesta sessão nova.
- Q1 (docs opcionais): incluir `docs/architecture.md`, `docs/roadmap.md` e `docs/migration.md`. ADRs e `.specs/` ficam fora.
- Q2 (tracks): **`A + C`**. O roadmap pede só `A` no H2, com `C` quando o CLAUDE.md ou as skills mudaram muito desde o H1. Não há registro do H1 no repositório, e o CLAUDE.md mudou em pontos centrais desde então: tenant por RLS (`975929b`) e processo obrigatório lean/driven (`26635a6`). Se discordar, rode só `A` e justifique.

O que observar:
- Track A: todo caminho, comando, helper e script citado no CLAUDE.md existe e bate com o código: `shared/money.ts`, `shared/config.ts`, `infrastructure/queue.ts`, `db.withTenant`, `scopeFor`, `audit.record`, `requirePermission`, `withTwoTenants`, `withTwoSalespeople`, `pnpm api:generate`, os scripts da `tlc-spec-lean`;
- regra de tenant do CLAUDE.md × AD-006/AD-007/AD-010: o CLAUDE.md fala só de `db.withTenant(ctx, …)`, mas o código também lê fora do tenant com `withUser` e `withInvitation`, e o hook de sessão do Better Auth grava `activeOrganizationId`. Um agente das próximas fases entenderia quando cada um vale?;
- Track C: skills que não mudam comportamento neste projeto. Candidatas: `vercel-react-best-practices` (Next.js saiu pelo ADR-009) e a sobreposição de processo (`tlc-spec-driven` × `tlc-spec-lean` × superpowers `brainstorming`/`writing-plans`/`executing-plans`);
- lições confirmadas em `.specs/LESSONS.md` (ex.: L-015, precondição de teste que não se estabelece) que deveriam virar regra curta no CLAUDE.md, e o contrário: regra do CLAUDE.md que já está coberta por teste de arquitetura (`test/architecture.spec.ts`, `test/schema.spec.ts`) e pode sair.

Saída: o relatório da skill (Ship/Review/Hold/Slim/Keep-core). **Não aplique nada antes da minha revisão.** Depois do meu ok, aplique num commit `chore(harness): …` e registre o que foi mantido e por quê.

Critério de aceite: Track A sem BROKEN; cada Slim/Ship aplicado ou registrado como mantido com justificativa; `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passando depois do commit.
Blast radius: nada de `git push`, nem ação na VPS de staging, sem o meu ok explícito.
No final, resuma o que mudou no harness e o que fica como atenção para a Fase 5 (Billing: Asaas, webhook fora do Origin check da AD-004, `requireFeature`/`assertQuota`).

> **Arquivado em 2026-09-23 (ADR-011):** prompt de fase do ERP, cancelado pelo pivot para o MVP. Não use como instrução; as fases atuais estão em `docs/roadmap.md`.

Vamos implementar a Fase 3 (Authentication) do Bens Seguros v2.

Antes de tudo, leia CLAUDE.md, docs/architecture.md (§6 Autenticação, §7 Isolamento de tenant, §8 API), a seção "Fase 3" de docs/roadmap.md,
os ADRs 003 (Better Auth), 004 (RLS — revisado na Fase 2), 007 e 008, e a seção "Auth / Organizations" de docs/migration.md.
As decisões já estão tomadas nos ADRs (docs/decisions/); não reabra nenhuma sem me perguntar.
O legado, só para consultar regras, está em /home/ixcsoft/www/bens-seguros.

Processo: tlc-spec-lean (obrigatório, perfil standard — é código de segurança), com plano revisado por mim antes dos checks
e Verifier independente ao final. Se achar que a fase pede tlc-spec-driven, justifique antes de começar.
Se o plano ficar grande, divida em features (ex.: auth-core, signup-gates, terms, staging), cada uma com o seu ciclo e Verifier.

Escopo: exatamente o que a Fase 3 do roadmap descreve e os itens de migration.md que pertencem a ela
(cadastro com Turnstile, e-mail temporário e SIGNUP_MODE; verificação de e-mail; reset de senha; 2FA; termos versionados).
Nada da Fase 4: sem onboarding de organização, sem Member/Invitation, sem troca de org ativa, sem RBAC.
A Fase 2 já está commitada: leia o código existente e siga os padrões dele (withTenant, queue.ts, email.ts, config, error handler, harness de testes).
Use a versão estável mais recente de cada dependência nova, consultando a documentação atual pelo Context7.

Pendências da Fase 2 que entram aqui:
- job `email.send` via queue.ts: definir o payload (um ReactElement não serializa; provavelmente template + props) e enviar verify-email/reset-password por ele;
- autenticação do Socket.IO pelo mesmo cookie de sessão (ADR-003), sem rooms de org ainda;
- `/api/docs` (swagger-ui) só fora de produção;
- chaves novas (segredo do Better Auth, Turnstile) em shared/config.ts e no .env.example.

Pontos de atenção:
- RLS (ADR-004): as tabelas do Better Auth são de usuário, não de tenant — não podem ter coluna `organizationId`
  (o teste de schema exigiria RLS). `Session.activeOrganizationId` tem outro nome de propósito; confira que o teste de schema continua verde.
  O Better Auth deve usar o client do app (role `bens_app`), nunca o owner;
- o `RequestContext` hoje exige `organizationId`, mas antes da Fase 4 um usuário logado pode não ter organização:
  proponha no plano como separar contexto de usuário e contexto de tenant (é decisão que a Fase 4 herda);
- cookie e Origin atrás do Caddy (`trustProxy`, host-only, SameSite=Lax) — valide cedo;
- rate limit de login persistido no banco (sobrevive a restart) e testado;
- staging: preciso te passar o acesso à VPS e o domínio. Sem isso, entregue `docker-compose.prod.yml` + `Caddyfile`
  validados localmente e o script de provisionamento do role `bens_app`, e pare antes do deploy.
  Push, deploy e qualquer ação na VPS só com o meu ok explícito;
- o pnpm 12 bloqueia pacotes publicados recentemente (`minimumReleaseAge`) e scripts de build (`allowBuilds`);
  ao abrir exceções no `pnpm-workspace.yaml`, me avise no resumo.

A fase termina quando os critérios de aceite dela forem atendidos, o Verifier de cada feature der PASS
(validate_verification.py com exit 0) e pnpm lint && pnpm typecheck && pnpm test && pnpm build passar (com o docker compose no ar).
Faça commits pequenos (Conventional Commits) e, no final, resuma o que foi feito, as decisões que você tomou
e o que ficou para o checkpoint H2 e para a Fase 4.

# State

## Decisions

| ID | Decision | Status | Source |
| --- | --- | --- | --- |
| AD-001 | Dois contextos. `UserContext = { requestId, userId, sessionId, isSuperAdmin }` sai da sessão validada (`requireSession`, Fase 3) e vive em `request.user`. `RequestContext = UserContext & { organizationId }` é o contexto de tenant: só a Fase 4 o monta (`requireTenant`, membership em `session.activeOrganizationId`) em `request.ctx`; `withTenant`, repositories e jobs continuam recebendo `RequestContext`. Rota sem tenant (`/me`, termos, 2FA) recebe `UserContext`. `isSuperAdmin` só é `true` com o flag do usuário **e** 2FA habilitado | active | `.specs/features/auth-core/plan.md` (Landing 5) |
| AD-002 | IP do cliente tem uma fonte só: o Fastify (`trustProxy` via `TRUST_PROXY`). O mount do Better Auth sobrescreve `x-forwarded-for` com `request.ip` antes de chamar `auth.handler`, então o rate limit do Better Auth não confia em header vindo do cliente | active | `.specs/features/auth-core/plan.md` (Landing 6) |
| AD-003 | E-mail sai só pelo job `email.send`, com payload serializável `{ template, to, props }`; `template` é uma chave validada com Zod em `src/emails/send-email.tsx`, que monta assunto + elemento React no worker | active | `.specs/features/auth-core/plan.md` (Landing 3) |
| AD-004 | Checagem de `Origin` própria em todo método mutável, em qualquer caminho (403 `ORIGIN_NOT_ALLOWED`; rodada 2 do `auth-core`: o filtro por prefixo da URL crua era contornável), além da do Better Auth. Webhooks (Fase 5+) entram como exceção explícita quando existirem | active | `.specs/features/auth-core/plan.md` (Landing 7) |
| AD-005 | Aceite pendente de termos bloqueia rota de tenant: o `requireTenant` da Fase 4 responde `403 TERMS_NOT_ACCEPTED`; `/me` e o próprio aceite ficam liberados (só `requireSession`) | active | `.specs/features/terms/plan.md` (Landing 3) |

## Phase 3 — features

Ordem e escopo. Cada feature tem `plan.md` → `checks.md` → build → Verifier.

1. `auth-core` — Better Auth no server: tabelas, e-mail/senha, verificação, reset, 2FA, rate limit persistido, `email.send`, contexto de usuário, `/me`, Origin, helmet, Socket.IO autenticado, `/api/docs` fora de produção, chaves novas no config.
2. `auth-web` — telas de auth no web, guard `_app`, 2FA no web, e2e de login (Playwright).
3. `staging` — Dockerfiles, `docker-compose.prod.yml`, `Caddyfile`, provisionamento do `bens_app`, validação local em HTTPS. Para antes do deploy.
4. `signup-gates` — `SIGNUP_MODE`, bloqueio de e-mail temporário, Turnstile (server + web).
5. `terms` — aceite versionado de termos e privacidade (server + web).

## Handoff

- Fase 3 em planejamento: os 5 `plan.md` escritos, aguardando revisão do usuário antes dos `checks.md`.

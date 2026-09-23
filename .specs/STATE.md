# State

## Decisions

| ID | Decision | Status | Source |
| --- | --- | --- | --- |
| AD-001 | Dois contextos. `UserContext = { requestId, userId, sessionId, isSuperAdmin }` sai da sessão validada (`requireSession`, Fase 3) e vive em `request.user`. `RequestContext = UserContext & { organizationId }` é o contexto de tenant: só a Fase 4 o monta (`requireTenant`, membership em `session.activeOrganizationId`) em `request.ctx`; `withTenant`, repositories e jobs continuam recebendo `RequestContext`. Rota sem tenant (`/me`, termos, 2FA) recebe `UserContext`. `isSuperAdmin` só é `true` com o flag do usuário **e** 2FA habilitado | active | `.specs/features/auth-core/plan.md` (Landing 5) |
| AD-002 | IP do cliente tem uma fonte só: o Fastify (`trustProxy` via `TRUST_PROXY`). O mount do Better Auth sobrescreve `x-forwarded-for` com `request.ip` antes de chamar `auth.handler`, então o rate limit do Better Auth não confia em header vindo do cliente | active | `.specs/features/auth-core/plan.md` (Landing 6) |
| AD-003 | E-mail sai só pelo job `email.send`, com payload serializável `{ template, to, props }`; `template` é uma chave validada com Zod em `src/emails/send-email.tsx`, que monta assunto + elemento React no worker | active | `.specs/features/auth-core/plan.md` (Landing 3) |
| AD-004 | Checagem de `Origin` própria em todo método mutável, em qualquer caminho (403 `ORIGIN_NOT_ALLOWED`; rodada 2 do `auth-core`: o filtro por prefixo da URL crua era contornável), além da do Better Auth. Webhooks (Fase 5+) entram como exceção explícita quando existirem | active | `.specs/features/auth-core/plan.md` (Landing 7) |
| AD-005 | Aceite pendente de termos bloqueia rota de tenant: o `requireTenant` da Fase 4 responde `403 TERMS_NOT_ACCEPTED`; `/me` e o próprio aceite ficam liberados (só `requireSession`) | active | `.specs/features/terms/plan.md` (Landing 3) |
| AD-006 | RLS de quem ainda não está dentro do tenant. `Member` usa a política `tenant_isolation`: `USING` é `organizationId = app.tenant_id` ou `userId = app.user_id` (`current_setting(..., true)`); `WITH CHECK` é só o tenant. `Organization` não tem `organizationId`; a política homônima libera a linha quando `id = app.tenant_id` ou existe `Member` daquele `app.user_id`. `app.user_id` só é setado em `database.ts` (`withUser`). Sem isso a troca de organização não lê o próprio membro, e sem RLS qualquer sessão lista as corretoras. O predicado de `Invitation` saiu daqui: é a AD-007 | active | `.specs/features/org-core/plan.md` (Landing 5 e 6) |
| AD-007 | Convite legível fora do tenant só pelo token. `Invitation.tenant_isolation`: `USING` é `organizationId = app.tenant_id` ou `tokenHash = current_setting('app.invitation_token', true)`; `WITH CHECK` é só o tenant. `app.invitation_token` só é setado em `database.ts` (`withInvitation`). O `organizationId` do `Member` criado no aceite sai dessa linha, nunca do request. Não usa `userId`: a linha não tem usuário até o aceite | active | `.specs/features/invitations/plan.md` (Landing 4) |

## Phase 3 — features

Ordem e escopo. Cada feature tem `plan.md` → `checks.md` → build → Verifier.

1. `auth-core` — Better Auth no server: tabelas, e-mail/senha, verificação, reset, 2FA, rate limit persistido, `email.send`, contexto de usuário, `/me`, Origin, helmet, Socket.IO autenticado, `/api/docs` fora de produção, chaves novas no config.
2. `auth-web` — telas de auth no web, guard `_app`, 2FA no web, e2e de login (Playwright).
3. `staging` — Dockerfiles, `docker-compose.prod.yml`, `Caddyfile`, provisionamento do `bens_app`, validação local em HTTPS. Para antes do deploy.
4. `signup-gates` — `SIGNUP_MODE`, bloqueio de e-mail temporário, Turnstile (server + web).
5. `terms` — aceite versionado de termos e privacidade (server + web).

## Phase 4 — features

Ordem. Cada uma: `plan.md` revisado → `checks.md` → build → Verifier. Perfil standard.

1. `org-core` — onboarding (org + OWNER + trial), teto de orgs, troca da ativa, `requireTenant`, RLS de `Organization`/`Member` (AD-006), `permissions[]` no `/me`, fim do módulo `examples`.
2. `invitations` — convite com papel e expiração, e-mail `email.send`, aceite checa `maxUsers` do plano.
3. `audit` — `audit.record` sem PII, papel e OWNER na API, transferência de carteira com o que existir, `scopeFor`, `withTwoSalespeople`.
4. `org-web` — onboarding, seletor e settings, depois dos termos.

## Handoff

- `invitations`: `plan.md`, `checks.md` e código prontos. Gate local verde. Verifier ainda não rodou.
- `org-core`: `verification.md` PASS (`8869be9`).
- Fase 3 fechada: `signup-gates` e `terms` com `verification.md` PASS.

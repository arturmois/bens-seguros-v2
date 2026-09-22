# Staging checks

Profile: standard
Plan: `.specs/features/staging/plan.md`

15 checks in 4 slices · 5 one-way doors · 1 open (blocks go-live: VPS access and domain)

Every proof runs against the local stack:
`docker compose -f docker-compose.prod.yml -f docker-compose.staging-local.yml --env-file .env.staging-local up -d --build`
(`.env.staging-local` is generated from `.env.prod.example` by `scripts/staging-smoke.sh up`). The
smoke script takes one step name per check and exits non-zero on the first failed assertion.

## Checks

### S1 - A pilha sobe em HTTPS · ~9 files · ~30 KB · ~8k

**C1** - Com a pilha no ar, `migrate` terminou com código 0 antes de `server` iniciar (o `State.FinishedAt` do `migrate` é anterior ao `State.StartedAt` do `server`), e `curl -k https://localhost/api/health` responde `200 {"status":"ok"}` (AC 1)
Proof: `scripts/staging-smoke.sh health`

**C2** - `https://localhost/login` responde `200` com o `index.html` da SPA (contém `<div id="root">`), e `/assets/<arquivo com hash>` responde com `Cache-Control: public, max-age=31536000, immutable` (AC 2, Surface)
Proof: `scripts/staging-smoke.sh spa`

**C3** - `http://localhost/` responde `308` com `Location: https://localhost/` (AC 3)
Proof: `scripts/staging-smoke.sh redirect`

**C4** - `docker compose port server 3001` e `docker compose port postgres 5432` não publicam nada no `docker-compose.prod.yml` sozinho (o override local publica o Postgres só em `127.0.0.1` para o e2e) (AC 4)
Proof: `scripts/staging-smoke.sh ports`

**C5** - `docker compose exec server id -u` imprime um uid diferente de `0` (AC 5)
Proof: `scripts/staging-smoke.sh non-root`

**C6** - Num Postgres novo, o script de provisionamento com `APP_DB_PASSWORD=x` cria `bens_app` com `rolsuper = false`, `rolbypassrls = false` e login com `x`; com `APP_DB_PASSWORD` vazio sai com código ≠ 0 e o role não existe (AC 6)
Proof: `scripts/staging-smoke.sh provision`

**C7** - Rodar o script de novo com `APP_DB_PASSWORD=y` sai com código 0; o login com `y` funciona e com `x` falha (AC 7)
Proof: `scripts/staging-smoke.sh provision`

### S2 - Cookie, Origin e IP atrás do Caddy · ~4 files · ~15 KB · ~4k

**C8** - O login por `https://localhost` devolve `set-cookie` `__Secure-better-auth.session_token=…` com `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` e sem `Domain` (AC 8)
Proof: `scripts/staging-smoke.sh cookie`

**C9** - `POST https://localhost/api/auth/sign-in/email` com `Origin: https://evil.example` responde `403` (AC 9)
Proof: `scripts/staging-smoke.sh origin`

**C10** - 11 logins errados com `X-Forwarded-For` diferente em cada um: os 10 primeiros não são `429` e o 11º é `429` (AC 10)
Proof: `scripts/staging-smoke.sh forwarded-for`

**C11** - `GET https://localhost/api/docs` responde `404` (AC 11)
Proof: `scripts/staging-smoke.sh docs`

**C12** - `GET https://localhost/login` traz exatamente os headers do door 5: `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` e `Content-Security-Policy` com os valores literais do plano (AC 12)
Proof: `scripts/staging-smoke.sh headers`

### S3 - O ciclo de login em HTTPS · ~2 files · ~5 KB · ~2k

**C13** - `E2E_BASE_URL=https://localhost E2E_DATABASE_URL=<Postgres do override> pnpm e2e` termina com código 0 (cadastro, verificação, login, logout, reset e 2FA de `auth-web`) (AC 13)
Proof: `scripts/staging-smoke.sh e2e`

**C14** - Um cliente Socket.IO com o cookie de um login feito por `https://localhost` conecta em `wss://localhost/socket.io` (transporte `websocket`) com `Origin: https://localhost` (AC 14)
Proof: `scripts/staging-smoke.sh socket`

### S4 - Runbook · ~1 file · ~5 KB · ~1k

**C15** - `docs/runbooks/staging.md` tem, nesta ordem, as seções DNS, `.env`, subir a pilha, verificar e rollback, e cada comando da seção "subir" existe no repo (arquivos citados existem) (AC 15)
Proof: `scripts/staging-smoke.sh runbook`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| serviços do compose (4) | `caddy` C2 · `server` C1, C5 · `postgres` C4, C6 · `migrate` C1 | - |
| rotas do Caddy (4) | SPA fallback C2 · `/assets/*` C2 · `/api/*` C1 · `/socket.io/*` C14 | - |
| Surface statuses (5) | `200` SPA C2 · `200` assets C2 · `404` assets C2 · `308` C3 · `502` com o server fora C1 | - |
| headers do door 5 (5) | HSTS C12 · nosniff C12 · Referrer-Policy C12 · X-Frame-Options C12 · CSP C12 | - |
| atributos do cookie (6) | prefixo C8 · `Secure` C8 · `HttpOnly` C8 · `SameSite=Lax` C8 · `Path=/` C8 · sem `Domain` C8 | - |
| provisionamento (3) | cria C6 · senha vazia C6 · troca de senha C7 | - |
| portas não publicadas (2) | `server` C4 · `postgres` C4 | - |
| startup config do server em produção (2 assemblies) | `docker-compose.prod.yml` C1 · CI e2e job (feature `auth-web`) C13 | - |
| Landing doors (5) | 1 imagem do server C1, C5 · 2 imagem do web C2 · 3 provisionamento C6, C7 · 4 compose C1, C4 · 5 headers C12 | - |

- Claims naming a status code or header: every proof crosses the Caddy boundary with `curl -k` or a real client
- `404` de assets e `502` com o server fora: C2 pede um asset inexistente; C1 para o `server`, espera `502` em `/api/health` e sobe de novo

## Test policy

There is no house rule for deployment artifacts. These rows are the bar.

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Caddyfile routing and headers | one smoke step per route and per header, through TLS | literal values of the plan |
| Dockerfiles, compose | the stack built from scratch and observed running | each service's role observed (C1, C4, C5) |
| provisioning script | run against a throwaway Postgres | each branch: create, empty password, password change |

Evidence:

- `Caddyfile`: 3 routing branches + 1 header block -> decides, proven per branch
- `docker/postgres/init/01-app-role.sh`: 2 branches (missing password, create vs alter) -> decides
- Dockerfiles: no conditionals -> instrumentation, proven by the running stack

## Swept

- validation: C6 (senha vazia)
- failure modes: C1 (`migrate` antes do `server`; `502` com o server fora)
- idempotency: C7 (provisionamento repetido)
- authorization: C4, C9, C10
- concurrency: n/a - uma instância de cada serviço
- data lifecycle: n/a - volumes nomeados; backup é Fase 12–13 (plan Out of scope)
- dependency failure: C1 (`502`)
- state transitions: n/a - sem máquina de estados
- observability: n/a - logs no stdout do Docker; Sentry e uptime nas Fases 12–13

## Handoff

- S1–S4 ≈ 14 arquivos novos/alterados (Dockerfiles, compose, Caddyfile, env examples, script de provisionamento, smoke script, runbook, CI, compose de dev) ≈ 60 KB ≈ 15k tokens; abaixo do budget de 150k - one builder

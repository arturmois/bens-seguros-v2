# Staging checks

Profile: standard
Plan: `.specs/features/staging/plan.md`

17 checks in 4 slices · 5 one-way doors · 1 open (blocks go-live: VPS access and domain)

Every proof runs against the local stack:
`docker compose -f docker-compose.prod.yml -f docker-compose.staging-local.yml --env-file .env.staging-local up -d --build`
(`.env.staging-local` is generated from `.env.prod.example` by `node scripts/staging-smoke.mjs up`). The
smoke script takes one step name per check and exits non-zero on the first failed assertion.
Locally the site is `https://localhost:8443` and `http://localhost:8080` (`HTTPS_PORT`/`HTTP_PORT`);
`https://localhost` below means that site.

## Checks

### S1 - A pilha sobe em HTTPS · ~9 files · ~30 KB · ~8k

**C1** - Com a pilha no ar, `migrate` terminou com código 0 antes de `server` iniciar (o `State.FinishedAt` do `migrate` é anterior ao `State.StartedAt` do `server`), e `curl -k https://localhost/api/health` responde `200 {"status":"ok"}` (AC 1)
Proof: `node scripts/staging-smoke.mjs health`

**C2** - `https://localhost/login` responde `200` com o `index.html` da SPA (contém `<div id="root">`), e `/assets/<arquivo com hash>` responde com `Cache-Control: public, max-age=31536000, immutable` (AC 2, Surface)
Proof: `node scripts/staging-smoke.mjs spa`

**C3** - `http://localhost/` responde `308` com `Location: https://localhost/` (AC 3)
Proof: `node scripts/staging-smoke.mjs redirect`

**C4** - `docker compose port server 3001` e `docker compose port postgres 5432` não publicam nada no `docker-compose.prod.yml` sozinho (o override local publica o Postgres só em `127.0.0.1` para o e2e) (AC 4)
Proof: `node scripts/staging-smoke.mjs ports`

**C5** - `docker compose exec server id -u` imprime um uid diferente de `0` (AC 5)
Proof: `node scripts/staging-smoke.mjs non-root`

**C6** - Num Postgres novo, o script de provisionamento com `APP_DB_PASSWORD=x` cria `bens_app` com `rolsuper = false`, `rolbypassrls = false` e login com `x`; com `APP_DB_PASSWORD` vazio sai com código ≠ 0 e o role não existe (AC 6)
Proof: `node scripts/staging-smoke.mjs provision`

**C7** - Rodar o script de novo com `APP_DB_PASSWORD=y` sai com código 0; o login com `y` funciona e com `x` falha (AC 7)
Proof: `node scripts/staging-smoke.mjs provision`

**C16** - O script rodado com `PROVISION_DATABASE_URL` apontando para **outro banco** (que o fallback do initdb nunca alcança) sai com código 0, deixa `bens_app` logando com a senha dada e aplica os grants **nesse** banco (ramo usado pelo CI e pelo runbook, **rodada 2**; **rodada 3**: antes o fallback fazia o check passar mesmo ignorando a URL)
Proof: `node scripts/staging-smoke.mjs provision`

**C17** - A imagem de runtime do server não contém o Prisma CLI, `next`, `@next/swc`, `playwright`, `playwright-core`, `typescript`, `@prisma/studio-core` nem `vitest`, tem menos de 400 MB de `node_modules`, o server podado responde `200` em `/api/health`, e todo módulo compilado (`app`, `dependencies`, `infrastructure/{pdf,storage,email,queue,realtime}`, `emails/send-email`, `modules/auth/auth`) importa dentro da imagem (Landing 1 e 1b, **rodada 2**: a imagem tinha 866 MB; **rodada 3**: só o boot era observado, e a poda podia remover o `@react-pdf/renderer` sem falhar)
Proof: `node scripts/staging-smoke.mjs image`

### S2 - Cookie, Origin e IP atrás do Caddy · ~4 files · ~15 KB · ~4k

**C8** - O login por `https://localhost` devolve `set-cookie` `__Secure-better-auth.session_token=…` com `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` e sem `Domain` (AC 8)
Proof: `node scripts/staging-smoke.mjs cookie`

**C9** - `POST https://localhost/api/auth/sign-in/email` com `Origin: https://evil.example` responde `403` (AC 9)
Proof: `node scripts/staging-smoke.mjs origin`

**C10** - 11 logins errados com `X-Forwarded-For` diferente em cada um: os 10 primeiros não são `429` e o 11º é `429` (AC 10)
Proof: `node scripts/staging-smoke.mjs forwarded-for`

**C11** - `GET https://localhost/api/docs` responde `404` (AC 11)
Proof: `node scripts/staging-smoke.mjs docs`

**C12** - `GET https://localhost/login` traz exatamente os headers do door 5: `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` e `Content-Security-Policy` com os valores literais do plano (AC 12)
Proof: `node scripts/staging-smoke.mjs headers`

### S3 - O ciclo de login em HTTPS · ~2 files · ~5 KB · ~2k

**C13** - `E2E_BASE_URL=https://localhost E2E_DATABASE_URL=<Postgres do override> pnpm e2e` termina com código 0 (cadastro, verificação, login, logout, reset e 2FA de `auth-web`) (AC 13)
Proof: `node scripts/staging-smoke.mjs e2e`

**C14** - Um cliente Socket.IO com o cookie de um login feito por `https://localhost` conecta em `wss://localhost/socket.io` (transporte `websocket`) com `Origin: https://localhost` (AC 14)
Proof: `node scripts/staging-smoke.mjs socket`

### S4 - Runbook · ~1 file · ~5 KB · ~1k

**C15** - `docs/runbooks/staging.md` tem, nesta ordem, as seções DNS, `.env`, subir a pilha, verificar e rollback, e cada comando da seção "subir" existe no repo (arquivos citados existem) (AC 15)
Proof: `node scripts/staging-smoke.mjs runbook`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| serviços do compose (4) | `caddy` C2 · `server` C1, C5 · `postgres` C4, C6 · `migrate` C1 | - |
| rotas do Caddy (4) | SPA fallback C2 · `/assets/*` C2 · `/api/*` C1 · `/socket.io/*` C14 | - |
| Surface statuses (5) | `200` SPA C2 · `200` assets C2 · `404` assets C2 · `308` C3 · `502` com o server fora C1 | - |
| headers do door 5 (5) | HSTS C12 · nosniff C12 · Referrer-Policy C12 · X-Frame-Options C12 · CSP C12 | - |
| atributos do cookie (6) | prefixo C8 · `Secure` C8 · `HttpOnly` C8 · `SameSite=Lax` C8 · `Path=/` C8 · sem `Domain` C8 | - |
| provisionamento (4) | cria C6 · senha vazia C6 · troca de senha C7 · por `PROVISION_DATABASE_URL` C16 | - |
| portas não publicadas (2) | `server` C4 · `postgres` C4 | - |
| startup config do server em produção (2 assemblies) | `docker-compose.prod.yml` C1, C17 · CI e2e job (feature `auth-web`) C16 | - |
| Landing doors (6) | 1 imagem do server C1, C5, C17 · 1b poda C17 · 2 imagem do web C2 · 3 provisionamento C6, C7, C16 · 4 compose C1, C4 · 5 headers C12 | - |

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
- `docker/postgres/init/01-app-role.sh`: 3 branches (missing password, create vs alter, URL vs initdb connection) -> decides
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

- **Boundary:** C1-C15 closed at the commit `build: add the production stack and validate it locally` (`node scripts/staging-smoke.mjs all` exit 0: 48 assertions, `pnpm e2e` 29 passed over `https://localhost:8443`; repo gate green, 130 tests)
- **Settled mid-build:** the local stack listens on 8080/8443 (another container holds 443 here), so Caddy's ports are configurable (plan Landing 4b); the HTTP redirect goes to the standard HTTPS port, `https://localhost/`, which is AC 3's literal value and what the VPS does on 443; the smoke script is Node (`.mjs`) rather than bash - JSON, cookies and the Socket.IO client; `pg_hba` of the official image trusts 127.0.0.1, so the provisioning proof logs in over the container address; `health` recreates `migrate` and `server` to observe their order on a fresh start
- **Abandoned:** `SITE_ADDRESS=localhost:8443` (Caddy still redirected to the default port)
- **Boundary:** C16-C17 closed at the commit `build: prune optional peers from the server image and prove the url provisioning` (round 2; `node scripts/staging-smoke.mjs all` exit 0, `pnpm e2e` 29 passed over HTTPS; repo gate green)
- **Settled mid-build:** the user chose to prune in the Dockerfile (2026-09-22); instead of a hand list, `apps/server/scripts/prune-runtime.mjs` keeps what is reachable from the server's production dependencies and required peers (866 MB -> 260 MB); `autoInstallPeers: false` in the workspace changed nothing in the `--prod` install and was reverted; the runbook no longer claims a Caddy healthcheck
- **Abandoned:** `autoInstallPeers: false` (no effect on the image, changes the whole lockfile)
- **Boundary:** rodada 3 closed at the commit `test: make the staging image and provisioning proofs discriminate` (`node scripts/staging-smoke.mjs all` exit 0 with `image` included; repo gate green)
- **Settled mid-build:** C16 points the URL at another database and asserts the grants landed there, because the initdb fallback reached the same server; C17 imports every compiled module in the container, because the boot path alone missed `@react-pdf/renderer` and the AWS SDK; `image` is in the `all` list
- **Abandoned:** none


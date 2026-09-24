# Staging signup env checks

Profile: standard
Plan: none - change under ~3 files, no one-way door (see Intent)

## Intent

The production stack does not boot. Since `152bf11` (signup-gates) the server config requires
`TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY` when `NODE_ENV=production` and
`SIGNUP_MODE=self_serve` (the default), but `docker-compose.prod.yml` never passes `SIGNUP_MODE`
or `TURNSTILE_*` to the `server` container, so it exits on config and never becomes healthy. The
local staging smoke (`scripts/staging-smoke.mjs`) fails for the same reason, which blocks the F0
criterion "CI verde e o smoke local" (ADR-011, erp-prune C9) and would block the staging milestone.

When this ships, the compose stack passes the sign-up settings to the server and refuses to start
without the Turnstile keys, and the smoke runs with Cloudflare's documented always-pass test keys
(sitekey `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`, dummy token
`XXXX.DUMMY.TOKEN.XXXX`; https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

9 checks in 1 slice · 0 one-way doors · 0 open

Every command runs from the repo root. `rg` means real ripgrep; in this shell it runs as
`ARGV0=rg ~/.local/bin/claude <args>` (see erp-prune checks, Handoff).

## Checks

### S1 - a pilha de produção sobe com o cadastro configurado · 3 files · 24 KB · ~6k

**C1** - O serviço `server` do `docker-compose.prod.yml` recebe `SIGNUP_MODE: ${SIGNUP_MODE:-self_serve}`, `TURNSTILE_SECRET_KEY: ${TURNSTILE_SECRET_KEY:?}` e `TURNSTILE_SITE_KEY: ${TURNSTILE_SITE_KEY:?}`
Proof: `rg -n --fixed-strings 'SIGNUP_MODE: ${SIGNUP_MODE:-self_serve}' docker-compose.prod.yml` exits 0
Proof: `rg -n --fixed-strings 'TURNSTILE_SECRET_KEY: ${TURNSTILE_SECRET_KEY:?}' docker-compose.prod.yml` exits 0
Proof: `rg -n --fixed-strings 'TURNSTILE_SITE_KEY: ${TURNSTILE_SITE_KEY:?}' docker-compose.prod.yml` exits 0

**C2** - Com todas as outras variáveis do `.env.staging-local` presentes e sem `TURNSTILE_SECRET_KEY`, `docker compose … config` sai com código diferente de `0` e cita `TURNSTILE_SECRET_KEY` (falha no compose, não em crash loop do container)
Proof: `grep -v '^TURNSTILE_' .env.staging-local > /tmp/claude-1000/no-turnstile.env && docker compose -f docker-compose.prod.yml -f docker-compose.staging-local.yml --env-file /tmp/claude-1000/no-turnstile.env config 2>&1 >/dev/null | rg -q TURNSTILE_SECRET_KEY` exits 0

**C3** - O `.env.staging-local` que o smoke gera contém `SIGNUP_MODE=self_serve`, `TURNSTILE_SITE_KEY=1x00000000000000000000AA` e `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`; um `.env.staging-local` já existente sem essas chaves as recebe no início do smoke, sem perder as linhas que tinha
Proof: `rg -n --fixed-strings "TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA" scripts/staging-smoke.mjs` exits 0
Proof: `rg -c "^(SIGNUP_MODE=self_serve|TURNSTILE_SITE_KEY=1x00000000000000000000AA|TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA)$" .env.staging-local` prints `3` after `node scripts/staging-smoke.mjs all` ran on a file that lacked them

**C4** - O cadastro do smoke envia o header `x-captcha-response: XXXX.DUMMY.TOKEN.XXXX`
Proof: `rg -n --fixed-strings "'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX'" scripts/staging-smoke.mjs` exits 0

**C5** - O smoke local termina com exit code `0` (fecha o C9 da `erp-prune`)
Proof: `node scripts/staging-smoke.mjs up && node scripts/staging-smoke.mjs all` exits 0

**C6** - O runbook de staging manda preencher `TURNSTILE_SECRET_KEY` e `TURNSTILE_SITE_KEY` com as chaves do site no Cloudflare
Proof: `rg -n "TURNSTILE_SECRET_KEY" docs/runbooks/staging.md` exits 0

**C7** - O passo `headers` do smoke compara a `Content-Security-Policy` servida com exatamente a do `Caddyfile` decidida pela `signup-gates` (C15 dela: `https://challenges.cloudflare.com` em `script-src` e `frame-src`); a comparação continua por igualdade
Proof: `node scripts/staging-smoke.mjs headers` exits 0 with the stack up
Proof: `rg -n --fixed-strings "script-src 'self' https://challenges.cloudflare.com" scripts/staging-smoke.mjs` exits 0

**C8** - O helper `signUp` do e2e (`apps/web/e2e/support.ts`) envia `x-captcha-response: XXXX.DUMMY.TOKEN.XXXX` (acrescentado com o usuário: o passo `e2e` do smoke falhava com `400` no cadastro)
Proof: `rg -n --fixed-strings "'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX'" apps/web/e2e/support.ts` exits 0
Proof: `node scripts/staging-smoke.mjs e2e` exits 0 with the stack up

**C9** - O job de e2e do CI roda o server com `SIGNUP_MODE: self_serve`, `TURNSTILE_SITE_KEY: 1x00000000000000000000AA` e `TURNSTILE_SECRET_KEY: 1x0000000000000000000000000000000AA` (em `NODE_ENV=production` sem elas, o server não passa da config)
Proof: `rg -n "^      (SIGNUP_MODE: self_serve|TURNSTILE_SITE_KEY: 1x00000000000000000000AA|TURNSTILE_SECRET_KEY: 1x0000000000000000000000000000000AA)$" .github/workflows/ci.yml` prints 3 lines

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| sign-up settings the production config reads (3) | `SIGNUP_MODE` C1 · `TURNSTILE_SECRET_KEY` C1, C2 · `TURNSTILE_SITE_KEY` C1 | - |
| places that assemble a production-mode env (4) | `docker-compose.prod.yml` C1 · smoke-generated `.env.staging-local` C3 · runbook `.env` from `.env.prod.example` C6 · CI e2e job C9 | - |
| stale callers of sign-up from before `152bf11` (3) | smoke C4 · e2e helper C8 · CI e2e job C9 | - |
| stale expectations the smoke carried from before `152bf11` (2) | Turnstile env C3, C4 · CSP C7 | - |
| smoke `.env.staging-local` states (2) | absent, generated C3 · present without the keys, appended C3 | - |

- No check claims more than the case its proof exercises.

## Swept

- validation: C2 (compose refuses to start without the secret instead of a crash loop)
- failure modes: C2
- idempotency: C3 (appending runs only for missing keys; a second smoke run adds nothing)
- authorization: n/a - no route or permission changes
- concurrency: n/a - single local script and compose file
- data lifecycle: n/a - no stored data
- dependency failure: n/a - the smoke's sign-up reaches Cloudflare siteverify; an offline machine fails the smoke, which is the existing behaviour of every external call in it
- state transitions: n/a - none
- observability: n/a - no log or metric changes

## Handoff

- S1 = 6k, one builder.
- **Settled mid-build:** (1) `all` does not include `up` (its `ORDER` starts at `health`, which starts only `server`), so the smoke proof is `up && all`, as the `staging` feature ran it; the runbook sentence that said only `all` is corrected. (2) The first smoke run then failed on `headers`: the CSP expectation predates `152bf11`, which widened the Caddyfile CSP for Turnstile on purpose (signup-gates C15). C7 added. (3) The first C2 run exited 1 and did not reproduce in two later runs of the same command; attributed to the `rtk` hook rewriting the output of the first `docker` command in a call.
- **Progress:** C1-C9 green; `up && all` exits 0 (16 steps, 84 e2e passed); gates green

# Staging verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 7a7da47..7629514
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

All 15 checks are green at `7629514` with a located assertion each, and all 5 faults were killed.
The verdict is FAIL on coverage: the server image carries the Prisma CLI, which is the alternative
Landing door 1 rejected, and no check looks at what is in the image. The provisioning script's
`PROVISION_DATABASE_URL` branch, which both CI jobs use, is also proven by no check. That leaves
one `Test policy` row unmet.

Real-tree baseline `git status --porcelain` was empty before the run. It was still empty after the
fault injection, the worktree removal and the gate. The stack was restored from the real tree, and
`health`, `non-root`, `headers`, `spa` and `forwarded-for` passed again. The Caddyfile inside the
running `caddy` container matches the real `Caddyfile` (`diff` empty). Nothing was pushed: the
branch `feat/phase-2-infrastructure` is 24 commits ahead of its remote. No VPS action was taken.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-008-deployment.md` | yes - services caddy/server/postgres/migrate, same origin, `/api/*` + `/socket.io/*` to server | none - GHCR/tag pipeline, backup, Sentry, `/api/ready` and `/embed/*` are deferred by the plan's Out of scope / door 5 | - |
| `docs/decisions/ADR-004-tenant-isolation.md` | yes - item 2 (runtime as `bens_app`, only the Prisma CLI as owner) | none - `docker-compose.prod.yml:54` `DATABASE_URL` is `bens_app`, `:34` `MIGRATION_DATABASE_URL` is the owner, C6 asserts `rolsuper`/`rolbypassrls` false | - |
| `docs/architecture.md` §7 security controls | yes - "Headers: helmet na API; CSP e X-Frame-Options no Caddy para a SPA" | none - `apps/server/src/app.ts:47` registers helmet; observed through Caddy, `GET /api/health` also carries HSTS, CSP, nosniff, `X-Frame-Options: DENY` (one value each; the Caddy `header` block at `Caddyfile:32-39` replaces them site-wide) | - |
| `docs/architecture.md` §10 deploy | yes - "node:24-slim, multi-stage (deps -> prisma generate -> tsc -> runtime não-root)" | none - `apps/server/Dockerfile:5,11-18,31-41`; C5 uid 1000 | - |
| `prompts/prompt-03.md` staging bullet | yes - compose + Caddyfile validated locally + provisioning script, stop before deploy | none - all three delivered; no push/deploy (branch ahead of origin by 24) | - |
| `CLAUDE.md` | yes - lean process, gate, secrets via config | none | - |

## Checks

All proofs ran in one invocation: `node scripts/staging-smoke.mjs all`, exit 0. It printed 48
`ok -` lines and `pnpm e2e` reported `29 passed (1.1m)` against `https://localhost:8443`. Every
step is in the new file `scripts/staging-smoke.mjs`, so each proof exercises code from this diff.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | migrate exits 0 before server starts; health 200 `{"status":"ok"}`; 502 with server down | `staging-smoke.mjs all` (step `health`) exit 0 | `scripts/staging-smoke.mjs:187` - `assert(migrateExit === '0', …)`; `:188-189` - `containerTime('migrate','FinishedAt') < containerTime('server','StartedAt')`; `:193-194` - `health.status === 200` and `JSON.stringify(await health.json()) === '{"status":"ok"}'`; `:199` - `down.status === 502` | PASS |
| C2 | `/login` 200 SPA; hashed asset immutable; missing asset 404 | step `spa` | `scripts/staging-smoke.mjs:210-211` - `login.status === 200`, `html.includes('<div id="root">')`; `:216-217` - `found.headers.get('cache-control') === 'public, max-age=31536000, immutable'`; `:221` - `missing.status === 404` | PASS |
| C3 | `http://` -> 308 `Location: https://localhost/` | step `redirect` | `scripts/staging-smoke.mjs:227` - `response.status === 308`; `:231` - `response.headers.get('location') === 'https://localhost/'` | PASS |
| C4 | prod file alone publishes no server/postgres port | step `ports` | `scripts/staging-smoke.mjs:239-248` - `docker compose -f docker-compose.prod.yml … config` (prod file alone, no override); `:251` - `config.services.server.ports === undefined`; `:255` - `config.services.postgres.ports === undefined` | PASS |
| C5 | server uid != 0 | step `non-root` | `scripts/staging-smoke.mjs:268` - `assert(uid !== '0', …)` (observed uid 1000) | PASS |
| C6 | fresh DB: `x` creates NOSUPERUSER NOBYPASSRLS role that logs in with `x`; empty password exits != 0, no role | step `provision` | `scripts/staging-smoke.mjs:338-339` - `empty.status !== 0`, `roles() === ''`; `:341-343` - `run('senha-x').status === 0`, `roles() === 'false\|false'`, `login('senha-x')`. Login goes over the container IP (`:321-332`), so pg_hba `trust` on 127.0.0.1 does not apply. `:347` proves a password is actually checked | PASS |
| C7 | re-run with `y` exits 0; `y` logs in, `x` refused | step `provision` | `scripts/staging-smoke.mjs:345-347` - `run('senha-y').status === 0`, `login('senha-y')`, `!login('senha-x')` | PASS |
| C8 | `__Secure-` session cookie, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain | step `cookie` | `scripts/staging-smoke.mjs:356` - `item.startsWith('__Secure-better-auth.session_token=')`; `:361-367` - regex per attribute `/;\s*Secure/i`, `/;\s*HttpOnly/i`, `/;\s*SameSite=Lax/i`, `/;\s*Path=\/(;\|$)/i`; `:369` - `!/;\s*Domain=/i.test(cookie)` | PASS |
| C9 | `Origin: https://evil.example` -> 403 | step `origin` | `scripts/staging-smoke.mjs:379` - `response.status === 403`. The same request with `origin: BASE` returns 401 in step `forwarded-for`, so the 403 comes from the Origin check | PASS |
| C10 | 11 sign-ins, a different XFF on each: first 10 not 429, 11th 429 | step `forwarded-for` | `scripts/staging-smoke.mjs:390` - `'x-forwarded-for': \`203.0.113.${i + 1}\`` (a different value on every request); `:395` - `!statuses.slice(0, 10).includes(429)`; `:398` - `statuses[10] === 429`. The bucket is IP+path, not the e-mail (`apps/server/src/modules/auth/auth.ts:80-97`), so the 429 needs a fixed IP | PASS |
| C11 | `/api/docs` 404 | step `docs` | `scripts/staging-smoke.mjs:405` - `response.status === 404`. The route exists only when `NODE_ENV !== 'production'` (`apps/server/src/app.ts:62-64`) | PASS |
| C12 | door 5 headers, literal values | step `headers` | `scripts/staging-smoke.mjs:411-420` - `response.headers.get(name) === value` for the 5 headers with the plan's literal strings | PASS |
| C13 | `pnpm e2e` over HTTPS exits 0 (register, verify, login, logout, reset, 2FA) | step `e2e` (the checks name `scripts/staging-smoke.sh e2e`, a file that does not exist; see gaps) | `scripts/staging-smoke.mjs:434` - `result.status === 0`. `apps/web/playwright.config.ts:14` - `baseURL: process.env.E2E_BASE_URL`. 29 passed: `login.spec.ts` (12, incl. `signs out`), `password-reset.spec.ts` (4), `register.spec.ts` (6), `two-factor.spec.ts` (7) | PASS |
| C14 | Socket.IO websocket via `wss://` with the session cookie connects | step `socket` | `scripts/staging-smoke.mjs:446` - `transports: ['websocket']`; `:457-458` - `outcome === 'connected'` | PASS |
| C15 | runbook sections in order; cited files exist | step `runbook` | `scripts/staging-smoke.mjs:469-476` - every section found, `index > found[i - 1]`; `:483` - `text.includes(file) && existsSync(file)` | PASS |

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| compose services (4) | `docker-compose.prod.yml:8,27,39,72` | caddy C2/C12 · server C1/C5 · postgres C1 (server connects as `bens_app` from the init script), C4 · migrate C1 | - |
| Caddy routes (4) | `Caddyfile:13-30` | `@api /api/*` C1 · `@api /socket.io/*` C14 · `/assets/*` C2 · SPA fallback C2 | - |
| Surface statuses (5) | plan Surface | SPA 200 C2 · assets 200 C2 · assets 404 C2 · 308 C3 · API 502 with the server down C1 | - |
| door 5 headers (5) | plan Landing door 5 / `Caddyfile:33-37` | HSTS · nosniff · Referrer-Policy · X-Frame-Options · CSP, all C12 | - |
| cookie attributes (6) | plan AC 8 | prefix · Secure · HttpOnly · SameSite=Lax · Path=/ · no Domain, all C8 | - |
| provisioning script branches (4, the checks say 3) | `docker/postgres/init/01-app-role.sh:11-14,16-20,25-27` | empty password C6 · create C6 · alter/password change C7 · **connection by `PROVISION_DATABASE_URL` (`:16-17`)**: no proof. The provision step only takes the `POSTGRES_USER`/`POSTGRES_DB` branch (`scripts/staging-smoke.mjs:300-304`) | PROVISION_DATABASE_URL branch (used by `.github/workflows/ci.yml:57` and `:131`) |
| unpublished ports (2) | plan AC 4 | server C4 · postgres C4 | - |
| server startup assemblies (2) | `docker-compose.prod.yml:39-70`; `.github/workflows/ci.yml:57,131` | compose C1 · CI: the only change this diff makes to the CI assembly is role provisioning over `PROVISION_DATABASE_URL`. C13 runs against the compose stack, never against the CI assembly, and CI has not run at this HEAD (not pushed) | CI assembly (`ci.yml:57`, `:131`) |
| Landing doors (6: 1, 2, 3, 4, 4b, 5) | plan Landing | door 1: runs C1, non-root C5; **"prod-only runtime (`pnpm deploy --prod` to `/app`), migration tool not in the process that serves requests"** has no proof, and the code contradicts it: `apps/server/Dockerfile:26-37` installs `--prod` into `/repo`, with no `pnpm deploy` and no `/app`; the running `server` image holds `/repo/node_modules/.pnpm/prisma@7.10.0…/node_modules/prisma/build/index.js` (the Prisma CLI, pulled in as the peer of `@prisma/client`) plus `@prisma/studio-core`, `next@16.3.3`, `playwright-core` and the native `typescript`, 866 MB of `node_modules` in all; migrate CMD is `pnpm exec prisma migrate deploy` (`:23`), not `["prisma","migrate","deploy"]`. door 2 C2 · door 3 C6/C7 · door 4 C1/C4 · door 4b C3 (8080), C1 (8443) · door 5 C12 | door 1 (runtime free of the migration tool) |

- Claims that name a status code or a header all cross the Caddy boundary over TLS, so there is no
  level gap.
- The door 4 literal says secrets go in "`.env` (`env_file`)", but the compose file interpolates
  them per service (`environment: ${…}` with `--env-file`). This is tighter than `env_file`,
  because each service gets only its own variables. It is still drift the plan does not record.
  The same goes for `caddy:2.10-alpine` -> `2.11.4-alpine`, which the Assumptions row allows.

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Caddyfile routing and headers | `Caddyfile` | one smoke step per route and header, through TLS: C1, C2, C3, C12, C14 | yes |
| Dockerfiles, compose | `apps/server/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.prod.yml`, `docker-compose.staging-local.yml` | stack built and observed running: C1, C4, C5 | yes as written ("each service's role observed"); the door-1 image contents are a Coverage gap above |
| provisioning script | `docker/postgres/init/01-app-role.sh` | each branch against a throwaway Postgres | no - gap: the `PROVISION_DATABASE_URL` branch (`:16-17`) is never run by a proof; the Evidence line (`checks.md:100`) counts "2 branches" and misses it |

## Faults injected

Each fault was injected in a git worktree under the scratchpad. The stack was rebuilt from that
worktree with project `bens-staging-local`, and the narrowest step was run from there. The stack
was then restored from the real tree and the worktree removed.

| Mutation | Location | Killed |
| --- | --- | --- |
| CSP without `frame-ancestors 'none'` | `Caddyfile:37` | yes - `headers`: `not ok - content-security-policy: … connect-src 'self'; base-uri 'self'; …` |
| `/assets/*` handle removed (assets fall through to the SPA handle) | `Caddyfile:18-23` | yes - `spa`: `not ok - cache-control: null` (killed before the 404 assertion) |
| Caddy trusts the client's X-Forwarded-For (`servers { trusted_proxies static private_ranges }`) | `Caddyfile:3-6` | yes - `forwarded-for`: `not ok - the 11th is 429 despite a new X-Forwarded-For (401)` |
| `USER node` dropped | `apps/server/Dockerfile:39` | yes - `non-root`: `not ok - server runs as uid 0` |
| empty-password guard removed | `docker/postgres/init/01-app-role.sh:11-14` | yes - `provision`: `not ok - empty APP_DB_PASSWORD exits 0` |

- C4's proof is a static read of `docker compose config` on the prod file. A fault there is
  trivially killed, so no run was spent on it.
- Supplementary probe, not a proof. In a throwaway `postgres:18-alpine`, the script with
  `PROVISION_DATABASE_URL=postgresql://postgres:owner@<container ip>/postgres` exited 0, and
  `bens_app` logged in with the new password as `f|f`. A password containing `'` and `;` was
  quoted safely by `:'app_password'`. So the branch works today, but nothing in the checks would
  catch it breaking.

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` - exit 0: biome 109 files; 22 test files, 130 passed, 0 failed; web build ok.

## Ranked gaps

1. Landing door 1 is unproven and contradicted. The runtime image ships the Prisma CLI, the thing
   the plan's rejected alternative warned about, plus `next`, `playwright-core`, native `typescript`
   and `@prisma/studio-core` (866 MB of `node_modules`). There is no `pnpm deploy --prod` to
   `/app`, and the migrate CMD differs. No check asserts what the image contains. Coverage row
   "Landing doors"; `apps/server/Dockerfile:26-37,23`.
2. The provisioning script's `PROVISION_DATABASE_URL` branch has no proof, yet it is the path both
   CI jobs now take. The Test policy row "each branch" is unmet, and the startup-config row's CI
   member is unproven. `docker/postgres/init/01-app-role.sh:16-17`, `.github/workflows/ci.yml:57,131`,
   `.specs/features/staging/checks.md:79,81,100`.
3. Precision gap: C13's proof names `scripts/staging-smoke.sh e2e`, and that file does not exist.
   The header and the plan also still name the `.sh`. `.specs/features/staging/checks.md:10,60`,
   `.specs/features/staging/plan.md:103,152`.
4. Precision gap (C15): the runbook says `caddy` is `running (healthy)`, but the `caddy` service
   has no healthcheck. C15 checks only headings and file existence, not that the commands and
   their expected output are right. `docs/runbooks/staging.md:46-47` vs
   `docker-compose.prod.yml:72-89`.
5. Observation, not failing: the `caddy` and `migrate` containers run as root (image `User`
   empty). Architecture §10 requires non-root only for the server runtime.
   `apps/web/Dockerfile:15`, `apps/server/Dockerfile:21-23`.
6. Observation: `APP_DB_PASSWORD` stays in the long-running `postgres` container's environment,
   although it is needed only at init (`docker-compose.prod.yml:16`). Locally, C3's `Location:
   https://localhost/` points at port 443, which is another container on this machine. The Handoff
   accepts this, and it is correct on the VPS.

# Staging verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 7a7da47..f34e69a (fix range edabd1d..f34e69a)
**Round**: 3 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 2 (at `b04cbff`) left four ranked gaps: C16 did not discriminate (mutant R2-1 survived — throwaway Postgres ignored the URL and fell back to the local socket); C17 only covered boot (mutant R2-4 survived — pruning `@react-pdf/renderer` still passed `image` / `health` / `cookie`); `image` was missing from `ORDER`; the startup-config Coverage row still mapped the CI assembly to C13.

The fix commit `f34e69a` (`test: make the staging image and provisioning proofs discriminate`) changes only `scripts/staging-smoke.mjs` and the C16/C17 wording plus Coverage mapping in `checks.md`. C16 now points `PROVISION_DATABASE_URL` at another database `provision_target` and asserts the CREATE grant is absent before the run and present after on that database. C17 imports every compiled module listed in the check inside the container. `image` is in `ORDER` after `provision`.

All proofs re-ran in full at `f34e69a`: one invocation `env -u PLAYWRIGHT_BROWSERS_PATH node scripts/staging-smoke.mjs all`, exit 0, 63 `ok -` lines. Named steps in that output, in order: `health`, `spa`, `redirect`, `ports`, `non-root`, `provision`, `image`, `cookie`, `origin`, `forwarded-for`, `docs`, `headers`, `socket`, `runbook`, `e2e`. `image` ran as part of `all`, not only standalone. `pnpm e2e` 29 passed against `https://localhost:8443`. Real-tree baseline `git status --porcelain` was empty before the run, empty after the faults, the worktree removal and the gate. The stack was restored from the real tree: `image` passes again (260 MB, compiled modules import). Nothing was pushed or deployed; the `opasuite` container was listed and not touched.

C1–C15 are carried from `7629514` for their claim and were re-run at `f34e69a`; citations in `scripts/staging-smoke.mjs` are refreshed because the fix moved later line numbers. C16, C17, Coverage rows the fix touched, unmet Test policy rows, and faults are re-judged at `f34e69a`.

## Binding sources

Carried from `b04cbff` (the fix touched no binding source — only the smoke script and checks wording).

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/architecture.md` §10 deploy | carried from `b04cbff` - `apps/server/Dockerfile:5,11-18,26-34,35-45` still multi-stage on `node:24.21.0-slim` with `USER node` | none | - |
| `docs/decisions/ADR-004-tenant-isolation.md` | carried from `b04cbff` - `docker-compose.prod.yml:34,54`; pruned image keeps `@prisma/client` + `@prisma/adapter-pg` and drops the CLI | none | - |
| `docs/decisions/ADR-008-deployment.md`, `docs/architecture.md` §7, `prompts/prompt-03.md`, `CLAUDE.md` | carried from `7629514` via `b04cbff` - opened there, no contradiction, nothing uncovered | none | - |

## Checks

`node scripts/staging-smoke.mjs all` at `f34e69a`, exit 0: 63 `ok -` lines, `pnpm e2e` 29 passed against `https://localhost:8443`. `ORDER` at `scripts/staging-smoke.mjs:579-595` includes `'image'` at `:586` immediately after `'provision'`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | migrate exits 0 before the server starts; health 200 `{"status":"ok"}`; 502 with the server down | `all` (step `health`) | `scripts/staging-smoke.mjs:187` - `migrateExit === '0'`; `:188-191` - `containerTime('migrate','FinishedAt') < containerTime('server','StartedAt')`; `:193-194` - `health.status === 200`, `JSON.stringify(await health.json()) === '{"status":"ok"}'`; `:199` - `down.status === 502` | PASS |
| C2 | `/login` 200 SPA; hashed asset immutable; missing asset 404 | step `spa` | `:210-211` - `login.status === 200`, `html.includes('<div id="root">')`; `:216-217` - `found.headers.get('cache-control') === 'public, max-age=31536000, immutable'`; `:221` - `missing.status === 404` | PASS |
| C3 | `http://` -> 308 `Location: https://localhost/` | step `redirect` | `:227` - `response.status === 308`; `:230-231` - `response.headers.get('location') === 'https://localhost/'` | PASS |
| C4 | the prod file alone publishes no server/postgres port | step `ports` | `:239-248` - `docker compose -f docker-compose.prod.yml … config` (prod file alone); `:250-251` - `config.services.server.ports === undefined`; `:254-255` - `config.services.postgres.ports === undefined` | PASS |
| C5 | server uid != 0 | step `non-root` | `:268` - `assert(uid !== '0', …)`, observed uid 1000 | PASS |
| C6 | fresh DB: creates `bens_app` NOSUPERUSER NOBYPASSRLS, logs in; empty password exits != 0 and creates nothing | step `provision` | `:338-339` - `empty.status !== 0`, `roles() === ''`; `:341-343` - `run('senha-x').status === 0`, `roles()` is `rolsuper=false rolbypassrls=false`, `login('senha-x')`; login goes over the container IP (`:321-335`) | PASS |
| C7 | re-run with `y` exits 0; `y` logs in, `x` refused | step `provision` | `:345-347` - `run('senha-y').status === 0`, `login('senha-y')`, `!login('senha-x')` | PASS |
| C8 | `__Secure-` cookie with Secure, HttpOnly, SameSite=Lax, Path=/, no Domain | step `cookie` | `:390-394` - `item.startsWith('__Secure-better-auth.session_token=')`; `:395-402` - one regex per attribute; `:403` - `!/;\s*Domain=/i.test(cookie)` | PASS |
| C9 | `Origin: https://evil.example` -> 403 | step `origin` | `:413` - `response.status === 403` | PASS |
| C10 | 11 sign-ins with a different XFF each: first 10 not 429, 11th 429 | step `forwarded-for` | `:424` - `'x-forwarded-for': 203.0.113.${i + 1}`; `:428-430` - `!statuses.slice(0, 10).includes(429)`; `:432` - `statuses[10] === 429` | PASS |
| C11 | `/api/docs` 404 | step `docs` | `:439` - `response.status === 404` | PASS |
| C12 | door 5 headers, literal values | step `headers` | `:445-454` - `response.headers.get(name) === value` over the 5 header literals | PASS |
| C13 | `pnpm e2e` over HTTPS exits 0 | step `e2e` | `:468` - `result.status === 0`; `apps/web/playwright.config.ts:14` - `baseURL: process.env.E2E_BASE_URL`; 29 passed (login 12, reset 4, register 6, 2FA 7) | PASS |
| C14 | Socket.IO over `wss://` with the session cookie connects | step `socket` | `:480` - `transports: ['websocket']`; `:491-493` - `outcome === 'connected'` | PASS |
| C15 | runbook sections in order; cited files exist | step `runbook` | `:560-567` - sections found and increasing; `:574` - `text.includes(file) && existsSync(file)` | PASS |
| C16 | `PROVISION_DATABASE_URL` pointed at another database the initdb fallback never reaches; exit 0; `bens_app` logs in; CREATE grant absent before and present after on that database | step `provision` | `:351` - `CREATE DATABASE provision_target`; `:362-364` - `grantedOn('provision_target') === 'f'` before the run; `:373` - URL is `postgresql://postgres:owner@${ip}/provision_target`; `:379` - `byUrl.status === 0`; `:380` - `login('senha-z')`; `:381` - `grantedOn('provision_target') === 't'`. Fault R3-1 disables the URL branch; `provision` then prints the before-grant and exit-0 / login lines and dies on `:381` | PASS |
| C17 | no prisma CLI / next / @next swc / playwright(-core) / typescript / @prisma studio-core / vitest; < 400 MB; pruned server answers `/api/health`; every compiled module (`app`, `dependencies`, `infrastructure/{pdf,storage,email,queue,realtime}`, `emails/send-email`, `modules/auth/auth`) imports in the image | `all` (step `image`, in `ORDER` after `provision`) | `:510-516` - `present.length === 0` for each of the 8 names; `:519` - `Number(size) < 400` (observed 260); `:521` - `health.status === 200`; `:524-534` - the nine `dist/*.js` paths named by the check; `:548-550` - `load.status === 0` (`every compiled module imports in the image`). Fault R3-2 drops `@react-pdf/renderer`; `image` then dies on `:548-550` (`Cannot find package '@react-pdf/renderer' imported from …/pdf.js`); size and `/api/health` still pass | PASS |

## Coverage

Recomputed at `f34e69a` for the rows the fix touched (provisioning, startup config, Landing doors, runtime modules). The other rows — compose services, Caddy routes, Surface statuses, door 5 headers, cookie attributes, unpublished ports — are carried from `7629514` via `b04cbff`, where they were recomputed with no unproven member; the fix touches none of them.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| provisioning script branches (4) | `docker/postgres/init/01-app-role.sh:11-14,16-20,25-29` | empty password C6 · create C6 · alter C7 · `PROVISION_DATABASE_URL` C16 - URL is `…/provision_target` (`scripts/staging-smoke.mjs:373`); CREATE grant asserted `'f'` then `'t'` on that database (`:362-364,:381`); killed by R3-1 | - |
| server startup assemblies (2) | `docker-compose.prod.yml:39-70`; `.github/workflows/ci.yml:57-59,133-134` | compose C1, C17 · CI: both the `ci` job (`:59`) and the `e2e` job (`:134`) run `PROVISION_DATABASE_URL=postgresql://bens:bens@localhost:5432/bens docker/postgres/init/01-app-role.sh`, which is the branch C16 now discriminates. `checks.md:87` maps this member to C16 | - |
| Landing doors (6) | plan Landing | 1 C1, C5, C17 · 1b C17 · 2 C2 · 3 C6, C7, C16 · 4 C1, C4 · 5 C12. Door 3 includes C16 (`checks.md:88`) | - |
| runtime modules the server can load off the boot path (9 compiled files / 3 packages named in round 2) | C17's module list (`scripts/staging-smoke.mjs:524-534`); `apps/server/src/infrastructure/pdf.ts:1` (`@react-pdf/renderer`); `apps/server/src/infrastructure/storage.ts:9-10` (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`); `apps/server/src/infrastructure/email.ts:3` (`react-email`); `apps/server/src/dependencies.ts:5` | each of `app`, `dependencies`, `pdf`, `storage`, `email`, `queue`, `realtime`, `emails/send-email`, `modules/auth/auth` is imported in the container (C17 `:548-550`); PDF package absence is killed by R3-2 | - |
| serviços do compose (4) | carried from `7629514` via `b04cbff` | `caddy` C2 · `server` C1, C5 · `postgres` C4, C6 · `migrate` C1 | - |
| rotas do Caddy (4) | carried from `7629514` via `b04cbff` | SPA fallback C2 · `/assets/*` C2 · `/api/*` C1 · `/socket.io/*` C14 | - |
| Surface statuses (5) | carried from `7629514` via `b04cbff` | `200` SPA C2 · `200` assets C2 · `404` assets C2 · `308` C3 · `502` C1 | - |
| headers do door 5 (5) | carried from `7629514` via `b04cbff` | HSTS C12 · nosniff C12 · Referrer-Policy C12 · X-Frame-Options C12 · CSP C12 | - |
| atributos do cookie (6) | carried from `7629514` via `b04cbff` | prefixo C8 · `Secure` C8 · `HttpOnly` C8 · `SameSite=Lax` C8 · `Path=/` C8 · sem `Domain` C8 | - |
| portas não publicadas (2) | carried from `7629514` via `b04cbff` | `server` C4 · `postgres` C4 | - |

## Test policy rows

Re-judged the unmet rows from round 2 and the rows that classify files the fix's proofs cover (`01-app-role.sh`, Dockerfiles / `prune-runtime.mjs`). Caddyfile row carried.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Caddyfile routing and headers | `Caddyfile` | one smoke step per route and header, through TLS: C1, C2, C3, C12, C14 | yes - carried from `7629514`, proofs re-run at `f34e69a` |
| Dockerfiles, compose | `apps/server/Dockerfile`, `apps/server/scripts/prune-runtime.mjs`, `apps/web/Dockerfile`, `docker-compose.prod.yml`, `docker-compose.staging-local.yml` | stack built from scratch and each service's role observed: C1, C4, C5, plus C17 for image contents and compiled-module import | yes - C17's import assertion (`scripts/staging-smoke.mjs:548-550`) is killed when the prune drops `@react-pdf/renderer` (R3-2) |
| provisioning script | `docker/postgres/init/01-app-role.sh` | each branch against a throwaway Postgres: create, empty password, password change, URL vs initdb | yes - the URL branch is now discriminated by the CREATE grant on `provision_target` (`scripts/staging-smoke.mjs:362-364,:381`); disabling it kills `provision` (R3-1) |

## Faults injected

Injected in `git worktree add /tmp/staging-verify-r3 f34e69a`. Real-tree porcelain stayed empty. Cap 5; one fault per distinct assertion surface the fix added. Caddy / cookie / header surfaces were killed in round 1 and the fix does not touch them. After the faults the scratch was discarded (`git worktree remove --force`); real-tree porcelain still empty; the stack was rebuilt from the real tree and `image` passes.

| Mutation | Location | Killed |
| --- | --- | --- |
| `if [ -n "${PROVISION_DATABASE_URL:-}" ]` -> `if false` (URL ignored; fallback is `--username postgres --dbname postgres`) | `docker/postgres/init/01-app-role.sh:16` | yes - `provision` exit 1 on `the grants landed on the database of the URL` (`scripts/staging-smoke.mjs:381`). The before-grant, `byUrl.status === 0` and `login('senha-z')` lines still printed — those alone would not have killed R2-1 |
| root `dependencies` filtered to exclude `@react-pdf/renderer` | `apps/server/scripts/prune-runtime.mjs:33` | yes - `image` exit 1 on `every compiled module imports in the image (Cannot find package '@react-pdf/renderer' imported from /repo/apps/server/dist/infrastructure/pdf.js)` (`scripts/staging-smoke.mjs:548-550`). Forbidden-package, size (223 MB) and `/api/health` still passed — those alone would not have killed R2-4 |

## Gate

`./node_modules/.bin/biome check . && pnpm typecheck && pnpm test && pnpm build` - exit 0: biome 110 files; typecheck ok; 22 test files, 130 passed, 0 failed; web and server build ok.

Repo gate is not a check. Recorded at `f34e69a` as required by the brief.

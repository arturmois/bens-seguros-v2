# Staging verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 7a7da47..b04cbff (fix range 7629514..b04cbff)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 1 (at `7629514`) was FAIL: Landing door 1 unproven and contradicted (the runtime image
carried the Prisma CLI, `next`, `playwright-core`, native `typescript`, 866 MB), the provisioning
script's `PROVISION_DATABASE_URL` branch unproven, one `Test policy` row unmet, and two precision
gaps (C13's proof named a file that did not exist, C15's runbook claimed a Caddy healthcheck).

The fix commit `b04cbff` adds `apps/server/scripts/prune-runtime.mjs` (run in the `prod-deps`
stage), the smoke steps `image` (C17) and the `PROVISION_DATABASE_URL` assertions inside
`provision` (C16), plan Landing 1b, and the wording fixes in `checks.md`, `plan.md` and the
runbook. The image is now 260 MB.

Round 2 verdict is FAIL on two grounded findings, both about the new proofs rather than the new
code: C16's assertions pass with the `PROVISION_DATABASE_URL` branch disabled (surviving mutant),
and C17's "the pruned server answers `/api/health`" does not reach the modules the server loads
off the boot path - a prune that deletes `@react-pdf/renderer` passes `image`, `health` and
`cookie`. `image` is also absent from the `all` list, so the run the runbook and the Handoff call
the local validation never executes C17.

All proofs re-ran in full at `b04cbff`. Real-tree baseline `git status --porcelain` was empty
before the run, and empty again after the faults, the worktree removal and the gate. The stack was
restored from the real tree: `health` and `image` pass and the runtime probe below is green again.
Nothing was pushed or deployed; the `opasuite` container was not touched.

## Binding sources

Carried from `7629514` (the fix touched no binding source; the Dockerfile change stays inside
architecture §10's "multi-stage, runtime não-root"). Re-checked the two rows the fix could move.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/architecture.md` §10 deploy | yes - verified at `b04cbff`: `apps/server/Dockerfile:5,11-18,26-34,35-45` still multi-stage on `node:24.21.0-slim` with `USER node` | none | - |
| `docs/decisions/ADR-004-tenant-isolation.md` | yes - verified at `b04cbff`: `docker-compose.prod.yml:34,54`; the pruned image keeps `@prisma/client` + `@prisma/adapter-pg` and drops only the CLI | none | - |
| `docs/decisions/ADR-008-deployment.md`, `docs/architecture.md` §7, `prompts/prompt-03.md`, `CLAUDE.md` | carried from `7629514` - opened there, no contradiction, nothing uncovered | none | - |

## Checks

`node scripts/staging-smoke.mjs all` at `b04cbff`, exit 0: 50 `ok -` lines, `pnpm e2e` 29 passed
against `https://localhost:8443`. `all` does not include `image`, so C17 ran separately:
`node scripts/staging-smoke.mjs image`, exit 0, 10 `ok -` lines.

C1-C15 are carried from `7629514` for their claim and re-run at `b04cbff`; citations refreshed
because the new steps moved line numbers.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | migrate exits 0 before the server starts; health 200 `{"status":"ok"}`; 502 with the server down | `all` (step `health`) | `scripts/staging-smoke.mjs:187` - `migrateExit === '0'`; `:188-191` - `containerTime('migrate','FinishedAt') < containerTime('server','StartedAt')`; `:193-194` - `health.status === 200`, `JSON.stringify(await health.json()) === '{"status":"ok"}'`; `:199` - `down.status === 502` | PASS |
| C2 | `/login` 200 SPA; hashed asset immutable; missing asset 404 | step `spa` | `:210-211` - `login.status === 200`, `html.includes('<div id="root">')`; `:216-217` - `found.headers.get('cache-control') === 'public, max-age=31536000, immutable'`; `:221` - `missing.status === 404` | PASS |
| C3 | `http://` -> 308 `Location: https://localhost/` | step `redirect` | `:227` - `response.status === 308`; `:230-231` - `response.headers.get('location') === 'https://localhost/'` | PASS |
| C4 | the prod file alone publishes no server/postgres port | step `ports` | `:239-248` - `docker compose -f docker-compose.prod.yml … config` (prod file alone); `:250-251` - `config.services.server.ports === undefined`; `:254-255` - `config.services.postgres.ports === undefined` | PASS |
| C5 | server uid != 0 | step `non-root` | `:268` - `assert(uid !== '0', …)`, observed uid 1000 | PASS |
| C6 | fresh DB: creates `bens_app` NOSUPERUSER NOBYPASSRLS, logs in; empty password exits != 0 and creates nothing | step `provision` | `:338-339` - `empty.status !== 0`, `roles() === ''`; `:341-343` - `run('senha-x').status === 0`, `roles() === 'false\|false'`, `login('senha-x')`; login goes over the container IP (`:321-335`), so the image's `trust` on 127.0.0.1 does not apply | PASS |
| C7 | re-run with `y` exits 0; `y` logs in, `x` refused | step `provision` | `:345-347` - `run('senha-y').status === 0`, `login('senha-y')`, `!login('senha-x')` | PASS |
| C8 | `__Secure-` cookie with Secure, HttpOnly, SameSite=Lax, Path=/, no Domain | step `cookie` | `:373` - `item.startsWith('__Secure-better-auth.session_token=')`; `:378-384` - one regex per attribute; `:386` - `!/;\s*Domain=/i.test(cookie)` | PASS |
| C9 | `Origin: https://evil.example` -> 403 | step `origin` | `:396` - `response.status === 403`; the same request with the real origin returns 401 in `forwarded-for` | PASS |
| C10 | 11 sign-ins with a different XFF each: first 10 not 429, 11th 429 | step `forwarded-for` | `:407` - `'x-forwarded-for': 203.0.113.${i + 1}`; `:411-412` - `!statuses.slice(0, 10).includes(429)`; `:415` - `statuses[10] === 429` | PASS |
| C11 | `/api/docs` 404 | step `docs` | `:422` - `response.status === 404`; the route exists only when `NODE_ENV !== 'production'` (`apps/server/src/app.ts:62-64`) | PASS |
| C12 | door 5 headers, literal values | step `headers` | `:428-437` - `response.headers.get(name) === value` over the 5 header literals | PASS |
| C13 | `pnpm e2e` over HTTPS exits 0 | step `e2e` (proof line now reads `node scripts/staging-smoke.mjs e2e`, `checks.md:66`) | `:451` - `result.status === 0`; `apps/web/playwright.config.ts:14` - `baseURL: process.env.E2E_BASE_URL`; 29 passed (login 12, reset 4, register 6, 2FA 7) | PASS |
| C14 | Socket.IO over `wss://` with the session cookie connects | step `socket` | `:463` - `transports: ['websocket']`; `:474-475` - `outcome === 'connected'` | PASS |
| C15 | runbook sections in order; cited files exist | step `runbook` | `:513-521` - sections found and increasing; `:527` - `text.includes(file) && existsSync(file)`. The round-1 inaccuracy is fixed: `docs/runbooks/staging.md:46-47` now says `caddy` `running` "(sem healthcheck)" | PASS |
| C16 | the `PROVISION_DATABASE_URL` run exits 0 and `bens_app` logs in with that password | step `provision` | `:363` - `byUrl.status === 0`; `:364` - `login('senha-z')`. **Non-discriminating**: the assertions also pass when the branch is removed (fault R2-1), because the throwaway container falls back to the local socket as `postgres` | PASS (assertion passes, but it does not settle the claim - see Faults and gaps) |
| C17 | no prisma CLI / next / @next swc / playwright(-core) / typescript / @prisma studio-core / vitest; < 400 MB; the pruned server answers `/api/health` | `node scripts/staging-smoke.mjs image` exit 0 (not part of `all`) | `:490-499` - `present.length === 0` for each of the 8 names; `:502` - `Number(size) < 400` (observed 260); `:504` - `health.status === 200` | PASS for the "absent" half; the "the pruned server still works" half is settled only for the boot path (see gaps) |

## Coverage

Recomputed at `b04cbff` for the rows the fix touched (provisioning, Landing doors, startup
config, and the new "runtime modules" row). The other rows - compose services, Caddy routes,
Surface statuses, door 5 headers, cookie attributes, unpublished ports - are carried from
`7629514`, where they were recomputed with no unproven member; the fix touches none of them.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| provisioning script branches (4) | `docker/postgres/init/01-app-role.sh:11-14,16-20,25-27` | empty password C6 · create C6 · alter C7 · `PROVISION_DATABASE_URL` C16 - present but non-discriminating (fault R2-1 survived) | the URL branch is named by a proof that passes without it |
| server startup assemblies (2) | `docker-compose.prod.yml:39-70`; `.github/workflows/ci.yml:57,131` | compose C1 · CI: the diff's only change to the CI assembly is the role provisioning, now named by C16. `checks.md:88` still maps this member to C13, which runs against the compose stack and never against the CI assembly | the row's own mapping (C13) does not reach the CI assembly; the substance is covered by C16 subject to the caveat above |
| Landing doors (6) | plan Landing | 1 C1, C5, C17 · 1b C17 · 2 C2 · 3 C6, C7, C16 · 4 C1, C4 · 5 C12. Door 1's round-1 gap is closed: `image` shows the CLI, `next`, `playwright-core`, `typescript`, `@prisma/studio-core` and `vitest` are gone and `node_modules` is 260 MB | - |
| runtime modules the server can load off the boot path (3) | `apps/server/src/dependencies.ts:5,29` (storage), `apps/server/src/infrastructure/pdf.ts:1-7` (`@react-pdf/renderer`), `apps/server/src/infrastructure/email.ts:23-24` (`react-email` render) | e-mail render: C13 (the e2e reads verification and reset e-mails out of Mailpit) · PDF: no proof · S3 storage: no proof. Fault R2-4 shows the consequence: with `@react-pdf/renderer` pruned away, `image`, `health` and `cookie` all pass | `renderPdf` (`@react-pdf/renderer`), `createStorage` (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) |

Probe, not a proof (verified at `b04cbff`, inside the running pruned container, `docker compose
exec -w /repo/apps/server server node --input-type=module`): `renderPdf` produced a 1526-byte
`%PDF-`, `render()` from `react-email` produced HTML with the accented text, and
`createStorage(...)` did `put` + presigned `GET` (200, same length) + `delete` against MinIO. So
the prune at `b04cbff` is correct today; nothing in the checks would notice if it stopped being.
A sweep of the pruned store for unresolved optional peers of kept packages found only deliberate
removals (`prisma`, `next`, `typescript`, `vitest`, drizzle/mongo/svelte/solid/vue adapters,
`pg-native`, `bufferutil`, `utf-8-validate`, cross-platform `@esbuild/*`), each loaded lazily or
not at all by this server.

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Caddyfile routing and headers | `Caddyfile` | one smoke step per route and header, through TLS: C1, C2, C3, C12, C14 | yes - carried from `7629514`, proofs re-run at `b04cbff` |
| Dockerfiles, compose | `apps/server/Dockerfile`, `apps/server/scripts/prune-runtime.mjs`, `apps/web/Dockerfile`, `docker-compose.prod.yml`, `docker-compose.staging-local.yml` | stack built from scratch and each service's role observed: C1, C4, C5, plus C17 for the image's contents | partial - the contents half is met (C17); the "the pruned image still holds everything the server loads" half is proven only for the boot path and the e2e's e-mail path (faults R2-3 and R2-4 survived) |
| provisioning script | `docker/postgres/init/01-app-role.sh` | each branch against a throwaway Postgres | no - the URL branch now has a proof (C16) but the proof passes with the branch disabled; `checks.md:103` counts 3 branches, which is right |

## Faults injected

Injected in a git worktree at `b04cbff` under the scratchpad, the stack rebuilt from that worktree
under the same project name, then the narrowest step run from there. The stack was restored from
the real tree afterwards. R2-1 and R2-5 were not run, in order to keep to the cap: the caddy,
cookie and header surfaces were made to fail in round 1 and the fix does not touch them.

| Mutation | Location | Killed |
| --- | --- | --- |
| `if [ -n "${PROVISION_DATABASE_URL:-}" ]` -> `if false` (the URL is ignored; the script falls back to the local socket) | `docker/postgres/init/01-app-role.sh:16` | **no** - `provision` still printed `ok - PROVISION_DATABASE_URL run exits 0` and `ok - bens_app logs in with senha-z`, exit 0 |
| the prune follows optional peers too (`!optionalPeers[name]?.optional` -> `name !== undefined`) | `apps/server/scripts/prune-runtime.mjs:29-31` | yes - `image`: `not ok - the runtime image has no prisma (prisma@7.10.0…)` |
| the prune stops following `optionalDependencies` | `apps/server/scripts/prune-runtime.mjs:34` | **no** - `image` (249 MB) and `health` both exit 0. It deletes `@esbuild/linux-x64`, esbuild's platform binary; the probe still passed, so the mutant is latent rather than harmless, and no assertion can tell |
| the prune drops a real runtime dependency off the boot path (root `dependencies` filtered to exclude `@react-pdf/*`) | `apps/server/scripts/prune-runtime.mjs:33` | **no** - `image` exit 0 (223 MB, `/api/health` 200), `health` exit 0, `cookie` 6/6 ok; only the probe failed: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@react-pdf/renderer'` |

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` - exit 0: biome 110 files; 22 test files, 130 passed, 0 failed; web build ok.

## Ranked gaps

1. **C16 does not discriminate (surviving mutant R2-1).** In the throwaway container the script
   falls back to `--username postgres --dbname postgres` over the local socket, which succeeds, so
   disabling the `PROVISION_DATABASE_URL` branch still prints both `ok` lines. The branch needs a
   proof that can only pass through the URL - for example a connection URL whose user is not the
   container's default, or one the local fallback cannot reach. `scripts/staging-smoke.mjs:348-364`,
   `docker/postgres/init/01-app-role.sh:16-20`.
2. **C17's "the pruned server works" half reaches only the boot path (surviving mutants R2-4 and
   R2-3).** Deleting `@react-pdf/renderer` from the image passes `image`, `health` and `cookie`;
   `renderPdf` and `createStorage` have no check at all. The `image` step should load the modules
   the server can load - the PDF render and a storage round trip are both runnable in the
   container, as the probe shows. `scripts/staging-smoke.mjs:481-505`,
   `apps/server/src/infrastructure/pdf.ts:1-7`, `apps/server/src/infrastructure/storage.ts:19-46`.
3. **`image` is missing from `ORDER`**, so `node scripts/staging-smoke.mjs all` - the command the
   runbook calls the local validation and the Handoff cites as the round-2 boundary - never runs
   C17. `scripts/staging-smoke.mjs:532-547`, `docs/runbooks/staging.md:5`,
   `.specs/features/staging/checks.md:128`.
4. **Stale mapping (precision).** The startup-config Coverage row still sends the CI assembly to
   C13, which never runs it; after this fix the member belongs to C16.
   `.specs/features/staging/checks.md:88`.
5. Closed since round 1, re-judged at `b04cbff`: Landing door 1 (C17, 260 MB, no CLI), C13's proof
   command (`checks.md:66`), C15's runbook claim (`docs/runbooks/staging.md:46-47`), and the
   `Test policy` branch count (`checks.md:103`).
6. Observations carried from `7629514`, none failing: the `caddy` and `migrate` containers run as
   root; door 4's literal says `env_file` while the compose interpolates per service;
   `APP_DB_PASSWORD` stays in the long-running postgres container's environment
   (`docker-compose.prod.yml:16`); locally C3's `https://localhost/` points at port 443, which is
   another container on this machine, and is correct on the VPS.

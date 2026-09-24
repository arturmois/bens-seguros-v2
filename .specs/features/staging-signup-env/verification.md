# Staging signup env verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 452294b..cdb059c
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

All 9 checks are proven at `cdb059c`. The whole smoke, `up && all`, exits 0 (16 steps, 84 e2e
passed). The CSP expectation matches the `Caddyfile` byte for byte. The Turnstile strings match
Cloudflare's testing page. 5 faults were injected on 5 different assertion surfaces, and all 5 were
killed. The Intent paragraph serves as the plan here, because there is no `plan.md`.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| Cloudflare Turnstile testing docs (https://developers.cloudflare.com/turnstile/troubleshooting/testing/) | yes - fetched during this verification | none. The page lists sitekey `1x00000000000000000000AA` as "Always passes" (visible) and secret `1x0000000000000000000000000000000AA` as "Always passes validation". It says the test sitekeys produce `XXXX.DUMMY.TOKEN.XXXX` and that the test secrets "only accept the dummy token". These are the exact strings in `scripts/staging-smoke.mjs:36-37,163`, `apps/web/e2e/support.ts:84` and `.github/workflows/ci.yml:110-111` | - |
| signup-gates `plan.md` Impact row (line 38): the Caddyfile CSP allows `https://challenges.cloudflare.com` in `script-src` and `frame-src` | yes - read at HEAD | none | - |
| signup-gates `checks.md` C15 (line 59) and its test `apps/server/src/modules/auth/signup-gates.spec.ts:403-407` | yes - read at HEAD | none. `Caddyfile:37` carries both sources. A Python extraction of the CSP from `Caddyfile:37` and from `scripts/staging-smoke.mjs:463` printed `True` for string equality | - |

## Checks

Every proof ran at HEAD `cdb059c`. The `rg` proofs ran as `ARGV0=rg /home/artur/.local/bin/claude <args>`
through a shell function, so zsh does not word-split the command. Sanity checks came first: a
known-positive search (`loadConfig` in `config.ts`) returned line 61, and a known-negative search
exited 1. The smoke ran in a clean HEAD worktree (`/tmp/claude-1000/verify-sse`). Its
`.env.staging-local` was the real tree's file with the `SIGNUP_MODE`/`TURNSTILE_*` lines removed (13
lines, 0 of the 3 keys). The command was `node scripts/staging-smoke.mjs up && node scripts/staging-smoke.mjs all`,
and it exited 0. The log shows every step from `health` through `e2e` as `ok`, with `84 passed (3.9m)`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | prod `server` gets `SIGNUP_MODE` (default `self_serve`) and both `TURNSTILE_*` as required | 3 × `rg -n --fixed-strings ... docker-compose.prod.yml`, each exit 0 | `docker-compose.prod.yml:58` - `SIGNUP_MODE: ${SIGNUP_MODE:-self_serve}`; `:59` - `TURNSTILE_SECRET_KEY: ${TURNSTILE_SECRET_KEY:?}`; `:60` - `TURNSTILE_SITE_KEY: ${TURNSTILE_SITE_KEY:?}`. Extra run: dropping only `TURNSTILE_SITE_KEY` makes `compose config` exit 1 with `required variable TURNSTILE_SITE_KEY is missing a value`, and dropping `SIGNUP_MODE` renders `SIGNUP_MODE: self_serve` | PASS |
| C2 | without `TURNSTILE_SECRET_KEY`, `compose config` exits non-zero and names it | the checks.md proof verbatim, exit 0. Raw run: `compose config` exit 1, stderr `error while interpolating services.server.environment.TURNSTILE_SECRET_KEY: required variable TURNSTILE_SECRET_KEY is missing a value`. Positive control with the full env: exit 0 | `docker-compose.prod.yml:59` - `${TURNSTILE_SECRET_KEY:?}` (the `:?` produces the error) | PASS |
| C3 | a generated env has the 3 keys, and an existing env without them gains them with no lines lost | `rg -n --fixed-strings "TURNSTILE_SECRET_KEY=1x...AA" scripts/staging-smoke.mjs` exit 0 (line 37). After `up && all` on the 13-line file, `grep -c` of the 3 exact lines printed `3`, and `diff` against the pre-run copy showed `+3 added, -0 removed`. Absent case: with no file, `node scripts/staging-smoke.mjs nosuch` generated it, the count was `3`, and a second run left it at 16 lines (idempotent) | `scripts/staging-smoke.mjs:61` - `...TURNSTILE_TEST_ENV,` in the generated file; `:68-73` - `missing = TURNSTILE_TEST_ENV.filter((line) => !new RegExp(...).test(current))`, then `writeFileSync(ENV_FILE, \`${current.replace(/\n?$/, '\n')}${missing.join('\n')}\n\`)` | PASS |
| C4 | the smoke's sign-up sends `x-captcha-response: XXXX.DUMMY.TOKEN.XXXX` | `rg -n --fixed-strings "'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX'" scripts/staging-smoke.mjs` exit 0 | `scripts/staging-smoke.mjs:163` - `{ 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' },` passed as `post()`'s `headers` (`:112-116`, spread into the request); `:165` - `if (signUp.status !== 200) throw new Error(...)` | PASS |
| C5 | the local smoke exits 0 | `node scripts/staging-smoke.mjs up && node scripts/staging-smoke.mjs all` exit 0 (clean HEAD worktree), followed by `down` exit 0 | `scripts/staging-smoke.mjs:480` - `assert(result.status === 0, \`pnpm e2e against ${BASE} exits ${result.status}\`)` printed `ok`; every assertion of the 15 `ORDER` steps (`:589-605`) printed `ok` | PASS |
| C6 | the staging runbook tells the operator to fill both Turnstile keys | `rg -n "TURNSTILE_SECRET_KEY" docs/runbooks/staging.md` exit 0 | `docs/runbooks/staging.md:24` - "`TURNSTILE_SECRET_KEY` e `TURNSTILE_SITE_KEY` do site no Cloudflare Turnstile (o compose não sobe sem elas)" | PASS |
| C7 | the `headers` step compares the served CSP with the Caddyfile's by equality | `node scripts/staging-smoke.mjs headers` exit 0 with the stack up (it ran inside `all`); `rg -n --fixed-strings "script-src 'self' https://challenges.cloudflare.com" scripts/staging-smoke.mjs` exit 0 | `scripts/staging-smoke.mjs:466` - `assert(response.headers.get(name) === value, ...)` over `expected` (`:463`, identical to `Caddyfile:37`) | PASS |
| C8 | the e2e `signUp` helper sends the dummy token | `rg -n --fixed-strings ... apps/web/e2e/support.ts` exit 0; the `e2e` step exit 0 (84 passed, inside `all`) | `apps/web/e2e/support.ts:84` - `headers: { 'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX' },`; `:87` - `expect(response.status()).toBe(200)` | PASS |
| C9 | the CI e2e job runs the server with self-serve and the always-pass keys | the checks.md `rg` printed 3 lines (109, 110, 111) | `.github/workflows/ci.yml:109-111` - `SIGNUP_MODE: self_serve` / `TURNSTILE_SITE_KEY: 1x00000000000000000000AA` / `TURNSTILE_SECRET_KEY: 1x0000000000000000000000000000000AA`, in the same `env:` block as `NODE_ENV: production` (`:99`). Whether the CI job itself passes was not run here: it needs GitHub Actions. The same keys against the same production config are proven locally by C5/C8 | PASS |

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| sign-up settings the production config reads (3) | `apps/server/src/shared/config.ts:27-29,35-50`: `SIGNUP_MODE` and both `TURNSTILE_*` are read, and the `superRefine` requires the two keys in production + self-serve. `TURNSTILE_SITEVERIFY_URL` is test-only (`:30-31`). `MAX_ORGS_PER_USER` is an org limit with a default, not a sign-up gate (signup-gates plan line 36 names exactly these 3 keys) | `SIGNUP_MODE` C1 (and the extra `config` run) · `TURNSTILE_SECRET_KEY` C1, C2 · `TURNSTILE_SITE_KEY` C1 (and the extra `config` run) | - |
| places that assemble a production-mode env (4) | `rg "NODE_ENV.{0,4}production"`: `docker-compose.prod.yml:47`, `.github/workflows/ci.yml:99`, `apps/server/Dockerfile:36` (the image; its env comes from compose), plus specs only (`signup-gates.spec.ts:68`, `app.spec.ts:266`). `.env.prod.example:28-30` already carried the 3 keys at base | compose C1 · smoke env C3 · runbook `.env` C6 · CI e2e C9 | - |
| sign-up callers that predate `152bf11` (3) | `rg` for `sign-up/email` or `x-captcha-response` over `apps/web/e2e scripts .github`: direct API callers are `support.ts:81` and `staging-smoke.mjs:161`. Every other hit drives the UI (`/register`) or stubs the route with `page.route` | smoke C4 · e2e helper C8 · CI job C9 | - |
| stale smoke expectations (2) | the diff of `scripts/staging-smoke.mjs` plus the step list | Turnstile env C3/C4 · CSP C7 | - |
| smoke `.env.staging-local` states (2) | `localEnv()` branches (`staging-smoke.mjs:42` absent, `:66-73` present) | absent C3 (generated, count 3) · present without keys C3 (appended, count 3, 13 lines kept) | - |

Level: every claim sits at the layer it names. C2 is proven by a real `docker compose config`. C5, C7
and C8 are proven against the running production stack. C1, C6 and C9 are text claims with text proofs.

Swept rows that resolve to existing work were re-read against the code. Validation and failure modes
(C2): the `:?` interpolation is present at `docker-compose.prod.yml:59-60`, and it refused both keys
when they were absent. Idempotency (C3): a second invocation on a complete file wrote nothing (16
lines before and after).

Observations (not failing):
- `:?` makes compose require both keys even with `SIGNUP_MODE=closed`, although `config.ts` would
  accept their absence there. This matches the Intent ("refuses to start without the Turnstile
  keys"). An operator running closed must still set placeholder keys.
- C3's second proof says "after `all` ran". The append actually runs at module load on any
  invocation (`staging-smoke.mjs:85`), so any step triggers it. The claim still holds.

## Test policy rows

`checks.md` has no `## Test policy` section, so there is nothing to judge. Level follows the repo
convention (`CLAUDE.md` › Testes). This change touches no server code, so no unit or integration
test is owed. The proofs are the compose, smoke and e2e runs above.

## Faults injected

Every fault ran in the scratch worktree `/tmp/claude-1000/verify-sse` (`git worktree add --detach ... HEAD`,
`pnpm install --frozen-lockfile`). Each was run against the stack started from that worktree and
reverted with `git checkout` there. The real tree's baseline `git status --porcelain` was empty.
C1, C6 and C9 are text-only proofs, so a fault on their line is killed by the `rg` by construction.
The faults below target behaviour.

| Mutation | Location | Killed |
| --- | --- | --- |
| `${TURNSTILE_SECRET_KEY:?}` -> `${TURNSTILE_SECRET_KEY:-}` (compose accepts the missing secret) | `docker-compose.prod.yml:59` | yes - the C2 proof exited 1 (the unmutated control exited 0) |
| append guard `missing.length > 0` -> `> 3` (existing env never gains the keys) | `scripts/staging-smoke.mjs:71` | yes - C3's count printed `0` on the 13-line file (the unmutated control printed `3`) |
| sign-up `x-captcha-response` header removed from `signedIn()` | `scripts/staging-smoke.mjs:163` | yes - `node scripts/staging-smoke.mjs cookie` exited 1: `not ok - sign-up: 400` (C4/C5) |
| `https://challenges.cloudflare.com` removed from the expected `script-src` | `scripts/staging-smoke.mjs:463` | yes - `node scripts/staging-smoke.mjs headers` exited 1: `not ok - content-security-policy: ...` (C7/C5) |
| `x-captcha-response` header removed from the e2e `signUp` helper | `apps/web/e2e/support.ts:84` | yes - `node scripts/staging-smoke.mjs e2e` exited 1 (`Expected: 200`, `Received: 400`; only 20 passed) (C8/C5) |

## Gate

- `node scripts/staging-smoke.mjs up && node scripts/staging-smoke.mjs all`: exit 0 (16 steps, 84 e2e passed). The stack was torn down with `down` (exit 0).
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (clean HEAD worktree): exit 0. 29 test files and 272 tests passed, 0 failed.

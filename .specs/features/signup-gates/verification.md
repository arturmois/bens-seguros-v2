# Signup gates verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: fbffc8f..ddcf614
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Binding-source screen enumeration (step 1) is ui-only; skipped under profile `standard`. Fix `ddcf614` touched only the e2e mock/assertion order — interface not changed; step 1 not re-run.

Proofs re-run in full at `ddcf614`. Checks whose evidence sits in untouched files: `carried from 152bf11`. Citations for `apps/web/e2e/signup-gates.spec.ts` refreshed. C18 and the unmet test-policy row re-judged.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | closed signup `403` `SIGNUP_CLOSED`, no User, no verify-email job | `vitest … signup-gates.spec.ts` - `closed signup returns SIGNUP_CLOSED and creates nothing` exit 0 at ddcf614 | carried from 152bf11 — `apps/server/src/modules/auth/signup-gates.spec.ts:204` - `expect(response.statusCode).toBe(403)`; `:205-208` - `toMatchObject({ code: 'SIGNUP_CLOSED', message: '…' })`; `:209` - `user.count … toBe(0)`; `:210` - `emailJobsTo(…, 'verify-email')).toEqual([])` | PASS |
| C2 | closed mode still sign-in / verify / reset | `…` - `closed signup still signs in, verifies and resets` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:219` - `signIn.statusCode`).toBe(200); `:225` - `verify.statusCode`).toBe(302); `:231-232` - reset `200` and `reset-password` job length 1 | PASS |
| C3 | disposable domain `403` `EMAIL_DOMAIN_NOT_ALLOWED` (case-insensitive), no User | `…` - `rejects a disposable domain` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:113` - `toBe(403)`; `:114-117` - `code: 'EMAIL_DOMAIN_NOT_ALLOWED'` + message; `:118` - `user.count … toBe(0)` over `mailinator.com` / `MAILINATOR.COM` | PASS |
| C4 | regular domains `200` and User created | `…` - `accepts a regular domain` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:134` - `toBe(200)`; `:135` - `user.count … toBe(1)` for `gmail.com` / `corretora.com.br` | PASS |
| C5 | public signup-config `200` mirrors mode + site key / null | `…` - `returns the public signup config` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:141-142` - open `{ signupMode: 'self_serve', turnstileSiteKey: null }`; `:156-160` - closed + site key | PASS |
| C6 | response body must not contain `TURNSTILE_SECRET_KEY` value | same proof exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:161` - `expect(body).not.toContain(secret)` | PASS |
| C7 | default `self_serve`; production missing turnstile keys exit 1 | `…` - `defaults signup mode to self_serve` + `production self_serve without turnstile exits 1` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:393` - `SIGNUP_MODE`).toBe('self_serve'); `:398-399` / `:402-403` - `code`).toBe(1) and stderr contains each key | PASS |
| C8 | missing captcha → `400` `MISSING_RESPONSE`, no User, 0 siteverify calls | `…` - `missing captcha token` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:271-274` - status 400, code, user 0, `verify.calls.length`).toBe(before) | PASS |
| C9 | rejected captcha → `403` `VERIFICATION_FAILED`, no User | `…` - `rejected captcha` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:355-357` - 403, code, user 0 | PASS |
| C10 | accepted captcha → `200`, User, siteverify got secret+token | `…` - `accepted captcha` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:287-289` - 200, user 1, `toMatchObject({ secret, response: token })` | PASS |
| C11 | siteverify down → `500` `UNKNOWN_ERROR`, no User | `…` - `captcha service down` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:386-388` - 500, code, user 0 | PASS |
| C12 | no turnstile secret → signup without header `200` | `…` - `signup without turnstile secret` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:175-176` - 200 and user 1 | PASS |
| C13 | captcha not required on sign-in / reset; 0 siteverify | `…` - `captcha is not required on sign-in or reset` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:317-320` - sign-in 200, reset job, reset 200, calls unchanged | PASS |
| C14 | disposable still rejected after valid captcha | `…` - `disposable domain is rejected after a valid captcha` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:300-302` - 403, `EMAIL_DOMAIN_NOT_ALLOWED`, user 0 | PASS |
| C15 | Caddy CSP allows turnstile host in script-src and frame-src | `…` - `allows the turnstile host in the caddy csp` exit 0 at ddcf614 | carried from 152bf11 — `signup-gates.spec.ts:408-409` - `toContain` both directives | PASS |
| C16 | closed config → closed copy, no Senha field | `playwright … signup-gates.spec.ts` - `shows that signup is closed` exit 0 at ddcf614 | refreshed — `apps/web/e2e/signup-gates.spec.ts:13-15` - closed text `toBeVisible()`; `getByLabel('Senha')).toHaveCount(0)` | PASS |
| C17 | disposable error maps to pt-BR on form | `…` - `shows the disposable e-mail message` exit 0 at ddcf614 | refreshed — `e2e/signup-gates.spec.ts:36-39` - disposable message `toBeVisible()` | PASS |
| C18 | widget visible; Criar conta starts disabled; header `x-captcha-response` = token | `…` - `requires the turnstile token` exit 0 at ddcf614 | verified at ddcf614 — `e2e/signup-gates.spec.ts:70` - widget `toBeVisible()`; `:71` - `submit`).toBeDisabled() before token; `:72-76` - fire held mock callback; `:85` - header `toBe('token-e2e')` | PASS |
| C19 | captcha failure message + widget reset (button disabled again) | `…` - `shows the captcha failure and resets the widget` exit 0 at ddcf614 | refreshed — `e2e/signup-gates.spec.ts:131-134` - message visible; submit disabled; `[data-turnstile="reset"]` visible | PASS |
| C20 | loading / config error / retry shows form | `…` - `shows loading and error for signup config` exit 0 at ddcf614 | refreshed — `e2e/signup-gates.spec.ts:150-157` - loading text; error text; after retry Senha visible | PASS |

## Coverage

Rows whose authority the fix did not touch: carried from 152bf11. Web `/register` states recomputed at ddcf614 (C18 now proven).

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| sign-up outcomes (6) | carried from 152bf11 | 200 C4 · SIGNUP_CLOSED C1 · EMAIL_DOMAIN_NOT_ALLOWED C3 · MISSING_RESPONSE C8 · VERIFICATION_FAILED C9 · UNKNOWN_ERROR C11 | - |
| `GET /api/public/signup-config` statuses (1) | carried from 152bf11 | 200 C5 | - |
| `SIGNUP_MODE` (2) | carried from 152bf11 | closed C1 · self_serve C4 | - |
| disposable case (2) | carried from 152bf11 | mailinator.com C3 · MAILINATOR.COM C3 | - |
| allowed domains (2) | carried from 152bf11 | gmail.com C4 · corretora.com.br C4 | - |
| siteverify results (3) | carried from 152bf11 | missing C8 · false C9 · true C10 | - |
| captcha on endpoints (3) | carried from 152bf11 | sign-up C8 · sign-in C13 · request-password-reset C13 | - |
| production turnstile keys (2) | carried from 152bf11 | missing secret C7 · missing site key C7 | - |
| closed mode still-open flows (3) | carried from 152bf11 | sign-in C2 · verify-email C2 · request-password-reset C2 | - |
| web `/register` states (5) | recomputed at ddcf614 — register.tsx branches + Observable | closed C16 · disposable C17 · widget / starts-disabled / captcha header C18 · captcha error C19 · config error C20 | - |
| Landing doors (4) | carried from 152bf11 | hook C1 · captcha plugin C10 · public config C5 · packages C3 | - |
| startup config assemblies (2) | carried from 152bf11 | `loadConfig` C7 · test harness C12 | - |

Swept existing: carried from 152bf11 — disposable + domain validation in `auth.ts:112-118`; Caddy CSP host (`Caddyfile:37`); signup-config schema `.strict()` at `signup.schema.ts:8`.

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary | `auth.ts` signup hook (`SIGNUP_MODE`, disposable) | boundary C1/C3 via `app.inject` / TestClient | yes — carried from 152bf11 |
| Decides, reached across a boundary | captcha plugin outcomes at `/sign-up/email` | boundary C8/C9/C10/C11 | yes — carried from 152bf11 |
| Entry point that decides nothing | `auth.routes.ts` `GET /api/public/signup-config` | boundary C5/C6 | yes — carried from 152bf11 |
| Decides, reached across a boundary | `register.tsx` (mode, siteKey, error codes) | browser C16–C20 | yes — re-judged at ddcf614; C18 proof green (widget, starts disabled, captcha header) |
| Instrumentation, pass-throughs | auth error message map in `auth-client.ts` | covered by consumer C17/C19 | yes — carried from 152bf11 |

## Faults injected

Baseline real-tree porcelain before worktree: `?? .specs/features/signup-gates/verification.md`, `?? prompts/prompt-04.md`. Scratch: `git worktree add /tmp/signup-gates-verify-r2 HEAD`. Mutated product served from scratch Vite on `:3010` (`E2E_BASE_URL`); real tree never mutated; porcelain matched baseline after remove.

Round 1 server faults (5) carried from 152bf11 — all killed.

| Mutation | Location | Killed |
| --- | --- | --- |
| `waitingForToken` always `false` (submit never waits for captcha) | scratch `register.tsx` `waitingForToken` | yes — C18 `expect(submit).toBeDisabled()` failed (enabled) |

## Gate

`pnpm --filter @bens/server exec vitest run src/modules/auth/signup-gates.spec.ts --reporter=verbose` — 15 passed, 0 failed (at ddcf614)

`PLAYWRIGHT_BROWSERS_PATH=… pnpm --filter @bens/web exec playwright test e2e/signup-gates.spec.ts --reporter=list` — 5 passed, 0 failed (at ddcf614)

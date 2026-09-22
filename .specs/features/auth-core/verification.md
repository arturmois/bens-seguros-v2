# Auth core verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: dde6e63..ce8e7d5
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

All 42 named proofs exist, ran individually and passed at `ce8e7d5` (one vitest invocation, 12
files, `42 passed | 23 skipped`); C41 passed; the full gate is green. The verdict is FAIL because
of: a concrete counterexample to C32 (a percent-encoded `/api` path skips the Origin check and
runs the handler); 2 of 5 mutants surviving; two `Test policy` rows not met; and
Better Auth values the plan fixes (password 8-128, reset token 1 h, rate-limit windows) that no
proof observes.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-003-authentication.md` | yes - full file | none - 3 d / 12 h (`auth.ts:65-66`), no `cookieCache`, host-only Lax httpOnly cookie (`sign-in.spec.ts:40-43`), socket on the same cookie (`realtime.ts:33-42`) | - |
| `docs/decisions/ADR-004-tenant-isolation.md` | yes - full file | none - identity tables carry no `organizationId` (`schema.spec.ts:285`); Better Auth runs on `deps.db` (`dependencies.ts:31`, `auth.ts:31`) | door 9 `withoutTenant` claims "every tenant-scoped table fails inside it" (plan Landing 9); no test opens a tenant table inside `withoutTenant` |
| `docs/roadmap.md` Fase 3 | yes - section | none for this feature (the roadmap's "preHandler que monta o `RequestContext`" is superseded by AD-001 on purpose) | - |
| `prompts/prompt-03.md` | yes - full file | none | - |
| `.specs/STATE.md` AD-001 | yes | none - `request-context.ts:4-16`, `session-context.ts:42` | - |
| `.specs/STATE.md` AD-002 | yes | none - `app.ts:40`, `auth.routes.ts:22` | - |
| `.specs/STATE.md` AD-003 | yes | AD-003 says the template key belongs to `src/emails/templates.ts`, but no such file exists. The union and dispatch live in `src/emails/send-email.tsx:14-36`. The substance holds (key, Zod props, subject and element built in the worker), so either the decision text or the file is stale | - |
| `.specs/STATE.md` AD-004 | yes | none in the decision; the implementation breaks it: see C32 | percent-encoded `/api` paths (see Coverage) |
| `.specs/STATE.md` AD-005 | yes | n/a - terms / Phase 4 | - |
| `CLAUDE.md` rules | yes | none found - `getMe` has `operationId`, Zod output; `requirePermission` deferred to Phase 4 by plan Out of scope | - |

## Checks

Proof run for C1-C40: `pnpm --filter @bens/server exec vitest run --reporter=verbose <12 files> -t "<42 names>"`, exit 0, each name printed individually as `✓`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | sign-up: unverified user, no session cookie, `verify-email` job for the address | batch, exit 0 | `src/modules/auth/sign-up.spec.ts:38` - `expect(sessionCookieOf(...)).toBeUndefined()`; `:40` - `expect(user.emailVerified).toBe(false)`; `:43` - `expect(jobs.map((job) => job.template)).toEqual(['verify-email'])` | PASS (AC 1 password range 8-128 has no check; see Coverage) |
| C2 | duplicate e-mail answers like a new one, still 1 `User` | batch, exit 0 | `sign-up.spec.ts:60` - `expect(second.statusCode).toBe(first.statusCode)`; `:61` - keys equal; `:62` - `expect(await deps.db.user.count({ where: { email } })).toBe(1)` | PASS |
| C3 | unverified sign-in -> 403, no cookie | batch, exit 0 | `sign-in.spec.ts:25` - `expect(response.statusCode).toBe(403)`; `:26` - no session cookie | PASS |
| C4 | verify link -> `emailVerified`, cookie, `/me` 200 | batch, exit 0 | `sign-up.spec.ts:71` - `toBe(302)`; `:72` cookie defined; `:73` - `emailVerified).toBe(true)`; `:75` - `me.statusCode).toBe(200)` | PASS |
| C5 | 200 + cookie HttpOnly, Lax, Path=/, no Domain | batch, exit 0 | `sign-in.spec.ts:37` - `toBe(200)`; `:40-43` - `toMatch(/;\s*HttpOnly/i)`, `/;\s*SameSite=Lax/i`, `/;\s*Path=\/(;\|$)/i`, `not.toMatch(/;\s*Domain=/i)` | PASS |
| C6 | https -> `Secure` + `__Secure-`; http -> neither | batch, exit 0 | `sign-in.spec.ts:113` - `toMatch(/^__Secure-better-auth\.session_token=/)`; `:114` - `toMatch(/;\s*Secure/i)`. The http half is asserted in C5's test instead: `:39` `toMatch(/^better-auth\.session_token=/)`, `:44` `not.toMatch(/;\s*Secure/i)` | PASS |
| C7 | wrong password -> 401, no cookie | batch, exit 0 | `sign-in.spec.ts:55` - `toBe(401)`; `:56` no cookie | PASS |
| C8 | sign-out deletes `Session`; same cookie -> 401 | batch, exit 0 | `sign-in.spec.ts:86` - `session.count(...)).toBe(0)`; `:88` - `me.statusCode).toBe(401)` | PASS |
| C9 | reset request -> 200 + `reset-password` job | batch, exit 0 | `password-reset.spec.ts:50` - `toBe(200)`; `:52` - `expect(jobs).toHaveLength(1)` (filtered by `'reset-password'`) | PASS |
| C10 | unknown e-mail -> same 200 body, no job | batch, exit 0 | `password-reset.spec.ts:64` - `expect(unknown.json()).toEqual(known.json())`; `:65` - `emailJobsTo(deps, unknownEmail)).toEqual([])` | PASS |
| C11 | reset changes password, revokes all sessions | batch, exit 0 | `password-reset.spec.ts:79` - `session.count(...)).toBe(0)`; `:80` old cookie 401; `:81` old password 401; `:82` new password 200 | PASS |
| C12 | used token -> 400; expired (>1 h) -> 400; old password kept | batch, exit 0 | `password-reset.spec.ts:99` - `reused.statusCode).toBe(400)`; `:116` - `late.statusCode).toBe(400)`. The "expired" token is made by setting `expiresAt` to now - 1 s (`:107`), so the 1 h bound is never observed. Mutant F4 (1 h -> 24 h) survived | PARTIAL |
| C13 | `/me` 200 with exactly the 7 fields | batch, exit 0 | `me.spec.ts:46-54` - `expect(response.json()).toEqual({ id: userId, ..., activeOrganizationId: null })` | PASS |
| C14 | 4 invalid-session reasons -> 401 UNAUTHENTICATED body | batch, exit 0 | `me.spec.ts:83` - `toBe(401)`; `:84` - `expect(response.json()).toEqual(unauthenticated)` over `noCookie, unknownToken, expired, deleted` (`:77-82`) | PASS |
| C15 | `expiresAt` = login + 3 d; refresh after 12 h, not before | batch, exit 0 | `me.spec.ts:93` - `Math.abs(... - (signedInAt + 3 * DAY))).toBeLessThan(60_000)`; `:102-104` - `expiresAt).toEqual(recentExpiry)` at 11 h; `:117` - refreshed ≈ `usedAt + 3 * DAY` at 13 h | PASS |
| C16 | effective super-admin in `/me` and `request.user` | batch, exit 0 | `me.spec.ts:135` - `expect(me.json().isSuperAdmin, label).toBe(expected)`; `:136` - `expect(user.json(), label).toMatchObject({ userId, isSuperAdmin: expected })` over 3 cases `:121-125` | PASS |
| C17 | client `isSuperAdmin` / `activeOrganizationId` not written | batch, exit 0 | `me.spec.ts:155` - `created.isSuperAdmin).toBe(false)`; `:167` - update-user `isSuperAdmin` 400; `:169` still false; `:172` - `sessions[0]?.activeOrganizationId).toBeNull()` | PASS |
| C18 | enable -> totpURI issuer + backup codes; enabled only after verify | batch, exit 0 | `two-factor.spec.ts:48` - `searchParams.get('issuer')).toBe('Bens Seguros')`; `:49` backup codes > 0; `:50` `toBe(false)`; `:57` `toBe(true)` | PASS |
| C19 | 2FA sign-in -> `twoFactorRedirect`, no new session | batch, exit 0 | `two-factor.spec.ts:70` - `toMatchObject({ twoFactorRedirect: true })`; `:72` - session count unchanged | PASS |
| C20 | right TOTP -> cookie + `/me` 200; wrong -> 401 no session | batch, exit 0 | `two-factor.spec.ts:85` - `rejected.statusCode).toBe(401)`; `:87` count unchanged; `:94` cookie defined; `:96` `/me` 200 | PASS |
| C21 | disable -> flag false, plain sign-in issues session | batch, exit 0 | `two-factor.spec.ts:106` - `toBe(false)`; `:112` - `not.toHaveProperty('twoFactorRedirect')`; `:113` cookie defined | PASS |
| C22 | stored secret differs from the URI secret | batch, exit 0 | `two-factor.spec.ts:122` - `expect(stored.secret).not.toBe(secret)`; `:123` - `not.toContain(secret)` | PASS |
| C23 | 10 sign-ins pass, 11th 429 | batch, exit 0 | `rate-limit.spec.ts:32` - `result.slice(0, 10)).not.toContain(429)`; `:33` - `expect(result[10]).toBe(429)` (burst only; the 15 min window is not observed) | PASS |
| C24 | counter survives app + deps restart | batch, exit 0 | `rate-limit.spec.ts:50` - `expect(row.count).toBe(10)` (DB row); `:60` - `after.statusCode).toBe(429)` | PASS |
| C25 | client XFF ignored without trusted proxy | batch, exit 0 | `rate-limit.spec.ts:72-73` - first 10 not 429, `result[10]).toBe(429)` with 11 random XFF | PASS |
| C26 | trusted proxy buckets by client IP | batch, exit 0 | `rate-limit.spec.ts:93` - `b.statusCode).not.toBe(429)`; `:94` - `aAgain.statusCode).toBe(429)` | PASS |
| C27 | per-path limits 5 / 3 / 3 / 10 | batch, exit 0 | `rate-limit.spec.ts:114` - `result.slice(0, limit), path).not.toContain(429)`; `:115` - `expect(result[limit], path).toBe(429)` over 4 cases `:99-108` | PASS |
| C28 | worker `verify-email` -> Mailpit, subject, url in HTML+text | batch, exit 0 | `send-email.spec.tsx:46` - `Subject).toBe('Confirme seu e-mail')`; `:49-50` url in HTML and Text. The proof calls `sendEmail(deps.mailer, …)` (`:43`), not the worker registered on the queue | PARTIAL |
| C29 | worker `reset-password` -> subject + url | batch, exit 0 | `send-email.spec.tsx:60` - `Subject).toBe('Redefina sua senha')`; `:62-63`. Handler-level only (`:57`). Mutant F5 (worker forces `verify-email`) survived: no test sends a reset e-mail through the queue | PARTIAL |
| C30 | invalid template / props -> handler throws, nothing sent | batch, exit 0 | `send-email.spec.tsx:76` and `:83` - `.rejects.toThrow()`; `:85-86` - `inbox(...)).toEqual([])` | PASS |
| C31 | queue `retryLimit` 3 + backoff; failing handler retried | batch, exit 0 | `send-email.spec.tsx:101` - `expect(queue).toEqual({ retry_limit: 3, retry_backoff: true })`; `:123` - `retry_count … toBeGreaterThanOrEqual(1)` | PASS |
| C32 | every mutating `/api/*` request without or with a foreign Origin gets 403 and the handler does not run | batch, exit 0 (both proofs) | `app.spec.ts:183-186` - `toBe(403)` + body `toEqual({ error: { code: 'ORIGIN_NOT_ALLOWED', … } })` over 4 methods × 3 origins; `:189` - `expect(writes).toBe(0)`; `sign-in.spec.ts:68-71`. **Counterexample at HEAD**: a probe in the isolated worktree sent `POST /%61pi/test/write` with no Origin. The route `/api/test/write` answered `200` and the handler ran (`writes: 1`). Cause: `app.ts:81` checks the raw `request.url.startsWith('/api/')`, but the router matches the decoded path | FAIL |
| C33 | GET without Origin -> 200 | batch, exit 0 | `app.spec.ts:205` - `expect(res.statusCode).toBe(200)` | PASS |
| C34 | helmet `nosniff` + HSTS | batch, exit 0 | `app.spec.ts:213` - `toBe('nosniff')`; `:214` - `toMatch(/max-age=\d+/)` | PASS |
| C35 | `/api/docs` 200 HTML in test, 404 in production | batch, exit 0 | `app.spec.ts:219-220` - 200 + `text/html`; `:227` - `hidden.statusCode).toBe(404)` | PASS |
| C36 | config rejects short secret / missing APP_URL; boot exits 1 | batch, exit 0 | `src/shared/config.spec.ts:57-59` - `toThrow(ConfigError)`, `/BETTER_AUTH_SECRET/`, `/APP_URL/`; `test/boot.spec.ts:68-71` - `rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('BETTER_AUTH_SECRET') })` | PASS |
| C37 | valid cookie + Origin connects, `socket.data.user.userId` | batch, exit 0 | `realtime.spec.ts:46` - `toEqual({ connected: true })`; `:49` - `serverSide?.data.user.userId).toBe(userId)` | PASS |
| C38 | no cookie / revoked -> `connect_error UNAUTHENTICATED` | batch, exit 0 | `realtime.spec.ts:55` and `:61` - `toEqual({ error: 'UNAUTHENTICATED' })` | PASS (AC 38's "expired" member unproven at the socket; see Coverage) |
| C39 | foreign Origin with a valid cookie does not connect | batch, exit 0 | `realtime.spec.ts:72` - `expect(result).not.toEqual({ connected: true })`. Surface names handshake `403`, which is not asserted (precision gap) | PASS |
| C40 | 6 identity tables exist without `organizationId` | batch, exit 0 | `test/schema.spec.ts:285` - `expect(rows).toEqual(identity.map((table) => ({ table, tenant: false })))` | PASS |
| C41 | `api:generate` with no env; `getMe` in, `/api/auth/` out | `env -i PATH HOME pnpm api:generate` exit 0; `grep -q '"operationId": "getMe"' … && ! grep -q '/api/auth/' …` exit 0; `git status` shows no diff | `apps/server/openapi.json:45` - `"operationId": "getMe"`; `grep -c '/api/auth/'` = 0; `scripts/export-openapi.ts:17-18` placeholder `APP_URL`/`BETTER_AUTH_SECRET` | PASS |

Result: 37 PASS, 3 PARTIAL (C12, C28, C29), 1 FAIL (C32). All 41 checks have located evidence and a run proof. 37/41 are proven as claimed.

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `/api/auth/*` statuses (6) | plan Surface | 200 `sign-in.spec.ts:37` · 302 `sign-up.spec.ts:71` · 400 `password-reset.spec.ts:99` · 401 `sign-in.spec.ts:55` · 403 `sign-in.spec.ts:25` (and `:68` Origin) · 429 `rate-limit.spec.ts:33` | - |
| `/api/auth/*` endpoints named in Surface (9 groups) | plan Surface `In` column | sign-up C1 · sign-in C5 · sign-out C8 · verify-email C4 · request-password-reset C9 · reset-password C11 · two-factor/* C18-C21 · send-verification-email only as a 429 counter (C27), its own response never asserted | `get-session`: no test calls it (`rg get-session` finds nothing in `src`/`test`) |
| `GET /api/v1/me` statuses (2) | plan Surface | 200 `me.spec.ts:45` · 401 `me.spec.ts:83` | - |
| `GET /api/docs` statuses (2) | plan Surface | 200 `app.spec.ts:219` · 404 `app.spec.ts:227` | - |
| socket handshake outcomes (3) | plan Surface | accepted `realtime.spec.ts:46` · foreign Origin `:72` (does not connect; the `403` is not asserted) · UNAUTHENTICATED `:55,:61` | - |
| socket rejection reasons, AC 38 (3) | plan AC 38 | no cookie `realtime.spec.ts:55` · revoked `:61` | expired session over the socket: no proof (only HTTP, `me.spec.ts:67-80`) |
| mutating method × Origin state (4 × 3) | `app.ts:23`, plan Landing 7 | all 12 at `app.spec.ts:179-189`, plus 4 allowed at `:191-199` | - |
| paths the Origin hook must cover (`/api/*` as routed) | router semantics (find-my-way decodes the path) vs `app.ts:81` raw `request.url` | literal `/api/...` `app.spec.ts:183` | percent-encoded `/api` (`/%61pi/...`): a probe showed 200 with the handler running |
| `/me` 401 reasons (4) | `session-context.ts:29-34`, AC 14/15 | no cookie · unknown token · expired · deleted, `me.spec.ts:77-85` | - |
| effective super-admin (3) | `session-context.ts:42` | 3 cases `me.spec.ts:121-137` | - |
| server-only field × route (4) | `auth.ts:69,74` | sign-up `isSuperAdmin` `me.spec.ts:155` · sign-up `activeOrganizationId` `:172` · update-user `isSuperAdmin` `:167,169` · update-user `activeOrganizationId` `:168,172` | - |
| `email.send` payloads (4) | `send-email.tsx:14-17` | verify `send-email.spec.tsx:46-50` · reset `:60-63` · unknown template `:76,85` · bad props `:83,86` (all at handler level, not through the queue) | - |
| rate-limit rules (5 + global) | `auth.ts:80-91` | counts: sign-in 10 `rate-limit.spec.ts:33` · sign-up 5 / reset 3 / send-verification 3 / two-factor verify-totp 10 `:114-115` | windows (900 s, 3600 s ×3, 900 s) never observed; global rule `window 60, max 100` never observed |
| client IP source (2) | `app.ts:40`, `auth.routes.ts:22` | false `rate-limit.spec.ts:72-73` · true `:92-94` | - |
| invalid reset tokens (2) | AC 12 | used `password-reset.spec.ts:99` · expired `:116` | the "1 h" bound (`auth.ts:39`): F4 survived |
| cookie per `APP_URL` scheme (2) | AC 6 | https `sign-in.spec.ts:113-114` · http `:39,:44` | - |
| identity tables without tenant (6) | `prisma/schema.prisma`, migration `20260922125628_auth` | `test/schema.spec.ts:285` | - |
| startup config assemblies (4) | read each: `server.ts:9` (`loadConfig(process.env)`, `.env.example:15-19`), `test/app.ts:24-25`, `scripts/export-openapi.ts:17-18`, `test/boot.spec.ts` (both boot envs carry `APP_URL`/secret) | server C36 · test app every HTTP proof · export C41 · boot C36 | - |
| Better Auth configured values (Test policy row 2) | `auth.ts:25-101` | requireEmailVerification C3 · sendOnSignUp C1 · autoSignIn C4 · revokeSessions C11 · session 3 d / 12 h C15 · input:false C17 · issuer C18 · storage database C24 · ipAddressHeaders C25/C26 · generateId false (UUID `id`, C13) | `minPasswordLength: 8` / `maxPasswordLength: 128` (AC 1 "8 a 128"): no proof (`rg` finds them only in `auth.ts:37-38`) · `emailVerification.expiresIn: 86_400`: no proof · `resetPasswordTokenExpiresIn: 3600`: no proof · rate-limit windows: no proof |
| Landing doors (9, the checks table lists 8) | plan Landing 1-9 | 1 C5 · 2 C40 · 3 C31 (payload shape at handler level) · 4 C15 · 5 C16 · 6 C25 · 7 C32 · 8 C34/C35 | door 7 is broken for encoded paths (C32) · door 9 `withoutTenant` "tenant tables fail inside it": no proof (its only test use is `send-email.spec.tsx:103`) |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary | `session-context.ts` (4 reasons + 3 super-admin combos) | boundary per decision row | yes - `me.spec.ts:77-85`, `:121-137` via `app.inject` |
| Decides, reached across a boundary | origin hook `app.ts:76-86` (4 methods × 3 states) | boundary per decision row | not met - the 12 rows are asserted at the boundary, but the path half of the decision (`startsWith('/api/')` on the raw URL) has no row, and an encoded path gets through (C32) |
| Decides, reached across a boundary | `emails/send-email.tsx` worker (2 templates + validation) | boundary per decision row: the job through the queue | not met - C28-C30 call `sendEmail()` directly (`send-email.spec.tsx:43,57,71`), so the queue→worker→template path is never observed with Mailpit. F5 survived |
| Better Auth configuration | `modules/auth/auth.ts` | one boundary observation per configured value | not met - password 8/128, verification 24 h, reset 1 h, every rate-limit window and the global rule are configured but never observed (see Coverage) |
| Instrumentation, pass-throughs | auth mount `auth.routes.ts:14-38` | none of its own; consumer proofs | yes - C25/C26 at the boundary; F3 killed |

Swept rows re-read against the code: "cookies já redigidos no pino" holds at `src/shared/logger.ts:8`. "expurgo de `Verification`/`RateLimit` fica com o Better Auth" holds: `better-auth/dist/db/internal-adapter.mjs:753` deletes expired verification rows, and the database rate-limit storage calls `deleteExpiredRows`. "Postgres fora = 500 do handler existente" holds: `app.spec.ts:158-170` covers the generic 500.

## Faults injected

Isolated worktree `scratchpad/verify-wt` at `ce8e7d5`, `pnpm install --frozen-lockfile --offline`; each fault reverted with `git checkout` before the next; worktree removed with `git worktree remove --force`. Real tree `git status --porcelain` before and after: `?? .specs/features/auth-web/checks.md` (pre-existing, unchanged).

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 - drop `DELETE` from `MUTATING_METHODS` | `src/app.ts:23` | yes - C32 `app.spec.ts:183` "DELETE {}: expected 200 to be 403" |
| F2 - super-admin ignores 2FA (`isSuperAdmin === true`) | `src/modules/auth/session-context.ts:42` | yes - C16 `me.spec.ts:135` "expected true to be false" |
| F3 - keep a client-sent `x-forwarded-for` instead of overwriting it | `src/modules/auth/auth.routes.ts:22` | yes - C25 `rate-limit.spec.ts:73` "expected 401 to be 429" |
| F4 - `resetPasswordTokenExpiresIn` 3600 -> 86_400 | `src/modules/auth/auth.ts:39` | no - survived: C12 passes, because the proof backdates `expiresAt` instead of observing the 1 h bound |
| F5 - worker handler forces `template: 'verify-email'` for every job | `src/emails/send-email.tsx:44` | no - survived: `send-email.spec.tsx` + `password-reset.spec.ts` ran 8 tests and all passed, because no proof drives a job through the queue to Mailpit |

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build`: exit 0. Biome checked 81 files; 22 test files and 120 tests passed, 0 failed; the web build succeeded. `pnpm api:generate` left no diff.

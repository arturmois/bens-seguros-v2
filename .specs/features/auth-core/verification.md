# Auth core verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: dde6e63..a811a03 (round 2 fix: ce8e7d5..a811a03)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

This round covers the fix diff `ce8e7d5..a811a03` and every verdict from round 1 that was not
PASS: C12, C28, C29, C32, three Test policy rows, the unproven Coverage members and the surviving
mutants F4 and F5.

All proofs ran again at `a811a03` in a single verbose vitest call over 13 files. All 52 named
tests (C1–C50) appeared individually and passed (`52 passed | 33 skipped`). C41 also ran again.
Every round-1 gap now has a proof that sits at the claimed boundary. F4 and F5 were injected
again and both were caught, and so were the 3 new faults on the surfaces the fix created.

## Binding sources

Verified at a811a03 for the touched sources (the plan's Landing 7b and Surface row, AC 32, and
STATE AD-003/AD-004). Everything else is carried from ce8e7d5.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-003-authentication.md` (carried from ce8e7d5) | yes | none | - |
| `docs/decisions/ADR-004-tenant-isolation.md` (verified at a811a03) | yes | none. Door 9 now proven: tenant table read/write fails inside `withoutTenant` (`database.spec.ts:359-361`) | - |
| `docs/roadmap.md` Fase 3 (carried from ce8e7d5) | yes | none | - |
| `prompts/prompt-03.md` (carried from ce8e7d5) | yes | none | - |
| `.specs/STATE.md` AD-001, AD-002, AD-005 (carried from ce8e7d5) | yes | none | - |
| `.specs/STATE.md` AD-003 (verified at a811a03) | yes | none: it now names `src/emails/send-email.tsx`, which matches `send-email.tsx:14-36` | - |
| `.specs/STATE.md` AD-004 (verified at a811a03) | yes | none: "every mutating method, on any path" matches `app.ts:80` | - |
| `plan.md` Landing 7b, Surface "any path", AC 32 (verified at a811a03) | yes | none: `app.ts:80` checks only the method and `Origin`, not the path | - |
| `CLAUDE.md` rules (carried from ce8e7d5) | yes | none | - |

## Checks

Proof run for C1–C50 (verified at a811a03): `pnpm --filter @bens/server exec vitest run --reporter=verbose <13 files> -t "<52 names>"` exited 0, and each name was printed as `✓`. Citations are refreshed in the files the fix touched. Rows for untouched files keep their round-1 line numbers, and I re-checked those at a811a03.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | sign-up: unverified user, no cookie, `verify-email` job | batch, exit 0 | `src/modules/auth/sign-up.spec.ts:38` no cookie; `:40` `emailVerified).toBe(false)`; `:43` `toEqual(['verify-email'])` | PASS |
| C2 | duplicate e-mail answers the same, 1 `User` | batch, exit 0 | `sign-up.spec.ts:60-62` | PASS |
| C3 | unverified sign-in -> 403 | batch, exit 0 | `sign-in.spec.ts:25` `toBe(403)`; `:26` | PASS |
| C4 | verify link signs in | batch, exit 0 | `sign-up.spec.ts:71` `toBe(302)`; `:72-75` | PASS |
| C5 | cookie HttpOnly, Lax, Path=/, no Domain | batch, exit 0 | `sign-in.spec.ts:37`, `:40-43` | PASS |
| C6 | https -> Secure + `__Secure-`; http -> neither | batch, exit 0 | `sign-in.spec.ts:128` `toMatch(/^__Secure-better-auth\.session_token=/)`; `:129` `toMatch(/;\s*Secure/i)`; http case now in the same test at `:139-140` | PASS |
| C7 | wrong password -> 401 | batch, exit 0 | `sign-in.spec.ts:55-56` | PASS |
| C8 | sign-out deletes the session | batch, exit 0 | `sign-in.spec.ts:86` `toBe(0)`; `:88` `toBe(401)` | PASS |
| C9 | reset request -> 200 + job | batch, exit 0 | `password-reset.spec.ts:50`, `:52` | PASS |
| C10 | unknown e-mail -> same body, no job | batch, exit 0 | `password-reset.spec.ts:64-65` | PASS |
| C11 | reset changes password, revokes sessions | batch, exit 0 | `password-reset.spec.ts:79-82` | PASS |
| C12 | used / expired (>1 h) token -> 400, old password kept | batch, exit 0 | `password-reset.spec.ts:114` `reused.statusCode).toBe(400)`; `:131` `late.statusCode).toBe(400)`. The 1 h bound is now observed by C44 (`:95`). Re-injected F4 was caught | PASS (round 1: PARTIAL) |
| C13 | `/me` exact shape | batch, exit 0 | `me.spec.ts:46-54` `toEqual({...})` | PASS |
| C14 | 4 invalid sessions -> 401 body | batch, exit 0 | `me.spec.ts:83-84` | PASS |
| C15 | 3 d expiry, 12 h refresh | batch, exit 0 | `me.spec.ts:93`, `:102-104`, `:117` | PASS |
| C16 | effective super-admin | batch, exit 0 | `me.spec.ts:135-136` | PASS |
| C17 | server-only fields ignored | batch, exit 0 | `me.spec.ts:155`, `:167`, `:169`, `:172` | PASS |
| C18 | enable TOTP, issuer, enabled after verify | batch, exit 0 | `two-factor.spec.ts:48-50`, `:57` | PASS |
| C19 | 2FA sign-in -> `twoFactorRedirect`, no session | batch, exit 0 | `two-factor.spec.ts:70`, `:72` | PASS |
| C20 | TOTP right / wrong | batch, exit 0 | `two-factor.spec.ts:85`, `:87`, `:94`, `:96` | PASS |
| C21 | disable restores plain sign-in | batch, exit 0 | `two-factor.spec.ts:106`, `:112-113` | PASS |
| C22 | secret stored encrypted | batch, exit 0 | `two-factor.spec.ts:122-123` | PASS |
| C23 | 11th sign-in -> 429 | batch, exit 0 | `rate-limit.spec.ts:32-33` | PASS |
| C24 | survives restart | batch, exit 0 | `rate-limit.spec.ts:50` `row.count).toBe(10)`; `:60` `toBe(429)` | PASS |
| C25 | client XFF ignored | batch, exit 0 | `rate-limit.spec.ts:72-73` | PASS |
| C26 | trusted proxy buckets by client | batch, exit 0 | `rate-limit.spec.ts:93-94` | PASS |
| C27 | per-path limits | batch, exit 0 | `rate-limit.spec.ts:114-115` | PASS |
| C28 | `verify-email`: subject, url in HTML + text | batch, exit 0 | `send-email.spec.tsx:46` `Subject).toBe('Confirme seu e-mail')`; `:49-50`. The path through the worker is now proven by C43 (`:112`) | PASS (round 1: PARTIAL) |
| C29 | `reset-password`: subject + url | batch, exit 0 | `send-email.spec.tsx:60` `Subject).toBe('Redefina sua senha')`; `:62-63`. Worker path proven by C43; re-injected F5 was caught | PASS (round 1: PARTIAL) |
| C30 | invalid payload throws, nothing sent | batch, exit 0 | `send-email.spec.tsx:70-83` `.rejects.toThrow()`; `:85-86` | PASS |
| C31 | retry 3 + backoff, retried | batch, exit 0 | `send-email.spec.tsx:135` `toEqual({ retry_limit: 3, retry_backoff: true })`; `:157` `toBeGreaterThanOrEqual(1)` | PASS |
| C32 | mutating request without / with a foreign Origin -> 403, handler not run | batch, exit 0 (both proofs) | `app.spec.ts:194-198` 403 + full body over 4 methods × 3 origins; `:200` `writes).toBe(0)`; `sign-in.spec.ts:68-71`. The round-1 counterexample `/%61pi/...` is now refused (C42). The old prefix condition was re-injected and caught | PASS (round 1: FAIL) |
| C33 | GET without Origin -> 200 | batch, exit 0 | `app.spec.ts:240` | PASS |
| C34 | helmet headers | batch, exit 0 | `app.spec.ts:248-249` | PASS |
| C35 | docs 200 in test / 404 in production | batch, exit 0 | `app.spec.ts:254-255`, `:262` | PASS |
| C36 | config + boot exit 1 | batch, exit 0 | `src/shared/config.spec.ts:57-59`; `test/boot.spec.ts:68-71` | PASS |
| C37 | valid socket accepted, `userId` | batch, exit 0 | `realtime.spec.ts:46`, `:49` | PASS |
| C38 | no cookie / revoked -> UNAUTHENTICATED | batch, exit 0 | `realtime.spec.ts:55`, `:61` | PASS |
| C39 | foreign Origin socket does not connect | batch, exit 0 | `realtime.spec.ts:96` `not.toEqual({ connected: true })`; the 403 is now asserted by C47 (`:85`) | PASS |
| C40 | identity tables without tenant column | batch, exit 0 | `test/schema.spec.ts:285` | PASS |
| C41 | `api:generate` with no env; `getMe` in, `/api/auth/` out | `env -i PATH HOME pnpm api:generate` exit 0; grep pair exit 0; no git diff | `apps/server/openapi.json:45` `"operationId": "getMe"` | PASS |
| C42 | Origin 403 on any path: `/api/...`, `/%61pi/...`, `/test/write` | batch, exit 0 | `app.spec.ts:221` `expect(res.statusCode, \`${method} ${url}\`).toBe(403)`; `:222` code `ORIGIN_NOT_ALLOWED`; `:225` `writes).toBe(0)`; `:233-234` same encoded route with app origin -> 200, `writes).toBe(1)` | PASS |
| C43 | both templates delivered through the queue worker | batch, exit 0 | `send-email.spec.tsx:110-112` `expect.poll(... Subject).toEqual([subject])` per template; `:114` url in Text | PASS |
| C44 | reset token 1 h; verification link 24 h | batch, exit 0 (both proofs) | `password-reset.spec.ts:95` `Math.abs(verification.expiresAt - (requestedAt + 3_600_000))).toBeLessThan(60_000)`; `sign-up.spec.ts:90` `expect(claims.exp - claims.iat).toBe(86_400)` | PASS |
| C45 | password 7/129 -> 400, 8/128 -> 200 | batch, exit 0 | `sign-up.spec.ts:109` `toBe(status)`; `:110` user count `status === 200 ? 1 : 0` over 4 lengths | PASS |
| C46 | each rule's window (5 rules + global on `/get-session`) | batch, exit 0 | `rate-limit.spec.ts:150` `inside.statusCode ...).toBe(429)` at `window - 5`; `:151` `after.statusCode ...).not.toBe(429)` at `window + 1`, over 6 rules | PASS |
| C47 | expired session over the socket -> UNAUTHENTICATED; foreign-Origin handshake -> 403 | batch, exit 0 (both proofs) | `realtime.spec.ts:73` `toEqual({ error: 'UNAUTHENTICATED' })`; `:85` `foreign.status).toBe(403)`; `:86` `own.status).toBe(200)` | PASS |
| C48 | get-session with cookie -> user; without -> `null` | batch, exit 0 | `sign-in.spec.ts:101` `signedIn.json().user.id).toBe(userId)`; `:102-103` `toBe(200)`, `toBeNull()` | PASS |
| C49 | `withoutTenant` refuses tenant tables and reads user tables | batch, exit 0 | `database.spec.ts:359-360` `read` / `write` `toBeInstanceOf(Error)`; `:361` snapshot unchanged. The `users` assertion `:362` `toBeGreaterThanOrEqual(0)` can never fail; the user-table half rests on the call not throwing | PASS |
| C50 | http cookie has neither `Secure` nor the `__Secure-` prefix, inside C6's proof | batch, exit 0 | `sign-in.spec.ts:139` `toMatch(/^better-auth\.session_token=/)`; `:140` `not.toMatch(/;\s*Secure/i)` | PASS |

Result: 50/50 PASS, each with a located assertion.

## Coverage

The rows the fix touched are verified at a811a03 and recomputed from the plan, the ADRs and
`auth.ts` / `app.ts`. The rest are carried from ce8e7d5, and their proofs ran again green.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `/api/auth/*` statuses (6) (carried from ce8e7d5) | plan Surface | 200 C5/C48 · 302 C4 · 400 C12/C45 · 401 C7 · 403 C3 · 429 C23 | - |
| `/api/auth/*` endpoints in Surface (9) (verified at a811a03) | plan Surface `In` | sign-up C1 · sign-in C5 · sign-out C8 · verify-email C4 · send-verification-email C27/C46 · request-password-reset C9 · reset-password C11 · get-session C48 (`sign-in.spec.ts:100-103`) · two-factor/* C18-C21 | - |
| `/me` statuses (2) (carried from ce8e7d5) | plan Surface | 200 C13 · 401 C14 | - |
| `/api/docs` statuses (2) (carried from ce8e7d5) | plan Surface | 200 / 404 C35 | - |
| socket handshake outcomes (3) (verified at a811a03) | plan Surface | accepted C37 · foreign Origin `403` C47 `realtime.spec.ts:85` · UNAUTHENTICATED C38 | - |
| socket rejection reasons, AC 38 (3) (verified at a811a03) | plan AC 38 | no cookie `:55` · revoked `:61` · expired `:73` | - |
| mutating method × Origin state (4 × 3) (verified at a811a03) | `app.ts:23`, `:80` | `app.spec.ts:190-200` | - |
| paths under the Origin hook (3) (verified at a811a03) | router semantics vs `app.ts:80` (no path condition) | `/api/...` · `/%61pi/...` · `/test/write`, `app.spec.ts:217-225` | - |
| `/me` 401 reasons (4) (carried from ce8e7d5) | `session-context.ts:29-34` | `me.spec.ts:77-85` | - |
| effective super-admin (3) (carried from ce8e7d5) | `session-context.ts:42` | `me.spec.ts:121-137` | - |
| server-only field × route (4) (carried from ce8e7d5) | `auth.ts:69,74` | `me.spec.ts:155-172` | - |
| `email.send` payloads at the handler (4) (carried from ce8e7d5) | `send-email.tsx:14-17` | C28 · C29 · C30 ×2 | - |
| `email.send` templates through the queue (2) (verified at a811a03) | `send-email.tsx:43-48`, `workers.ts:7` | verify-email and reset-password, `send-email.spec.tsx:110-114` | - |
| rate-limit maxima (5) (carried from ce8e7d5) | `auth.ts:85-91` | C23 · C27 | - |
| rate-limit windows (5 rules + global) (verified at a811a03) | `auth.ts:82-91` | 900/3600/3600/3600/900 and global 60/100, `rate-limit.spec.ts:150-151` | - |
| password bounds (4) (verified at a811a03) | `auth.ts:37-38` | 7 · 8 · 128 · 129, `sign-up.spec.ts:109-110` | - |
| token lifetimes (2) (verified at a811a03) | `auth.ts:39`, `:52` | reset 1 h `password-reset.spec.ts:95` · verification 24 h `sign-up.spec.ts:90` | - |
| client IP source (2) (carried from ce8e7d5) | `app.ts:40`, `auth.routes.ts:22` | C25 · C26 | - |
| invalid reset tokens (2) (verified at a811a03) | AC 12 | used `:114` · expired `:131` + 1 h bound `:95` | - |
| cookie per scheme (2) (verified at a811a03) | AC 6 | https `sign-in.spec.ts:128-129` · http `:139-140` | - |
| identity tables (6) (carried from ce8e7d5) | migration `20260922125628_auth` | `test/schema.spec.ts:285` | - |
| startup config assemblies (4) (carried from ce8e7d5; the fix touched none of them) | `server.ts:9`, `test/app.ts:24-25`, `scripts/export-openapi.ts:17-18`, `test/boot.spec.ts` | C36 · all HTTP proofs · C41 · C36 | - |
| Better Auth configured values (verified at a811a03) | `auth.ts:25-101` | requireEmailVerification C3 · min/max password C45 · reset 1 h C44 · revoke C11 · sendOnSignUp C1 · autoSignIn C4 · verification 24 h C44 · session C15 · input:false C17 · rate limit counts C23/C27, windows C46, storage C24 · ipAddressHeaders C25/C26 · generateId false C13 · issuer C18 | - |
| Landing doors (9 + 7b) (verified at a811a03) | plan Landing | 1 C5/C45 · 2 C40 · 3 C28/C43 · 4 C15 · 5 C16 · 6 C25 · 7 C32 · 7b C42 · 8 C34/C35 · 9 C49 | - |

## Test policy rows

Verified at a811a03.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary | `session-context.ts` | boundary per decision row | yes - `me.spec.ts:77-85`, `:121-137` (carried from ce8e7d5) |
| Decides, reached across a boundary | Origin hook `app.ts:76-83` | boundary per decision row | yes - 4 methods × 3 origin states (`app.spec.ts:190-200`) and 3 path forms (`:217-234`) via `app.inject`; the old prefix mutant was caught |
| Decides, reached across a boundary | `emails/send-email.tsx` worker | the job driven through the queue | yes - C43 enqueues both templates and reads Mailpit (`send-email.spec.tsx:110-114`); F5 was caught |
| Better Auth configuration | `modules/auth/auth.ts` | one boundary observation per configured value | yes - each value in the Coverage row above is observed in a response or a DB row; F4 and the global-window mutant were caught |
| Instrumentation, pass-throughs | auth mount `auth.routes.ts` | consumer proofs | yes - C25/C26 (carried from ce8e7d5; F3 was caught in round 1) |

Swept rows: carried from ce8e7d5 (logger redaction `src/shared/logger.ts:8`, Better Auth purge of expired verification/rate-limit rows, generic 500). The fix touched none of them.

## Faults injected

Verified at a811a03. Isolated worktree `scratchpad/verify-wt2` at `a811a03`, set up with `pnpm install --frozen-lockfile --offline`. Each fault was reverted with `git checkout -- .` before the next, then the worktree was removed with `git worktree remove --force`. The real tree's `git status --porcelain` was the same before and after: `?? .specs/features/auth-web/checks.md` (not part of this feature, left alone). Round-1 faults F1–F3 are carried from ce8e7d5; all three were caught, and the fix did not touch their surfaces.

| Mutation | Location | Killed |
| --- | --- | --- |
| F4 (re-injected) - `resetPasswordTokenExpiresIn` 3600 -> 86_400 | `src/modules/auth/auth.ts:39` | yes - C44 `password-reset.spec.ts:95` "expected 82800012 to be less than 60000" |
| F5 (re-injected) - worker forces `template: 'verify-email'` | `src/emails/send-email.tsx:44` | yes - C43 `send-email.spec.tsx:112` "expected [ 'Confirme seu e-mail' ] to deeply equal [ 'Redefina sua senha' ]" |
| R3 - Origin hook gets back the `request.url.startsWith('/api/')` condition | `src/app.ts:80` | yes - C42 `app.spec.ts:221` "POST /%61pi/test/write: expected 200 to be 403" |
| R4 - global rate-limit `window` 60 -> 120 | `src/modules/auth/auth.ts:83` | yes - C46 `rate-limit.spec.ts:151` "/get-session after the window: expected 429 not to be 429" |
| R5 - `withoutTenant` silently sets `app.tenant_id` to an existing organization | `src/infrastructure/database.ts:45-46` | yes - C49 `database.spec.ts:359` "expected undefined to be an instance of Error" |

## Gate

Verified at a811a03. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exited 0: Biome checked 81 files, 22 test files ran with 130 tests passed and 0 failed, and the web build succeeded. `pnpm api:generate` left no diff.

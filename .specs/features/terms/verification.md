# Terms verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 152bf11..7f0a9dc
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

## Binding sources

Binding-source screen enumeration (step 1) is ui-only; skipped under profile `standard`. Fix `7f0a9dc` did not touch the interface — step 1 not re-run. (carried from 89acc88)

## Checks

Proofs re-run in full at `7f0a9dc`. C1–C11 and C13–C16 judgments carried from `89acc88`; C12 re-judged after the assertion fix. Citations for `apps/web/e2e/terms.spec.ts` refreshed (file touched by the fix).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `GET /me` without acceptance → `200` `terms: { pending: true, termsVersion: '1.0', privacyVersion: '1.0' }` | `vitest … terms.spec.ts` - `reports pending terms before acceptance` exit 0 at `7f0a9dc` | `apps/server/src/modules/auth/terms.spec.ts:30` - `expect(response.statusCode).toBe(200)`; `:31-33` - `toMatchObject({ terms: { pending: true, termsVersion: '1.0', privacyVersion: '1.0' } })` (carried from 89acc88) | PASS |
| C2 | after both current versions, `terms.pending: false` | `…` - `reports pending false after both current versions` exit 0 at `7f0a9dc` | `terms.spec.ts:62` - `toMatchObject({ terms: { pending: false } })` (carried from 89acc88) | PASS |
| C3 | only older version `0.9` → `pending: true` with current `1.0` | `…` - `pending stays true when only an older version exists` exit 0 at `7f0a9dc` | `terms.spec.ts:72-74` - `toMatchObject({ terms: { pending: true, termsVersion: '1.0', privacyVersion: '1.0' } })` (carried from 89acc88) | PASS |
| C4 | POST current versions stores TERMS+PRIVACY with `acceptedAt` and `ipAddress`, `200` body | `…` - `stores both documents with the client ip` exit 0 at `7f0a9dc` | `terms.spec.ts:42` - `toBe(200)`; `:43` - `toMatchObject(current)`; `:48` - documents `['PRIVACY','TERMS']`; `:49` - version `1.0`; `:50` - `ipAddress === member.client.ip`; `:52-53` - `acceptedAt` window + ISO (carried from 89acc88) | PASS |
| C5 | repeat acceptance → `200`, first `acceptedAt`, row count `2` | `…` - `repeat acceptance keeps the first timestamp` exit 0 at `7f0a9dc` | `terms.spec.ts:82` - `toBe(200)`; `:83` - `second.json()).toEqual(first.json())`; `:84` - `count … toBe(2)` (carried from 89acc88) | PASS |
| C6 | non-current version → `409` `TERMS_VERSION_MISMATCH` + exact message, no rows | `…` - `rejects a version that is not current` exit 0 at `7f0a9dc` | `terms.spec.ts:94` - `toBe(409)`; `:95-100` - `toEqual({ error: { code: 'TERMS_VERSION_MISMATCH', message: '…' } })`; `:102` - `count … toBe(0)` (carried from 89acc88) | PASS |
| C7 | extra field / missing `privacyVersion` → `400` `VALIDATION_ERROR`, no rows | `…` - `rejects a body that is not the two versions` exit 0 at `7f0a9dc` | `terms.spec.ts:113-116` - both `toBe(400)` and `code: 'VALIDATION_ERROR'`; `:117` - `count … toBe(0)` (carried from 89acc88) | PASS |
| C8 | POST without session → `401` `UNAUTHENTICATED` | `…` - `requires a session` exit 0 at `7f0a9dc` | `terms.spec.ts:131` - `accept.statusCode`).toBe(401); `:132` - `code: 'UNAUTHENTICATED'` (carried from 89acc88) | PASS |
| C9 | user A accepted → A `pending: false`, B `pending: true` | `…` - `one user acceptance does not clear another` exit 0 at `7f0a9dc` | `terms.spec.ts:153-155` - A `pending: false`; `:156-159` - B `pending: true` (carried from 89acc88) | PASS |
| C10 | `GET /me` no session → `401`; POST without Origin → `403` `ORIGIN_NOT_ALLOWED` | `…` - `requires a session` + `rejects a write from another origin` exit 0 at `7f0a9dc` | `terms.spec.ts:129-130` - me `401` `UNAUTHENTICATED`; `:144-145` - `403` `ORIGIN_NOT_ALLOWED` (carried from 89acc88) | PASS |
| C11 | pending user opening `/dashboard` → `/terms-acceptance` with `redirect` containing dashboard | `playwright … e2e/terms.spec.ts` - `sends a pending user to terms acceptance` exit 0 at `7f0a9dc` | `apps/web/e2e/terms.spec.ts:11` - `toHaveURL(/\/terms-acceptance\?redirect=.*dashboard/)` (carried from 89acc88; citation refreshed) | PASS |
| C12 | "Li e aceito" sends versions from `/me`; with `redirect=/settings/security` → that path; without → `/dashboard` | `…` - `accepts and follows the redirect` exit 0 at `7f0a9dc` | `e2e/terms.spec.ts:16` - `fromMe = { termsVersion: '4.2', privacyVersion: '8.8' }` rewritten onto `GET /me` at `:22`; `:26` - `expect(route.request().postDataJSON()).toEqual(fromMe)`; `:40` - `toHaveURL('/settings/security')`; `:52` - `toHaveURL('/dashboard')` (re-judged at 7f0a9dc) | PASS |
| C13 | `409` shows the mismatch message; next submit uses new `/me` versions | `…` - `reloads terms when the version changed` exit 0 at `7f0a9dc` | `e2e/terms.spec.ts:86` - `expect(body).toEqual({ termsVersion: '2.0', privacyVersion: '2.0' })`; `:99-101` - mismatch message `toBeVisible()` (carried from 89acc88; citation refreshed) | PASS |
| C14 | `/terms-acceptance` links to `/terms` and `/privacy` with `target="_blank"` | `…` - `links the two documents in a new tab` exit 0 at `7f0a9dc` | `e2e/terms.spec.ts:114-126` - both links `target` `_blank` and `href` `/terms` / `/privacy` (carried from 89acc88; citation refreshed) | PASS |
| C15 | public `/terms` and `/privacy` show version `1.0` and a text excerpt | `…` - `shows the public documents` exit 0 at `7f0a9dc` | `e2e/terms.spec.ts:134-136` - heading, `Versão 1.0`, terms excerpt; `:139-141` - privacy heading, version, LGPD excerpt (carried from 89acc88; citation refreshed) | PASS |
| C16 | while accepting, button shows `Aguarde…` and is disabled | `…` - `disables the button while accepting` exit 0 at `7f0a9dc` | `e2e/terms.spec.ts:160` - `getByRole('button', { name: 'Aguarde…' })).toBeDisabled()` (carried from 89acc88; citation refreshed) | PASS |

## Coverage

Recomputed rows whose authority the fix touched: none — `7f0a9dc` only strengthened the C12 e2e assertion; no new set member or branch. Full join carried from 89acc88:

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /api/v1/me` statuses (2) | plan Surface + `auth.routes.ts` `getMe` | 200 C1 · 401 C10 | - |
| `POST /api/v1/me/terms-acceptance` statuses (5) | plan Surface + `acceptTerms` / Origin guard | 200 C4 · 400 C7 · 401 C8 · 403 C10 · 409 C6 | - |
| documents (2) | `LegalDocument` enum + `CURRENT` in `terms.ts` | TERMS C4 · PRIVACY C4 | - |
| pending causes (3) | `termsState` acceptance set | none C1 · both current C2 · older version C3 | - |
| Landing doors (3) | plan Landing | record C4 · contract C6 · session stays open C1 (`/me` without accept) | - |
| web screens (3) | plan Impact / Observable | `/terms-acceptance` C11 · `/terms` C15 · `/privacy` C15 | - |

Swept existing (carried from 89acc88): `TermsAcceptance` `@@unique([userId, document, version])` present at `apps/server/prisma/schema.prisma:148`; `termsAcceptanceInput` `.strict()` at `terms.schema.ts:3-8`; `requireSession` on both `/me` routes at `auth.routes.ts:62` and `:76`. Swept `n/a` rows: policy as approved.

## Test policy rows

Re-judged the previously unmet instrumentation note (C12 consumer gap) plus the row classifying the touched e2e file.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary | `terms.ts` `termsState` (pending table) | boundary C1–C3 via `GET /api/v1/me` | yes — three inputs at `/me` (carried from 89acc88) |
| Decides, reached across a boundary | `terms.ts` `acceptTerms` (match / mismatch / repeat) | boundary C4–C6 | yes (carried from 89acc88) |
| Decides, reached across a boundary | `_app.tsx` pending redirect | browser C11 | yes (carried from 89acc88) |
| Entry point that decides nothing | `auth.routes.ts` POST accept + session/origin | boundary C7–C8 · C10 | yes (carried from 89acc88) |
| Instrumentation, pass-throughs | Orval `useAcceptTerms` / me client; consumer `e2e/terms.spec.ts` | covered by C12–C13 consumers | yes — C12 now asserts POST body equals `/me` versions (`4.2`/`8.8`); C13 still asserts reload path (re-judged at 7f0a9dc) |

## Faults injected

Baseline real-tree porcelain before worktree: `?? .specs/features/terms/verification.md` + `?? prompts/prompt-04.md`. Scratch: `git worktree add /tmp/terms-verify-r2 HEAD`. Real tree not mutated for mutants. After `git worktree remove --force`, porcelain matched baseline.

Scoped to surfaces created by `7f0a9dc` (new C12 POST-body assertion). Prior server mutants carried as killed from 89acc88 — not re-injected.

| Mutation | Location | Killed |
| --- | --- | --- |
| Vite split `terms-acceptance` posts hardcoded `'1.0'`/`'1.0'` instead of `versions.*` from `/me` | scratch intercept of `**/terms-acceptance.tsx?tsr-split=component*` while running `accepts and follows the redirect` against live `:3000` | yes — C12 `e2e/terms.spec.ts:26` `toEqual(fromMe)` expected `4.2`/`8.8`, received `1.0`/`1.0` |

## Gate

`pnpm --filter @bens/server exec vitest run src/modules/auth/terms.spec.ts --reporter=verbose` — 10 passed, 0 failed (at `7f0a9dc`)

`PLAYWRIGHT_BROWSERS_PATH=… pnpm --filter @bens/web exec playwright test e2e/terms.spec.ts --reporter=list` — 6 passed, 0 failed (at `7f0a9dc`)

Proofs green at `7f0a9dc`; C12 assertion gap from round 1 closed.

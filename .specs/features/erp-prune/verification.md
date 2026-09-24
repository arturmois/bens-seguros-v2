# ERP prune verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: db84b0b..cdb059c
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Both gaps from round 1 are closed at `cdb059c`. C9 is green: `up && all` exits 0, with 16 steps and
84 e2e passed. The F0 criterion now has a check for the landing page (C31), and it records the Terms
of Use as an explicit exception. All 31 proofs were re-run and pass.

The feature still fails, for one reason: the new check C31 does not prove what it claims. The claim
says the landing describes three things: captura de leads, atendimento com IA and acompanhamento
comercial. The proofs only grep for `leads` and for the absence of `ERP|apólices|comissões`. A
mutant that deletes "atendimento com IA e acompanhamento comercial" survives both proofs (see Faults).

**Round 1** (`0983bf8`, full, FAIL): C9 was red because the staging server was unhealthy without
`TURNSTILE_*`. The roadmap's F0 criterion also had two unchecked web files, the landing page and the
Terms of Use. That report is in git at `40a939d`
(`git show 40a939d:.specs/features/erp-prune/verification.md`).

**Scope of this round.** It covers the fix diff `0983bf8..cdb059c` and every verdict that was not
PASS in round 1 (C9, the roadmap Uncovered cell, and the Coverage rows "startup config" and "living
code free of ERP terms"). The fix diff contains:
- `452294b`: landing copy, plan AC 17, C31, the Terms-of-Use exception in plan, roadmap and STATE, and the corrected C9 proof.
- `cdb059c`: compose, smoke, e2e helper, CI env and runbook, verified separately as `staging-signup-env`.
- `40a939d`: the round-1 report only.

No file under `apps/server/` changed in `0983bf8..cdb059c`, so server citations carry forward.

## Binding sources

*Verified at cdb059c.*

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-011-pivot-to-mvp.md` ("A F0 fecha com CI verde e o smoke local", line 34) | yes - re-read at HEAD | none | - (C9 green, see Checks) |
| `docs/roadmap.md` § F0 criterion (line 31) | yes - re-read at HEAD | none | -. The criterion now reads "... Exceção: o texto dos Termos de Uso, reescrito na revisão jurídica antes do go-live (F11)". This matches plan Out of scope (`plan.md:136`) and F11's criterion (`roadmap.md:149`). The round-1 sweep was re-run at HEAD over `apps/web/src apps/server/src scripts .github docker-compose*.yml README.md CLAUDE.md docs/runbooks docs/architecture.md` for `\bERP\b`, `apólice`, `sinistro`, `asaas`, `comiss` and `commission` (case-insensitive, excluding `apps/web/src/api/`). The remaining hits are `documents.ts:29` (the Terms of Use, excepted); `README.md:5`, `CLAUDE.md:3` and `architecture.md:18-19` (they describe the pivot or say "Não é um ERP"); and `app.spec.ts:294-295` (asserts the old route is absent). The landing page no longer matches |

## Checks

*Proofs re-run at cdb059c. Citations refreshed for files the fix touched. Server citations are carried from 0983bf8, because those files are unchanged.*

The proofs were batched as follows:
- One vitest call from a clean HEAD worktree:
  `pnpm --filter @bens/server exec vitest run src/shared/config.spec.ts test/boot.spec.ts src/app.spec.ts src/modules/organizations/member.spec.ts test/schema.spec.ts src/modules/organizations/onboarding.spec.ts src/modules/organizations/invitation.spec.ts test/architecture.spec.ts --reporter=verbose`.
  It exited 0 with 8 files and 131 tests passed. Each of the 17 named tests appears as `✓` in the verbose output. `requires a session` matches 4 lines, and the PATCH one is among them.
- The `rg` proofs ran as `ARGV0=rg /home/artur/.local/bin/claude <args>`. Sanity checks came first: `fastify` in `pnpm-lock.yaml` returned 56 hits, and a known-negative search exited 1.
- C4, C21, C28 and C9 ran in the HEAD worktree `/tmp/claude-1000/verify-sse`.
- C30 used a second worktree at `db84b0b`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | defaults object exact, no `S3_*` | vitest ✓ | `apps/server/src/shared/config.spec.ts:14` - `expect(loadConfig(required)).toEqual({...})` (carried from 0983bf8, file unchanged) | PASS |
| C2 | boot passes config and exits 1 on RLS bypass | vitest ✓ | `apps/server/test/boot.spec.ts:40-43` - `rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Database role "bens" bypasses row level security') })` (carried) | PASS |
| C3 | test app answers `/api/health` 200 `{status:'ok'}` without `S3_*` | vitest ✓; `rg -n "S3_" apps/server/src apps/server/test` exit 1 | `apps/server/src/app.spec.ts:75-76` - `toBe(200)`, `toEqual({ status: 'ok' })` (carried) | PASS |
| C4 | `export-openapi.ts` runs without `S3_*` | `rg -n "S3_" apps/server/scripts` exit 1; `pnpm --filter @bens/server openapi:export` exit 0 | `apps/server/scripts/export-openapi.ts:8` - `loadConfig({...})` without `S3_*` (carried) | PASS |
| C5 | none of the 3 deps in package.json or the lockfile | `rg -n "@aws-sdk/client-s3...@react-pdf/renderer" apps/server/package.json pnpm-lock.yaml` exit 1 | `apps/server/package.json:1` - no match in the file (carried; neither file is in the fix diff) | PASS |
| C6 | the 4 files are gone and nothing imports them | `test ! -e` ×4 exit 0; `rg -n "infrastructure/(storage...ensureBucket" ...` exit 1 | `apps/server/src/dependencies.ts:24-30` - `Deps` has no `storage` (carried). New extra check: `ls dist/infrastructure` in the running staging image lists only `database.js`, `email.js`, `queue.js` and `realtime.js` (+ `.map`) | PASS |
| C7 | dev compose has exactly `mailpit postgres` and no minio | awk proof exit 0; `rg -n -i minio docker-compose.yml` exit 1 | `docker-compose.yml:1` - the services block equals `"mailpit postgres "` (carried) | PASS |
| C8 | CI has no MinIO and no `S3_*` | `rg -n -i "minio...S3_" .github/workflows/ci.yml` exit 1 (re-run: the fix added 4 env lines to this file) | `.github/workflows/ci.yml:108-111` - the only lines the fix added are the Turnstile env; the whole file has no match | PASS |
| C9 | the smoke exits 0 and loads no pdf/storage module | `node scripts/staging-smoke.mjs up && node scripts/staging-smoke.mjs all` **exit 0** (clean HEAD worktree, fresh stack; 16 steps, every assertion `ok`, `84 passed (3.8m)`), then `down` exit 0; `rg -n "infrastructure/(pdf...storage)" scripts/staging-smoke.mjs` exit 1 | `scripts/staging-smoke.mjs:480` - `assert(result.status === 0, ...)` for the e2e step; `scripts/staging-smoke.mjs:541-555` - the `image` step imports every compiled infra module, and its list (`:535-543`) has no pdf/storage. The image's `dist/infrastructure` has neither file (see C6) | PASS |
| C10 | `GET /members` 200 with exactly 6 keys (OWNER, ADMIN) | vitest ✓ | `apps/server/src/modules/organizations/member.spec.ts:367` - `toEqual({ id, userId, role: 'MANAGER', active: false, email, name: 'Membro' })`; `:381` - `Object.keys(item).sort()` `toEqual([...6])` (carried) | PASS |
| C11 | `GET /members` without a session: 401 | vitest ✓ | `member.spec.ts:388-389` - `toBe(401)`, `'UNAUTHENTICATED'` (carried) | PASS |
| C12 | `GET /members` MANAGER/COMMERCIAL/VIEWER: 403 | vitest ✓ | `member.spec.ts:397-398` - `toBe(403)`, `'FORBIDDEN'` (carried) | PASS |
| C13 | PATCH `{role}` 200 with the 6 keys | vitest ✓ | `member.spec.ts:98` - `Object.keys(response.json()).sort()` `toEqual([...6])` (carried) | PASS |
| C14 | PATCH with a bad body: 400 | vitest ✓ | `member.spec.ts:244-245` - `toBe(400)`, `'VALIDATION_ERROR'` (carried) | PASS |
| C15 | PATCH without a session: 401 | vitest ✓ | `member.spec.ts:268-278` - `toBe(401)` (carried) | PASS |
| C16 | PATCH without `member:update`: 403 | vitest ✓ | `member.spec.ts:260-261` - `toBe(403)` (carried) | PASS |
| C17 | PATCH on an unknown id: 404 | vitest ✓ | `member.spec.ts:302-305` - `toBe(404)`, `NOT_FOUND` body (carried) | PASS |
| C18 | PATCH on the OWNER: 422 | vitest ✓ | `member.spec.ts:222-228` - `toBe(422)`, `OWNER_IMMUTABLE` (carried) | PASS |
| C19 | `Member` has no `commissionSplitBp` and keeps its 7 columns | vitest ✓ | `apps/server/test/schema.spec.ts:347` - `not.toContain('commissionSplitBp')`; `:348-358` `arrayContaining([...7])` (carried) | PASS |
| C20 | the drop migration exists and the schema does not declare the field | `rg -F 'ALTER TABLE "Member" DROP COLUMN "commissionSplitBp";' apps/server/prisma/migrations` exit 0; `rg commissionSplitBp apps/server/prisma/schema.prisma` exit 1 | `apps/server/prisma/migrations/20260923220000_drop_member_commission_split/migration.sql:2` | PASS |
| C21 | `api:generate` gives no diff and no `commissionSplitBp`, with 2 operationIds | `pnpm api:generate && git diff --exit-code -- apps/server/openapi.json apps/web/src/api` exit 0; `rg commissionSplitBp apps/server/openapi.json apps/web/src` exit 1; `rg -c` printed `2` | `apps/server/src/modules/organizations/member.schema.ts:16-25` - `memberOutput` with 6 keys (carried) | PASS |
| C22 | the transfer probe write persists, returning `{transferred:2}` | vitest ✓ | `member.spec.ts:467-468` - `toEqual({ transferred: 2 })`, `active).toBe(false)` (carried) | PASS |
| C23 | a throwing move gives 500, a rollback and no audit | vitest ✓ | `member.spec.ts:493-495` - `toBe(500)`, `active).toBe(true)`, `auditsOf(...)).toEqual(before)` (carried) | PASS |
| C24 | onboarding and invite create members with `active: true` | vitest ✓ ×2 | `apps/server/src/modules/organizations/onboarding.spec.ts:51`, `invitation.spec.ts:687` - `toMatchObject({ role, active: true })` (carried) | PASS |
| C25 | 8 archived docs carry the ADR-011 notice in their first 3 lines | loop over the 8 files printed no failure | `prompts/prompt-01.md:1` - archived notice citing ADR-011 (carried; none of the files is in the fix diff) | PASS |
| C26 | the 8 living files have no minio, `S3_` or commissionSplit | `rg -n -i "minio...commissionSplit" <8 files>` exit 1 (re-run: the fix touched the runbook, `docker-compose.prod.yml` and `staging-smoke.mjs`) | `docs/runbooks/staging.md:24` - the only new operator line (Turnstile keys) has no match; `docker-compose.prod.yml:57-60` and `scripts/staging-smoke.mjs:32-38` - the new lines have no match | PASS |
| C27 | `architecture.md` is free of storage.ts, pdf.ts, minio and "sai na F0" | `rg` exit 1 | `docs/architecture.md:274` (carried; file unchanged) | PASS |
| C28 | the four gates exit 0 | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exit 0 (clean HEAD worktree): 29 files, 272 tests | `apps/server/src/modules/organizations/member.spec.ts:193` - the concurrency test is in the green run (carried) | PASS |
| C29 | architecture.spec unchanged, boot.spec loses only `S3_*`, schema.spec only gains C19 | vitest over the 3 files ✓ (in the batch); `git diff --exit-code db84b0b..HEAD -- ...architecture.spec.ts` exit 0; boot filter exit 1; schema `^-` filter exit 1 | `apps/server/test/schema.spec.ts:335-359` (carried) | PASS |
| C30 | exactly the 2 listed tests disappear | `pnpm --filter @bens/server exec vitest list` in clean worktrees at `db84b0b` and `cdb059c` (267 lines each). `comm -23` printed exactly `src/infrastructure/pdf.spec.tsx > renderPdf > renders a React PDF document to a PDF buffer` and `src/infrastructure/storage.spec.ts > storage (MinIO) > uploads, serves through a pre-signed attachment URL and deletes`. `comm -13` printed the C11 and C19 tests | `member.spec.ts:385`, `test/schema.spec.ts:337` (carried) | PASS |
| C31 | landing describes lead capture, AI service and commercial follow-up; no `ERP`, `apólices` or `comissões` | `rg -n "ERP...comissões" "apps/web/src/routes/(public)/index.tsx"` exit 1; `rg -n "leads" ...` exit 0 | `apps/web/src/routes/(public)/index.tsx:26-27` - "Captura de leads, atendimento com IA e acompanhamento comercial para corretoras de seguros." The claim holds at HEAD. The proofs assert only 1 of the 3 described elements plus the absence of 3 case-sensitive words, and a mutant removing the other two survives (see Faults and Coverage) | PASS |

Precision (checks, not code):
- `checks.md` line 6 still says "30 checks", while there are 31.
- C31's absence proof is case-sensitive: `erp`, `Apólices` and the singular `comissão` would pass it.
- C10's OWNER call asserts exact equality on `items[0]` only. This note is carried from round 1.

## Coverage

*The rows whose authority the fix touched were recomputed at cdb059c. The others are carried from 0983bf8, with their sources unchanged in the fix diff.*

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| startup config without `S3_*` (4 assemblies) - verified at cdb059c | `loadConfig(` call sites (server.ts, test/app.ts, export-openapi.ts) plus the production image from `docker-compose.prod.yml` | boot C2 · harness C3 · export C4 · staging image C9 (now green: `health`, `image` and `e2e` all ok) | - |
| removed dependencies (3) - carried from 0983bf8 | package.json diff | all 3 C5 | - |
| removed files (4) - carried from 0983bf8 | base tree | all 4 C6 | - |
| MinIO start points (3) - verified at cdb059c (ci.yml and smoke touched) | `git grep -il minio db84b0b` over runnable config | compose C7 · CI C8 · smoke C9, C26 | - |
| `GET /api/v1/members` statuses (3) - carried from 0983bf8 | plan Surface | 200 C10 · 401 C11 · 403 C12 | - |
| `PATCH /api/v1/members/:id` statuses (6) - carried from 0983bf8 | plan Surface | 200 C13 · 400 C14 · 401 C15 · 403 C16 · 404 C17 · 422 C18 | - |
| `memberOutput` keys (6) - carried from 0983bf8 | `member.schema.ts:16-25` | each C10 + C13 | - |
| one-way doors (2) - carried from 0983bf8 | plan Landing | door 1 C19/C20 · door 2 C10/C13/C21 | - |
| `Member` writers of `commissionSplitBp` at base (3) - carried from 0983bf8 | `git grep` at base | C24 ×2 · C22/C23 | - |
| archived documents (8) - carried from 0983bf8 | `prompts/` plus 2 docs | all 8 C25 | - |
| living code/config/docs free of ERP terms (roadmap F0, authority `docs/roadmap.md:31`) - verified at cdb059c | the HEAD sweep (see Binding sources) with the roadmap's own Terms-of-Use exception | 8 AC-12 files C26 · `architecture.md` C27 · landing C31 · `documents.ts` excepted by `roadmap.md:31` and `plan.md:136` | - |
| what the landing must describe (3, authority: plan AC 17 and the C31 claim) - verified at cdb059c | `plan.md` AC 17: "captura de leads, atendimento com IA e acompanhamento comercial" | captura de leads: C31 (`rg "leads"`) · atendimento com IA: no proof · acompanhamento comercial: no proof | "atendimento com IA" and "acompanhamento comercial" - present at `index.tsx:26`, but no proof asserts them, and removing them survives C31 |

Level: C3 and C10-C18 cross the HTTP boundary (carried). C9 runs against the real production stack.
C31 is a source-text claim with text proofs, which is appropriate for static copy. The gap is in how
much the proofs assert, not in the level.

## Test policy rows

*Carried from 0983bf8.* `checks.md` has no `## Test policy` section. Its `## Tests removed or
changed` table is unchanged in the fix diff, and no file it classifies changed in
`0983bf8..cdb059c`: no file under `apps/server/` changed. `apps/web/e2e/support.ts` (changed by
`cdb059c`) is not classified by any row. The round-1 verdicts stand, and all rows are met.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| storage/pdf specs removed with the files | `storage.spec.ts`, `pdf.spec.tsx` | only these 2 disappear (C30) | yes - re-run at cdb059c: `comm -23` gives exactly these 2 |
| config.spec: defaults / coercion / required | `src/shared/config.spec.ts` | only `S3_*` removed, exact object kept | yes (carried) |
| `S3_*` leaves the boot, signup-gates and harness env | `test/boot.spec.ts`, `signup-gates.spec.ts`, `test/app.ts` | only `S3_*` lines removed | yes - C29 filter re-run exit 1 |
| member.spec list: exact object | `member.spec.ts:367` | `toEqual` without `commissionSplitBp` | yes (carried) |
| member.spec PATCH: exact keys | `member.spec.ts:98` | keys assertion | yes (carried) |
| member.spec 401 on list | `member.spec.ts:385` | new test | yes (carried) |
| transfer probe column | `member.spec.ts:457, 483` | probe on `active`, asserts kept | yes (carried) |
| onboarding/invitation `toMatchObject` | `onboarding.spec.ts:51`, `invitation.spec.ts:687` | only `commissionSplitBp: 0` removed | yes (carried) |
| schema.spec new test | `test/schema.spec.ts:335-359` | C19 test | yes (carried) |

## Faults injected

*Verified at cdb059c.* Faults ran in the scratch worktree `/tmp/claude-1000/verify-sse` (HEAD,
`pnpm install --frozen-lockfile`) and were reverted there with `git checkout`. The worktree was then
removed. The real tree's `git status --porcelain` held only the two report files, against an empty
baseline. The fix touched these surfaces: the landing (C31, new), and the smoke, compose and e2e
path that C9 now depends on. Round 1's five server faults are carried from 0983bf8, because no
server file changed.

| Mutation | Location | Killed |
| --- | --- | --- |
| `ERP` reintroduced into the landing copy ("ERP com captura de leads, ...") | `apps/web/src/routes/(public)/index.tsx:26` | yes - C31's first proof exits 0 (a match) instead of 1 |
| the landing drops "atendimento com IA e acompanhamento comercial" (copy becomes "Captura de leads para corretoras de seguros.") | `apps/web/src/routes/(public)/index.tsx:26-27` | no - C31's first proof still exits 1 and the second still exits 0. `rg` over `apps/web` finds no other test that reads the copy |
| sign-up `x-captcha-response` removed from the smoke's `signedIn()` (a surface the C9 fix created) | `scripts/staging-smoke.mjs:163` | yes - `node scripts/staging-smoke.mjs cookie` exits 1 with `not ok - sign-up: 400`, so `all` (C9) fails. Run during the `staging-signup-env` verification in this session, at the same commit and stack |
| e2e `signUp` helper sends no captcha token | `apps/web/e2e/support.ts:84` | yes - the `e2e` step exits 1 (`Received: 400`), so C9's `all` fails. Same run as above |
| the expected CSP loses `challenges.cloudflare.com` in `script-src` | `scripts/staging-smoke.mjs:463` | yes - the `headers` step exits 1, so C9's `all` fails. Same run as above |
| extra key in `memberOutput`; migration removed; `S3_BUCKET` required; onboarding/invite `active: false` (5 faults) | server (see round 1) | yes - carried from 0983bf8 (the files are unchanged) |

## Gate

Verified at cdb059c.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (clean HEAD worktree): exit 0, 29 files, 272 passed, 0 failed.
- `node scripts/staging-smoke.mjs up && node scripts/staging-smoke.mjs all`: exit 0 (16 steps, 84 e2e passed). Then `down` exit 0.

## Ranked gaps

1. C31 under-asserts its own claim. Plan AC 17 and C31 say the landing describes "captura de leads,
   atendimento com IA e acompanhamento comercial". The proofs check only `leads` and the absence of
   `ERP`, `apólices` and `comissões`, all case-sensitive. A mutant that removes "atendimento com IA e
   acompanhamento comercial" survives. - C31 - `apps/web/src/routes/(public)/index.tsx:26-27`.
   Cheap fix: add `rg` proofs for "atendimento com IA" and "acompanhamento comercial", and make the
   absence proof case-insensitive and cover `comissão`/`apólice`.
2. Precision (not failing on its own): `checks.md` still says "30 checks". C10's OWNER call asserts
   `items[0]` only (carried from round 1).

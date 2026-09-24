# ERP prune verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: db84b0b..e1f406c
**Round**: 3 - scoped
**Verifier**: independent sub-agent (author != verifier)

All 31 checks are proven at `e1f406c`. This round re-ran the round-2 mutant that survived C31
(deleting "atendimento com IA e acompanhamento comercial"), and C31's new proofs now kill it. The
strengthened C10 loop kills a mutant that reaches only the non-first items of the OWNER's list. The
round-2 version of the test lets that same mutant pass. The server suite, every command proof and
the four gates were re-run and are green.

**Earlier rounds:**
- Round 1 (`0983bf8`, full, FAIL): C9 red, and the F0 criterion left two web files uncovered. The report is in git at `40a939d`.
- Round 2 (`cdb059c`, scoped, FAIL): C9 and the F0 coverage closed, but a C31 mutant survived. The report is in git at `e07801b`.

**Scope of this round.** It covers the fix diff `e07801b..e1f406c` and every verdict that was not PASS
in round 2 (C31, its Coverage row "what the landing must describe", and its surviving fault). The
fix diff touches 4 files:
- `.specs/features/erp-prune/checks.md`: header count, C31 proofs, handoff line.
- `apps/server/src/modules/organizations/member.spec.ts`: +3 lines, lines 375-377.
- `.specs/LESSONS.md` and `.specs/lessons.json`: lessons L-038 to L-042, docs only.

No production source, config, compose, smoke or web file changed.

**Smoke choice: not re-run, carried from cdb059c.** The only code-adjacent change is a spec file,
and `apps/server/tsconfig.build.json:10` excludes `src/**/*.spec.ts` from the build. The runtime
image the smoke builds is therefore byte-identical in behaviour to `cdb059c`, where `up && all`
exited 0 (16 steps, 84 e2e passed). C9's static proof was re-run at `e1f406c`.

## Binding sources

*Carried from cdb059c.* The fix diff touches no binding source (`docs/decisions/ADR-011-pivot-to-mvp.md`,
`docs/roadmap.md` § F0) and no swept file. It adds only `.specs/` docs and a test.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-011-pivot-to-mvp.md` ("A F0 fecha com CI verde e o smoke local", line 34) | yes - read in round 2 at cdb059c, unchanged since | none; C9 green (carried) | - |
| `docs/roadmap.md` § F0 criterion (line 31, with the Terms-of-Use exception) | yes - read in round 2 at cdb059c, unchanged since | none; the sweep was done at cdb059c, and no swept file changed | - |

## Checks

*Proofs re-run at e1f406c, except C9's smoke (carried from cdb059c, see Smoke choice). Citations refreshed in `member.spec.ts` (lines after 372 moved +3) and `checks.md`.*

The proofs were batched as follows:
- One vitest call in a clean HEAD worktree (`/tmp/claude-1000/verify-r3`):
  `pnpm --filter @bens/server exec vitest run src/shared/config.spec.ts test/boot.spec.ts src/app.spec.ts src/modules/organizations/member.spec.ts test/schema.spec.ts src/modules/organizations/onboarding.spec.ts src/modules/organizations/invitation.spec.ts test/architecture.spec.ts --reporter=verbose`.
  It exited 0 with 8 files and 131 tests passed. Each of the 17 named tests appears as `✓`. `requires a session` matches 4 lines, and the PATCH one is among them.
- The `rg` proofs ran as `ARGV0=rg /home/artur/.local/bin/claude <args>`. Sanity checks came first: `fastify` in `pnpm-lock.yaml` returned 56 hits, and a known-negative search exited 1.
- C31's case-insensitive absence pattern was also checked against a control file containing `Erp e Comissão`, where it matched and exited 0.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | defaults object exact, no `S3_*` | vitest ✓ | `apps/server/src/shared/config.spec.ts:14` - `expect(loadConfig(required)).toEqual({...})` | PASS |
| C2 | boot passes config and exits 1 on RLS bypass | vitest ✓ | `apps/server/test/boot.spec.ts:40-43` - `rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Database role "bens" bypasses row level security') })` | PASS |
| C3 | test app `/api/health` 200 `{status:'ok'}` | vitest ✓; `rg -n "S3_" apps/server/src apps/server/test` exit 1 | `apps/server/src/app.spec.ts:75-76` - `toBe(200)`, `toEqual({ status: 'ok' })` | PASS |
| C4 | export script without `S3_*` | `rg -n "S3_" apps/server/scripts` exit 1; `pnpm --filter @bens/server openapi:export` exit 0 | `apps/server/scripts/export-openapi.ts:8` - `loadConfig({...})` without `S3_*` | PASS |
| C5 | none of the 3 deps | `rg` over package.json and the lockfile, exit 1 | `apps/server/package.json:1` - no match in the file | PASS |
| C6 | 4 files gone, no imports | `test ! -e` ×4 exit 0; `rg` for storage/pdf imports exit 1 | `apps/server/src/dependencies.ts:24-30` - `Deps` has no `storage` | PASS |
| C7 | dev compose has exactly `mailpit postgres` | awk proof exit 0; `rg -i minio docker-compose.yml` exit 1 | `docker-compose.yml:1` - the services block equals `"mailpit postgres "` | PASS |
| C8 | CI has no MinIO and no `S3_*` | `rg -n -i "minio...S3_" .github/workflows/ci.yml` exit 1 | `.github/workflows/ci.yml:108-111` - the only env lines added since base are Turnstile's; no match | PASS |
| C9 | the smoke exits 0 and loads no pdf/storage | `rg -n "infrastructure/(pdf...storage)" scripts/staging-smoke.mjs` exit 1 (re-run). `up && all` exit 0 carried from cdb059c (16 steps, 84 e2e passed); the fix diff cannot reach the image (see Smoke choice) | `scripts/staging-smoke.mjs:480` - `assert(result.status === 0, ...)`; the image's `dist/infrastructure` held only database, email, queue and realtime at cdb059c | PASS |
| C10 | `GET /members` 200, every item exactly 6 keys (OWNER and ADMIN) | vitest ✓ | `apps/server/src/modules/organizations/member.spec.ts:367` - `expect(listed.json().items[0]).toEqual({ id, userId, role: 'MANAGER', active: false, email, name: 'Membro' })`; `member.spec.ts:375-376` (OWNER, every item, new) - `expect(Object.keys(item).sort()).toEqual(['active', 'email', 'id', 'name', 'role', 'userId'])`; `member.spec.ts:383-384` (ADMIN, every item) - the same | PASS |
| C11 | list without a session: 401 | vitest ✓ | `member.spec.ts:391-392` - `toBe(401)`, `'UNAUTHENTICATED'` | PASS |
| C12 | list by MANAGER/COMMERCIAL/VIEWER: 403 | vitest ✓ | `member.spec.ts:400-401` - `toBe(403)`, `'FORBIDDEN'` | PASS |
| C13 | PATCH `{role}` 200 with 6 keys | vitest ✓ | `member.spec.ts:98` - `Object.keys(response.json()).sort()` `toEqual([...6])` | PASS |
| C14 | PATCH with a bad body: 400 | vitest ✓ | `member.spec.ts:244-245` - `toBe(400)`, `'VALIDATION_ERROR'` | PASS |
| C15 | PATCH without a session: 401 | vitest ✓ | `member.spec.ts:277-278` - `toBe(401)`, `'UNAUTHENTICATED'` | PASS |
| C16 | PATCH without `member:update`: 403 | vitest ✓ | `member.spec.ts:260-261` - `toBe(403)`, `'FORBIDDEN'` | PASS |
| C17 | PATCH on an unknown id: 404 | vitest ✓ | `member.spec.ts:302-305` - `toBe(404)`, `NOT_FOUND` body | PASS |
| C18 | PATCH on the OWNER: 422 | vitest ✓ | `member.spec.ts:222-228` - `toBe(422)`, `OWNER_IMMUTABLE` | PASS |
| C19 | `Member` has no `commissionSplitBp` and keeps 7 columns | vitest ✓ | `apps/server/test/schema.spec.ts:347` - `not.toContain('commissionSplitBp')`; `:348-358` - `arrayContaining([...7])` | PASS |
| C20 | the drop migration exists and the schema does not declare the field | `rg -F` exit 0; `rg commissionSplitBp schema.prisma` exit 1 | `apps/server/prisma/migrations/20260923220000_drop_member_commission_split/migration.sql:2` - `ALTER TABLE "Member" DROP COLUMN "commissionSplitBp";` | PASS |
| C21 | `api:generate` gives no diff and no field, with 2 operationIds | `pnpm api:generate && git diff --exit-code -- apps/server/openapi.json apps/web/src/api` exit 0; `rg commissionSplitBp` exit 1; `rg -c` printed `2` | `apps/server/src/modules/organizations/member.schema.ts:16-25` - `memberOutput`, 6 keys, `.strict()` | PASS |
| C22 | the transfer probe persists, `{transferred:2}` | vitest ✓ | `member.spec.ts:470` - `toEqual({ transferred: 2 })` | PASS |
| C23 | a throwing move gives 500, a rollback and no audit | vitest ✓ | `member.spec.ts:496` - `toBe(500)`; `:498` - `auditsOf(...)).toEqual(before)` | PASS |
| C24 | onboarding and invite create members with `active: true` | vitest ✓ ×2 | `apps/server/src/modules/organizations/onboarding.spec.ts:51`, `invitation.spec.ts:687` - `toMatchObject({ role, active: true })` | PASS |
| C25 | 8 archived docs carry the ADR-011 notice | the loop printed no failure (8 files) | `prompts/prompt-01.md:1` - archived notice citing ADR-011 | PASS |
| C26 | the 8 living files have no minio, `S3_` or commissionSplit | `rg -n -i` over the 8 files, exit 1 | `docs/runbooks/staging.md:24` - no match in the file | PASS |
| C27 | `architecture.md` is free of the storage and pdf markers | `rg` exit 1 | `docs/architecture.md:274` - replacement text | PASS |
| C28 | the four gates exit 0 | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exit 0 (clean HEAD worktree): 29 files, 272 tests | `member.spec.ts:193` - the concurrency test is in the green run | PASS |
| C29 | architecture.spec unchanged, boot.spec loses only `S3_*`, schema.spec only gains C19 | vitest ✓ (batch); architecture diff exit 0; boot filter exit 1; schema `^-` filter exit 1 | `apps/server/test/schema.spec.ts:335-359` | PASS |
| C30 | exactly the 2 listed tests disappear | `vitest list` at `e1f406c` (267 lines) against the `db84b0b` list from this session's clean base worktree (267 lines). `comm -23` gives exactly the pdf and storage tests; `comm -13` gives exactly the C11 and C19 tests. The fix adds no test name | `member.spec.ts:388` - `requires a session to list members`; `test/schema.spec.ts:337` - `Member carries no commission column` | PASS |
| C31 | landing describes lead capture, AI service and commercial follow-up; no ERP wording | case-insensitive stem absence `rg -n -i` for `\bERP\b`, `apólice`, `comiss` over `apps/web/src/routes/(public)/index.tsx` exit 1; `rg -n "Captura de leads"` exit 0; `rg -n "atendimento com IA"` exit 0; `rg -n "acompanhamento comercial"` exit 0 | `apps/web/src/routes/(public)/index.tsx:26` - "Captura de leads, atendimento com IA e acompanhamento comercial para corretoras de"; proofs at `.specs/features/erp-prune/checks.md:111-114` | PASS |

The round-2 precision notes are resolved:
- `checks.md:6` now reads "31 checks".
- C10's OWNER call asserts the keys of every item (`member.spec.ts:375-376`).
- C31's absence proof is case-insensitive and matches by stem (`comiss`, `apólice`).

## Coverage

*The row whose authority the fix touched was recomputed at e1f406c, and the C10 row was re-checked. Every other row is carried from cdb059c, because none of its sources changed in `e07801b..e1f406c`.*

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| what the landing must describe (3, authority: plan AC 17) - verified at e1f406c | `plan.md` AC 17: "captura de leads, atendimento com IA e acompanhamento comercial" | captura de leads C31 (`rg "Captura de leads"`) · atendimento com IA C31 (`rg "atendimento com IA"`) · acompanhamento comercial C31 (`rg "acompanhamento comercial"`) | - |
| ERP words the landing must not contain (3, authority: AC 17) - verified at e1f406c | AC 17: `ERP`, `apólices`, `comissões` | all 3 through C31's case-insensitive stem pattern (`\bERP\b`, `apólice`, `comiss`) | - |
| `memberOutput` keys (6), over every listed item - verified at e1f406c | `member.schema.ts:16-25` | each key: C10 (OWNER every item `:375-376`, ADMIN every item `:383-384`) and C13 | - |
| startup config without `S3_*` (4 assemblies) - carried from cdb059c | `loadConfig(` call sites plus the prod image | C2 · C3 · C4 · C9 | - |
| removed dependencies (3) - carried from cdb059c | package.json diff | C5 | - |
| removed files (4) - carried from cdb059c | base tree | C6 | - |
| MinIO start points (3) - carried from cdb059c | `git grep -il minio db84b0b` | C7 · C8 · C9/C26 | - |
| `GET /api/v1/members` statuses (3) - carried from cdb059c | plan Surface | 200 C10 · 401 C11 · 403 C12 | - |
| `PATCH /api/v1/members/:id` statuses (6) - carried from cdb059c | plan Surface | 200 C13 · 400 C14 · 401 C15 · 403 C16 · 404 C17 · 422 C18 | - |
| one-way doors (2) - carried from cdb059c | plan Landing | door 1 C19/C20 · door 2 C10/C13/C21 | - |
| `Member` writers of `commissionSplitBp` at base (3) - carried from cdb059c | `git grep` at base | C24 ×2 · C22/C23 | - |
| archived documents (8) - carried from cdb059c | `prompts/` plus 2 docs | C25 | - |
| living code/config/docs free of ERP terms (roadmap F0) - carried from cdb059c | the cdb059c sweep, with the Terms-of-Use exception at `roadmap.md:31` | C26 · C27 · C31 | - |

Level: carried. C3 and C10-C18 cross the HTTP boundary through `app.inject`. C9 runs against the
production stack. C31 is a static-copy claim with text proofs.

## Test policy rows

*Re-judged for the row that classifies the touched file. The others are carried from cdb059c.* `checks.md` has no
`## Test policy` section. Its `## Tests removed or changed` table is judged instead.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| member.spec list: exact object (verified at e1f406c) | `member.spec.ts:367` (+ `:375-376`) | an exact-object assertion without `commissionSplitBp`; the fix adds only an every-item keys loop and weakens nothing | yes - the diff adds 3 lines and removes 0 |
| storage/pdf specs removed with the files (verified at e1f406c) | `storage.spec.ts`, `pdf.spec.tsx` | only these 2 disappear (C30) | yes - re-run: `comm -23` gives exactly these 2 |
| config.spec: defaults / coercion / required | `src/shared/config.spec.ts` | only `S3_*` removed | yes (carried) |
| `S3_*` leaves the boot, signup-gates and harness env | `test/boot.spec.ts`, `signup-gates.spec.ts`, `test/app.ts` | only `S3_*` lines removed | yes - C29 filter re-run exit 1 |
| member.spec PATCH: exact keys | `member.spec.ts:98` | keys assertion | yes (carried) |
| member.spec 401 on list | `member.spec.ts:388` | new test | yes (carried) |
| transfer probe column | `member.spec.ts:460, 486` | probe on `active`, asserts kept | yes (carried) |
| onboarding/invitation `toMatchObject` | `onboarding.spec.ts:51`, `invitation.spec.ts:687` | only `commissionSplitBp: 0` removed | yes (carried) |
| schema.spec new test | `test/schema.spec.ts:335-359` | C19 test | yes (carried) |

## Faults injected

*Verified at e1f406c.* The faults ran in the scratch worktree `/tmp/claude-1000/verify-r3` (HEAD,
`pnpm install --frozen-lockfile`) and were reverted there with `git checkout`. The worktree was then
removed. The real tree's `git status --porcelain` was empty before and after, apart from this report.
The fix touched two surfaces: C31's proofs and the C10 loop. Earlier faults are carried as follows:
- The round-2 C9 smoke faults (captcha header, e2e helper, CSP) are carried from cdb059c.
- The round-1 server faults are carried from 0983bf8.

Neither set's code changed.

| Mutation | Location | Killed |
| --- | --- | --- |
| the landing drops "atendimento com IA e acompanhamento comercial" (the mutant that survived round 2) | `apps/web/src/routes/(public)/index.tsx:26` | yes - `rg "atendimento com IA"` exits 1 and `rg "acompanhamento comercial"` exits 1 (the absence proof stays 1 and `Captura de leads` stays 0) |
| `, ERP,` inserted into the landing copy | `apps/web/src/routes/(public)/index.tsx:26` | yes - C31's absence proof exits 0 (a match) |
| `gestão de Comissão` inserted (singular, capitalised; round 2's case-sensitive pattern would have missed it) | `apps/web/src/routes/(public)/index.tsx:26` | yes - C31's absence proof exits 0 |
| `listMembers` adds a `legacyFlag` key to every item but the first when the caller is OWNER (the schema is loosened to allow it) | `apps/server/src/modules/organizations/member.ts:103`, `member.schema.ts:23` | yes - `vitest run member.spec.ts -t "lists members newest first including inactive"` exited 1 at `member.spec.ts:376:40` (`+ "legacyFlag"`). Control: the same mutant against the round-2 test (lines 375-377 removed) exited 0, so only the strengthened assertion catches it |

## Gate

Verified at e1f406c.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (clean HEAD worktree): exit 0, 29 files, 272 passed, 0 failed.
- `node scripts/staging-smoke.mjs up && node scripts/staging-smoke.mjs all`: carried from cdb059c (exit 0, 84 e2e passed). It was not re-run because the fix diff cannot change the image.

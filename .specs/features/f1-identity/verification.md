# F1 identity verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: c858eb6..5989e9f (fix under review: e89952f..5989e9f)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier). I did not build this feature. I ran every server proof, the shell proofs and the gate myself at `5989e9f`. I injected faults only in a scratch worktree. I changed no product, test or spec file. This report is the only file I wrote.

## Summary

- **Round 1 gaps**: all 5 are closed (see the table below). The C10 proofs are stable: each ran 6 times on its own, with 5 races per run, and all 12 runs were green. Removing `FOR UPDATE` makes both proofs fail in 5 of 5 runs.
- **Checks**: 50 of 50 PASS at `5989e9f`. The server proofs ran in one invocation: 56 passed and 0 failed, and every proof name appears in the output. The e2e proofs (C13, C14, C21, C39–C42) are carried from `3924f68`, because `git diff --stat 3924f68..HEAD -- apps/web docs` is empty.
- **Coverage**: I recomputed the rows the fix touched. One new set has unproven members: the new branding and logo bodies reject unknown keys (`.strict()`), and no proof covers that.
- **Faults**: I injected 9 faults this round. 7 were killed and **2 survived**: removing `.strict()` from `updateBrandingInput` (`apps/server/src/modules/organizations/branding.schema.ts:15`) and from `uploadLogoInput` (`branding.schema.ts:25`). All 20 tests in `branding.spec.ts` pass under each mutant.
- **Gate**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exits 0, with 31 files and 307 tests passed. `pnpm api:generate` leaves no diff.

### Ranked gaps

1. **No test covers the unknown-key rejection on the two new request bodies.** Removing `.strict()` at `branding.schema.ts:15` (the `PATCH /api/v1/organization/branding` body) or at `branding.schema.ts:25` (the `PUT /api/v1/organization/logo` body) leaves `branding.spec.ts` at 20 of 20 passing. Without it, `{ greeting: 'Oi', extra: true }` gets `200` with the key silently dropped, where it now gets `400 VALIDATION_ERROR`. The Test policy row "Entry point that decides nothing" requires "each rejected input". Plan door 4 (`plan.md:60`) names "schema Zod `.strict()` em toda rota" as a reason for the upload format. The repo already has the pattern: `member.spec.ts:398` sends `{ role: 'COMMERCIAL', extra: true }` and asserts `400` at `:402-403`. Round 1 missed this too; I found it while re-judging that unmet row. Fix: add an unknown-key body to C51, or a new check, for both routes.

Minor observations (they do not change the verdict):
- Two new Coverage rows in `checks.md:199-200` ("saudação e corpo inválidos", "isolamento das escritas novas") have 2 cells and no `Unproven` cell.
- The API proof for C10 accepts `403` for the loser. In a round where the loser gets `403`, that proof does not exercise the guard at HTTP. The use-case proof covers the guard every round, and it fails without the lock, so C10 holds as the user decided it.

### Round 1 gaps: status at `5989e9f`

| Round 1 gap | Change in the fix | Status |
| --- | --- | --- |
| 1. C10 flaky (`[200, 403]`) | the API proof accepts `422 LAST_ADMIN` or `403 FORBIDDEN` for the loser, and requires exactly one `200` and one active ADMIN (`member.spec.ts:331-341`). A new use-case proof requires exactly one fulfilled call and one `{ status: 422, code: 'LAST_ADMIN' }` (`member.spec.ts:365-377`) | closed. Each proof ran alone 6 times: 12 of 12 green, 60 races in total. Without `FOR UPDATE`, both fail in 5 of 5 runs |
| 2. `AND active` mutant survived | new C50 (`member.spec.ts:302-315`) | closed. The mutant is killed at `member.spec.ts:311` (`expected 200 to be 422`) |
| 3. `min(1)` and `refine` unproven | new C51 (`branding.spec.ts:162-174`) | closed. `min(1)` is killed at `:169` and `refine` at `:171` |
| 4. phantom `422` on POST invitations | removed from the plan's Surface (`plan.md:51`), from C47 and from the Coverage row | closed. The Surface now matches `invitation.ts:56-120`, which returns 200, 400, 401, 403 and 409 |
| 5. no `withTwoTenants` on the new writes | new C52 (`branding.spec.ts:373-415`) | closed. Killed by a test-setup fault and by a product fault (see Faults) |
| minor: stale comment | `public-chat-key.ts:4` no longer mentions the backfill | closed |
| minor: writes load `bytea` | `select: { id: true }` added at `branding.ts:71` and `:93` | closed for `branding.ts`. `onboarding.ts` `create` is unchanged, but a new organization has no logo, so it loads no bytes |

## Round 1 (history, `c858eb6..3924f68`, FAIL)

45 of 47 checks passed. C10 failed: its proof was red in 5 of 6 filtered runs, because `[200, 403]` is a legitimate result. C47 was partial: it claimed a `422` that the invitations route never had. Three mutants survived: `AND active` in the guard, `.min(1)` on the greeting, and the empty-body `.refine`. The three new write routes had no `withTwoTenants` test. The migration squash audit found nothing lost. The gate was green, with 303 tests. The full round 1 report is at commit `e89952f`.

## Binding sources

Carried from `3924f68`. The fix touched the interface only in the plan's `Surface` row for `POST /api/v1/invitations`, where it removed `422`. That now agrees with the code and with `openapi.json`. No binding source names a `422` on that route, so nothing new contradicts a source.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-016-roles-portfolio-assignment.md` | yes (round 1, and again this round for "≥ 1 ADMIN ativo") | none | - (the inactive-ADMIN row is now covered by C50) |
| `docs/decisions/ADR-014-public-channel-identity-consent.md` | yes (round 1) | none | - |
| `docs/handoff.md` §7, §11, §12, §36 | yes (round 1) | none | - |
| `docs/architecture-analysis.md` §10.4 | yes (round 1) | none | - |

## Checks

Server proofs, verified at `5989e9f`, in one invocation from `apps/server`: `pnpm exec vitest run <8 files> -t "<55 names, alternated>" --reporter=verbose`. It exits 0 with 56 passed and 84 skipped. Each of the 55 proof names appears with a ✓. The 56th pass is "requires a session and an active organization", which the "requires a session" pattern also matches. Shell proofs C43, C44, C45 and C48 were re-run verbatim and exit 0. E2E proofs are carried from `3924f68`, because nothing in `apps/web` has changed since then. Citations are refreshed for `member.spec.ts` and `branding.spec.ts`; other files are unchanged since round 1.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | 3 roles × permissions | ✓ at 5989e9f | `apps/server/src/shared/permissions.spec.ts:6` - `expect(ROLE_PERMISSIONS).toEqual({...})` | PASS |
| C2 | enum Role, no `Member_one_owner` | ✓ at 5989e9f | `apps/server/test/schema.spec.ts:376` `toEqual(['ADMIN', 'MANAGER', 'COMMERCIAL'])`; `:389` `not.toContain('Member_one_owner')` | PASS |
| C3 | member role OWNER/VIEWER → 400 | ✓ at 5989e9f | `apps/server/src/modules/organizations/member.spec.ts:222` `toBe(400)`; `:225` role `'COMMERCIAL'` | PASS |
| C4 | invitation role OWNER/VIEWER → 400 | ✓ at 5989e9f | `apps/server/src/modules/organizations/invitation.spec.ts:183` `toBe(400)`; `:187` `toEqual([])` | PASS |
| C6 | demote only active ADMIN → 422 LAST_ADMIN | ✓ at 5989e9f | `member.spec.ts:237-243` `toBe(422)`, `toEqual({ error: { code: 'LAST_ADMIN', message: 'A corretora precisa de pelo menos um administrador ativo.' } })`; `:248` trail `toEqual(before)` | PASS |
| C7 | deactivate only active ADMIN → 422 | ✓ at 5989e9f | `member.spec.ts:259-260` `toBe(422)`, `'LAST_ADMIN'`; `:265` trail `toEqual(before)` | PASS |
| C8 | demote with another active ADMIN → 200 | ✓ at 5989e9f | `member.spec.ts:276` `toBe(200)`; `:281` `changes).toEqual({ role: ['ADMIN', 'COMMERCIAL'] })` | PASS |
| C9 | guard only for the last active ADMIN | ✓ at 5989e9f | `member.spec.ts:296` `demoted.statusCode).toBe(200)`; `:298` `deactivated.statusCode).toBe(200)` | PASS |
| C10 | two racing demotions leave one active ADMIN; API: one 200 and a 422/403 loser; use case: one success and one LAST_ADMIN; 5 rounds | ✓ at 5989e9f, and each proof 6 × on its own (12 of 12 green) | `member.spec.ts:331-334` `codes.filter((code) => code === 200)).toHaveLength(1)`; `:336-337` `[422, 403]).toContain(loser?.statusCode)`, code `LAST_ADMIN`/`FORBIDDEN`; `:341` `admins).toBe(1)`; `:365-368` `filter(fulfilled)).toHaveLength(1)`; `:370-373` `toMatchObject({ status: 422, code: 'LAST_ADMIN' })`; `:377` `admins).toBe(1)` | PASS |
| C11 | self-demotion → 200; `/me` MANAGER | ✓ at 5989e9f | `member.spec.ts:390` `toBe(200)`; `:392` `toMatchObject({ role: 'MANAGER', permissions: ['organization:read'] })` | PASS |
| C12 | other tenant → 404; 401/403/404 | ✓ at 5989e9f | `member.spec.ts:503-504` `toBe(404)`, foreign role `'COMMERCIAL'` (`withTwoTenants` `:496`); `:435` `toBe(401)`; `:418-419` `403` `FORBIDDEN`; `:460-461` `404` | PASS |
| C13 | selectors offer exactly the 3 roles | carried from 3924f68 (e2e ✓) | `apps/web/e2e/org-web.spec.ts:480-481` options `toHaveText(expected)` | PASS |
| C14 | last-admin message in the UI | carried from 3924f68 (e2e ✓) | `apps/web/e2e/org-web.spec.ts:466` message visible; `:469` `toHaveValue('ADMIN')` | PASS |
| C15 | onboarding: ADMIN and key | ✓ at 5989e9f | `apps/server/src/modules/organizations/onboarding.spec.ts:64-67` `toBe(200)`, `toMatch(/^[0-9a-f]{32}$/)`; `:76-77` | PASS |
| C16 | `organization.create` audit | ✓ at 5989e9f | `onboarding.spec.ts:109` `changes).toEqual({ role: 'ADMIN' })` | PASS |
| C17 | distinct keys; unique; not null | ✓ at 5989e9f | `onboarding.spec.ts:91` `size).toBe(3)`; `apps/server/test/schema.spec.ts:414` `23505`; `:428` `23502` | PASS |
| C19 | GET organization for all roles; no tenant B key | ✓ at 5989e9f | `apps/server/src/modules/organizations/organization.spec.ts:92-101` `toEqual({ …, publicChatKey, … })`; `:222-224` `not.toContain(keys[1]?.publicChatKey)` | PASS |
| C20 | no `logo` key | ✓ at 5989e9f | `organization.spec.ts:247` `not.toContain('logo')` | PASS |
| C21 | link shown and copied | carried from 3924f68 (e2e ✓) | `apps/web/e2e/org-web.spec.ts:292` `toHaveText(expected)`; `:296` `toBe(expected)` | PASS |
| C22 | PATCH branding saves both | ✓ at 5989e9f | `apps/server/src/modules/organizations/branding.spec.ts:92-93` `toBe(200)`, `toEqual({ brandColor: '#1a2b3c', greeting: … })`; `:97` GET `toMatchObject` | PASS |
| C23 | audit `['', value]` | ✓ at 5989e9f | `branding.spec.ts:114` `changes).toEqual({ brandColor: ['', '#1a2b3c'], greeting: ['', 'Bem-vindo'] })` | PASS |
| C24 | uppercase lowered | ✓ at 5989e9f | `branding.spec.ts:128-129` `toBe('#1a2b3c')` | PASS |
| C25 | 5 invalid colors → 400 | ✓ at 5989e9f | `branding.spec.ts:138` `toBe(400)`; `:142` `toBe('#000000')` | PASS |
| C26 | 500 accepted, 501 → 400 | ✓ at 5989e9f | `branding.spec.ts:156-159` | PASS |
| C27 | null clears one field | ✓ at 5989e9f | `branding.spec.ts:187` `toMatchObject({ brandColor: null, greeting: 'Oi' })`; `:193` both null | PASS |
| C28 | MANAGER/COMMERCIAL × 3 writes → 403 | ✓ at 5989e9f | `branding.spec.ts:213-214` `toBe(403)`, `FORBIDDEN`; `:218` `toEqual(before)` | PASS |
| C29 | magic-byte table | ✓ at 5989e9f | `apps/server/src/modules/organizations/logo.spec.ts:26` `detectImageType(...)).toBe(expected)` | PASS |
| C30 | PNG/JPEG/WebP stored and served | ✓ at 5989e9f | `branding.spec.ts:235` `toBe(200)`; `:240` content-type `toBe(type)`; `:241` `Buffer.compare(...)).toBe(0)` | PASS |
| C31 | audit booleans, no base64 | ✓ at 5989e9f | `branding.spec.ts:253` `toEqual({ logo: [false, true] })`; `:255-256` `not.toContain(encoded.slice(...))` | PASS |
| C32 | 204800 ok; 204801 → 422 | ✓ at 5989e9f | `branding.spec.ts:265` `200`; `:271-272` `422`, `LOGO_TOO_LARGE`; `:274` previous bytes kept | PASS |
| C33 | SVG/text → 422 unsupported | ✓ at 5989e9f | `branding.spec.ts:297-298` `422`, `error).toEqual({ code: 'LOGO_UNSUPPORTED_TYPE', … })`; `:304` logo null | PASS |
| C34 | non-base64 → 400 | ✓ at 5989e9f | `branding.spec.ts:314-316` `400`, `VALIDATION_ERROR`, `toBeNull()` | PASS |
| C35 | ETag and 304 | ✓ at 5989e9f | `branding.spec.ts:331-335` `200`, `private, no-cache`, `304`, `length).toBe(0)` | PASS |
| C36 | no logo → 404; other tenant logo never served | ✓ at 5989e9f | `branding.spec.ts:343-344` `404 NOT_FOUND`; `:370` `toBe(404)` (`withTwoTenants` `:351`) | PASS |
| C37 | DELETE → 204, then 404, `logoUpdatedAt` null | ✓ at 5989e9f | `branding.spec.ts:427-430` `204`, empty, `404`, `toBeNull()` | PASS |
| C38 | 4 routes: 401 and 403 NO_ACTIVE_ORGANIZATION | ✓ at 5989e9f | `branding.spec.ts:458` `toBe(401)`; `:460-461` `403`, `NO_ACTIVE_ORGANIZATION` | PASS |
| C39 | upload and remove preview | carried from 3924f68 (e2e ✓) | `apps/web/e2e/branding.spec.ts:36` `toHaveAttribute('src', /^\/api\/v1\/organization\/logo\?v=/)` | PASS |
| C40 | SVG error shown | carried from 3924f68 (e2e ✓) | `apps/web/e2e/branding.spec.ts:57` message visible | PASS |
| C41 | save notice; values persist | carried from 3924f68 (e2e ✓) | `apps/web/e2e/branding.spec.ts:72`; `:74-75` `toHaveValue('#1a2b3c')` | PASS |
| C42 | COMMERCIAL read-only | carried from 3924f68 (e2e ✓) | `apps/web/e2e/branding.spec.ts:92-101` texts visible, 5 × `toHaveCount(0)` | PASS |
| C43 | architecture.md markers | shell exit 0 at 5989e9f | `docs/architecture.md` - the 4 greps in `checks.md:149` | PASS |
| C44 | roadmap F2, not F1 | shell exit 0 at 5989e9f | `docs/roadmap.md` - awk and grep in `checks.md:152` | PASS |
| C45 | no OWNER/VIEWER in non-test code | shell exit 0 at 5989e9f | the grep in `checks.md:155` finds nothing | PASS |
| C46 | gate green; api:generate no diff | exit 0 at 5989e9f | 31 files and 307 tests passed; web build OK; `git diff --exit-code apps/web/src/api apps/server/openapi.json` exit 0 | PASS |
| C47 | unchanged statuses (invitations: 200, 401, 403, 409) | ✓ at 5989e9f (9 names) | `onboarding.spec.ts:213` 401, `:169-170` 422; `organization.spec.ts:114` 401, `:55-58` 403; `invitation.spec.ts:119` 200, `:228` 401, `:198` 403, `:261` 409, `:281` 409 | PASS |
| C48 | single init migration, RLS on 5 tables | shell exit 0; ✓ at 5989e9f | `apps/server/test/schema.spec.ts:199` `unprotected).toEqual([])`; `apps/server/prisma/migrations/20260924120000_init/migration.sql:294` | PASS |
| C49 | body above 400 KB → 413 | ✓ at 5989e9f | `branding.spec.ts:284-285` `toBe(413)`, logo `toBeNull()` | PASS |
| C50 | active + inactive ADMIN; demote the active → 422, unchanged, no audit | ✓ at 5989e9f | `member.spec.ts:311-312` `toBe(422)`, `'LAST_ADMIN'`; `:313` role `'ADMIN'`; `:314` trail `toEqual(before)` (inactive ADMIN seeded at `:304`) | PASS |
| C51 | blank greeting and `{}` → 400, greeting unchanged | ✓ at 5989e9f | `branding.spec.ts:169-170` `blank.statusCode).toBe(400)`, `VALIDATION_ERROR`; `:171-172` `empty.statusCode).toBe(400)`, `VALIDATION_ERROR`; `:173` `toBe('Oi')` | PASS |
| C52 | tenant B's writes leave tenant A intact | ✓ at 5989e9f | `branding.spec.ts:407` `toEqual([200, 200, 204])`; `:408-412` B `toMatchObject({ brandColor: '#bbbbbb', greeting: 'Organização B', logo: null })`; `:413` `stored(tenantA…)).toEqual(beforeA)`; `:414` `audits(tenantA…)).toEqual([])` (`withTwoTenants` `:377`) | PASS |

## Coverage

Verified at `5989e9f` for the rows the fix touched, recomputed from `member.ts:73-78`, `branding.schema.ts:3-25`, `branding.ts` and `invitation.ts:56-120`. The other rows are carried from `3924f68`, where they had no unproven member.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| last-admin guard decision rows (6) | `member.ts:73-78` + ADR-016 | only active, demote -> C6 · only active, deactivate -> C7 · another active -> C8 · target inactive or not ADMIN -> C9 · race -> C10 (two proofs, both stable, both killed without the lock) · inactive ADMINs do not count -> C50 | - |
| greeting edges (2) + blank (1) | `branding.schema.ts:8` | 500, 501 -> C26 · whitespace-only -> C51 | - |
| branding body shape (2) | `branding.schema.ts:10-16` | `{}` -> C51 (refine) · unknown key (`.strict()`, `:15`) -> **no proof** (mutant survived) | unknown key on the branding body |
| logo body shape (2) | `branding.schema.ts:25` | not base64 -> C34 · unknown key (`.strict()`) -> **no proof** (mutant survived) | unknown key on the logo body |
| new writes × tenant (3) | `branding.ts:24,63,84` (`withTenant`) | PATCH branding, PUT logo, DELETE logo -> C52 | - |
| POST invitations statuses (5) | `invitation.ts:56-120`, `openapi.json` | 200, 401, 403, 409 -> C47 · 400 -> C4 | - |
| PATCH member statuses (6) | route + `member.ts` | 200 C8 · 400 C3 · 401 C12 · 403 C12 · 404 C12 · 422 C6, C7, C50 | - |
| doors (5) | plan Landing | 1 -> C2, C48 · 2 -> C15, C17 · 3 -> C19, C20 · 4 -> C29, C32, C33, C49 · 5 -> C6, C7, C9, C10, C50 | - |
| other rows (roles, logo types, logo edges, colors, role × write, screen states, onboarding, GET organization, PATCH branding, PUT, DELETE and GET logo statuses) | carried from 3924f68 | see the round 1 report at `e89952f` | - |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary (magic bytes) | `logo.ts` | own layer C29 · boundary C30, C33 | yes (carried from 3924f68, `logo.ts` untouched) |
| Decides, proven at the boundary (last-admin guard) | `member.ts:73-78` | one boundary case per row: C6, C7, C8, C9, C10, C50 | yes - every row has a case, and C10 also has a use-case proof. Faults on `FOR UPDATE` and `AND active` are killed |
| Entry point that decides nothing (branding and logo bodies) | `branding.schema.ts` | accepted input and each rejected input | not met - blank greeting and `{}` are now proven (C51), but the unknown-key rejection on both bodies has no proof. Both `.strict()` mutants survive |
| Instrumentation (GET organization select) | `organization.ts:10-27` | covered by its consumer | yes (carried from 3924f68) |

The Swept rows are carried from `3924f68`. The fix touched none of the code they cite.

## Faults injected

Verified at `5989e9f`. All faults ran in a scratch worktree (`git worktree add --detach <scratchpad>/wt HEAD`, with `pnpm install --offline`). I made one worktree, removed it, and later made a second for the `.strict()` faults and removed that too. The real tree's `git status --porcelain` was empty before and after each worktree. I did not use `git stash`. I ran more faults than the cap of 5, because the brief named specific surfaces and the Entry-point row needed re-judging. Round 1's 29 killed faults are carried from `3924f68`: the fix left those surfaces unchanged, apart from the two new tests.

| Mutation | Location | Killed |
| --- | --- | --- |
| remove `FOR UPDATE` from the admin lock | `apps/server/src/modules/organizations/member.ts:77` | yes - API proof 5 of 5 runs (`round 1: expected [ 200, 200 ] to have a length of 1 but got 2`, `member.spec.ts:331`); use-case proof 5 of 5 runs (two fulfilled, `member.spec.ts:365`) |
| drop `AND active` (count inactive ADMINs) | `member.ts:77` | yes - C50 at `member.spec.ts:311` (`expected 200 to be 422`); 38 others pass |
| drop `.min(1)` on greeting | `branding.schema.ts:8` | yes - C51 at `branding.spec.ts:169` (`expected 200 to be 400`) |
| drop the empty-body `.refine` | `branding.schema.ts:16` | yes - C51 at `branding.spec.ts:171` (`expected 200 to be 400`) |
| C52 test setup: user is also ADMIN of A, session active on A, B assertions removed | `branding.spec.ts:391-412` (scratch only) | yes - `branding.spec.ts:408` (was `:413`): `expected { brandColor: '#bbbbbb', … } to deeply equal { brandColor: '#aaaaaa', … }`. The tenant-A assertions catch a write that lands in A |
| `uploadLogo` writes outside the tenant (`withTenant(ctx, …)` -> `withoutTenant(…)`) | `branding.ts:63` | yes - C52 at `branding.spec.ts:407` (`expected [ 200, 500, 204 ] to deeply equal [ 200, 200, 204 ]`) |
| drop `.strict()` on `updateBrandingInput` | `branding.schema.ts:15` | **no - survived**, `branding.spec.ts` 20 of 20 |
| drop `.strict()` on `uploadLogoInput` | `branding.schema.ts:25` | **no - survived**, `branding.spec.ts` 20 of 20 |

About C52: under RLS, a product change inside `withTenant` cannot write into another tenant, so no product mutant can make tenant A change. I proved the two halves separately. The test-setup fault shows that the A-side assertions (`:413-414` at HEAD) fail when a write reaches A. The `withoutTenant` fault shows that the proof needs the tenant-scoped write path.

The `select: { id: true }` added at `branding.ts:71` and `:93` does not change behaviour. C30 and C37 still pass, and no fault applies.

## Gate

Verified at `5989e9f`. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exits 0: 31 files and 307 tests passed, 0 failed, and the web build succeeded. `pnpm api:generate && git diff --exit-code apps/web/src/api apps/server/openapi.json` exits 0. There are 4 more tests than in round 1: C50, C51, C52 and the C10 use-case proof.

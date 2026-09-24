# F1 identity verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: c858eb6..c2df916 (fix under review: 0027cb6..c2df916)
**Round**: 3 - scoped
**Verifier**: independent sub-agent (author != verifier). I did not build this feature. At `c2df916` I ran every server proof, the shell proofs, the gate and `pnpm api:generate` myself. I injected faults only in scratch worktrees. I changed no product, test or spec file. I wrote this report and the lessons store (`.specs/lessons.json`, `.specs/LESSONS.md`) and nothing else.

## Summary

- **Round 2 gap: closed.** New check C53 (`checks.md:173-174`, Coverage row `:204`) is proven by `branding.spec.ts:176-194` "rejects unknown fields in the branding and logo bodies". Removing `.strict()` from `updateBrandingInput` (`apps/server/src/modules/organizations/branding.schema.ts:15`) makes the test fail. Removing it from `uploadLogoInput` (`branding.schema.ts:25`) also makes it fail. Both fail at `branding.spec.ts:190` with `expected 200 to be 400`.
- **Checks**: all 51 PASS at `c2df916`. I ran the server proofs in one invocation: 57 passed, 0 failed, and each of the 56 proof names shows up with a ✓. The e2e proofs (C13, C14, C21, C39–C42) are carried from `3924f68`, because `git diff --stat 3924f68..HEAD -- apps/web docs` is empty.
- **Coverage**: every row in `checks.md` has members and an `Unproven` cell. The two rows that round 2 flagged now have 3 cells. I recomputed the new row "corpos `.strict()` novos (2)" from the code, and both members are proven.
- **Other request schemas**: the feature adds no other body or param schema. Of the body schemas it edited, `createInvitationInput` and `updateMemberInput` already have unknown-key proofs, and I made each of those proofs fail by removing `.strict()`. The two new routes without a body (`DELETE` and `GET /api/v1/organization/logo`) take no body, params or query schema.
- **Faults**: I injected 4 faults this round and all 4 were killed.
- **Gate**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exits 0, with 31 files and 308 tests passed. That is one more test than round 2, which is C53. `pnpm api:generate` leaves no diff.

Minor observations (they do not change the verdict):
- In `checks.md`, the `PATCH /api/v1/organization/branding` statuses row lists `400` only under C25, and the `PATCH /api/v1/members/:id` row lists `422` without C50. Both members are proven anyway: the 400 by C51 and C53 as well, and the 422 by C6 and C7.
- The round 2 note about C10 still applies. The API proof accepts `403` for the loser. The use-case proof (`member.spec.ts:365-377`) covers the guard every round.

## History

**Round 1** (`c858eb6..3924f68`, FAIL, report at `e89952f`): 45 of 47 checks passed. C10 was flaky, because `[200, 403]` is a legitimate result. C47 claimed a `422` that the invitations route never returned. Three mutants survived: `AND active` in the last-admin guard, `.min(1)` on the greeting, and the empty-body `.refine`. The new write routes had no `withTwoTenants` test. The gate passed with 303 tests.

**Round 2** (`e89952f..5989e9f`, FAIL, report at `0027cb6`): all 5 round 1 gaps were closed by C50, C51, C52, the second C10 proof, and the C47 and `Surface` fix. 50 of 50 checks passed. Two mutants survived: removing `.strict()` from `updateBrandingInput` (`branding.schema.ts:15`) and from `uploadLogoInput` (`branding.schema.ts:25`). Two Coverage rows had no `Unproven` cell. The gate passed with 307 tests.

## Binding sources

Carried from `3924f68` and `5989e9f`. The fix does not touch the interface. It adds one test and changes only `checks.md` rows, so step 1 is not re-run.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-016-roles-portfolio-assignment.md` | yes (rounds 1 and 2) | none | - |
| `docs/decisions/ADR-014-public-channel-identity-consent.md` | yes (round 1) | none | - |
| `docs/handoff.md` §7, §11, §12, §36 | yes (round 1) | none | - |
| `docs/architecture-analysis.md` §10.4 | yes (round 1) | none | - |

## Checks

Server proofs, verified at `c2df916`, run in one invocation from `apps/server`: `pnpm exec vitest run <8 files> -t "<56 names, regex-escaped and alternated>" --reporter=verbose`. It exits 0 with 57 passed and 84 skipped. A script checked that each of the 56 names appears on a ✓ line. The 57th pass is "requires a session and an active organization", which the "requires a session" pattern also matches. I re-ran shell proofs C43, C44, C45 and C48 verbatim, and each exits 0. The e2e proofs are carried from `3924f68`. The fix inserted 20 lines at `branding.spec.ts:176`, so I moved every `branding.spec.ts` citation at or after that line down by 20 and re-read each one. No other file changed.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | 3 roles × permissions | ✓ at c2df916 | `apps/server/src/shared/permissions.spec.ts:6` - `expect(ROLE_PERMISSIONS).toEqual({...})` | PASS |
| C2 | enum Role, no `Member_one_owner` | ✓ at c2df916 | `apps/server/test/schema.spec.ts:376` `toEqual(['ADMIN', 'MANAGER', 'COMMERCIAL'])`; `:389` `not.toContain('Member_one_owner')` | PASS |
| C3 | member role OWNER/VIEWER → 400 | ✓ at c2df916 | `apps/server/src/modules/organizations/member.spec.ts:222` `toBe(400)`; `:225` role `'COMMERCIAL'` | PASS |
| C4 | invitation role OWNER/VIEWER → 400 | ✓ at c2df916 | `apps/server/src/modules/organizations/invitation.spec.ts:183` `toBe(400)`; `:187` `toEqual([])` | PASS |
| C6 | demote only active ADMIN → 422 LAST_ADMIN | ✓ at c2df916 | `member.spec.ts:237-243` `toBe(422)`, `toEqual({ error: { code: 'LAST_ADMIN', … } })`; `:248` trail `toEqual(before)` | PASS |
| C7 | deactivate only active ADMIN → 422 | ✓ at c2df916 | `member.spec.ts:259-260` `toBe(422)`, `'LAST_ADMIN'`; `:265` trail `toEqual(before)` | PASS |
| C8 | demote with another active ADMIN → 200 | ✓ at c2df916 | `member.spec.ts:276` `toBe(200)`; `:281` `changes).toEqual({ role: ['ADMIN', 'COMMERCIAL'] })` | PASS |
| C9 | guard only for the last active ADMIN | ✓ at c2df916 | `member.spec.ts:296` `demoted.statusCode).toBe(200)`; `:298` `deactivated.statusCode).toBe(200)` | PASS |
| C10 | two racing demotions leave one active ADMIN | ✓ at c2df916 (both proofs) | `member.spec.ts:331-334` one `200`; `:336-337` loser `[422, 403]`; `:341` `admins).toBe(1)`; `:365-368` one fulfilled; `:370-373` `toMatchObject({ status: 422, code: 'LAST_ADMIN' })`; `:377` `admins).toBe(1)` | PASS |
| C11 | self-demotion → 200; `/me` MANAGER | ✓ at c2df916 | `member.spec.ts:390` `toBe(200)`; `:392` `toMatchObject({ role: 'MANAGER', permissions: ['organization:read'] })` | PASS |
| C12 | other tenant → 404; 401/403/404 | ✓ at c2df916 | `member.spec.ts:503-504` `toBe(404)`, foreign role `'COMMERCIAL'` (`withTwoTenants` `:496`); `:435` `401`; `:418-419` `403 FORBIDDEN`; `:460-461` `404` | PASS |
| C13 | selectors offer exactly the 3 roles | carried from 3924f68 (e2e ✓) | `apps/web/e2e/org-web.spec.ts:480-481` options `toHaveText(expected)` | PASS |
| C14 | last-admin message in the UI | carried from 3924f68 (e2e ✓) | `apps/web/e2e/org-web.spec.ts:466` message visible; `:469` `toHaveValue('ADMIN')` | PASS |
| C15 | onboarding: ADMIN and key | ✓ at c2df916 | `apps/server/src/modules/organizations/onboarding.spec.ts:64-67` `toBe(200)`, `toMatch(/^[0-9a-f]{32}$/)`; `:76-77` | PASS |
| C16 | `organization.create` audit | ✓ at c2df916 | `onboarding.spec.ts:109` `changes).toEqual({ role: 'ADMIN' })` | PASS |
| C17 | distinct keys; unique; not null | ✓ at c2df916 | `onboarding.spec.ts:91` `size).toBe(3)`; `apps/server/test/schema.spec.ts:414` `23505`; `:428` `23502` | PASS |
| C19 | GET organization for all roles; no tenant B key | ✓ at c2df916 | `apps/server/src/modules/organizations/organization.spec.ts:92-101` `toEqual({ …, publicChatKey, … })`; `:222-224` `not.toContain(keys[1]?.publicChatKey)` | PASS |
| C20 | no `logo` key | ✓ at c2df916 | `organization.spec.ts:247` `not.toContain('logo')` | PASS |
| C21 | link shown and copied | carried from 3924f68 (e2e ✓) | `apps/web/e2e/org-web.spec.ts:292` `toHaveText(expected)`; `:296` `toBe(expected)` | PASS |
| C22 | PATCH branding saves both | ✓ at c2df916 | `apps/server/src/modules/organizations/branding.spec.ts:92-93` `toBe(200)`, `toEqual({ brandColor: '#1a2b3c', greeting: … })`; `:97` GET `toMatchObject` | PASS |
| C23 | audit `['', value]` | ✓ at c2df916 | `branding.spec.ts:114` `changes).toEqual({ brandColor: ['', '#1a2b3c'], greeting: ['', 'Bem-vindo'] })` | PASS |
| C24 | uppercase lowered | ✓ at c2df916 | `branding.spec.ts:128-129` `toBe('#1a2b3c')` | PASS |
| C25 | 5 invalid colors → 400 | ✓ at c2df916 | `branding.spec.ts:138` `toBe(400)`; `:142` `toBe('#000000')` | PASS |
| C26 | 500 accepted, 501 → 400 | ✓ at c2df916 | `branding.spec.ts:156-159` | PASS |
| C27 | null clears one field | ✓ at c2df916 | `branding.spec.ts:207` `toMatchObject({ brandColor: null, greeting: 'Oi' })`; `:213` both null | PASS |
| C28 | MANAGER/COMMERCIAL × 3 writes → 403 | ✓ at c2df916 | `branding.spec.ts:233-234` `toBe(403)`, `FORBIDDEN`; `:238` `toEqual(before)` | PASS |
| C29 | magic-byte table | ✓ at c2df916 | `apps/server/src/modules/organizations/logo.spec.ts:26` `detectImageType(...)).toBe(expected)` | PASS |
| C30 | PNG/JPEG/WebP stored and served | ✓ at c2df916 | `branding.spec.ts:255` `toBe(200)`; `:260` content-type `toBe(type)`; `:261` `Buffer.compare(...)).toBe(0)` | PASS |
| C31 | audit booleans, no base64 | ✓ at c2df916 | `branding.spec.ts:273` `toEqual({ logo: [false, true] })`; `:275-276` `not.toContain(encoded.slice(...))` | PASS |
| C32 | 204800 ok; 204801 → 422 | ✓ at c2df916 | `branding.spec.ts:285` `200`; `:291-292` `422`, `LOGO_TOO_LARGE`; `:294` previous bytes kept | PASS |
| C33 | SVG/text → 422 unsupported | ✓ at c2df916 | `branding.spec.ts:317-318` `422`, `LOGO_UNSUPPORTED_TYPE`; `:324` `toMatchObject({ logo: null, logoMimeType: null })` | PASS |
| C34 | non-base64 → 400 | ✓ at c2df916 | `branding.spec.ts:334-336` `400`, `VALIDATION_ERROR`, `toBeNull()` | PASS |
| C35 | ETag and 304 | ✓ at c2df916 | `branding.spec.ts:351-355` `200`, `private, no-cache`, `304`, `rawPayload.length).toBe(0)` | PASS |
| C36 | no logo → 404; other tenant logo never served | ✓ at c2df916 | `branding.spec.ts:363-364` `404 NOT_FOUND`; `:390` `toBe(404)` (`withTwoTenants` `:371`) | PASS |
| C37 | DELETE → 204, then 404, `logoUpdatedAt` null | ✓ at c2df916 | `branding.spec.ts:447-450` `204`, empty, `404`, `logoUpdatedAt).toBeNull()` | PASS |
| C38 | 4 routes: 401 and 403 NO_ACTIVE_ORGANIZATION | ✓ at c2df916 | `branding.spec.ts:478` `toBe(401)`; `:480-481` `403`, `NO_ACTIVE_ORGANIZATION` | PASS |
| C39 | upload and remove preview | carried from 3924f68 (e2e ✓) | `apps/web/e2e/branding.spec.ts:36` `toHaveAttribute('src', /^\/api\/v1\/organization\/logo\?v=/)` | PASS |
| C40 | SVG error shown | carried from 3924f68 (e2e ✓) | `apps/web/e2e/branding.spec.ts:57` message visible | PASS |
| C41 | save notice; values persist | carried from 3924f68 (e2e ✓) | `apps/web/e2e/branding.spec.ts:72`; `:74-75` `toHaveValue('#1a2b3c')` | PASS |
| C42 | COMMERCIAL read-only | carried from 3924f68 (e2e ✓) | `apps/web/e2e/branding.spec.ts:92-101` texts visible, 5 × `toHaveCount(0)` | PASS |
| C43 | architecture.md markers | shell exit 0 at c2df916 | `docs/architecture.md` - the 4 greps in `checks.md:149` | PASS |
| C44 | roadmap F2, not F1 | shell exit 0 at c2df916 | `docs/roadmap.md` - awk and grep in `checks.md:152` | PASS |
| C45 | no OWNER/VIEWER in non-test code | shell exit 0 at c2df916 | the grep in `checks.md:155` finds nothing | PASS |
| C46 | gate green; api:generate no diff | exit 0 at c2df916 | 31 files and 308 tests passed; web build OK; `git diff --exit-code apps/web/src/api apps/server/openapi.json` exit 0 | PASS |
| C47 | unchanged statuses (invitations: 200, 401, 403, 409) | ✓ at c2df916 (9 names) | `onboarding.spec.ts:213` 401, `:169-170` 422; `organization.spec.ts:114` 401, `:55-58` 403; `invitation.spec.ts:119` 200, `:228` 401, `:198` 403, `:261` 409, `:281` 409 | PASS |
| C48 | single init migration, RLS on 5 tables | shell exit 0; ✓ at c2df916 | `apps/server/test/schema.spec.ts:199` `unprotected).toEqual([])`; `apps/server/prisma/migrations/20260924120000_init/migration.sql:294` | PASS |
| C49 | body above 400 KB → 413 | ✓ at c2df916 | `branding.spec.ts:304-305` `toBe(413)`, logo `toBeNull()` | PASS |
| C50 | active + inactive ADMIN; demote the active → 422 | ✓ at c2df916 | `member.spec.ts:311-312` `toBe(422)`, `'LAST_ADMIN'`; `:313` role `'ADMIN'`; `:314` trail `toEqual(before)` | PASS |
| C51 | blank greeting and `{}` → 400, greeting unchanged | ✓ at c2df916 | `branding.spec.ts:169-172` `blank`/`empty` `toBe(400)`, `VALIDATION_ERROR`; `:173` `toBe('Oi')` | PASS |
| C52 | tenant B's writes leave tenant A intact | ✓ at c2df916 | `branding.spec.ts:427` `toEqual([200, 200, 204])`; `:428-432` B `toMatchObject(...)`; `:433` `stored(tenantA…)).toEqual(beforeA)`; `:434` `audits(tenantA…)).toEqual([])` (`withTwoTenants` `:397`) | PASS |
| C53 | unknown key on PATCH branding and PUT logo → 400 VALIDATION_ERROR; nothing stored | ✓ at c2df916 (`branding.spec.ts > PATCH /api/v1/organization/branding > rejects unknown fields in the branding and logo bodies`, 138ms) | `branding.spec.ts:180-187` bodies `{ greeting: 'Outra', extra: true }` and `{ image: <valid PNG>, logoMimeType: 'image/svg+xml' }`; `:189-191` for both, `statusCode).toBe(400)` and `error.code).toBe('VALIDATION_ERROR')`; `:193` `stored(...)).toMatchObject({ greeting: 'Oi', logo: null })` | PASS |

About C53: the logo body carries a valid PNG, so without `.strict()` the use case would accept it and store it. That makes both the status assertion at `:190` and the persistence assertion at `:193` capable of failing. Fault M2 confirmed this.

## Coverage

Verified at `c2df916`. All 23 rows in `checks.md:195-217` have 3 cells, and every `Unproven` cell reads `-`. I recomputed the row the fix added, and the round 2 rows the fix touched, from the code. The other rows are carried from `5989e9f` and `3924f68`, where none had an unproven member.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| new `.strict()` request bodies (2) | route schemas added in `c858eb6..HEAD`: `branding.routes.ts:28` `body: updateBrandingInput`, `:43` `body: uploadLogoInput`. `DELETE` and `GET` logo (`:56`, `:69`) have no body, params or query schema | `updateBrandingInput` (`branding.schema.ts:15`) -> C53, fault M1 killed · `uploadLogoInput` (`branding.schema.ts:25`) -> C53, fault M2 killed | - |
| body schemas this feature edited (2) | `git diff c858eb6..HEAD -- '*.schema.ts'`: `createInvitationInput` (role enum), `updateMemberInput` (role enum) | `createInvitationInput` `.strict()` (`invitation.schema.ts:12`) -> `invitation.spec.ts:163,169`, fault M3 killed · `updateMemberInput` `.strict()` (`member.schema.ts:9`) -> `member.spec.ts:398,402`, fault M4 killed | - |
| branding body shape (2) | `branding.schema.ts:10-16` | `{}` -> C51 (refine) · unknown key -> C53 | - |
| logo body shape (2) | `branding.schema.ts:25` | not base64 -> C34 · unknown key -> C53 | - |
| blank greeting and invalid body (2) | `checks.md:202`, `branding.schema.ts:8,16` | whitespace-only C51 · `{}` C51 | - |
| new writes × tenant (3) | `checks.md:203`, `branding.ts` `withTenant` | PATCH branding, PUT logo, DELETE logo -> C52 | - |
| other rows (roles, removed roles, last-admin guard, web role places, logo types, logo and greeting edges, colors, role × write, screen states, route statuses, doors, replaced v2 tests) | carried from 5989e9f and 3924f68 | see the round 2 report at `0027cb6` and the round 1 report at `e89952f` | - |

The feature adds no param schema. `memberIdParams` (`member.schema.ts:12`) and `invitationIdParams` and `invitationTokenParams` (`invitation.schema.ts:39,48`) are unchanged by `c858eb6..HEAD`. The feature did not touch the other request bodies (`onboardInput`, `renameOrganizationInput`, `setActiveOrganizationInput`, `acceptInvitationInput`, `transferPortfolioInput`), and each already has an unknown-key proof in the suite: `onboarding.spec.ts:191`, `organization.spec.ts:184`, `active-organization.spec.ts:73`, `invitation.spec.ts:761` and `member.spec.ts:752`.

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary (magic bytes) | `logo.ts` | own layer C29 · boundary C30, C33 | yes (carried from 3924f68, `logo.ts` untouched) |
| Decides, proven at the boundary (last-admin guard) | `member.ts:73-78` | one boundary case per row: C6, C7, C8, C9, C10, C50 | yes (carried from 5989e9f, `member.ts` untouched) |
| Entry point that decides nothing (branding and logo bodies) | `branding.schema.ts` | accepted input and each rejected input | yes. Re-judged at c2df916: accepted C22, C24, C26, C30. Rejected: color C25, 501 chars C26, blank C51, `{}` C51, not base64 C34, unknown key on both bodies C53. Each refinement has a killed fault: `.min(1)` and `refine` in round 2, both `.strict()` this round |
| Instrumentation (GET organization select) | `organization.ts:10-27` | covered by its consumer | yes (carried from 3924f68) |

The Swept rows are carried from `3924f68`, because the fix touched none of the code they cite.

## Faults injected

Verified at `c2df916`. I ran the faults in two scratch worktrees, one at a time (`git worktree add --detach <scratchpad>/wt HEAD`, then `pnpm install --offline`). Before each fault, the unmutated C53 passed in the scratch tree (1 passed). The real tree's `git status --porcelain` was empty before and after each worktree was removed. I did not use `git stash`. The 36 faults killed in rounds 1 and 2 are carried from `3924f68` and `5989e9f`. The fix does not touch those surfaces.

| Mutation | Location | Killed |
| --- | --- | --- |
| M1: drop `.strict()` on `updateBrandingInput` | `apps/server/src/modules/organizations/branding.schema.ts:15` | yes - C53 fails at `branding.spec.ts:190` (`expected 200 to be 400`) on the branding response |
| M2: drop `.strict()` on `uploadLogoInput` | `branding.schema.ts:25` | yes - C53 fails at `branding.spec.ts:190` (`expected 200 to be 400`) on the upload response |
| M3: drop `.strict()` on `createInvitationInput` (a body this feature edited) | `invitation.schema.ts:12` | yes - `invitation.spec.ts:169` (`{"…","role":"COMMERCIAL","extra":true}: expected 200 to be 400`) |
| M4: drop `.strict()` on `updateMemberInput` (a body this feature edited) | `member.schema.ts:9` | yes - `member.spec.ts:402` (`expected 200 to be 400`) |

## Gate

Verified at `c2df916`, from the repo root, with docker compose postgres healthy. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exits 0: 31 test files and 308 tests passed, 0 failed, and the web build succeeded. `bash -c 'pnpm api:generate >/dev/null && git diff --exit-code apps/web/src/api apps/server/openapi.json'` exits 0.

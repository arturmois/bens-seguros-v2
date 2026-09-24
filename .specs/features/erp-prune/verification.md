# ERP prune verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: db84b0b..0983bf8
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

29 of 30 checks are proven at `0983bf8`. The feature fails on two things. C9 is red: the local
staging smoke exits 1. ADR-011 and the roadmap make that smoke part of how F0 closes. Separately,
the roadmap's F0 criterion covers more than the checks do: live web copy still sells the product as
an ERP with commissions, and no check covers it.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-011-pivot-to-mvp.md` | yes - read in full at HEAD | none | "A F0 fecha com CI verde e o smoke local (`scripts/staging-smoke.mjs`)": its check, C9, is red (see Checks). The requirement is in the checks, but it is not met |
| `docs/roadmap.md` § F0 (lines 24-31) | yes - read at HEAD | none | The criterion reads "nenhum código, config ou doc vivo referencia storage, PDF, MinIO, comissão ou módulos do ERP". AC 12 limits the sweep to 8 named files, and `Out of scope` does not exclude web copy. Two references to the ERP and its commissions remain with no check: `apps/web/src/routes/(public)/index.tsx:26` (landing page: "ERP para corretoras de seguros: propostas, apólices, comissões e atendimento") and `apps/web/src/features/legal/documents.ts:29` (terms of use: "controle de comissões, ... gestão de documentos") |

The search behind the Uncovered cell:
`ARGV0=rg claude -n -i "\bERP\b|apólice|sinistro|asaas|comiss|commission" apps/web/src apps/server/src scripts .github docker-compose*.yml README.md CLAUDE.md docs/runbooks`.
Other hits don't count as live references. `docs/architecture.md:19` lists comissão as out of scope.
`apps/server/src/app.spec.ts:294` asserts that the old example route is absent. `test/schema.spec.ts:336-347`
is C19's own test. The Rate-limit `storage: 'database'` hits are Better Auth's storage option, not S3.
`docs/roadmap.md` lines 166-208 are in the historical appendix, which the plan puts out of scope.

## Checks

The proofs were run at HEAD `0983bf8`. The vitest proofs ran in one call:
`pnpm --filter @bens/server exec vitest run src/shared/config.spec.ts test/boot.spec.ts src/app.spec.ts src/modules/organizations/member.spec.ts test/schema.spec.ts src/modules/organizations/onboarding.spec.ts src/modules/organizations/invitation.spec.ts test/architecture.spec.ts --reporter=verbose`
exited 0 with 8 files and 131 tests passed. The verbose output lists every named test below
individually as ✓. The `rg` proofs ran as `ARGV0=rg /home/artur/.local/bin/claude <args>`, with
known-positive sanity checks first (`loadConfig` in `config.ts` exits 0, and `fastify` in
`pnpm-lock.yaml` returns 56 hits). C4, C21, C28 and C9 ran in a clean HEAD worktree.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `loadConfig` with only the 5 required variables returns the exact default object and no `S3_*` key | vitest `-t "applies defaults to the optional variables"` ✓ | `apps/server/src/shared/config.spec.ts:14` - `expect(loadConfig(required)).toEqual({ ...required, NODE_ENV, HOST, PORT, LOG_LEVEL, TRUST_PROXY, SIGNUP_MODE, MAX_ORGS_PER_USER })`; `required` at `config.spec.ts:4-10` holds exactly the 5 keys | PASS |
| C2 | Boot entrypoint runs with no `S3_*`, gets past config, and exits 1 with the RLS-bypass message | vitest `-t "refuses to boot with a role that bypasses row security"` ✓ | `apps/server/test/boot.spec.ts:40-43` - `rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Database role "bens" bypasses row level security') })`; the env at `boot.spec.ts:26-36` has no `S3_*` | PASS |
| C3 | The test app with no `S3_*` answers `GET /api/health` with 200 `{status:'ok'}` | vitest `-t "returns ok with a request id header"` ✓; `rg -n "S3_" apps/server/src apps/server/test` exit 1 | `apps/server/src/app.spec.ts:75-76` - `expect(res.statusCode).toBe(200)`, `expect(res.json()).toEqual({ status: 'ok' })` | PASS |
| C4 | `export-openapi.ts` generates the spec with no `S3_*` | `rg -n "S3_" apps/server/scripts` exit 1; `pnpm --filter @bens/server openapi:export` exit 0 (worktree) | `apps/server/scripts/export-openapi.ts:8` - `loadConfig({ NODE_ENV, LOG_LEVEL, DATABASE_URL, SMTP_URL, ... })`, with no `S3_*` | PASS |
| C5 | package.json and the lockfile have none of the 3 dependencies | `rg -n "@aws-sdk/client-s3\|@aws-sdk/s3-request-presigner\|@react-pdf/renderer" apps/server/package.json pnpm-lock.yaml` exit 1; the same pattern gets 6 hits in the base lockfile | `apps/server/package.json:1` - the file has none of the 3 names (the diff removes exactly those 3 lines) | PASS |
| C6 | The 4 files are gone and nothing imports storage/pdf | `test ! -e` ×4 exit 0; `rg -n "infrastructure/(storage\|pdf)\|deps\.storage\|ensureBucket" apps/server/src apps/server/test apps/server/scripts` exit 1 | `apps/server/src/dependencies.ts:24-30` - `Deps` has no `storage` key; `apps/server/src/server.ts:35` - `assertRowSecurityApplies()` is followed straight by `queue.start()`, with no `ensureBucket` | PASS |
| C7 | Dev compose has exactly `mailpit` and `postgres` and no minio volume | the awk service list = `"mailpit postgres "` exit 0; `rg -n -i minio docker-compose.yml` exit 1 | `docker-compose.yml:1` - services block, the awk output is shown equal | PASS |
| C8 | CI starts no MinIO and passes no `S3_*` | `rg -n -i "minio\|S3_" .github/workflows/ci.yml` exit 1 | `.github/workflows/ci.yml:1` - the file has no match (the diff removes 14 lines) | PASS |
| C9 | `staging-smoke.mjs all` exits 0 and loads no pdf/storage module | `node scripts/staging-smoke.mjs all` **exit 1** (worktree at HEAD, then `down` exit 0); `rg -n "infrastructure/(pdf\|storage)" scripts/staging-smoke.mjs` exit 1 | `scripts/staging-smoke.mjs:1` - `not ok - ... up -d --wait server`: `container bens-staging-local-server-1 is unhealthy`, and the container log says `TURNSTILE_SECRET_KEY: Required when NODE_ENV is production and SIGNUP_MODE is self_serve`. The cause predates this feature: `docker-compose.prod.yml` at `db84b0b` passes neither `SIGNUP_MODE` nor `TURNSTILE_*`, while `config.ts` at base already requires them (introduced in `152bf11`). Precision note: the second proof only shows that the script does not name those paths. It does not assert what the image loaded. | FAIL |
| C10 | `GET /members` by OWNER and ADMIN returns 200, and every item has exactly the 6 keys | vitest `-t "lists members newest first including inactive"` ✓ | `apps/server/src/modules/organizations/member.spec.ts:367` - `expect(listed.json().items[0]).toEqual({ id, userId, role: 'MANAGER', active: false, email, name: 'Membro' })`; `member.spec.ts:381` (ADMIN, every item) - `expect(Object.keys(item).sort()).toEqual(['active','email','id','name','role','userId'])`. Precision note: the OWNER call asserts exact equality on `items[0]` only, not on every item | PASS |
| C11 | `GET /members` without a session returns 401 | vitest `-t "requires a session to list members"` ✓ | `member.spec.ts:388-389` - `expect(response.statusCode).toBe(401)`, `...error.code).toBe('UNAUTHENTICATED')` | PASS |
| C12 | `GET /members` by MANAGER, COMMERCIAL or VIEWER returns 403 FORBIDDEN | vitest `-t "rejects listing members without member:update"` ✓ | `member.spec.ts:397-398` - `expect(response.statusCode, role).toBe(403)`, `...error.code).toBe('FORBIDDEN')`, looping over the 3 roles | PASS |
| C13 | PATCH `{role}` returns 200 with exactly the 6 keys | vitest `-t "changes a member role and records the audit"` ✓ | `member.spec.ts:98` - `expect(Object.keys(response.json()).sort()).toEqual(['active','email','id','name','role','userId'])` | PASS |
| C14 | A PATCH body that is neither `role` nor `active` returns 400 | vitest `-t "rejects a member body that is not a role or an active flag"` ✓ | `member.spec.ts:244-245` - `toBe(400)`, `error.code).toBe('VALIDATION_ERROR')` | PASS |
| C15 | PATCH without a session returns 401 | vitest `-t "requires a session"` ✓ (the PATCH describe) | `member.spec.ts:268-278` - `client.patch('/api/v1/members/${id}', ...)`, then `expect(response.statusCode).toBe(401)` | PASS |
| C16 | PATCH by a role without `member:update` returns 403 | vitest `-t "rejects a member change from a role without member:update"` ✓ | `member.spec.ts:260-261` - `toBe(403)`, `'FORBIDDEN'` | PASS |
| C17 | PATCH on an unknown id returns 404 | vitest `-t "returns not found for an unknown member"` ✓ | `member.spec.ts:302-305` - `toBe(404)`, `toEqual({ error: { code: 'NOT_FOUND', message: 'Membro não encontrado.' } })` | PASS |
| C18 | PATCH on the OWNER returns 422 OWNER_IMMUTABLE | vitest `-t "rejects a change to the owner"` ✓ | `member.spec.ts:222-228` - `toBe(422)`, `toEqual({ error: { code: 'OWNER_IMMUTABLE', ... } })` | PASS |
| C19 | After all migrations, `Member` has no `commissionSplitBp` and keeps the 7 columns | vitest `-t "Member carries no commission column"` ✓ | `apps/server/test/schema.spec.ts:347` - `expect(columns).not.toContain('commissionSplitBp')`; `schema.spec.ts:348-358` - `arrayContaining(['id','organizationId','userId','role','active','createdAt','updatedAt'])` | PASS |
| C20 | A new migration drops the column, and `schema.prisma` does not declare it | `rg -F 'ALTER TABLE "Member" DROP COLUMN "commissionSplitBp";' apps/server/prisma/migrations` exit 0; `rg commissionSplitBp apps/server/prisma/schema.prisma` exit 1 | `apps/server/prisma/migrations/20260923220000_drop_member_commission_split/migration.sql:2` - `ALTER TABLE "Member" DROP COLUMN "commissionSplitBp";` (it sorts after `20260923133344_user_last_active_organization`) | PASS |
| C21 | `api:generate` leaves no diff and no `commissionSplitBp`, and both operationIds remain | `pnpm api:generate` exit 0, then `git diff --exit-code -- apps/server/openapi.json apps/web/src/api` exit 0 (worktree); `rg commissionSplitBp apps/server/openapi.json apps/web/src` exit 1; `rg -c '"operationId": "(listMembers\|updateMember)"'` printed `2` | `apps/server/openapi.json:1` - 2 operationId hits; `apps/server/src/modules/organizations/member.schema.ts:16-25` - `memberOutput` with 6 keys, `.strict()` | PASS |
| C22 | A transfer whose move writes another `Member` column returns 200 `{transferred:2}`, and the write persists | vitest `-t "adds the rows a registered move reports"` ✓ | `member.spec.ts:467-468` - `toEqual({ transferred: 2 })`, `memberOf(...).active).toBe(false)`; the move writes `active: false` (`member.spec.ts:457`), and `transferPortfolio` never writes `active` itself (`member.ts:106-137`) | PASS |
| C23 | A throwing second move returns 500, the first write rolls back, and no audit is written | vitest `-t "rolls back the transfer when a move throws"` ✓ | `member.spec.ts:493-495` - `toBe(500)`, `memberOf(...).active).toBe(true)`, `auditsOf(...)).toEqual(before)` | PASS |
| C24 | Onboarding creates OWNER/active and invite-accept creates role/active, with the other assertions unchanged | vitest `-t "creates the organization, the owner and the trial"` ✓ and `-t "accepts the invitation and switches the active organization"` ✓ | `apps/server/src/modules/organizations/onboarding.spec.ts:51` - `toMatchObject({ role: 'OWNER', active: true })`; `apps/server/src/modules/organizations/invitation.spec.ts:687` - `toMatchObject({ role: 'COMMERCIAL', active: true })`; the diff changes only those 2 lines in both specs | PASS |
| C25 | Every archived doc has an ADR-011 notice in its first 3 lines | the loop over `prompts/*.md docs/legacy-analysis.md docs/original-brief.md` printed no failure (6 prompts plus 2 docs) | `prompts/prompt-01.md:1` - archived notice citing ADR-011 (the same 2-line notice in all 8 files, per the diff) | PASS |
| C26 | The 8 living files have no minio, `S3_` or commissionSplit | `rg -n -i "minio\|S3_\|commissionSplit" README.md docs/runbooks/staging.md .env.example .env.prod.example docker-compose.yml docker-compose.prod.yml docker-compose.staging-local.yml scripts/staging-smoke.mjs` exit 1 | `docs/runbooks/staging.md:1` - the file has no match (all 8 files are searched in one call) | PASS |
| C27 | `architecture.md` has no storage.ts, pdf.ts, minio or "sai na F0" | `rg -n -i "storage\.ts\|pdf\.ts\|minio\|sai na F0" docs/architecture.md` exit 1 | `docs/architecture.md:274` - "Logo: `bytea` ≤ 200 KB ... Sem storage de" (the replacement text) | PASS |
| C28 | All four gates exit 0 | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exit 0 (clean HEAD worktree): 29 files, 272 tests passed | `apps/server/src/modules/organizations/member.spec.ts:193` - the untouched concurrency test `keeps a single reactivation when two race for the last seat` is part of the green run | PASS |
| C29 | architecture.spec is unchanged, boot.spec only loses `S3_*`, schema.spec only gains C19, and all 3 pass | vitest over the 3 files ✓ (part of the batched run); `git diff --exit-code db84b0b..HEAD -- apps/server/test/architecture.spec.ts` exit 0; boot diff filtered with `rg -v S3_` exit 1 (6 lines removed, all `S3_*`); schema diff `rg '^-[^-]'` exit 1 | `apps/server/test/schema.spec.ts:335-359` - the only addition, a `describe('Member')` | PASS |
| C30 | Exactly the 2 listed tests disappear | `pnpm exec vitest list` in clean worktrees at `db84b0b` and at `0983bf8` (261 entries each); `comm -23` printed exactly `src/infrastructure/pdf.spec.tsx > renderPdf > renders a React PDF document to a PDF buffer` and `src/infrastructure/storage.spec.ts > storage (MinIO) > uploads, serves through a pre-signed attachment URL and deletes`; `comm -13` printed the 2 new tests (C11, C19) | `apps/server/src/modules/organizations/member.spec.ts:385` - `requires a session to list members` (new); `apps/server/test/schema.spec.ts:337` - `Member carries no commission column` (new) | PASS |

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| startup config without `S3_*` (4 assemblies) | `rg "loadConfig\("` call sites: `src/server.ts:9`, `test/app.ts:12`, `scripts/export-openapi.ts:8`, plus the prod image; `signup-gates.spec.ts:390` is test-only | boot C2 · test harness C3 · export script C4 · staging image C9 (red) | staging image - C9 exits 1 before the server is healthy, so the production assembly is unproven |
| removed dependencies (3) | `git diff db84b0b..HEAD -- apps/server/package.json` (3 removed lines) | all 3 C5 | - |
| removed files (4) | the base tree plus the diff stat | all 4 C6 | - |
| MinIO start points (3) | `git grep -il minio db84b0b` over runnable config: `docker-compose.yml`, `ci.yml`, `staging-smoke.mjs` (plus `.env.example`, a file that holds env, not a start point) | compose C7 · CI C8 · smoke C9/C26 · `.env.example` C26 | - |
| `GET /api/v1/members` statuses (3) | plan Surface | 200 C10 · 401 C11 · 403 C12 | - |
| `PATCH /api/v1/members/:id` statuses (6) | plan Surface | 200 C13 · 400 C14 · 401 C15 · 403 C16 · 404 C17 · 422 C18 | - |
| `memberOutput` keys (6) | `member.schema.ts:16-25` | each key C10 + C13 | - |
| one-way doors (2) | plan Landing | door 1 C19/C20 · door 2 C10/C13/C21 | - |
| `Member` writers setting `commissionSplitBp` at base (3) | `git grep commissionSplitBp db84b0b -- apps`: `onboarding.ts:33`, `invitation.ts:235`, the probe in `member.spec.ts:440/466` | onboarding C24 · invitation C24 · probe C22/C23 | - |
| archived documents (8) | `git ls-tree db84b0b prompts/` (6) plus the 2 docs named in the roadmap | all 8 C25 | - |
| living code/config/docs free of ERP terms (roadmap F0 criterion, authority: `docs/roadmap.md:31`) | a sweep of `apps/`, `scripts/`, `.github/`, the compose files, `.env*`, `README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/runbooks/` | the 8 AC-12 files C26 · `architecture.md` C27 · `apps/web/src/routes/(public)/index.tsx` · `apps/web/src/features/legal/documents.ts` | `apps/web/src/routes/(public)/index.tsx:26` ("ERP ... apólices, comissões") and `apps/web/src/features/legal/documents.ts:29` ("controle de comissões ... gestão de documentos") - still present, and no check covers them |

Level: every claim that names a status or response shape (C3, C10-C18) is proven through `app.inject` / `TestClient`, and C2 goes through a real child process. None sits below the boundary.

## Test policy rows

`checks.md` has no `## Test policy` section. It has `## Tests removed or changed` instead, which the
plan calls the Test policy. As `checks.md` itself says, the repo convention (`CLAUDE.md` › Testes)
governs level. Each listed row is judged below against the diff `db84b0b..0983bf8`.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| storage/pdf specs removed with the files | `infrastructure/storage.spec.ts`, `pdf.spec.tsx` | only these 2 disappear (C30) | yes - `comm -23` shows exactly these 2 |
| config.spec: defaults / coercion / required | `src/shared/config.spec.ts` | `S3_*` leaves the input and the expectations, and the exact-object assertion stays | yes - the diff removes only `S3_*` lines, moves the boolean case to `TRUST_PROXY` (`config.spec.ts:31-34`), and drops `/S3_BUCKET/` |
| `S3_*` leaves the boot, signup-gates and test-harness env | `test/boot.spec.ts`, `signup-gates.spec.ts`, `test/app.ts` | only `S3_*` lines removed | yes - C29's filter plus a read of the diff |
| member.spec list: exact object | `member.spec.ts:367` | `toMatchObject` becomes `toEqual` without `commissionSplitBp` | yes |
| member.spec PATCH: exact keys | `member.spec.ts:98` | added keys assertion | yes |
| member.spec 401 on list | `member.spec.ts:385` | new test | yes |
| transfer probe column | `member.spec.ts:457, 483` | the probe moves to `active` and the transfer/rollback/audit asserts stay | yes - `transferred`, 500, and the audit asserts are unchanged |
| onboarding/invitation `toMatchObject` | `onboarding.spec.ts:51`, `invitation.spec.ts:687` | only `commissionSplitBp: 0` leaves | yes |
| schema.spec new test | `test/schema.spec.ts:335-359` | new C19 test | yes |

Swept rows that resolve to existing ones were re-read. Validation is covered by
`config.spec.ts:49-51` (`DATABASE_URL`, `SMTP_URL`, `EMAIL_FROM`) and `config.spec.ts:58-59`
(`BETTER_AUTH_SECRET`, `APP_URL`). Concurrency is covered by `member.spec.ts:193`, which ran green
in C28.

## Faults injected

All faults ran in a scratch worktree at HEAD (`git worktree add --detach /tmp/claude-1000/verify-erp-head HEAD`, `pnpm install --frozen-lockfile`). Each was reverted with `git checkout` in the scratch copy. The worktree was then removed, and the real tree's `git status --porcelain` matched the empty baseline.

| Mutation | Location | Killed |
| --- | --- | --- |
| extra key `legacyFlag` added to `memberOutput` and `present()` (the contract reopened) | `member.ts:51`, `member.schema.ts:23` | yes - C10 (`member.spec.ts:367`) and C13 (`member.spec.ts:98`) both failed |
| drop migration removed (column survives) | `prisma/migrations/20260923220000_drop_member_commission_split/` | yes - C19 failed at `schema.spec.ts:347` |
| `S3_BUCKET: z.string().min(1)` made required again | `src/shared/config.ts:24` | yes - C1 failed at `config.spec.ts:14` (ConfigError) |
| onboarding creates the owner with `active: false` | `onboarding.ts:33` | yes - C24 failed at `onboarding.spec.ts:51` |
| invite accept creates the member with `active: false` | `invitation.ts:235` | yes - C24 failed at `invitation.spec.ts:687` |

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` (clean HEAD worktree) - exit 0, 29 files, 272 passed, 0 failed.
`node scripts/staging-smoke.mjs all` - exit 1 (server unhealthy: `TURNSTILE_*` required in production self-serve); the stack was torn down with `down` (exit 0).

## Ranked gaps

1. C9 is red. The local staging smoke exits 1, and ADR-011 names that smoke as F0's closing condition. The cause predates this feature (`docker-compose.prod.yml` never passes `SIGNUP_MODE`/`TURNSTILE_*`, since `152bf11`). It still blocks F0's criterion. - C9 - `scripts/staging-smoke.mjs` run output; `docker-compose.prod.yml` at `db84b0b` has no `TURNSTILE`.
2. The roadmap's F0 criterion ("nenhum código ... referencia ... comissão ou módulos do ERP") is not met, and no check covers it. The landing page copy at `apps/web/src/routes/(public)/index.tsx:26` still reads "ERP ... apólices, comissões", and the terms text at `apps/web/src/features/legal/documents.ts:29` still lists "controle de comissões, ... gestão de documentos". Rewording the legal terms is a product/legal decision to raise with the user.
3. Precision (not failing on its own): C9's second proof shows that the script does not name `infrastructure/(pdf|storage)`, but it does not assert the image's loaded-module list. C10's OWNER call asserts exact equality on `items[0]` only.

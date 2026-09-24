# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Plan/Checks)

Corroborated across multiple features. Safe to apply as guidance.

### L-015 - Give every member an acceptance criterion enumerates its own case in the check, even when a sibling transport already covers it
- signal: `ac_gap` · recurrence: 2 feature(s) · scope: `specs` · harmful: 0
- features: auth-core, org-web
- evidence: Coverage AC 38 - realtime.spec.ts:53-63 (expired session untested over the socket) (specs) (+2 more)
- last seen: 2026-09-23T14:09:19Z

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - An invariant on a scalar foreign key must also be enforced on the relation field that writes the same column
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tenant-guard` · harmful: 0
- features: tenant-guard
- evidence: verification.md gap 1 - database.ts:107,173 (tenant-guard)
- last seen: 2026-09-21T17:33:41Z

### L-002 - A write guard must inspect nested writes rooted at unguarded models, not only at guarded ones
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tenant-guard` · harmful: 0
- features: tenant-guard
- evidence: verification.md gap 2 - database.ts:147 (tenant-guard)
- last seen: 2026-09-21T17:33:41Z

### L-003 - Write a criterion only as strong as an observable proof can settle, or name the instrument that observes it
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: tenant-guard
- evidence: verification.md C2 / AC 1 (specs)
- last seen: 2026-09-21T17:33:41Z

### L-004 - A nested tenant filter must equal the query's own tenant, not merely be present
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tenant-guard` · harmful: 0
- features: tenant-guard
- evidence: verification.md round 2 gap 1 - database.ts:76-85 (N1-N23) (tenant-guard)
- last seen: 2026-09-21T17:45:55Z

### L-005 - A composite foreign key that shares the tenant column turns every relation write into a possible tenant change
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `tenant-guard` · harmful: 0
- features: tenant-guard
- evidence: verification.md round 2 - schema.prisma:34 composite FK (N1-N6) (tenant-guard)
- last seen: 2026-09-21T17:45:55Z

### L-006 - A relation guard must cover every shorthand of a projection key, such as _count: true, not only its expanded form
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tenant-guard` · harmful: 0
- features: tenant-guard
- evidence: verification.md round 3 gap 1 - database.ts:168-176 (tenant-guard)
- last seen: 2026-09-21T18:21:04Z

### L-007 - Both sides of an upsert must name the same tenant
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tenant-guard` · harmful: 0
- features: tenant-guard
- evidence: verification.md round 3 note - upsert where A create B (tenant-guard)
- last seen: 2026-09-21T18:21:04Z

### L-008 - Reject a filter that names more than one tenant instead of trusting the first tenant key found
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tenant-guard` · harmful: 0
- features: tenant-guard
- evidence: verification.md round 4 gap 1 - database.ts:78-84 (W3m) (tenant-guard)
- last seen: 2026-09-21T18:47:40Z

### L-009 - A cascading foreign key from a table without row security runs as the owner and bypasses the policies of the tables it reaches
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tenant-rls` · harmful: 0
- features: tenant-rls
- evidence: verification.md tenant-rls round 1 gap 1 - Example_organizationId_fkey ON DELETE CASCADE (tenant-rls)
- last seen: 2026-09-21T22:07:49Z

### L-010 - Give each clause of a schema checker its own synthetic failing case
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `tests` · harmful: 0
- features: tenant-rls
- evidence: verification.md tenant-rls round 1 - test/schema.spec.ts:17 (tests) (+1 more)
- last seen: 2026-09-21T22:18:51Z

### L-011 - Match a path-prefix guard against the path the router resolves, not the raw request URL, and test a percent-encoded variant
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: auth-core
- evidence: C32 - apps/server/src/app.ts:81 (POST /%61pi/test/write ran the handler) (routes)
- last seen: 2026-09-22T13:17:42Z

### L-012 - Prove a configured expiry by moving time to just inside and just outside the bound, not by setting the expiry to the past
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `auth` · harmful: 0
- features: auth-core
- evidence: F4 - apps/server/src/modules/auth/auth.ts:39; C12 password-reset.spec.ts:107 (auth)
- last seen: 2026-09-22T13:17:42Z

### L-013 - Prove a job's behaviour by enqueuing it and observing the side effect, not by calling the handler function directly
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `jobs` · harmful: 0
- features: auth-core
- evidence: F5 - apps/server/src/emails/send-email.tsx:44; C28-C29 send-email.spec.tsx:43,57 (jobs)
- last seen: 2026-09-22T13:17:42Z

### L-014 - Give every configured library value named in the plan a check that observes it at the boundary
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `auth` · harmful: 0
- features: auth-core
- evidence: Coverage 'Better Auth configured values' - auth.ts:37-38,52,85-91 (auth)
- last seen: 2026-09-22T13:17:42Z

### L-016 - Prove a client-side cache clear with in-app navigation, never with a full page reload that discards the cache anyway
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `web-e2e` · harmful: 0
- features: auth-web
- evidence: F3 apps/web/src/routes/_app.tsx:69 (web-e2e)
- last seen: 2026-09-22T16:21:04Z

### L-017 - Give every behavioural claim in plan Impact a check whose assertion fails when the behaviour is slowed or removed, not just broken
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `web-e2e` · harmful: 0
- features: auth-web
- evidence: F4 apps/web/src/main.tsx:14 (web-e2e)
- last seen: 2026-09-22T16:21:04Z

### L-018 - Prove a never-renders claim by recording the element during the whole navigation, not by one end-state count
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `web-e2e` · harmful: 0
- features: auth-web
- evidence: C10 apps/web/e2e/login.spec.ts:69 (web-e2e)
- last seen: 2026-09-22T16:21:04Z

### L-019 - Drive e-mail link flows from the screen that sends them, not from an API helper that supplies its own callback
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web-e2e` · harmful: 0
- features: auth-web
- evidence: C4 apps/web/src/routes/(auth)/register.tsx:30 (web-e2e)
- last seen: 2026-09-22T16:21:04Z

### L-020 - Enumerate every row of an error-message table in the checks and assert each through a screen
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web-e2e` · harmful: 0
- features: auth-web
- evidence: Test policy apps/web/src/lib/auth-client.ts:10 (web-e2e)
- last seen: 2026-09-22T16:21:04Z

### L-021 - Prove a container image's contents claim by listing what the built image holds, not only by running it
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `deploy` · harmful: 0
- features: staging
- evidence: Coverage Landing door 1; apps/server/Dockerfile:26-37 (deploy)
- last seen: 2026-09-22T17:02:29Z

### L-022 - Give every input branch of a provisioning script a proof, including the one only CI takes
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `deploy` · harmful: 0
- features: staging
- evidence: docker/postgres/init/01-app-role.sh:16-17; .github/workflows/ci.yml:57 (deploy)
- last seen: 2026-09-22T17:02:29Z

### L-023 - Rename every proof command in the checks when the proof script changes name or language
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: staging
- evidence: checks.md:60 C13 (specs)
- last seen: 2026-09-22T17:02:29Z

### L-024 - Check a runbook's expected outputs against the artifacts it describes, not only its headings and cited files
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `deploy` · harmful: 0
- features: staging
- evidence: C15; docs/runbooks/staging.md:46-47 (deploy)
- last seen: 2026-09-22T17:02:29Z

### L-025 - Prove a branch selected by an environment variable with a case the fallback path cannot satisfy
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `deploy` · harmful: 0
- features: staging
- evidence: fault R2-1; scripts/staging-smoke.mjs:348-364 (deploy)
- last seen: 2026-09-22T17:20:33Z

### L-026 - Prove a pruned or bundled image by loading every module the process can load, not only by a health check on the boot path
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `deploy` · harmful: 0
- features: staging
- evidence: fault R2-4; scripts/staging-smoke.mjs:481-505 (deploy)
- last seen: 2026-09-22T17:20:33Z

### L-027 - Add every new smoke step to the list the all command runs, or the suite silently skips the check
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: staging
- evidence: scripts/staging-smoke.mjs:532-547 (specs)
- last seen: 2026-09-22T17:20:33Z

### L-028 - When a check names N cases of a decision table, the cited proof must assert every case, including the all-false baseline pair
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `auth` · harmful: 0
- features: org-core
- evidence: C19 me.spec.ts:160-164 (auth)
- last seen: 2026-09-22T21:30:24Z

### L-029 - Fault-inject the uncovered member of a boolean decision table; a green named proof that omits that member is not coverage
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `auth` · harmful: 0
- features: org-core
- evidence: session-context.ts:42 vs C19 (auth)
- last seen: 2026-09-22T21:30:24Z

### L-030 - Recompute Coverage members from the claim; a member attributed to a proof that never asserts it is unproven
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `verification` · harmful: 0
- features: org-core
- evidence: Coverage isSuperAdmin pairs / neither (verification)
- last seen: 2026-09-22T21:30:24Z

### L-031 - Seed rows in an order different from the expected sort, so removing the sort fails the test
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `tests` · harmful: 0
- features: org-web
- evidence: F4 apps/server/src/modules/auth/me.ts:34-40; C8 me.spec.ts:230 (tests)
- last seen: 2026-09-23T12:35:52Z

### L-032 - Establish in the test every precondition the check names; a mocked field in one response does not create the server state it describes
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `web-e2e` · harmful: 0
- features: org-web
- evidence: F1 apps/web/src/features/organizations/account.ts:25; C15 org-web.spec.ts:221, C16 :236 (web-e2e)
- last seen: 2026-09-23T12:35:52Z

### L-033 - Prove a displayed value from a response with a value a constant cannot match, never only zero
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `web-e2e` · harmful: 0
- features: org-web
- evidence: F2 apps/web/src/routes/_app/settings/members.tsx:342; C34 org-web.spec.ts:569 (web-e2e)
- last seen: 2026-09-23T12:35:52Z

### L-034 - Scope a text or role assertion to the region the claim names, since a page-wide locator also matches the same text in the header or an open menu
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web-e2e` · harmful: 0
- features: org-web
- evidence: C21 org-web.spec.ts:329; C12 org-web.spec.ts:196 (web-e2e)
- last seen: 2026-09-23T12:35:52Z

### L-035 - When a change moves where a signed-in user lands, run the whole e2e suite before landing, not only the feature spec
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `web-e2e` · harmful: 0
- features: org-web
- evidence: verification.md Gate: login/terms/two-factor/password-reset e2e 15 failed at 90ca899 (web-e2e)
- last seen: 2026-09-23T12:35:52Z

### L-036 - Give every constraint the plan's Relations names a check that asserts it, or mark it n/a with the reason
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: org-web
- evidence: verification.md round 2 gap 2 - Relations SetNull, migration.sql:5 (20260923133344_user_last_active_organization) (specs)
- last seen: 2026-09-23T14:09:19Z

### L-037 - Check every harness sentence that names a helper against the call sites that use it, not only against the helper's definition
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `harness` · harmful: 0
- features: harness-h2
- evidence: verification.md round 1 I1 - CLAUDE.md:15 (withoutTenant claimed for identity tables) (harness)
- last seen: 2026-09-23T16:07:31Z

### L-038 - A claim listing several terms needs one presence proof per term; proving one term let a mutant delete the other two.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `checks` · harmful: 0
- features: erp-prune
- evidence: checks C31 round 2 (checks)
- last seen: 2026-09-24T01:53:02Z

### L-039 - When a phase criterion says 'no living reference to X', sweep the whole tree for X before writing checks, not a hand-picked file list.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `checks` · harmful: 0
- features: erp-prune
- evidence: roadmap F0 criterion / round 1 (checks)
- last seen: 2026-09-24T01:53:03Z

### L-040 - The staging smoke proof is 'up' then 'all'; 'all' alone never starts the stack.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `staging` · harmful: 0
- features: erp-prune
- evidence: C9 / scripts/staging-smoke.mjs ORDER (staging)
- last seen: 2026-09-24T01:53:03Z

### L-041 - A new required config variable must be wired in docker-compose.prod.yml, the staging smoke env and the CI e2e env in the same change.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `config` · harmful: 0
- features: staging-signup-env
- evidence: 152bf11 signup-gates (config)
- last seen: 2026-09-24T01:53:03Z

### L-042 - Sanity-check every search-based proof with a known-positive match first; in this shell plain rg exits 1 even on a match.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `tooling` · harmful: 0
- features: erp-prune
- evidence: rg proofs, round 1 build (tooling)
- last seen: 2026-09-24T01:53:03Z

### L-043 - Give every new request body a proof that sends an unknown field and expects 400, so removing .strict() fails a test
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: f1-identity
- evidence: apps/server/src/modules/organizations/branding.schema.ts:15,:25 - .strict() mutants survived (round 2, 0027cb6) (routes)
- last seen: 2026-09-24T13:00:35Z

### L-044 - When a guard counts only active rows, seed an inactive row the count must ignore, so dropping the active filter fails a test
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `guards` · harmful: 0
- features: f1-identity
- evidence: apps/server/src/modules/organizations/member.ts:77 - AND active mutant survived (round 1, e89952f) (guards)
- last seen: 2026-09-24T13:00:35Z

### L-045 - Give each refinement of an input schema its own rejected-input proof
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: f1-identity
- evidence: apps/server/src/modules/organizations/branding.schema.ts:8,:16 - .min(1) and empty-body refine survived (round 1, e89952f) (routes)
- last seen: 2026-09-24T13:00:36Z

### L-046 - Give every new tenant-scoped write route a withTwoTenants proof that the other tenant's rows and audit stay unchanged
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tenancy` · harmful: 0
- features: f1-identity
- evidence: branding PATCH, PUT logo, DELETE logo had no withTwoTenants test (round 1, e89952f; fixed by C52) (tenancy)
- last seen: 2026-09-24T13:00:36Z

### L-047 - A race proof must accept every legitimate loser outcome and assert the invariant, not one fixed status
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `concurrency` · harmful: 0
- features: f1-identity
- evidence: C10 member.spec.ts race proof flaky on a legitimate 403 loser (round 1, e89952f) (concurrency)
- last seen: 2026-09-24T13:00:36Z

### L-048 - Derive each route's status list in the plan from the route handler, not from memory
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: f1-identity
- evidence: C47 and plan.md:51 claimed a 422 that invitation.ts:56-120 never returns (round 1, e89952f) (specs)
- last seen: 2026-09-24T13:00:36Z

### L-049 - Prove a health or status probe against a redirect and a non-200 answer, not only a closed port: curl --fail passes a 3xx.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `ci` · harmful: 0
- features: cd-vps
- evidence: AC 12 / deploy-environment.yml Health check (ci)
- last seen: 2026-09-24T15:20:07Z

### L-050 - Every guard in a deploy script needs a smoke case that reaches it; a guard no scenario triggers can be deleted with the suite green.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `scripts` · harmful: 0
- features: cd-vps
- evidence: scripts/deploy-remote.sh:57 (scripts)
- last seen: 2026-09-24T15:20:07Z

### L-051 - A 'nothing changed' claim on containers compares every service the claim names, by ID and State.StartedAt, not a subset by ID.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `scripts` · harmful: 0
- features: cd-vps
- evidence: AC 6 / deploy-smoke.mjs snapshot (scripts)
- last seen: 2026-09-24T15:20:07Z

### L-052 - When a feature changes a literal an ADR fixes (image names, routes), write the replacement into the ADR revision in the same feature.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: cd-vps
- evidence: ADR-008:26 (docs)
- last seen: 2026-09-24T15:20:07Z

### L-053 - A one-way door added to Landing during the build gets its own check in the same commit, with a precondition that only that door's behaviour satisfies (a duplicate from a new phone, not the same phone), before the Verifier runs.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `checks` · harmful: 0
- features: conversation-core
- evidence: inbound.ts:78 (door 10) (checks)
- last seen: 2026-09-24T23:13:47Z

### L-054 - When a filter is an OR of rules, seed each expected row so that exactly one rule admits it; a row two rules admit keeps the result green when either rule is removed.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `repo-layer` · harmful: 0
- features: conversation-core
- evidence: C48 (repo-layer)
- last seen: 2026-09-24T23:13:50Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_

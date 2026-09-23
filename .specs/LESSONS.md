# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Plan/Checks)

Corroborated across multiple features. Safe to apply as guidance.

### L-015 - Give every member an acceptance criterion enumerates its own case in the check, even when a sibling transport already covers it
- signal: `ac_gap` · recurrence: 2 feature(s) · scope: `specs` · harmful: 0
- features: auth-core, org-web
- evidence: Coverage AC 38 - realtime.spec.ts:53-63 (expired session untested over the socket) (specs) (+1 more)
- last seen: 2026-09-23T12:35:52Z

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

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_

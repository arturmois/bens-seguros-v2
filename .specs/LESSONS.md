# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Plan/Checks)

Corroborated across multiple features. Safe to apply as guidance.

_none_

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

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_

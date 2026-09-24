# Audit actors verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: ecfb84a..eddcb2e
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| ADR-013 §Autoria e auditoria (`docs/decisions/ADR-013-conversation-model.md:66-70`) | yes - read at HEAD | none - enum `USER`/`AI`/`SYSTEM` and optional `actorUserId` match door 1 and C1-C6 | - |
| AD-008 row (`.specs/STATE.md`) | yes - read at HEAD (now `superseded by AD-013`) | none - its 9 denylisted keys are the C9 set, unchanged in `audit.ts:9-21` | - |
| AD-013 row (`.specs/STATE.md`, added in this diff) | yes - read at HEAD | none - signature `record(tx, actor, …)`, `SYSTEM_ACTOR`/`AI_ACTOR`, CHECK expression, no default, 11-key denylist all match the code and checks | - |

Step 1 is a `ui` step; recorded here because the brief asked for it. The AD-013 action list adds `conversation.reopen`; actions are free strings in `record`, so there is no code set for this feature to satisfy (the first caller lands in `conversation-core`).

## Checks

All nine proofs ran in one invocation from `apps/server` at `eddcb2e`:
`pnpm exec vitest run src/modules/audit/audit.spec.ts test/schema.spec.ts src/modules/organizations/onboarding.spec.ts --reporter=verbose -t "records a user actor|records the system actor without a user|records the ai actor without a user|ties the audit actor type to the actor user|backfills existing audit rows as user actors|requires an explicit audit actor type|records organization\.create|redacts message text and phone for any actor|redacts personal fields and keeps the role"` - exit 0, 9 passed / 30 skipped, each of the 9 names listed individually as passed. Every named test exists (`rg -n "it\('…"` hits cited below); the six new ones were added in this diff, C7 was edited in it (`onboarding.spec.ts:106` added), C9 is pre-existing and unchanged.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | user context -> `USER` + `actorUserId = ctx.userId` | batch above, `records a user actor` passed | `apps/server/src/modules/audit/audit.spec.ts:94` - `expect(row).toMatchObject({ actorType: 'USER', actorUserId: ctx.userId })` | PASS |
| C2 | `SYSTEM_ACTOR` -> `SYSTEM` + null user | batch above, `records the system actor without a user` passed | `apps/server/src/modules/audit/audit.spec.ts:110` - `expect(row).toMatchObject({ actorType: 'SYSTEM', actorUserId: null })` | PASS |
| C3 | `AI_ACTOR` -> `AI` + null user | batch above, `records the ai actor without a user` passed | `apps/server/src/modules/audit/audit.spec.ts:126` - `expect(row).toMatchObject({ actorType: 'AI', actorUserId: null })` | PASS |
| C4 | CHECK rejects the 3 inconsistent pairs with `23514 AuditLog_actor_check`, accepts the 3 consistent ones | batch above, `ties the audit actor type to the actor user` passed | `apps/server/test/schema.spec.ts:575` - `expect(outcomes).toEqual({ userWithUser: 'ok', userWithoutUser: '23514 AuditLog_actor_check', systemWithoutUser: 'ok', systemWithUser: '23514 AuditLog_actor_check', aiWithoutUser: 'ok', aiWithUser: '23514 AuditLog_actor_check' })` | PASS |
| C5 | migration backfills 2 pre-existing rows (2 users) as `USER`, same `actorUserId` | batch above, `backfills existing audit rows as user actors` passed | `apps/server/test/schema.spec.ts:607` - `expect(result.rows).toEqual(result.expected.map((actorUserId) => ({ actorType: 'USER', actorUserId })))`; rows seeded on the schema built by the migrations before `20260924150000_audit_actors`, then that migration applied (`withSchemaBefore`, `apps/server/test/setup-db.ts:95`) | PASS |
| C6 | INSERT without `actorType` -> `23502`; `actorType` no default; `actorUserId` nullable | batch above, `requires an explicit audit actor type` passed | `apps/server/test/schema.spec.ts:645` - `expect(missing).toMatchObject({ code: '23502', column: 'actorType' })`; `apps/server/test/schema.spec.ts:646` - `expect(columns).toEqual([{ column: 'actorType', default: null, nullable: 'NO' }, { column: 'actorUserId', default: null, nullable: 'YES' }])` | PASS |
| C7 | onboarding still records `organization.create` as `USER` with the creating user | batch above, `records organization.create` passed | `apps/server/src/modules/organizations/onboarding.spec.ts:104` - `expect(rows[0]).toMatchObject({ action: 'organization.create', actorType: 'USER', actorUserId: userId, entityId: organizationId })` | PASS |
| C8 | `text`/`phoneE164` redacted at top and nested level under `SYSTEM_ACTOR`, `status` kept | batch above, `redacts message text and phone for any actor` passed | `apps/server/src/modules/audit/audit.spec.ts:146` - `expect(row.changes).toEqual({ text: '[alterado]', phoneE164: '[alterado]', nested: { text: '[alterado]', phoneE164: '[alterado]', status: ['CLOSED', 'OPEN'] } })` | PASS |
| C9 | the 9 previously redacted keys stay redacted | batch above, `redacts personal fields and keeps the role` passed | `apps/server/src/modules/audit/audit.spec.ts:52` - `expect(row.changes).toEqual({ email: '[alterado]', name: '[alterado]', phone: '[alterado]', document: '[alterado]', documentEncrypted: '[alterado]', token: '[alterado]', password: '[alterado]', ipAddress: '[alterado]', userAgent: '[alterado]', role: [...], contact: { email: '[alterado]', name: '[alterado]', role: 'ADMIN' } })` | PASS |

Swept `existing` row re-read: authorization cites "hides an audit log from the other tenant" - present at `apps/server/src/modules/audit/audit.spec.ts:189`, asserting `expect(hidden).toEqual([])` (`:204`). Holds.

## Coverage

Recomputed from the authority for each set, not copied from `checks.md`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `actorType` values (3) | ADR-013 §Autoria (`USER`, `AI`, `SYSTEM`); code: `migration.sql:2`, `schema.prisma` enum | `USER` C1 (`audit.spec.ts:94`) · `SYSTEM` C2 (`:110`) · `AI` C3 (`:126`) | - |
| `AuditLog_actor_check` truth table (3 types x user/null = 6) | CHECK expression `migration.sql:15-16` | all 6 cells asserted in one `toEqual` at `schema.spec.ts:575` (C4) | - |
| newly redacted keys x levels (2 x 2) | plan S2 / AD-013 row; code `audit.ts:19-20` | `text` top, `text` nested, `phoneE164` top, `phoneE164` nested - all in `audit.spec.ts:146` (C8) | - |
| previously redacted keys (9) | AD-008 row in `.specs/STATE.md`; code `audit.ts:10-18` | all 9 at top level in `audit.spec.ts:52` (C9); `email`, `name` also nested | - |
| migration statements (5) | `migration.sql` at HEAD | CREATE TYPE (C1-C4 need it) · ADD COLUMN NOT NULL DEFAULT 'USER' (backfill, C5; NOT NULL, C6 `nullable: 'NO'`) · `actorUserId` DROP NOT NULL (C6 `nullable: 'YES'`, C2/C3) · DROP DEFAULT (C6 `23502`, `default: null`) · ADD CONSTRAINT CHECK (C4) | - |
| Relations one-way constraints (2) | plan Relations | `actorType` required C6 · `actorUserId` iff USER C4 | - |
| Landing doors (2) | plan Landing | door 1 C4, C5, C6 · door 2 C1, C2, C3 | - |
| `record` branch on actor shape (2 arms) | `audit.ts:59-61` (`'userId' in actor ? USER+user : actor.actorType`) | user arm C1, C7 · non-user arm C2, C3 | - |
| existing audited actions / callers (7 actions, 10 call sites in 5 files) | `rg "record\(tx" apps/server/src` | the actor is not caller-decided: every call site passes a `userId`-bearing context (enforced by `AuditActor` at typecheck) and the one branch is proven by C1; row-level actor assertions exist for `organization.create` (C7, `actorType` + `actorUserId`), `organization.update` (`organization.spec.ts:151`, `branding.spec.ts:113`), `invitation.create/revoke/accept` (`invitation.spec.ts:339`, `:515`, `:729`) via `actorUserId`, which the CHECK ties to `USER` | - |
| routes / statuses | plan Surface = `None` | no route touched by the diff | - |

Observation (non-blocking): the plan's Impact says "7 chamadores"; the code has 7 audited actions across 10 call sites. `member.update` and `portfolio.transfer` have no actor-level assertion in `member.spec.ts` (they assert only `action`), but no per-caller behaviour exists to prove - the value comes from `record`'s branch, covered above.

## Test policy rows

`checks.md` carries no `Test policy` rows: its section reads "Omitted: the repo answers both questions for this change". So the repo convention decides (CLAUDE.md "Testes"): `record` is proven against real PostgreSQL in `audit.spec.ts` (no DB mock), schema constraints against the catalog and real inserts in `test/schema.spec.ts`, and the proofs seed data a constant cannot satisfy (C5 uses two distinct users; C4 tests all six cells). No route is involved, so `app.inject` / `withTwoTenants` do not apply to new behaviour; the tenant isolation of `AuditLog` is covered by the existing test cited under Swept.

## Faults injected

Scratch: `git worktree add <scratchpad>/wt HEAD`, `pnpm install --frozen-lockfile --offline`, baseline 7 target proofs green in the worktree; each fault reverted with `git checkout -- .` before the next. Real tree porcelain matched the baseline after `git worktree remove` (only the pre-existing `?? .specs/features/domain-bens360/`).

| Mutation | Location | Killed |
| --- | --- | --- |
| swap the constants: `SYSTEM_ACTOR = { actorType: 'AI' }`, `AI_ACTOR = { actorType: 'SYSTEM' }` | `apps/server/src/modules/audit/audit.ts:45-46` | yes - C2 and C3 failed |
| user arm drops the user: `{ actorType: 'USER' }` without `actorUserId` | `apps/server/src/modules/audit/audit.ts:60` | yes - C1 and C7 failed |
| remove `'phoneE164'` from the denylist | `apps/server/src/modules/audit/audit.ts:19` | yes - C8 failed |
| delete the `AuditLog_actor_check` constraint | `apps/server/prisma/migrations/20260924150000_audit_actors/migration.sql:15-16` | yes - C4 failed |
| keep the backfill default (delete `DROP DEFAULT`) | `apps/server/prisma/migrations/20260924150000_audit_actors/migration.sql:8` | yes - C6 failed |

Cap of 5 reached. C5 (backfill) was not mutated: every wrong backfill value collides with the CHECK added in the same migration, so the migration itself would abort; C9 is a pre-existing surface the diff did not touch.

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` at `eddcb2e` from the repo root - exit 0: lint checked 165 files, no issues; typecheck server + web done; tests 31 files, 315 passed, 0 failed; build server + web ok.

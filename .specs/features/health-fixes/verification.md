# Health fixes verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 1e6ac38..202b2a7
**Round**: 2 - scoped (fix commit 202b2a7 plus every verdict of round 1 that was not PASS)
**Verifier**: independent sub-agent (author != verifier). I did not write the code, the tests, `plan.md`, `checks.md` or the round 1 report.

All 21 checks were re-run at `202b2a7` and are green. The round 1 FAIL came from two surviving
mutants (M1, M10c) and three unproven coverage members. At this HEAD each of them is killed or
proven. I re-injected every fault on a surface the fix touched or created, and all were killed.
The gate passes.

Round history: round 1 (`1e6ac38..9b85471`, report committed in `1f7ef1f`) returned FAIL. It
ranked four gaps: M10c at `invitation.ts:118`, `member.ts:81` unproven (AC 14), `audit.ts:37`
unproven (AC 13), and M1, where `toMatchObject` on `changes` accepted extra keys. The fix
`202b2a7` changes only specs and adds two proof lines to `checks.md`. The claims are unchanged,
and no production file is touched (`git show --stat 202b2a7`).

## Binding sources

Carried from 9b85471: the plan marks no source as binding, and the profile is `standard`, so
step 1 does not run. The fix does not touch any interface.

## Checks

Verified at 202b2a7. The proofs re-ran in full. All server proofs ran in one invocation:
`pnpm --filter @bens/server exec vitest run <audit, onboarding, organization, member, invitation specs> --reporter=verbose -t "<19-name alternation>"`
It exited 0 with 22 passed and 72 skipped. Each named test is listed individually as passed,
including the 2 new ones and the 4 `previews …` tests. I ran the structural proofs (C10, C11,
C12, C15-C20) from the repo root exactly as written, and each exited 0. Citations were refreshed
in the five spec files the fix touched. Production line numbers have not moved.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | invitation.create row: entityId, actor, changes exactly `{ role: 'COMMERCIAL' }` | vitest `records invitation.create without the email` passed | `apps/server/src/modules/organizations/invitation.spec.ts:319` status 200; `:321` `toHaveLength(1)`; `:322` `toMatchObject({ entityId: response.json().id, actorUserId: host.userId })`; `:326` `expect(rows[0]?.changes).toEqual({ role: 'COMMERCIAL' })`, which closes the round 1 precision gap (M1 killed) | PASS |
| C2 | no field of the row contains the email | same test passed | `invitation.spec.ts:327` `expect(JSON.stringify(rows[0]).toLowerCase()).not.toContain(email.toLowerCase())` | PASS |
| C3 | revoke row, changes exactly `{ status: ['PENDING','REVOKED'] }` | vitest `records invitation.revoke` passed | `invitation.spec.ts:492` status 200; `:495` `toMatchObject({ entityId: id, actorUserId: host.userId })`; `:499` `expect(rows[0]?.changes).toEqual({ status: ['PENDING', 'REVOKED'] })` | PASS |
| C4 | accept row in the invite's tenant, entityId = Member.id, `{ role, invitationId }` | vitest `records invitation.accept in the invited organization` passed | `invitation.spec.ts:704` status 200; `:710` `toMatchObject({ actorUserId: user.userId, entityId: member.id })`; `:714` `expect(rows[0]?.changes).toEqual({ role: 'COMMERCIAL', invitationId: created.json().id })` | PASS |
| C5 | organization.update row, changes exactly `{ name: '[alterado]' }` | vitest `records organization.update with the name redacted` passed | `apps/server/src/modules/organizations/organization.spec.ts:141` status 200; `:146` `toMatchObject({ actorUserId: userId, entityId: organizationId })`; `:150` `expect(rows[0]?.changes).toEqual({ name: '[alterado]' })`; `:151` `not.toContain('Nome Novo')` | PASS |
| C6 | organization.create row in the new org, changes exactly `{ role: 'OWNER' }` | vitest `records organization.create` passed | `apps/server/src/modules/organizations/onboarding.spec.ts:65` status 200; `:68` `toHaveLength(1)`; `:69` `toMatchObject({ action: 'organization.create', actorUserId: userId, entityId: organizationId })`; `:74` `expect(rows[0]?.changes).toEqual({ role: 'OWNER' })` | PASS |
| C7 | duplicate invite: 409 INVITATION_PENDING, one invitation.create row | vitest `does not record a rejected duplicate invitation` passed | `invitation.spec.ts:377` `toBe(409)`; `:378` `INVITATION_PENDING`; `:380` `toHaveLength(1)` | PASS |
| C8 | accept past seat cap: 422 USER_QUOTA_REACHED, no accept row | vitest `does not record an accept past the seat cap` passed | `invitation.spec.ts:730` `toBe(422)`; `:731` `USER_QUOTA_REACHED`; `:732` `expect(await auditOf(host.organizationId, 'invitation.accept')).toEqual([])` | PASS |
| C9 | row in tenant A invisible from tenant B | vitest `hides an audit log from the other tenant` passed | `apps/server/src/modules/audit/audit.spec.ts:135` `expect(hidden).toEqual([])`; `:136` `expect(visible).toHaveLength(1)` | PASS |
| C10 | org ceiling 422 ORG_LIMIT_REACHED on both paths; one production comparison, in membership.ts | vitest `rejects the fourth organization` and `rejects an accept past the organization limit` passed; rg proof exit 0 | `onboarding.spec.ts:134` `toBe(422)`; `:135` `toEqual({ error: { code: 'ORG_LIMIT_REACHED', … } })`; `invitation.spec.ts:897` `toBe(422)`; `:898` same body; the only production match is `apps/server/src/modules/organizations/membership.ts:26` `if (held >= maxOrgsPerUser) throw orgLimitReached` | PASS |
| C11 | isUniqueViolation defined once in shared/errors.ts; duplicate 409 (pre-check and unique index) and slug suffix work | rg proof exit 0; vitest `rejects a second pending invitation for the same email`, `suffixes a slug that is taken`, `maps a duplicate caught by the unique index to INVITATION_PENDING` passed | single definition at `apps/server/src/shared/errors.ts:25`; `invitation.spec.ts:266` `toBe(409)`, `:267` INVITATION_PENDING body; `onboarding.spec.ts:88` `` toBe(`${taken.json().slug}-2`) ``; race test `invitation.spec.ts:364` `toBe(409)`, `:365` `expect(response.json().error.code).toBe('INVITATION_PENDING')`, `:366` no `invitation.create` row. It reaches the `invitation.ts:118` branch (M10c killed 4/4, with `CONFLICT` received) | PASS |
| C12 | no `'tenant context missing'`; routes use `currentTenant(request)` (8) | rg proof exit 0 | counts `invitation.routes.ts:48,63,77`, `member.routes.ts:33,49,65`, `organization.routes.ts:70,84` = 8. `rg` finds the literal nowhere in `apps/server/src`; the single missing-context throw lives inside `currentTenant` (`apps/server/src/modules/organizations/tenant-context.ts:62-66`, carried from 9b85471, file untouched) | PASS |
| C13 | error names the key path for null, undefined and unsupported types | vitest `names the key path of an unsupported change` passed | `audit.spec.ts:95` `.rejects.toThrow('changes.nested.value')` (null); `:104` `.rejects.toThrow('changes.list[0]')` (undefined inside an array); `:113` `.rejects.toThrow('changes.at has unsupported type function')`; `:117` `expect(rows).toEqual([])` | PASS |
| C14 | missing Subscription: error names the organizationId on accept and on reactivation; nothing is written | vitest `rolls back the accept when the subscription is missing` and `cites the organization when the subscription is missing on reactivation` passed | `invitation.spec.ts:1007` `.rejects.toThrow(host.organizationId)`; `:1008` `memberCount(...)).toBe(0)`; `apps/server/src/modules/organizations/member.spec.ts:154` `.rejects.toThrow(host.organizationId)`; `:158` `expect(stored.active).toBe(false)` | PASS |
| C15 | previewStatus typed by the Prisma enum, no `'unexpected invitation status'`; 4 previews answer | `! rg … && pnpm typecheck` exit 0; vitest `previews` ×4 passed | `apps/server/src/modules/organizations/invitation.ts:49-56` takes `status: InvitationStatus`, and it has no throw branch; `invitation.spec.ts:593` `status: 'PENDING'`; `:627` `toBe('EXPIRED')`; `:646` `toBe('REVOKED')`; `:667` `toBe('ACCEPTED')` | PASS |
| C16 | architecture §2 describes the door-2 shape; example without commissionRepository | rg proof exit 0 | carried from 9b85471 (file untouched): `docs/architecture.md:120-135`, `:134` "dois ou mais arquivos de use case"; `:148-149` inline `tx.commission.findFirst` | PASS |
| C17 | §3 organizations row owns the active-org switch; the auth row does not | rg proof exit 0 | carried from 9b85471: `docs/architecture.md:172` | PASS |
| C18 | CLAUDE.md sentence covers both an inline query and a repository | rg proof exit 0 | carried from 9b85471: `CLAUDE.md:14` "a query recebe esse `tx` …" | PASS |
| C19 | AD-008 lists the seven actions and the new-action rule | loop rg proof exit 0 | carried from 9b85471: `.specs/STATE.md:14` | PASS |
| C20 | roadmap: documents.ts placeholders block go-live; bump TERMS_VERSION/PRIVACY_VERSION | rg proof exit 0 | carried from 9b85471: `docs/roadmap.md:377`, `:382` | PASS |
| C21 | member.update and portfolio.transfer still record after the signature change | vitest `changes a member role and records the audit` and `transfers an empty portfolio and records the audit` passed | `member.spec.ts:99` action `member.update`; `:100` `toMatchObject({ role: [previous, role] })`; `:426` action `portfolio.transfer`; `:427` `toEqual({ fromMemberId, toMemberId, transferred: 0 })` | PASS |

## Coverage

I recomputed the rows the fix touched from their authority: `isUniqueViolation` uses, F-07
invariant errors, and door 1 (its `changes` shape is now pinned). The other rows are carried
from 9b85471, because the fix touched no production code and so no authority behind them.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| audited actions, door 1 (7) - verified at 202b2a7 | AD-008 `.specs/STATE.md:14`; production `rg "action: '"` finds exactly these 7 (`invitation.ts:95,148,240`, `organization.ts:32`, `onboarding.ts:38`, `member.ts:94,134`) | member.update C21 · portfolio.transfer C21 · invitation.create C1 (exact `changes`, M1 killed) · invitation.revoke C3 (M2b killed) · invitation.accept C4 (M3b killed) · organization.create C6 (M5b killed) · organization.update C5 (M4b killed) | - |
| failure without a trail row (2) - carried from 9b85471 | plan AC 7, AC 8 | duplicate invite C7 · accept past seat cap C8 | - |
| paths hitting the org ceiling (2) - carried from 9b85471 | callers of `assertOrgLimit`: `onboarding.ts:23`, `invitation.ts:211` | onboarding C10 · accept C10 | - |
| uses of `isUniqueViolation` (3) - verified at 202b2a7 | `rg isUniqueViolation`: `errors.ts:47`, `invitation.ts:118`, `onboarding.ts:45` | errorHandler: `apps/server/src/app.spec.ts:154` (M10d killed in round 1, file untouched) · invitation.ts:118 C11 race test (M10c killed 4/4) · onboarding.ts C11 slug | - |
| F-07 invariant errors (6) - verified at 202b2a7 | code sites: `audit.ts:22` null, `audit.ts:22` undefined, `audit.ts:37` unsupported type, `invitation.ts:230`, `member.ts:81`; previewStatus throw removed | null C13 `:95` · undefined C13 `:104` (M7b killed) · unsupported type C13 `:113` (M13t killed) · Subscription on accept C14 `invitation.spec.ts:1007` · Subscription on reactivation C14 `member.spec.ts:154` (M14r killed) · preview throw removed C15 (structural + typecheck) | - |
| preview statuses (4) - carried from 9b85471 | Prisma `enum InvitationStatus` + derived EXPIRED | PENDING · EXPIRED · REVOKED · ACCEPTED, all C15 | - |
| documents (5) - carried from 9b85471 | plan S3 AC 16-20 | §2 C16 · §3 C17 · CLAUDE.md C18 · STATE.md C19 · roadmap.md C20 | - |
| module shape, door 2 (1) - carried from 9b85471 | plan Landing 2 | C16 | - |

## Test policy rows

Verified at 202b2a7. `checks.md` `## Test policy` has no rows, so the `CLAUDE.md` convention
decides. Both new tests hit real PostgreSQL. The race test goes through `app.inject` (via the
test client) and holds a real uncommitted row in a second transaction. The reactivation test
calls `updateMember` directly, because the 500 body hides the message, the same justification C14
already carries. No repository is mocked.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| (section has zero rows - repo convention applied) | organizations/*.ts, audit/audit.ts | integration against real PostgreSQL | yes |

## Swept existing

Carried from 9b85471 (authorization, concurrency of the accept race). One new concurrency proof
exists at `invitation.spec.ts:330`.

## Race test judgment (`maps a duplicate caught by the unique index to INVITATION_PENDING`)

- **Reaches the branch:** yes. The blocker inserts a PENDING row and holds its transaction open
  (`invitation.spec.ts:343-355`). Under READ COMMITTED the request's pre-check at
  `invitation.ts:84` cannot see that row. Its insert then waits on the partial unique index
  `Invitation_pending_email` (`apps/server/prisma/migrations/20260923001000_invitations/migration.sql:26`)
  and fails with P2002 after the blocker commits. I removed `invitation.ts:118` (M10c) four
  times, and the response code became `CONFLICT` (the generic errorHandler mapping) every time.
- **Determinism:** 8 isolated runs, 8 passed. It also passed in the full suite. The handshake is
  explicit: the blocker signals after its insert (`ready`), and the test polls
  `pg_stat_activity` for a lock-waiting Invitation insert before it releases (`:85-94`, 5s cap,
  and it fails loudly on timeout). There is no sleep-based guess.
- **Residual weakness (observation, not scored):** the `pg_stat_activity` filter is
  cluster-wide. It has no `datname` or `pid` scoping, so while spec files run in parallel,
  another file's lock-waiting Invitation insert could satisfy it early. In that case the release
  lands before the request's pre-check, and the test passes through the pre-check instead of the
  index. It cannot go red falsely. It can only lose its discrimination on a given run, and none
  of the runs here showed that.

## Faults injected

Verified at 202b2a7. As the brief instructed, I mutated the real tree one file at a time and
restored each file with `git checkout -- <file>`, not with a worktree. The baseline porcelain
was empty, it was empty after every mutant, and it was empty after the gate. Each fault ran
against the narrowest covering proof.

| Mutation | Location | Killed |
| --- | --- | --- |
| M1 `changes: { role }` -> `{ role, email: input.email }` (round 1 survivor) | `apps/server/src/modules/organizations/invitation.ts:97` | yes - `invitation.spec.ts:326` toEqual |
| M10c `if (isUniqueViolation(error)) throw invitationPending` removed (round 1 survivor), run 4 times | `invitation.ts:118` | yes - 4/4, `invitation.spec.ts:365` received `CONFLICT` |
| M14r reactivation message -> `'Subscription missing'` without organizationId | `apps/server/src/modules/organizations/member.ts:81` | yes - `member.spec.ts:154` |
| M13t unsupported-type throw -> `return String(value)` | `apps/server/src/modules/audit/audit.ts:37` | yes - `audit.spec.ts:113` promise resolved |
| M7b array path not extended (`redact(item, path)`) | `audit.ts:29` | yes - `audit.spec.ts:104` got `changes.list` |
| M2b revoke `changes` gains `by: ctx.role` | `invitation.ts:150` | yes - `invitation.spec.ts:499` toEqual |
| M3b accept `changes` gains `organizationId` | `invitation.ts:241` | yes - `invitation.spec.ts:714` toEqual |
| M4b organization.update `changes` gains `slug` | `apps/server/src/modules/organizations/organization.ts:34` | yes - `organization.spec.ts:150` toEqual |
| M5b organization.create `changes` gains `slug` | `apps/server/src/modules/organizations/onboarding.ts:40` | yes - `onboarding.spec.ts:74` toEqual |

The round 1 kills on untouched surfaces (M2-M13, M10d, M11b, M12b) are carried from 9b85471.
The fix touched none of their production code or assertions.

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build`: exit 0. Biome checked 158 files and applied no fixes. Typecheck is clean. 31 test files, 272 passed, 0 failed (round 1 had 270; +2 new tests). The build succeeded (`apps/web` built).

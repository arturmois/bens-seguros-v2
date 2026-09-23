# Health fixes verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 1e6ac38..9b85471
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier). I did not write the code, the tests, `plan.md` or `checks.md`.

All 21 checks were run at HEAD and are green, and the gate passes. The verdict is FAIL because
two mutants survived and three coverage members have no proof (ranked below). Each one is a
missing or loose test. None is a behaviour defect I could observe.

## Binding sources

The plan marks no source as binding (`Sources` names the audit conversation, AD-008 and
`prompt-05.md`), and the profile is `standard`, so step 1 does not run. I read AD-008 at
`.specs/STATE.md:14` as the authority for the audited-action set (Coverage below).

## Checks

The server proofs ran in a single invocation:
`pnpm --filter @bens/server exec vitest run <5 spec files> --reporter=verbose -t "<17-name alternation>"`
It exited 0 with 20 passed and 72 skipped. Each named test appears individually as passed
(`audit.spec.ts` ×2, `onboarding.spec.ts` ×3, `organization.spec.ts` ×1, `member.spec.ts` ×2,
`invitation.spec.ts` ×12, including the four `previews …` tests). The structural proofs were
run from the repo root exactly as written, and each exited 0.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | invitation.create row: entityId, actor, `{ role: 'COMMERCIAL' }` | vitest `records invitation.create without the email` passed | `apps/server/src/modules/organizations/invitation.spec.ts:307` `expect(response.statusCode).toBe(200)`; `:309` `toHaveLength(1)`; `:310` `toMatchObject({ entityId: response.json().id, actorUserId: host.userId, changes: { role: 'COMMERCIAL' } })`. Precision gap: `toMatchObject` accepts extra keys in `changes` (see M1) | PASS |
| C2 | no field of the row contains the email | same test passed | `invitation.spec.ts:315` `expect(JSON.stringify(rows[0]).toLowerCase()).not.toContain(email.toLowerCase())` | PASS |
| C3 | revoke row with `{ status: ['PENDING','REVOKED'] }` | vitest `records invitation.revoke` passed | `invitation.spec.ts:441` status 200; `:444` `toMatchObject({ entityId: id, actorUserId: host.userId, changes: { status: ['PENDING', 'REVOKED'] } })` | PASS |
| C4 | accept row in the invite's tenant, entityId = Member.id, `{ role, invitationId }` | vitest `records invitation.accept in the invited organization` passed | `invitation.spec.ts:653` status 200; `:659` `toMatchObject({ actorUserId: user.userId, entityId: member.id, changes: { role: 'COMMERCIAL', invitationId: created.json().id } })`, read via `withTenant({ organizationId: host.organizationId })` at `:78` | PASS |
| C5 | organization.update row with `{ name: '[alterado]' }` | vitest `records organization.update with the name redacted` passed | `apps/server/src/modules/organizations/organization.spec.ts:141` status 200; `:146` `toMatchObject({ actorUserId: userId, entityId: organizationId, changes: { name: '[alterado]' } })`; `:151` `not.toContain('Nome Novo')` | PASS |
| C6 | organization.create row in the new org, `{ role: 'OWNER' }` | vitest `records organization.create` passed | `apps/server/src/modules/organizations/onboarding.spec.ts:65` status 200; `:68` `toHaveLength(1)`; `:69` `toMatchObject({ action: 'organization.create', actorUserId: userId, entityId: organizationId, changes: { role: 'OWNER' } })` | PASS |
| C7 | duplicate invite: 409 INVITATION_PENDING, one invitation.create row | vitest `does not record a rejected duplicate invitation` passed | `invitation.spec.ts:326` `toBe(409)`; `:327` `error.code` `INVITATION_PENDING`; `:329` `toHaveLength(1)`; `:330` entityId = first id | PASS |
| C8 | accept past seat cap: 422 USER_QUOTA_REACHED, no accept row | vitest `does not record an accept past the seat cap` passed | `invitation.spec.ts:679` `toBe(422)`; `:680` `USER_QUOTA_REACHED`; `:681` `expect(await auditOf(host.organizationId, 'invitation.accept')).toEqual([])` | PASS |
| C9 | row in tenant A invisible from tenant B | vitest `hides an audit log from the other tenant` passed | `apps/server/src/modules/audit/audit.spec.ts:117` `expect(hidden).toEqual([])`; `:118` `expect(visible).toHaveLength(1)`. This test predates the feature. The property is RLS plus the column default, and the diff does not change either | PASS |
| C10 | org ceiling 422 ORG_LIMIT_REACHED on both paths; one production comparison, in membership.ts | vitest `rejects the fourth organization` and `rejects an accept past the organization limit` passed; rg proof exit 0 | `onboarding.spec.ts:134` `toBe(422)`; `:135` `toEqual({ error: { code: 'ORG_LIMIT_REACHED', … } })`; `invitation.spec.ts:846`/`:847` same; the only production match is `apps/server/src/modules/organizations/membership.ts:26` `if (held >= maxOrgsPerUser) throw orgLimitReached` | PASS |
| C11 | isUniqueViolation defined once in shared/errors.ts; duplicate 409 and slug suffix still work | rg proof exit 0; vitest `rejects a second pending invitation for the same email` and `suffixes a slug that is taken` passed | the single definition is at `apps/server/src/shared/errors.ts:25`; `invitation.spec.ts:254` `toBe(409)`, `:255` INVITATION_PENDING body; `onboarding.spec.ts:88` `` expect(next.json().slug).toBe(`${taken.json().slug}-2`) ``. Coverage gap on the call site at `invitation.ts:118`, see M10c | PASS |
| C12 | no `'tenant context missing'`; routes use `currentTenant(request)` (8) | rg proof exit 0 | the only match is the throw inside `currentTenant`, at `apps/server/src/modules/organizations/tenant-context.ts:62-66`; counts: `invitation.routes.ts` 3, `member.routes.ts` 3, `organization.routes.ts` 2; `request.ctx` is read nowhere else in production | PASS |
| C13 | `{ nested: { value: null } }` error names `changes.nested.value` | vitest `names the key path of an unsupported change` passed | `audit.spec.ts:95` `.rejects.toThrow('changes.nested.value')`; `:99` `expect(rows).toEqual([])` | PASS |
| C14 | accept with no Subscription: error names the organizationId; no member created | vitest `rolls back the accept when the subscription is missing` passed | `invitation.spec.ts:956` `.rejects.toThrow(host.organizationId)`; `:957` `memberCount(...)).toBe(0)` | PASS |
| C15 | previewStatus typed by the Prisma enum, no `'unexpected invitation status'`; 4 previews answer | `! rg … && pnpm typecheck` exit 0; vitest `previews` ×4 passed | `apps/server/src/modules/organizations/invitation.ts:49-56` takes `status: InvitationStatus`, has no throw branch; `invitation.spec.ts:542` `status: 'PENDING'`; `:576` `toBe('EXPIRED')`; `:595` `toBe('REVOKED')`; `:616` `toBe('ACCEPTED')` | PASS |
| C16 | architecture §2 describes the door-2 shape; example without commissionRepository | rg proof exit 0 | `docs/architecture.md:120-135` (entity file, routes, schema, spec, index; `:134` repository "quando a mesma query serve dois ou mais arquivos de use case"); `:148-149` example uses `tx.commission.findFirst` inline in `withTenant` | PASS |
| C17 | §3 organizations row owns the active-org switch, auth row does not | rg proof exit 0 | `docs/architecture.md:172` `… troca da organização ativa`; the `auth` row at `:171` does not mention it | PASS |
| C18 | CLAUDE.md sentence valid for inline query and repository | rg proof exit 0 | `CLAUDE.md:14` "a query recebe esse `tx` (inline no use case, ou em `<x>.repository.ts` quando reusada)" | PASS |
| C19 | AD-008 lists the seven actions and the new-action rule | loop rg proof exit 0 | `.specs/STATE.md:14` lists all seven and "ação nova entra na AD antes do código" | PASS |
| C20 | roadmap: documents.ts placeholders block go-live; bump TERMS_VERSION/PRIVACY_VERSION | rg proof exit 0 | `docs/roadmap.md:377` go-live block; `:382` acceptance criterion "não têm nenhum `[INSERIR`" | PASS |
| C21 | member.update and portfolio.transfer still record after the signature change | vitest `changes a member role and records the audit` and `transfers an empty portfolio and records the audit` passed | `apps/server/src/modules/organizations/member.spec.ts:98` action `member.update`; `:99` `toMatchObject({ role: [previous, role] })`; `:400` action `portfolio.transfer`; `:401` `toEqual({ fromMemberId, toMemberId, transferred: 0 })` | PASS |

## Coverage

Recomputed from the authority for each set, not read off `checks.md`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| audited actions, door 1 (7) | AD-008 `.specs/STATE.md:14`; production `rg "action: '"` finds exactly these 7 (`invitation.ts:95,148,240`, `organization.ts:32`, `onboarding.ts:38`, `member.ts:94,134`), none extra | member.update C21 · portfolio.transfer C21 · invitation.create C1 · invitation.revoke C3 · invitation.accept C4 · organization.create C6 · organization.update C5 | - |
| failure without a trail row (2) | plan AC 7, AC 8 | duplicate invite C7 (M11b killed) · accept past seat cap C8 (M12b killed) | - |
| paths hitting the org ceiling (2) | callers of `assertOrgLimit`: `onboarding.ts:23`, `invitation.ts:211` | onboarding C10 · accept C10 (M6/M6b killed) | - |
| uses of `isUniqueViolation` (3) | `rg isUniqueViolation`: `errors.ts:47`, `invitation.ts:118`, `onboarding.ts:45` | errorHandler: no C11 proof asserts it; covered by the unnamed existing test `apps/server/src/app.spec.ts:154` (M10d killed) · onboarding.ts C11 slug (M10b killed) | invitation.ts:118 - the C11 duplicate-invitation proof is answered by the pre-check at `invitation.ts:84`, not by the P2002 branch; removing the branch survives (M10c) |
| F-07 invariant errors (plan AC 13, AC 14, AC 15) | code sites: `audit.ts:22` (null/undefined), `audit.ts:37` (unsupported type), `invitation.ts:230`, `member.ts:81`; `previewStatus` throw removed | audit null C13 · invitation.ts Subscription C14 · preview throw removed C15 (structural and typecheck) | `member.ts:81` Subscription-missing message on reactivation: AC 14 covers "na checagem de vaga", and no test runs this site · `audit.ts:37` unsupported-type branch (AC 13 "tipo não serializável"): C13 tests only `null`, so this path is never run |
| preview statuses (4) | Prisma `enum InvitationStatus` (PENDING, ACCEPTED, REVOKED; `schema.prisma:72-76`) + derived EXPIRED | PENDING C15 `:542` · EXPIRED C15 `:576` (M9 killed) · REVOKED C15 `:595` · ACCEPTED C15 `:616` | - |
| documents (5) | plan S3 AC 16-20 | architecture §2 C16 · §3 C17 · CLAUDE.md C18 · STATE.md C19 · roadmap.md C20 | - |
| module shape, door 2 (1) | plan Landing 2 | C16 | - |

No route in `Surface` (plan: none). `Observable` names AC 7, 8 and 10 as error codes; the table
above covers all three.

## Test policy rows

`checks.md` `## Test policy` has no rows ("Sem linhas novas"), so the `CLAUDE.md` convention decides.
The endpoint claims (C1, C3-C8, C10, C11) are all proven by `app.inject` against real PostgreSQL.
C13 and C14 call the function directly, which is justified: the 500 body hides the message. No
repository is mocked. The convention is met.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| (none - section has no rows; repo convention applied) | organizations/*.ts, audit/audit.ts | integration via app.inject | yes |

## Swept existing

- authorization: the diff does not touch any `preHandler`, and every route file still calls `requirePermission(...)`. Confirmed.
- concurrency: `invitation.spec.ts:881` `keeps a single new member when two accepts race for the last seat` exists and passed in the full suite. Confirmed. No test races a duplicate invitation, which is why M10c survives.

## Faults injected

Deviation from verify.md step 4: I followed the dispatch brief and mutated the real tree one file
at a time, restoring each with `git checkout -- <file>`, instead of using a worktree. The baseline
porcelain was empty, and after every batch it was empty again.

| Mutation | Location | Killed |
| --- | --- | --- |
| M1 `changes: { role }` -> `{ role, email: input.email }` (email redacted to `[alterado]` by the denylist) | `apps/server/src/modules/organizations/invitation.ts:97` | no - survived; C1 uses `toMatchObject` (extra keys pass) and C2 finds only `[alterado]` |
| M1b `changes` gains `invitee: email` (non-denylisted key) | `invitation.ts:97` | yes (C2 `:315`) |
| M2 revoke status `['PENDING','ACCEPTED']` | `invitation.ts:150` | yes (C3) |
| M3 accept `entityId: current.id` instead of `joined.id` | `invitation.ts:241` | yes (C4) |
| M4 organization.update `entityId: ctx.userId` | `apps/server/src/modules/organizations/organization.ts:33` | yes (C5) |
| M5 organization.create `role: 'ADMIN'` | `apps/server/src/modules/organizations/onboarding.ts:40` | yes (C6) |
| M6 `held >= max` -> `held > max` | `apps/server/src/modules/organizations/membership.ts:26` | yes (both C10 proofs: 200 instead of 422) |
| M7 key path not extended (`redact(child, path)`) | `apps/server/src/modules/audit/audit.ts:33` | yes (C13) |
| M8 Subscription message without organizationId | `invitation.ts:230` | yes (C14) |
| M9 EXPIRED branch removed from previewStatus | `invitation.ts:54` | yes (C15 `previews an expired invitation as EXPIRED`) |
| M10 shared `P2002` -> `P2003` | `apps/server/src/shared/errors.ts:26` | yes (C11 slug proof; the C11 duplicate-invitation proof passed under it) |
| M10c `if (isUniqueViolation(error)) throw invitationPending` removed | `invitation.ts:118` | no - survived; C11 duplicate proof goes through the pre-check at `invitation.ts:84` |
| M10d errorHandler `P2002` -> `P2003`, run against `app.spec.ts` | `errors.ts:26` | yes (`app.spec.ts:154` 500 instead of 409) |
| M11b rejected invite writes an `invitation.create` row in its own transaction in `catch` | `invitation.ts:117` | yes (C7 `:329` length 2) |
| M12b accept writes an `invitation.accept` row in its own transaction before the seat check | `invitation.ts:213` | yes (C8 `:681`) |
| M13 array redaction drops first element | `audit.ts:29` | yes (C21 `member.spec.ts:99`) |

Discarded: I also renamed the `invitation.accept` action and ran it against C8. That mutant does
not touch C8's assertion surface (C8 only asserts absence), so it survived trivially. M12b replaces
it. On the first attempt, M11b and M12b died with a 500 because they passed a non-UUID `entityId`.
I re-ran both with valid UUIDs, and the kills recorded above are from that re-run.

## Rule check on the diff (CLAUDE.md)

- No `any`, `@ts-ignore`, `@ts-expect-error`, `console.` or `as <Type>` in the production diff (`rg` on the added lines found nothing). `as const`/`as string` appear only in specs.
- Audit without PII: `organization.update` passes `{ name }`, which is redacted (`organization.ts:30-35`); `invitation.create` stores only `role`. PII is absent at runtime.
- The new user-facing message is in pt-BR ("Você já participa do número máximo de organizações.", `membership.ts:7`). Identifiers and comments are in English.
- Observation, not scored: the new internal invariant messages (`audit.ts:22,37`, `invitation.ts:230`, `member.ts:81`, `tenant-context.ts:64`) are in English. Their predecessors were English too, and they never reach the user (500 `INTERNAL_ERROR`).

## Ranked gaps

1. Surviving mutant M10c / unproven member: the `isUniqueViolation` → `INVITATION_PENDING` mapping at `apps/server/src/modules/organizations/invitation.ts:118` is never run. C11's "409 de convite duplicado" proof passes through the pre-check at `invitation.ts:84`. A proof needs a duplicate that reaches the unique index (a race between two creates, or an insert that skips the pre-check).
2. Unproven member (AC 14): `apps/server/src/modules/organizations/member.ts:81` seat check on reactivation has no test asserting that the message names the `organizationId`.
3. Unproven member (AC 13): the unsupported-type branch at `apps/server/src/modules/audit/audit.ts:37` is never run. C13 covers only `null`, while the AC names null, undefined and non-serializable types.
4. Surviving mutant M1 / precision gap (C1, same pattern in C3-C6): `toMatchObject` on `changes` does not pin door 1's literal shape, so extra keys in `changes` pass (`invitation.spec.ts:310`, `:444`, `:659`; `organization.spec.ts:146`; `onboarding.spec.ts:69`). Assert `rows[0].changes` with `toEqual`.

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build`: exit 0. Biome checked 158 files with no fixes; typecheck clean; 31 test files and 270 tests passed, 0 failed; build succeeded (`apps/web` built).

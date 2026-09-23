# Invitations verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: e2cc41a..121a060
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/architecture.md` §6 passo 7 | yes - lines 277–292 | none | - |
| `docs/architecture.md` §8 | yes - lines 354–396 | none (402 plano/quota is Fase 5 `assertQuota`; this feature's seat check is 422 per plan Landing) | - |
| `docs/migration.md` Auth / Organizations | yes - line 27 | none | - |
| ADR-003 | yes | none | - |
| ADR-004 | yes | none | - |
| ADR-005 | yes | none | - |
| `.specs/STATE.md` AD-003 | yes | none | - |
| `.specs/STATE.md` AD-006 | yes | none | - |
| `.specs/STATE.md` AD-007 | yes | none | - |

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | POST create OWNER/ADMIN × 4 roles → 200 PENDING, e-mail job, SHA-256 only | `vitest run` name filter including create + invitation e-mail proofs, exit 0 | `invitation.spec.ts:100` `expect(response.statusCode, role).toBe(200)`; `:103` `expect(body.status).toBe('PENDING')`; `:121` `expect(stored?.tokenHash).toBe(sha256(token))`; `send-email.spec.tsx:77` `expect(summary?.Subject).toBe('Convite para Corretora Azul')` | PASS |
| C2 | invalid body → 400 VALIDATION_ERROR, no row | `… -t "rejects a body that is not an email…"` ✓ | `invitation.spec.ts:150` `expect(response.statusCode, …).toBe(400)`; `:151` `expect(response.json().error.code).toBe('VALIDATION_ERROR')`; `:153` `expect(…invitationsOf…).toHaveLength(before.length)` | PASS |
| C3 | MANAGER/COMMERCIAL/VIEWER POST → 403 FORBIDDEN | `… -t "rejects an invitation from a role without invitation:create"` ✓ | `invitation.spec.ts:164` `expect(response.statusCode, role).toBe(403)`; `:165` `expect(…error.code).toBe('FORBIDDEN')`; `:167` `expect(…invitationsOf…).toEqual([])` | PASS |
| C4 | POST/GET/DELETE invitations + accept without session → 401 | `… -t "requires a session"` ✓ | `invitation.spec.ts:194` `expect(response.statusCode).toBe(401)`; `:195` `expect(…error.code).toBe('UNAUTHENTICATED')` | PASS |
| C5 | terms pending → 403 TERMS_NOT_ACCEPTED | `… -t "blocks an invitation while terms are pending"` ✓ | `invitation.spec.ts:210` `expect(response.statusCode).toBe(403)`; `:211` `expect(…error.code).toBe('TERMS_NOT_ACCEPTED')`; `:212` `expect(…invitationsOf…).toEqual([])` | PASS |
| C6 | active/inactive member → 409 ALREADY_MEMBER | `… -t "rejects an invitation for someone who is already a member"` ✓ | `invitation.spec.ts:227` `expect(response.statusCode, String(active)).toBe(409)`; `:228-233` `expect(response.json()).toEqual({ error: { code: 'ALREADY_MEMBER', … } })` | PASS |
| C7 | second PENDING same email → 409 INVITATION_PENDING, count 1 | `… -t "rejects a second pending invitation for the same email"` ✓ | `invitation.spec.ts:247` `expect(response.statusCode).toBe(409)`; `:248-253` `expect(response.json()).toEqual({ error: { code: 'INVITATION_PENDING', … } })`; `:254` `expect(…toHaveLength(1)` | PASS |
| C8 | Artur@Exemplo.com stored lowercase | `… -t "stores the invited email in lowercase"` ✓ | `invitation.spec.ts:265` `expect(response.json().email).toBe('artur@exemplo.com')`; `:266` `expect(…[0]?.email).toBe('artur@exemplo.com')` | PASS |
| C9 | pending does not consume seat → second POST 200 | `… -t "allows another invitation while a pending one does not consume a seat"` ✓ | `invitation.spec.ts:290` `expect(response.statusCode).toBe(200)`; `:291` `expect(response.json().status).toBe('PENDING')` | PASS |
| C10 | enqueue fail rolls back Invitation + job | `… -t "rolls back the invitation when enqueue fails"` ✓ | `invitation.spec.ts:302` `expect(await invitationsOf(…)).toEqual([])`; `:303` `expect(await emailJobsTo(…)).toEqual([])` | PASS |
| C11 | ROLE_PERMISSIONS invitation:create on OWNER/ADMIN only | `… -t "matches the role permission snapshot"` ✓ | `permissions.spec.ts:6-12` `expect(ROLE_PERMISSIONS).toEqual({ OWNER: […, 'invitation:create'], ADMIN: […, 'invitation:create'], MANAGER: ['organization:read'], … })` | PASS |
| C12 | GET lists PENDING newest first; empty [] | `… -t "lists pending invitations newest first"` ✓ | `invitation.spec.ts:313` `expect(….json()).toEqual({ items: [] })`; `:325` `expect(listed.statusCode).toBe(200)`; `:326-339` `expect(listed.json().items).toEqual([newer, older])` | PASS |
| C13 | GET/DELETE without invitation:create → 403 | `… -t "rejects listing and revoking without invitation:create"` ✓ | `invitation.spec.ts:358` `expect(listed.statusCode, role).toBe(403)`; `:360` `expect(removed.statusCode, role).toBe(403)` | PASS |
| C14 | DELETE PENDING (incl. expired) → 200 REVOKED | `… -t "revokes a pending invitation"` ✓ | `invitation.spec.ts:386` `expect(first.statusCode).toBe(200)`; `:387` `expect(first.json()).toEqual({ id: open.json().id, status: 'REVOKED' })`; `:389` same for expired | PASS |
| C15 | missing/other-tenant DELETE → 404, foreign stays PENDING | `… -t "hides an invitation from another tenant on revoke"` ✓ | `invitation.spec.ts:404` `expect(missing.statusCode).toBe(404)`; `:406` `expect(foreign.statusCode).toBe(404)`; `:408` `expect(…status).toBe('PENDING')` | PASS |
| C16 | DELETE ACCEPTED/REVOKED → 422 INVITATION_CLOSED | `… -t "rejects revoking an invitation that is no longer pending"` ✓ | `invitation.spec.ts:434` `expect(againAccepted.statusCode).toBe(422)`; `:435-437` `expect(againAccepted.json()).toEqual({ error: { code: 'INVITATION_CLOSED', … } })` | PASS |
| C17 | GET tenant A hides B | `… -t "does not list the other tenant invitation"` ✓ | `invitation.spec.ts:462` `expect(listed.body).not.toContain(foreign.json().id as string)` | PASS |
| C18 | public preview PENDING without session | `… -t "previews a pending invitation without a session"` ✓ | `invitation.spec.ts:478` `expect(response.statusCode).toBe(200)`; `:479-485` `expect(response.json()).toEqual({ organizationName, email, role, status: 'PENDING', expiresAt })` | PASS |
| C19 | unknown token → 404 | `… -t "hides an unknown invitation token"` ✓ | `invitation.spec.ts:495` `expect(response.statusCode).toBe(404)`; `:496` `expect(…error.code).toBe('NOT_FOUND')` | PASS |
| C20 | expired PENDING preview → EXPIRED, row stays PENDING | `… -t "previews an expired invitation as EXPIRED"` ✓ | `invitation.spec.ts:517` `expect(response.json().status).toBe('EXPIRED')`; `:518` `expect(…[0]?.status).toBe('PENDING')` | PASS |
| C21 | REVOKED preview | `… -t "previews a revoked invitation"` ✓ | `invitation.spec.ts:536` `expect(response.json().status).toBe('REVOKED')` | PASS |
| C22 | ACCEPTED preview | `… -t "previews an accepted invitation"` ✓ | `invitation.spec.ts:557` `expect(response.json().status).toBe('ACCEPTED')` | PASS |
| C23 | accept → Member + ACCEPTED + activeOrganizationId; no NO_ACTIVE_ORGANIZATION | `… -t "accepts the invitation and switches the active organization"` ✓ | `invitation.spec.ts:571` `expect(response.statusCode).toBe(200)`; `:577` `expect(member).toMatchObject({ role: 'COMMERCIAL', active: true, commissionSplitBp: 0 })`; `:579` `expect(await activeOrganizationId(…)).toBe(host.organizationId)`; `:573` `expect(response.body).not.toContain('NO_ACTIVE_ORGANIZATION')` | PASS |
| C24 | accept body not only token → 400 | `… -t "rejects an accept body that is not the token"` ✓ | `invitation.spec.ts:594` `expect(extra.statusCode).toBe(400)`; `:595` `expect(…error.code).toBe('VALIDATION_ERROR')`; `:598` `expect(await memberCount(…)).toBe(0)` | PASS |
| C25 | wrong email → 403 INVITATION_EMAIL_MISMATCH | `… -t "rejects an accept from a different email"` ✓ | `invitation.spec.ts:613` `expect(response.statusCode).toBe(403)`; `:614-619` `expect(response.json()).toEqual({ error: { code: 'INVITATION_EMAIL_MISMATCH', … } })` | PASS |
| C26 | expired accept → 422 INVITATION_EXPIRED | `… -t "rejects an expired invitation"` ✓ | `invitation.spec.ts:640` `expect(response.statusCode).toBe(422)`; `:641-643` `expect(response.json()).toEqual({ error: { code: 'INVITATION_EXPIRED', … } })` | PASS |
| C27 | REVOKED/ACCEPTED accept → 422 INVITATION_CLOSED | `… -t "rejects an accept that is no longer open"` ✓ | `invitation.spec.ts:678` `expect(closedRevoked.statusCode).toBe(422)`; `:679` `expect(…error.code).toBe('INVITATION_CLOSED')`; `:680-681` same for ACCEPTED | PASS |
| C28 | 5 active → USER_QUOTA_REACHED; 4 active+1 inactive → 200 | `… -t "rejects an accept when the plan has no seat left"` ✓ | `invitation.spec.ts:701` `expect(denied.statusCode).toBe(422)`; `:702-707` `expect(denied.json()).toEqual({ error: { code: 'USER_QUOTA_REACHED', … } })`; `:724` `expect(accepted.statusCode).toBe(200)` | PASS |
| C29 | 3 memberships → ORG_LIMIT_REACHED | `… -t "rejects an accept past the organization limit"` ✓ | `invitation.spec.ts:745` `expect(response.statusCode).toBe(422)`; `:746-751` `expect(response.json()).toEqual({ error: { code: 'ORG_LIMIT_REACHED', … } })`; `:753` `expect(…status).toBe('PENDING')` | PASS |
| C30 | already member accept → 409 ALREADY_MEMBER, stays PENDING | `… -t "rejects an accept when the email is already a member"` ✓ | `invitation.spec.ts:775` `expect(response.statusCode).toBe(409)`; `:776` `expect(…error.code).toBe('ALREADY_MEMBER')`; `:777` `expect(…status).toBe('PENDING')` | PASS |
| C31 | race last seat → one 200 + one 422 USER_QUOTA_REACHED | `… -t "keeps a single new member when two accepts race for the last seat"` ✓ | `invitation.spec.ts:805` `expect(codes).toEqual([200, 422])`; `:806-808` `expect(….error.code).toBe('USER_QUOTA_REACHED')`; `:809` `expect(await memberCount(…)).toBe(5)` | PASS |
| C32 | active A + token B → Member/active B | `… -t "joins the invited organization even when another one is active"` ✓ | `invitation.spec.ts:827` `expect(response.json().organizationId).toBe(host.organizationId)`; `:828` `expect(await activeOrganizationId(…)).toBe(host.organizationId)` | PASS |
| C33 | accept txn fail → no Member, stays PENDING | `… -t "rolls back the accept when the subscription is missing"` ✓ | `invitation.spec.ts:848` `expect(await memberCount(…)).toBe(0)`; `:849` `expect(…status).toBe('PENDING')` | PASS |
| C34 | app.invitation_token only in database.ts | `… -t "only the database module sets the invitation token"` ✓ | `architecture.spec.ts:132` `expect(filesCitingTenantSetting(readSourceTree(srcRoot))).toEqual([])`; `:133-144` synthetic offender flagged | PASS |
| C35 | mailer fail keeps PENDING; email.send retry_limit 3 | `vitest run` name filter including mailer-fail + retries proofs, exit 0 | `invitation.spec.ts:866` `expect(…status).toBe('PENDING')`; `send-email.spec.tsx:153` `expect(queue).toEqual({ retry_limit: 3, retry_backoff: true })` | PASS |
| C36 | withInvitation by hash; hide other tenant; no bare read/write | `… -t "reads an invitation by token hash and hides the other tenant"` ✓ | `database.spec.ts:118` `expect(byToken?.id).toBe(rowA.id)`; `:119` `expect(otherHash).toBeNull()`; `:121` `expect(…tokenHash).not.toContain(hashB)`; `:122-135` rejects bare/withoutTenant/write | PASS |
| C37 | Invitation RLS USING has invitation_token; WITH CHECK does not; uniques | `… -t "isolates invitations by tenant or token hash"` ✓ | `schema.spec.ts:132` `expect(policy.rows[0]?.qual).toContain('app.invitation_token')`; `:133` `expect(…with_check).not.toContain('app.invitation_token')`; `:134-150` unique PENDING email + (organizationId, tokenHash) | PASS |
| C38 | acceptInvitation mounts without requirePermission; bare /api/v1 still fails boot | `… -t "fails startup when an api v1 route omits requirePermission"` ✓ | `app.spec.ts:283-285` `expect(() => { started.app.get('/api/v1/bare', …) }).toThrow(/requirePermission/)`; `:287` `expect(…printRoutes()).toMatch(/invitations[\s\S]*accept \(POST\)/)` | PASS |

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `POST /api/v1/invitations` statuses (5) | plan Surface | 200 C1 · 400 C2 · 401 C4 · 403 C3 · 409 C6 | - |
| `GET /api/v1/invitations` statuses (3) | plan Surface | 200 C12 · 401 C4 · 403 C13 | - |
| `DELETE /api/v1/invitations/:id` statuses (5) | plan Surface | 200 C14 · 401 C4 · 403 C13 · 404 C15 · 422 C16 | - |
| `GET /api/public/invitations/:token` statuses (2) | plan Surface | 200 C18 · 404 C19 | - |
| `POST /api/v1/invitations/accept` statuses (6) | plan Surface | 200 C23 · 400 C24 · 401 C4 · 403 C25 · 409 C30 · 422 C26 | - |
| preview `status` (4) | plan AC 18–22 | PENDING C18 · EXPIRED C20 · REVOKED C21 · ACCEPTED C22 | - |
| invitable `role` (4) | plan AC 1 | ADMIN/MANAGER/COMMERCIAL/VIEWER C1 | - |
| `invitation:create` (5) | plan door 5 / ADR-005 | OWNER/ADMIN yes C11 · MANAGER/COMMERCIAL/VIEWER no C11 | - |
| create forbidden roles (3) | plan AC 3 | MANAGER/COMMERCIAL/VIEWER C3 | - |
| list forbidden roles (3) | plan AC 13 | MANAGER/COMMERCIAL/VIEWER C13 | - |
| stored invitation status (3) | plan door 1 | PENDING C1 · ACCEPTED C23 · REVOKED C14 | - |
| revoke closed status (2) | plan AC 16 | ACCEPTED C16 · REVOKED C16 | - |
| accept closed status (2) | plan AC 28 | REVOKED C27 · ACCEPTED C27 | - |
| seat count (2) | plan AC 29 | 5 active C28 · 4 active + 1 inactive C28 | - |
| member already (2) | plan AC 6 | active C6 · inactive C6 | - |
| Landing doors (6) | plan Landing | table C37 · pending unique C7 · token hash C1 · token RLS C36 · who invites C11 · session-only accept C23/C38 | - |
| stored entities (4) | plan Impact | Invitation C1 · Member C23 · Session C23 · Plan C28 | - |

Swept existing: Invitation RLS/policy/indexes present (C37); `acceptInvitation` in `SESSION_ONLY` (`tenant-context.ts:21-26`); `enqueueEmail` path unchanged (C1/C35).

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary | `invitation.ts` create/list/revoke/preview/accept | boundary proofs C1–C33 + own-layer race C31 / RLS C36 | yes |
| Decides, not reached across a boundary | `permissions.ts` ROLE_PERMISSIONS | own-layer snapshot C11 | yes |
| Decides, not reached across a boundary | `database.ts` `withInvitation` | own-layer C36 | yes |
| Entry point that decides nothing | `invitation.routes.ts` wiring | boundary coverage via C1–C38; accept without `requirePermission` C38 | yes |
| Instrumentation, pass-throughs | n/a for this feature | none required | yes |

## Faults injected

| Mutation | Location | Killed |
| --- | --- | --- |
| create response `status: 'PENDING'` → `'ACCEPTED'` | `invitation.ts:116` (scratch) | yes - C1 `expect(response.statusCode).toBe(200)` failed (schema 500) |
| removed email-mismatch throw on accept | `invitation.ts:203` (scratch) | yes - C25 expected 403 got 200 |
| removed EXPIRED branch in `previewStatus` | `invitation.ts:59` (scratch) | yes - C20 expected `'EXPIRED'` got `'PENDING'` |
| quota `active >= maxUsers` → `active > maxUsers` | `invitation.ts:228` (scratch) | yes - C28 expected 422 got 200 |
| removed closed-status guard on revoke | `invitation.ts:146` (scratch) | yes - C16 expected 422 got 200 |

Scratch: `git worktree add` at HEAD `121a060`, discarded with `git worktree remove --force`. Real tree porcelain before/after: empty (unchanged).

## Gate

`pnpm --filter @bens/server exec vitest run` (7 files, name filter of all C1–C38 proofs, `--reporter=verbose`) - 40 passed, 0 failed, 50 skipped

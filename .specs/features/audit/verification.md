# Audit verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 116bf4e..3ab6b69
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/architecture.md` §3 módulo `audit` (+ §5 AuditLog) | yes - lines 176, 226–228 (plan Sources said §4; module table is §3) | none | - |
| `docs/architecture.md` §7 carteira / `scopeFor` | yes - lines 305–312 | none | - |
| `docs/architecture.md` §8 `POST …/transfer-portfolio` | yes - line 368 | none | - |
| `docs/migration.md` Auth / Organizations | yes - lines 28, 31 | none | - |
| ADR-004 | yes | none | - |
| ADR-005 | yes | none | - |
| ADR-010 | yes | none | - |
| `.specs/STATE.md` AD-008 | yes | none | - |
| `.specs/STATE.md` AD-009 | yes | none | - |

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | PATCH OWNER/ADMIN × 4 roles → 200 + AuditLog `member.update` `changes.role` | `vitest run` member/audit/scope/schema/permissions/app filters, exit 0; name ✓ | `member.spec.ts:95` `expect(response.statusCode, role).toBe(200)`; `:96` `expect(response.json().role).toBe(role)`; `:98` `expect(trail.at(-1)?.action).toBe('member.update')`; `:99` `expect(trail.at(-1)?.changes).toMatchObject({ role: [previous, role] })` | PASS |
| C2 | PATCH `active: false` → 200 + `changes.active` `[true, false]` | `… -t "deactivates a member"` ✓ | `member.spec.ts:113` `expect(response.statusCode).toBe(200)`; `:114` `expect(response.json().active).toBe(false)`; `:115-117` `expect(…changes).toMatchObject({ active: [true, false] })` | PASS |
| C3 | PATCH reactivate under cap → 200 + `changes.active` `[false, true]` | `… -t "reactivates a member under the seat cap"` ✓ | `member.spec.ts:128` `expect(response.statusCode).toBe(200)`; `:129` `expect(response.json().active).toBe(true)`; `:130-132` `expect(…changes).toMatchObject({ active: [false, true] })` | PASS |
| C4 | reactivate past cap → 422 `USER_QUOTA_REACHED`, member unchanged, no audit | `… -t "rejects a reactivation past the seat cap"` ✓ | `member.spec.ts:146` `expect(response.statusCode).toBe(422)`; `:147-152` `expect(response.json()).toEqual({ error: { code: 'USER_QUOTA_REACHED', message: 'O plano não tem vagas para outro usuário.' } })`; `:154` `expect(member.active).toBe(false)`; `:155` `expect(member.role).toBe('VIEWER')`; `:156` `expect(await auditsOf(…)).toEqual(before)` | PASS |
| C5 | race last seat → codes `[200, 422]`, 5 active, `USER_QUOTA_REACHED` | `… -t "keeps a single reactivation when two race for the last seat"` ✓ | `member.spec.ts:172` `expect(codes).toEqual([200, 422])`; `:173-175` `expect(….error.code).toBe('USER_QUOTA_REACHED')`; `:179` `expect(active).toBe(5)` | PASS |
| C6 | PATCH OWNER → 422 `OWNER_IMMUTABLE`, role/active unchanged, no audit | `… -t "rejects a change to the owner"` ✓ | `member.spec.ts:188` `expect(response.statusCode).toBe(422)`; `:189-194` `expect(response.json()).toEqual({ error: { code: 'OWNER_IMMUTABLE', message: 'O proprietário não pode ser alterado nem desativado.' } })`; `:198` `expect(owner.role).toBe('OWNER')`; `:199` `expect(owner.active).toBe(true)`; `:200` `expect(await auditsOf(…)).toEqual(before)` | PASS |
| C7 | body `role: OWNER` / empty / extra → 400 `VALIDATION_ERROR`, no change | `… -t "rejects a member body that is not a role or an active flag"` ✓ | `member.spec.ts:210` `expect(response.statusCode).toBe(400)`; `:211` `expect(response.json().error.code).toBe('VALIDATION_ERROR')`; `:214` `expect(….role).toBe('VIEWER')` | PASS |
| C8 | MANAGER/COMMERCIAL/VIEWER PATCH → 403 `FORBIDDEN`, no change | `… -t "rejects a member change from a role without member:update"` ✓ | `member.spec.ts:226` `expect(response.statusCode, role).toBe(403)`; `:227` `expect(….error.code).toBe('FORBIDDEN')`; `:230` `expect(….role).toBe('VIEWER')` | PASS |
| C9 | PATCH/GET/POST transfer without session → 401 `UNAUTHENTICATED` | `… -t "requires a session"` ✓ | `member.spec.ts:243` `expect(response.statusCode).toBe(401)`; `:244` `expect(….error.code).toBe('UNAUTHENTICATED')` (loop over patch/get/post) | PASS |
| C10 | terms pending PATCH → 403 `TERMS_NOT_ACCEPTED`, no change | `… -t "blocks a member change while terms are pending"` ✓ | `member.spec.ts:258` `expect(response.statusCode).toBe(403)`; `:259` `expect(….error.code).toBe('TERMS_NOT_ACCEPTED')`; `:260` `expect(….role).toBe('VIEWER')` | PASS |
| C11 | unknown id → 404 `NOT_FOUND` message | `… -t "returns not found for an unknown member"` ✓ | `member.spec.ts:268` `expect(response.statusCode).toBe(404)`; `:269-271` `expect(response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Membro não encontrado.' } })` | PASS |
| C12 | unchanged role+active → 200, audit list equal | `… -t "does not record an audit when the member is unchanged"` ✓ | `member.spec.ts:284` `expect(response.statusCode).toBe(200)`; `:285` `expect(await auditsOf(…)).toEqual(before)` | PASS |
| C13 | ADMIN self-deactivate → 200; next GET organization → 404 `NOT_FOUND` | `… -t "deactivates the caller and the next organization read is not found"` ✓ | `member.spec.ts:297` `expect(response.statusCode).toBe(200)`; `:298` `expect(organization.statusCode).toBe(404)`; `:299` `expect(….error.code).toBe('NOT_FOUND')` | PASS |
| C14 | tenant A PATCH tenant B id → 404; B role stays | `… -t "does not change the other tenant member"` ✓ | `member.spec.ts:311` `expect(response.statusCode).toBe(404)`; `:312` `expect(….role).toBe('VIEWER')` | PASS |
| C15 | GET OWNER/ADMIN → 200 items newest-first, fields, includes inactive | `… -t "lists members newest first including inactive"` ✓ | `member.spec.ts:327` `expect(listed.statusCode).toBe(200)`; `:328-332` `expect(….items.map(…id)).toEqual([newer, older, host])`; `:333-341` `expect(items[0]).toMatchObject({ id, userId, role, active: false, email, name, commissionSplitBp })`; `:345` `expect(asAdmin.statusCode).toBe(200)` | PASS |
| C16 | GET without `member:update` → 403 `FORBIDDEN` | `… -t "rejects listing members without member:update"` ✓ | `member.spec.ts:354` `expect(response.statusCode, role).toBe(403)`; `:355` `expect(….error.code).toBe('FORBIDDEN')` | PASS |
| C17 | GET without session → 401 | same `requires a session` ✓ | `member.spec.ts:243-244` (GET in request list) | PASS |
| C18 | terms pending GET → 403 `TERMS_NOT_ACCEPTED` | `… -t "blocks listing members while terms are pending"` ✓ | `member.spec.ts:367` `expect(response.statusCode).toBe(403)`; `:368` `expect(….error.code).toBe('TERMS_NOT_ACCEPTED')` | PASS |
| C19 | list tenant A hides B member id | `… -t "hides the other tenant from the member list"` ✓ | `member.spec.ts:378` `expect(listed.statusCode).toBe(200)`; `:379-381` `expect(….items.some(…foreign.member.id)).toBe(false)` | PASS |
| C20 | POST transfer OWNER/ADMIN empty moves → 200 `{ transferred: 0 }` + audit | `… -t "transfers an empty portfolio and records the audit"` ✓ | `member.spec.ts:397` `expect(response.statusCode).toBe(200)`; `:398` `expect(response.json()).toEqual({ transferred: 0 })`; `:400` `expect(trail.at(-1)?.action).toBe('portfolio.transfer')`; `:401-405` `expect(….changes).toEqual({ fromMemberId, toMemberId, transferred: 0 })` | PASS |
| C21 | registered move returns 2 → 200 `{ transferred: 2 }`, write persisted, audit | `… -t "adds the rows a registered move reports"` ✓ | `member.spec.ts:423` `expect(response.statusCode).toBe(200)`; `:424` `expect(response.json()).toEqual({ transferred: 2 })`; `:425` `expect(….commissionSplitBp).toBe(2)`; `:426-428` `expect(….changes).toMatchObject({ transferred: 2 })` | PASS |
| C22 | move throws → 500, prior write rolled back, no audit | `… -t "rolls back the transfer when a move throws"` ✓ | `member.spec.ts:450` `expect(response.statusCode).toBe(500)`; `:451` `expect(….commissionSplitBp).toBe(0)`; `:452` `expect(await auditsOf(…)).toEqual(before)` | PASS |
| C23 | same member → 422 `SAME_MEMBER`, no audit | `… -t "rejects a transfer to the same member"` ✓ | `member.spec.ts:466` `expect(response.statusCode).toBe(422)`; `:467-472` `expect(response.json()).toEqual({ error: { code: 'SAME_MEMBER', message: 'A carteira não pode ser transferida para o mesmo membro.' } })`; `:473` `expect(await auditsOf(…)).toEqual(before)` | PASS |
| C24 | inactive target → 422 `TARGET_INACTIVE`, no audit | `… -t "rejects a transfer to an inactive member"` ✓ | `member.spec.ts:485` `expect(response.statusCode).toBe(422)`; `:486-491` `expect(response.json()).toEqual({ error: { code: 'TARGET_INACTIVE', message: 'O destino da carteira precisa estar ativo.' } })`; `:492` `expect(await auditsOf(…)).toEqual(before)` | PASS |
| C25 | missing source/target → 404 `NOT_FOUND`; foreign untouched | `… -t "returns not found when the transfer target is missing"` ✓ | `member.spec.ts:510` `expect(missingTarget.statusCode).toBe(404)`; `:511` `expect(….error.code).toBe('NOT_FOUND')`; `:512` `expect(missingSource.statusCode).toBe(404)`; `:513` `expect(….role).toBe('COMMERCIAL')` | PASS |
| C26 | transfer without `portfolio:transfer` → 403 `FORBIDDEN` | `… -t "rejects a transfer from a role without portfolio:transfer"` ✓ | `member.spec.ts:526` `expect(response.statusCode, role).toBe(403)`; `:527` `expect(….error.code).toBe('FORBIDDEN')` | PASS |
| C27 | POST transfer without session → 401 | same `requires a session` ✓ | `member.spec.ts:243-244` (POST in request list) | PASS |
| C28 | terms pending POST → 403 `TERMS_NOT_ACCEPTED` | `… -t "blocks a transfer while terms are pending"` ✓ | `member.spec.ts:541` `expect(response.statusCode).toBe(403)`; `:542` `expect(….error.code).toBe('TERMS_NOT_ACCEPTED')` | PASS |
| C29 | transfer body missing/extra → 400 `VALIDATION_ERROR`, no audit | `… -t "rejects a transfer body that is not a member id"` ✓ | `member.spec.ts:555` `expect(response.statusCode).toBe(400)`; `:556` `expect(….error.code).toBe('VALIDATION_ERROR')`; `:559` `expect(await auditsOf(…)).toEqual(before)` | PASS |
| C30 | tenant A transfers tenant B id → 404 | `… -t "does not transfer the other tenant member"` ✓ | `member.spec.ts:572` `expect(response.statusCode).toBe(404)`; `:573` `expect(….role).toBe('COMMERCIAL')` | PASS |
| C31 | redact 9 PII keys (nested) keep `role` | `… -t "redacts personal fields and keeps the role"` ✓ | `audit.spec.ts:52-64` `expect(row.changes).toEqual({ email/name/phone/document/documentEncrypted/token/password/ipAddress/userAgent: '[alterado]', role: ['VIEWER', 'ADMIN'], contact: { email/name: '[alterado]', role: 'ADMIN' } })` | PASS |
| C32 | `actorUserId` = ctx.userId; row JSON has no actor email | `… -t "stores the actor user id and not the email"` ✓ | `audit.spec.ts:80` `expect(row.actorUserId).toBe(ctx.userId)`; `:81` `expect(JSON.stringify(row)).not.toContain(ctx.email)` | PASS |
| C33 | tenant B cannot read tenant A audit row | `… -t "hides an audit log from the other tenant"` ✓ | `audit.spec.ts:99` `expect(hidden).toEqual([])`; `:100` `expect(visible).toHaveLength(1)` | PASS |
| C34 | `scopeFor` COMMERCIAL → `{ salespersonId }`; others `{}` | `… -t "scopes only the commercial role to their user"` ✓ | `scope.spec.ts:12` `expect(scopeFor(context('COMMERCIAL'))).toEqual({ salespersonId: 'user-1' })`; `:14` `expect(scopeFor(context(role)), role).toEqual({})` | PASS |
| C35 | `withTwoSalespeople` → same org, distinct users, COMMERCIAL active members | `… -t "builds two commercial contexts in one organization"` ✓ | `member.spec.ts:582-583` `expect(….organizationId).toBe(host.organizationId)`; `:584` `expect(salespersonA.userId).not.toBe(salespersonB.userId)`; `:585-586` `expect(….role).toBe('COMMERCIAL')`; `:592` `expect(members).toHaveLength(2)`; `:593` `expect(members.every(…active && role === 'COMMERCIAL')).toBe(true)` | PASS |
| C36 | AuditLog RLS ENABLE+FORCE `tenant_isolation`; unique includes `organizationId` | `… -t "isolates audit logs by tenant"` ✓ | `schema.spec.ts:181` `expect(protectedTable.rows).toEqual([{ protected: true }])`; `:182` `expect(policy.rows[0]?.qual).toContain('app.tenant_id')`; `:184` `expect(….with_check).toContain('app.tenant_id')`; `:186-190` `expect(indexes…UNIQUE…organizationId…).toBe(true)` | PASS |
| C37 | `member:update` / `portfolio:transfer` only OWNER+ADMIN | `… -t "matches the role permission snapshot"` ✓ | `permissions.spec.ts:6-24` `expect(ROLE_PERMISSIONS).toEqual({ OWNER: […, 'member:update', 'portfolio:transfer'], ADMIN: […], MANAGER/COMMERCIAL/VIEWER: ['organization:read'] })` | PASS |
| C38 | boot refuses bare `/api/v1`; `printRoutes()` has `transfer-portfolio` | `… -t "fails startup when an api v1 route omits requirePermission"` ✓ | `app.spec.ts:283-285` `expect(() => { started.app.get('/api/v1/bare', …) }).toThrow(/requirePermission/)`; `:288` `expect(started.app.printRoutes()).toContain('transfer-portfolio')` | PASS |

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `PATCH /api/v1/members/:id` statuses (6) | plan Surface | 200 C1 · 400 C7 · 401 C9 · 403 C8 · 404 C11 · 422 C6 | - |
| `GET /api/v1/members` statuses (3) | plan Surface | 200 C15 · 401 C17 · 403 C16 | - |
| `POST /api/v1/members/:id/transfer-portfolio` statuses (7) | plan Surface | 200 C20 · 400 C29 · 401 C27 · 403 C26 · 404 C25 · 422 C23 · 500 C22 | - |
| assignable `role` (4) | `member.schema.ts` enum | ADMIN/MANAGER/COMMERCIAL/VIEWER C1 | - |
| patch forbidden roles (3) | plan AC 8 | MANAGER/COMMERCIAL/VIEWER C8 | - |
| list forbidden roles (3) | plan AC 16 | MANAGER/COMMERCIAL/VIEWER C16 | - |
| transfer forbidden roles (3) | plan AC 26 | MANAGER/COMMERCIAL/VIEWER C26 | - |
| `scopeFor` roles (5) | door 3 / ADR-010 | COMMERCIAL C34 · OWNER/ADMIN/MANAGER/VIEWER C34 | - |
| redaction keys (9) | door 2 / AD-008 | email/name/phone/document/documentEncrypted/token/password/ipAddress/userAgent C31 | - |
| `member:update` (5) | door 5 / ADR-005 | OWNER/ADMIN yes C37 · MANAGER/COMMERCIAL/VIEWER no C37 | - |
| `portfolio:transfer` (5) | door 5 / ADR-005 | OWNER/ADMIN yes C37 · MANAGER/COMMERCIAL/VIEWER no C37 | - |
| Landing doors (5) | plan Landing | table C36 · record C31 · scopeFor C34 · moves C21 · who C37 | - |
| stored entities (2) | plan Impact | AuditLog C31 · Member C1 | - |

Swept existing: Origin CSRF on mutating methods still in `app.ts:93-96`; `Member_one_owner` still in org-core migration / schema comment.

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary | `member.ts` updateMember / transferPortfolio | boundary C1–C30 + own-layer race C5 / audit C31 / RLS C36 | yes |
| Decides, reached across a boundary | `audit.ts` `record` / redact | own-layer C31–C33 + boundary consumers C1/C20 | yes |
| Decides, not reached across a boundary | `scope.ts` `scopeFor` | own-layer C34 (five roles) | yes |
| Decides, not reached across a boundary | `permissions.ts` ROLE_PERMISSIONS | own-layer snapshot C37 + boundary C8/C26 | yes |
| Entry point that decides nothing | `member.routes.ts` | boundary C1–C30; permission gate + `transfer-portfolio` in printRoutes C38 | yes |
| Instrumentation, pass-throughs | `portfolio.ts` empty `portfolioMoves` | covered by consumers C20/C21/C22 | yes |

## Faults injected

| Mutation | Location | Killed |
| --- | --- | --- |
| omit `audit.record` on member update | `member.ts` updateMember | yes - C1 `expect(trail.at(-1)?.action).toBe('member.update')` |
| remove OWNER immutability guard | `member.ts` updateMember | yes - C6 `expect(response.statusCode).toBe(422)` got 200 |
| skip moves; return `{ transferred: 7 }` | `member.ts` transferPortfolio | yes - C20 `expect(response.json()).toEqual({ transferred: 0 })` |
| drop `'email'` from REDACTED_KEYS | `audit.ts` | yes - C31 `expect(row.changes).toEqual({ email: '[alterado]', … })` |
| `scopeFor` always `{}` | `scope.ts` | yes - C34 `expect(scopeFor(COMMERCIAL)).toEqual({ salespersonId: 'user-1' })` |

Worktree `/tmp/audit-verify-wt` discarded after injections. Real-tree `git status --porcelain` matched empty baseline before and after.

## Gate

`pnpm --filter @bens/server exec vitest run` (member/audit/scope/schema/permissions/app name filter) - 36 passed, 0 failed (26 skipped unrelated)

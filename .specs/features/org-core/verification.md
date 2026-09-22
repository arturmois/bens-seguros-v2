# Org core verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: faafd9d..8869be9
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

## Binding sources

carried from 775d3ba

Plan `Sources` are not marked binding; profile is `standard` (step 1 is `ui`-scoped). Opened for contradiction sweep anyway:

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/roadmap.md` Fase 4 | yes | none for this slice (invites/audit/web out of scope) | - |
| ADR-003 | yes | none | - |
| ADR-004 | yes | none (doors 5–6 match Member/Organization RLS) | - |
| ADR-005 | yes | none | - |
| `docs/migration.md` Auth / Organizations | yes | none | - |
| AD-001 / AD-005 | cited in plan; no `docs/**/AD-*.md` files | n/a - absent artifact | - |

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | onboard 200 OWNER + member + trial + active session | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C2 | taken slug gets `-2` | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C3 | slug shapes acao/foo-bar/org/48 | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C4 | later onboardings become active (1 then 2) | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C5 | 4th org → 422 ORG_LIMIT_REACHED, count stays 3 | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C6 | name 2/80 → 200; extra/missing/1/81 → 400 VALIDATION_ERROR | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C7 | no session → 401 UNAUTHENTICATED | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C8 | trial plan missing → no org/member/activeId | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C9 | MAX_ORGS_PER_USER=1 → second 422 | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C10 | default MAX_ORGS_PER_USER is 3 | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C11 | switch active membership 200 + role | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C12 | foreign + inactive → 404, session unchanged | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C13 | extra/missing body → 400 | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C14 | active-org without session → 401 | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C15 | terms pending → 403 TERMS_NOT_ACCEPTED, no name | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C16 | no active org → 403 NO_ACTIVE_ORGANIZATION | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C17 | inactive member → GET/PATCH 404 | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C18 | /me role+permissions all 5 roles; null/[]; 401 | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C19 | isSuperAdmin true only flag+2FA; other three pairs false (four pairs) | verified at 8869be9 — `… "only an effective super-admin is a super-admin"` exit 0 | `me.spec.ts:161` `{ isSuperAdmin:false, twoFactorEnabled:false, expected:false }`; `:161-164` four cases; `:175` `expect(me.json().isSuperAdmin, label).toBe(expected)` | PASS |
| C20 | GET org 200 for all 5 roles | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C21 | GET/PATCH without session → 401 | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C22 | PATCH rename OWNER+ADMIN keeps slug | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C23 | PATCH MANAGER/COMMERCIAL/VIEWER → 403, name unchanged | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C24 | PATCH invalid body → 400 | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C25 | bare /api/v1 route throws; SESSION_ONLY four boot | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C26 | ROLE_PERMISSIONS snapshot | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C27 | socket joins user+org rooms | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C28 | socket without org → user room only | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C29 | socket without session refused | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C30 | withTenant hides other member; bare read fails | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C31 | withUser lists only caller orgs | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C32 | withTwoTenants GET hides B | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C33 | examples commission route 404 | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C34 | no Example table | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C35 | concurrent OWNER inserts → one wins | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |
| C36 | cross-tenant member write fails | carried from 775d3ba; re-run at 8869be9 exit 0 | carried from 775d3ba | PASS |

Proofs re-run in full at HEAD `8869be9`: `pnpm --filter @bens/server exec vitest run` over the 10 listed files with one `-t` alternation — **37 passed**, 44 skipped; each named proof appeared under `--reporter=verbose`.

## Coverage

Rows other than `isSuperAdmin` pairs: carried from 775d3ba.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `POST /onboarding` statuses (4) | plan Surface | 200 C1 · 400 C6 · 401 C7 · 422 C5 | - |
| `POST /active-organization` statuses (4) | plan Surface | 200 C11 · 400 C13 · 401 C14 · 404 C12 | - |
| `GET /organization` statuses (4) | plan Surface | 200 C20 · 401 C21 · 403 C15/C16 · 404 C17 | - |
| `PATCH /organization` statuses (5) | plan Surface | 200 C22 · 400 C24 · 401 C21 · 403 C23 · 404 C17 | - |
| `GET /me` statuses (2) | plan Surface | 200 C18 · 401 C18 | - |
| `Role` (5) | door 1 / `ROLES` | all five via C20 | - |
| `organization:read` (5) | C26 snapshot | all five via C26 | - |
| `organization:update` (5) | C22/C23 | OWNER/ADMIN C22 · MANAGER/COMMERCIAL/VIEWER C23 | - |
| name length (4) | AC 5 | 2/80/1/81 via C6 | - |
| slug shape (4) | AC 2 | via C3 | - |
| membership count before onboard (3) | AC 3–4 | 1 C4 · 2 C4 · 3 C5 | - |
| `MAX_ORGS_PER_USER` assemblies (2) | AC 4 | `loadConfig` C10 · test app env C9 | - |
| terms on tenant route (2) | AC 11 | pending C15 · accepted C20 | - |
| active membership (3) | AC 8–9 | active C11 · inactive C12 · missing C12 | - |
| `/me` permissions presence (2) | AC 14 | with org C18 · without C18 | - |
| `isSuperAdmin` pairs (4) | verified at 8869be9 — AC 14 / C19 / `me.spec.ts:161-164` | flag+2FA C19 · flag only C19 · 2FA only C19 · **neither** C19 (`:161` expected false) | - |
| socket session (3) | AC 19 | C27 · C28 · C29 | - |
| permission allowlist (4) | door 7 / `SESSION_ONLY` | getMe/acceptTerms/onboardOrganization/setActiveOrganization via C25 boot + `tenant-context.ts:21-26` | - |
| Landing doors (7) | plan Landing | C26 · C35 · C2 · C1 · C30 · C31 · C25 | - |
| stored entities (6) | Relations | exercised via C1/C7 as cited | - |

Swept existing: carried from 775d3ba — `Member_one_owner` and Member/Organization `tenant_isolation` policies present in `prisma/migrations/20260922210000_org_core/migration.sql`.

## Test policy rows

Re-judged the unmet C19 row (and the boundary row that named it); other rows carried from 775d3ba.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary | onboarding use case, `requireTenant`, `ROLE_PERMISSIONS`, `session-context` isSuperAdmin | boundary + own-layer where decision table exists | yes — verified at 8869be9: C19 now asserts all 4 pairs at `/me` (`me.spec.ts:161-164`) |
| Decides, not reached across a boundary | (none called out beyond above) | own layer | n/a — carried from 775d3ba |
| Entry point that decides nothing | route handlers | boundary | yes — carried from 775d3ba |
| Instrumentation, pass-throughs | n/a | none | n/a — carried from 775d3ba |

## Faults injected

Other mutants carried from 775d3ba (killed). Re-injected only the surface the fix touched (new neither assertion).

Isolated via `git worktree add` at `8869be9` (never stash). Real tree porcelain baseline matched after remove (`M .specs/LESSONS.md`, `M .specs/lessons.json`, `?? .specs/features/org-core/verification.md`, `?? prompts/prompt-04.md`).

| Mutation | Location | Killed |
| --- | --- | --- |
| onboard `role: 'OWNER'` → `'ADMIN'` | carried from 775d3ba | yes |
| `ORG_LIMIT` status 422 → 400 | carried from 775d3ba | yes |
| `TERMS_NOT_ACCEPTED` → `TERMS_PENDING` | carried from 775d3ba | yes |
| OWNER loses `organization:update` | carried from 775d3ba | yes |
| neither pair forces `isSuperAdmin: true` while keeping the three other pairs correct (`(a&&b) \|\| (!a&&!b)`) | verified at 8869be9 — `session-context.ts:42` | yes — C19 failed on `{"isSuperAdmin":false,"twoFactorEnabled":false}: expected true to be false` at `me.spec.ts:175` |

## Gate

`pnpm --filter @bens/server exec vitest run` (batched proofs at `8869be9`) — 37 passed, 0 failed among selected proofs.

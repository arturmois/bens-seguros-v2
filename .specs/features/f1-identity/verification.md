# F1 identity verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: c858eb6..3924f68
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier). I did not build this feature. I ran every proof myself at `3924f68` against the real tree and a scratch worktree, and I changed no product file.

## Summary

- **Checks**: 45 of 47 PASS. C10 FAILS: its own proof command is red at HEAD in 5 of 6 runs. C47 is PARTIAL: it claims a `422` on `POST /api/v1/invitations`, but no proof asserts it and the route has no code path that returns 422.
- **Coverage**: 20 sets recomputed. 4 members have no proof: the guard ignores inactive ADMINs; a whitespace-only greeting is rejected; an empty branding body is rejected; the invitations 422.
- **Faults**: 32 injected (see the note on count), 29 killed, 3 survived.
- **Gate**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exits 0 with 31 files and 303 tests passed. `pnpm api:generate` leaves no diff.
- **Migration squash**: nothing lost. I built the old chain (`c858eb6`) and the new `20260924120000_init` in scratch databases and compared their catalogs. The only differences are the F1 changes. `prisma migrate diff` from the init to `schema.prisma` is empty.

### Ranked gaps

1. **C10: the race proof is flaky and races on the wrong thing.** `apps/server/src/modules/organizations/member.spec.ts:302-324`. One session (`host`) sends both PATCHes, one of which demotes itself. If the self-demotion commits before the second request passes `requirePermission('member:update')`, the second request correctly gets `403`, not `422`. The run fails with `expected [ 200, 403 ] to deeply equal [ 200, 422 ]` at `member.spec.ts:313`. It failed 5 of 6 times with the check's own command (`-t "keeps one admin when two demotions race"`). It passes when the whole file runs (3 of 3), which is why the gate is green. The product keeps the invariant: when the lock is removed the test sees `[200, 200]`, and I observed no zero-admin case at HEAD. The proof needs a race that does not depend on the actor's permission. Options: call `updateMember` directly with a fixed ctx, or accept `403` as the loser's outcome while still asserting exactly one active ADMIN.
2. **Surviving mutant in the last-admin guard: inactive ADMINs.** At `apps/server/src/modules/organizations/member.ts:77` I removed `AND active` from `SELECT id FROM "Member" WHERE role = 'ADMIN' AND active ORDER BY id FOR UPDATE`. All 37 tests in `member.spec.ts` still pass, and so do all 303 server tests. Under that mutant, an organization with one active ADMIN and one inactive ADMIN can demote or deactivate its only active ADMIN and is left with none. That breaks AC 4 and ADR-016 ("sempre ≥ 1 ADMIN ativo"). No check seeds an inactive ADMIN next to the only active one. C9 seeds an inactive ADMIN but only changes that ADMIN. The "guarda do último ADMIN (5 linhas)" row in Coverage misses this row.
3. **Surviving mutants in branding validation.** At `apps/server/src/modules/organizations/branding.schema.ts:8` I removed `.min(1)`, so a whitespace-only greeting is accepted. At `branding.schema.ts:16` I removed the `.refine(...)` on an empty body `{}`. All 18 tests in `branding.spec.ts` pass under each mutant. Both are rejections the code makes but that neither the plan nor the checks name, and the Test policy row "Entry point … each rejected input" requires a proof for each.
4. **C47 / Coverage: a phantom 422 on `POST /api/v1/invitations`.** The plan's `Surface` and C47 claim `422` for this route, and the Coverage row says "422 C47". None of C47's 9 proofs asserts 422 on this route. `createInvitation` (`apps/server/src/modules/organizations/invitation.ts:56-120`) throws only `alreadyMember` (409) and `invitationPending` (409), and `openapi.json` lists only `200`. The artifact claims a status the route does not have. The fix belongs in `plan.md` and `checks.md`, not in the code.
5. **CLAUDE.md "Endpoint: … incluindo withTwoTenants" is only partly met.** `withTwoTenants` covers `GET /api/v1/organization/logo` (`branding.spec.ts:333-357`) and `GET /api/v1/organization` (`organization.spec.ts:196-225`). The three new write routes have no two-tenant test: `PATCH …/branding`, `PUT …/logo` and `DELETE …/logo` (`branding.spec.ts` has only one `withTwoTenants` call, at `:337`). The risk is low because they write `ctx.organizationId` under RLS and take no id, but the repo rule asks for it.

Minor observations (they do not change the verdict):
- The comment at `apps/server/src/modules/organizations/public-chat-key.ts:4` refers to "the migration backfill", which the squash removed.
- Door 3 says "Toda leitura da Organization usa select explícito". The reads do. The writes `tx.organization.update` at `branding.ts:68` and `:89`, and the `create` at `onboarding.ts:33`, have no `select`, so Prisma returns the whole row, `bytea` included, into memory, where it is dropped. Nothing leaves over HTTP (C20 holds under fault), but the server loads the logo bytes on every upload.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/decisions/ADR-016-roles-portfolio-assignment.md` | yes | none. Roles `ADMIN\|MANAGER\|COMMERCIAL` (C1, C2). "≥ 1 ADMIN ativo … 422 … lock das linhas de Member" is implemented at `member.ts:73-78`, which locks only the active ADMIN rows; that is enough for the invariant. `org:branding` appears among the ADR's *examples* ("ex."). The plan's Out of scope uses `organization:update` instead, which fits §7 "novas permissões devem nascer de requisitos reais" | - (the missing inactive-ADMIN row is reported as a Coverage gap below) |
| `docs/decisions/ADR-014-public-channel-identity-consent.md` | yes | none. The ADR writes the path as `/c/:slug` but resolves the tenant "pelo `publicChatKey` do link", and the link is `/c/<publicChatKey>` (C21). The ADR's "canal WEB_CHAT … criado no onboarding" moves to F2 by a user-confirmed Assumption (plan, Assumptions row 1 = y). Rotation is out of scope | - |
| `docs/handoff.md` §7 RBAC | yes | none. Three roles, authorization in the backend (`requirePermission` on all 4 new routes, `branding.routes.ts:22,70`) | - |
| `docs/handoff.md` §11 Web Chat | yes | none. The link is public, unique (C17) and stable (the key is never rotated) | - |
| `docs/handoff.md` §12 Personalização | yes | none. Name (existing), logo (C30, C39), greeting (C22, C41), basic visual identity via `brandColor` (C22, C24) | - |
| `docs/handoff.md` §36 onboarding | yes | none. Creator becomes ADMIN (C15). "Web Chat disponível" is the link (C21); the page arrives in F3 (Out of scope) | - |
| `docs/architecture-analysis.md` §10.4 | yes | none. Logo stored as `bytea` of at most 200 KB (C32), validated by magic bytes (C29), "servido com cache" via `ETag` and 304 with `private, no-cache` (C35) | - |

## Checks

Server proofs ran in one invocation from `apps/server`: `pnpm exec vitest run <8 files> -t "<51 names, alternated>" --reporter=verbose`. Result: 51 passed, 1 failed (C10), 84 skipped. All 51 names appear individually in the output. E2E proofs ran in one invocation from `apps/web`: `playwright test e2e/org-web.spec.ts e2e/branding.spec.ts -g "<7 names>"`, 7 passed. Every proof file is part of the diff `c858eb6..3924f68`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | matrix is exactly 3 roles × listed permissions | permissions.spec `matches the role permission snapshot` ✓ | `apps/server/src/shared/permissions.spec.ts:6` - `expect(ROLE_PERMISSIONS).toEqual({ ADMIN: [...5], MANAGER: ['organization:read'], COMMERCIAL: ['organization:read'] })` | PASS |
| C2 | enum `Role` = ADMIN, MANAGER, COMMERCIAL in order; no `Member_one_owner` | schema.spec (2 names) ✓ | `apps/server/test/schema.spec.ts:376` - `toEqual(['ADMIN', 'MANAGER', 'COMMERCIAL'])`; `schema.spec.ts:389` - `not.toContain('Member_one_owner')` | PASS |
| C3 | PATCH member with OWNER or VIEWER → 400, unchanged | member.spec ✓ | `apps/server/src/modules/organizations/member.spec.ts:222` - `toBe(400)`; `:225` role stays `'COMMERCIAL'` | PASS |
| C4 | POST invitation with OWNER or VIEWER → 400, none created | invitation.spec ✓ | `apps/server/src/modules/organizations/invitation.spec.ts:183` - `toBe(400)`; `:187` - `invitationsOf(...)).toEqual([])` | PASS |
| C6 | only active ADMIN demoted → 422 LAST_ADMIN + message, unchanged, no audit | member.spec ✓ | `member.spec.ts:237-243` - `toBe(422)` and `toEqual({ error: { code: 'LAST_ADMIN', message: 'A corretora precisa de pelo menos um administrador ativo.' } })`; `:244-248` role ADMIN, active, trail `toEqual(before)` | PASS |
| C7 | deactivate only active ADMIN → 422, no change, no audit | member.spec ✓ | `member.spec.ts:259-265` - `toBe(422)`, `code 'LAST_ADMIN'`, member unchanged, trail `toEqual(before)` | PASS |
| C8 | two active ADMINs, demote one → 200 + `changes.role` | member.spec ✓ | `member.spec.ts:276-281` - `toBe(200)`, stored `'COMMERCIAL'`, `changes).toEqual({ role: ['ADMIN', 'COMMERCIAL'] })` | PASS |
| C9 | guard fires only when the last *active* ADMIN would go | member.spec ✓ | `member.spec.ts:295-298` - demoted inactive ADMIN `200`, deactivated MANAGER `200` | PASS |
| C10 | two parallel demotions → exactly one 200 and one 422, one ADMIN left, 5 rounds | member.spec `keeps one admin when two demotions race` **×** (5 of 6 runs red when filtered; 3 of 3 green as a whole file) | `member.spec.ts:313` - `toEqual([200, 422])` fails with `[200, 403]` at HEAD. The test races the actor's own `member:update` permission (see gap 1) | FAIL |
| C11 | self-demotion with another ADMIN → 200; `/me` shows MANAGER permissions | member.spec ✓ | `member.spec.ts:335-337` - `toBe(200)`, `me.json()).toMatchObject({ role: 'MANAGER', permissions: ['organization:read'] })` | PASS |
| C12 | other tenant member → 404 unchanged; 401/403/404 still pass | member.spec (4 names) ✓ | `member.spec.ts:448-449` - `toBe(404)`, foreign role `'COMMERCIAL'` (`withTwoTenants` `:441`); `:380` `toBe(401)`; `:363-364` `toBe(403)` `FORBIDDEN`; `:405-408` `toBe(404)` `NOT_FOUND` | PASS |
| C13 | invite and change selectors offer exactly Administrador, Gerente, Comercial | e2e ✓ | `apps/web/e2e/org-web.spec.ts:480` - `#invite-role option … toHaveText(expected)`; `:481` - change selector options `toHaveText(expected)` | PASS |
| C14 | demoting the only ADMIN shows the server message; role stays Administrador | e2e ✓ | `org-web.spec.ts:466` - `getByText('A corretora precisa de pelo menos um administrador ativo.')` visible; `:469` - `toHaveValue('ADMIN')` | PASS |
| C15 | onboarding → 200, role ADMIN, key `^[0-9a-f]{32}$`, Member ADMIN active, same key stored | onboarding.spec ✓ | `apps/server/src/modules/organizations/onboarding.spec.ts:64-67` - `toBe(200)`, `role 'ADMIN'`, `toMatch(/^[0-9a-f]{32}$/)`; `:76-77` Member `{ role: 'ADMIN', active: true }`, stored key `toBe(body.publicChatKey)` | PASS |
| C16 | `organization.create` with `changes = { role: 'ADMIN' }` | onboarding.spec ✓ | `onboarding.spec.ts:109` - `changes).toEqual({ role: 'ADMIN' })` | PASS |
| C17 | 3 distinct keys; duplicate → unique violation; missing → NOT NULL | onboarding.spec + schema.spec ✓ | `onboarding.spec.ts:91` - `new Set(keys).size).toBe(3)`; `schema.spec.ts:414` - `{ code: '23505', constraint: 'Organization_publicChatKey_key' }`; `:428` - `{ code: '23502', column: 'publicChatKey' }` | PASS |
| C19 | GET organization returns key and branding for all 3 roles; tenant B's key never shows | organization.spec (2 names) ✓ | `apps/server/src/modules/organizations/organization.spec.ts:92-101` - `toEqual({ …, publicChatKey, brandColor: null, greeting: null, logoUpdatedAt: null, role })` per role; `:222-224` - own key, `not.toContain(keys[1]?.publicChatKey)` | PASS |
| C20 | GET organization has no `logo` key | organization.spec ✓ | `organization.spec.ts:247` - `Object.keys(response.json())).not.toContain('logo')` | PASS |
| C21 | link `<origin>/c/<key>` shown and copied exactly | e2e ✓ | `org-web.spec.ts:292` - `web-chat-link … toHaveText(expected)`; `:296` - `clipboard.readText()).toBe(expected)` | PASS |
| C22 | PATCH branding saves and returns both values; GET returns them | branding.spec ✓ | `apps/server/src/modules/organizations/branding.spec.ts:92-100` - `toBe(200)`, `toEqual({ brandColor: '#1a2b3c', greeting: 'Olá! Como podemos ajudar?' })`, GET `toMatchObject` | PASS |
| C23 | audit `{ brandColor: ['', '#1a2b3c'], greeting: ['', 'Bem-vindo'] }` | branding.spec ✓ | `branding.spec.ts:114-117` - `changes).toEqual({ brandColor: ['', '#1a2b3c'], greeting: ['', 'Bem-vindo'] })` | PASS |
| C24 | `#1A2B3C` stored and returned as `#1a2b3c` | branding.spec ✓ | `branding.spec.ts:128-129` - response and stored `toBe('#1a2b3c')` | PASS |
| C25 | 5 invalid colors → 400, stored unchanged | branding.spec ✓ | `branding.spec.ts:138` - `toBe(400)` per color; `:142` - stored `toBe('#000000')` | PASS |
| C26 | greeting of 500 after trim accepted, 501 → 400, unchanged | branding.spec ✓ | `branding.spec.ts:156-159` - `200`, `'a'.repeat(500)`, `400`, stored still 500 | PASS |
| C27 | null clears only that field | branding.spec ✓ | `branding.spec.ts:173` - `{ brandColor: null, greeting: 'Oi' }`; `:179` - both null | PASS |
| C28 | MANAGER or COMMERCIAL × 3 writes → 403, nothing changes | branding.spec ✓ | `branding.spec.ts:199-200` - `toBe(403)`, `FORBIDDEN` (6 combinations); `:204` - `stored(...)).toEqual(before)` | PASS |
| C29 | magic-byte table (8 rows) | logo.spec ✓ | `apps/server/src/modules/organizations/logo.spec.ts:26` - `detectImageType(...)).toBe(expected)` over the table `:15-22` (png, jpeg, webp → type; svg, gif, text, riff-wave, empty → null) | PASS |
| C30 | PNG, JPEG, WebP → 200; GET returns same bytes and type | branding.spec ✓ | `branding.spec.ts:221-227` - `200`, `content-type toBe(type)`, `Buffer.compare(logo.rawPayload, bytes)).toBe(0)` | PASS |
| C31 | audit `{ logo: [false, true] }`, no base64 fragment | branding.spec ✓ | `branding.spec.ts:239` - `toEqual({ logo: [false, true] })`; `:241-242` - `not.toContain(encoded.slice(...))` | PASS |
| C32 | 204800 accepted; 204801 → 422 LOGO_TOO_LARGE; previous kept | branding.spec ✓ | `branding.spec.ts:251` `200`; `:257-258` `422 LOGO_TOO_LARGE`; `:260` stored bytes equal the 204800 image | PASS |
| C33 | SVG and text → 422 LOGO_UNSUPPORTED_TYPE, nothing stored | branding.spec ✓ | `branding.spec.ts:283-287` - `422`, `error).toEqual({ code: 'LOGO_UNSUPPORTED_TYPE', message: 'Envie uma imagem PNG, JPEG ou WebP.' })`; `:290` logo null | PASS |
| C34 | non-base64 → 400, nothing stored | branding.spec ✓ | `branding.spec.ts:300-302` - `400`, `VALIDATION_ERROR`, logo `toBeNull()` | PASS |
| C35 | 200 + ETag; same If-None-Match → 304 with no body | branding.spec ✓ | `branding.spec.ts:317-321` - `200`, etag string, `private, no-cache`, `304`, `rawPayload.length).toBe(0)` | PASS |
| C36 | no logo → 404; tenant B never gets tenant A's logo | branding.spec (2 names) ✓ | `branding.spec.ts:329-330` - `404 NOT_FOUND`; `:356` - `toBe(404)` with tenant A holding a logo (`withTwoTenants` `:337`) | PASS |
| C37 | DELETE → 204; GET logo → 404; `logoUpdatedAt: null` | branding.spec ✓ | `branding.spec.ts:369-372` - `204`, empty body, `404`, `logoUpdatedAt).toBeNull()` | PASS |
| C38 | 4 routes: 401 without a session; 403 NO_ACTIVE_ORGANIZATION without a tenant | branding.spec ✓ | `branding.spec.ts:400` `toBe(401)`; `:402-403` `403`, `NO_ACTIVE_ORGANIZATION` | PASS |
| C39 | no logo text → PNG preview with `src` on `/api/v1/organization/logo` → Remover → no logo text | e2e ✓ | `apps/web/e2e/branding.spec.ts:27`, `:36` - `toHaveAttribute('src', /^\/api\/v1\/organization\/logo\?v=/)`; `:42-43` | PASS |
| C40 | SVG shows the server message | e2e ✓ | `apps/web/e2e/branding.spec.ts:57` - `getByText('Envie uma imagem PNG, JPEG ou WebP.')` visible | PASS |
| C41 | save shows "Identidade visual atualizada."; reload keeps values | e2e ✓ | `apps/web/e2e/branding.spec.ts:72` notice; `:74-75` - `toHaveValue('#1a2b3c')`, greeting value | PASS |
| C42 | COMMERCIAL sees color, greeting and link; no inputs or buttons | e2e ✓ | `apps/web/e2e/branding.spec.ts:92-101` - texts visible, link regex, 5 × `toHaveCount(0)` | PASS |
| C43 | architecture.md markers | shell proof exit 0 | `docs/architecture.md` - the 4 greps in the proof (exit 0 at HEAD) | PASS |
| C44 | roadmap F2 has "canal Web Chat padrão", F1 does not | shell proof exit 0 | `docs/roadmap.md` - the awk and grep proof (exit 0 at HEAD) | PASS |
| C45 | no OWNER, VIEWER or Member_one_owner in non-test code | shell proof exit 0 | the grep returns nothing. Control: the same pattern hits `member.spec.ts:216` when specs are included. `apps/web/src/api`, `openapi.json`, `apps/web/e2e` and `docs/architecture.md` are also clean | PASS |
| C46 | gate green; api:generate leaves no diff | gate exit 0; `git diff --exit-code` exit 0 | gate: 31 files and 303 tests passed, web build succeeded; `apps/web/src/api` and `apps/server/openapi.json` unchanged | PASS |
| C47 | unchanged statuses of onboarding, organization and invitations, incl. invitations **422** | 9 names ✓ | `onboarding.spec.ts:213` 401, `:169-170` 422 ORG_LIMIT_REACHED; `organization.spec.ts:114` 401, `:55-58` 403 NO_ACTIVE_ORGANIZATION; `invitation.spec.ts:119` 200, `:228` 401, `:198` 403, `:261` 409, `:281` 409. **No proof asserts 422 on POST /api/v1/invitations**, and `invitation.ts:56-120` has no 422 path (gap 4) | PARTIAL - FAIL |
| C48 | a single init migration with `Invitation_pending_email`, the trial seed, and ENABLE/FORCE on 5 tables | shell proof exit 0; schema.spec `every tenant table is protected by row security` ✓ | `apps/server/test/schema.spec.ts:199` - `unprotected).toEqual([])`; `apps/server/prisma/migrations/20260924120000_init/migration.sql:294` (pending index), `:301-366` (RLS and policies), `:369-370` (trial seed) | PASS |
| C49 | body above 400 KB → 413, nothing stored | branding.spec ✓ | `branding.spec.ts:270-271` - `toBe(413)`, logo `toBeNull()` | PASS |

### Migration squash (user-requested audit)

I applied the old chain (`c858eb6:apps/server/prisma/migrations`, 10 migrations) to `verify_old` and `20260924120000_init` to `verify_new`. Then I compared a sorted catalog dump of both: columns with type, nullability and default; every constraint with `pg_get_constraintdef` (FK actions included); every index definition; every policy with `qual` and `with_check`; `relrowsecurity` and `relforcerowsecurity` per table; enums; the `Plan` rows; functions and triggers. The only differences:

- `Organization` gains `brandColor`, `greeting`, `logo`, `logoMimeType`, `logoUpdatedAt` (nullable) and `publicChatKey` (`NOT NULL`, unique index `Organization_publicChatKey_key`).
- `Member_one_owner` is gone.
- `Role` changes from `OWNER,ADMIN,MANAGER,COMMERCIAL,VIEWER` to `ADMIN,MANAGER,COMMERCIAL`.

Identical in both: RLS ENABLE and FORCE, and `tenant_isolation` on `Member`, `Organization`, `Subscription`, `Invitation` and `AuditLog`; `Invitation_pending_email`; all 13 FKs with their ON DELETE and ON UPDATE actions; all defaults; the `trial` Plan (`018f…00aa`, maxUsers 5). `prisma migrate diff --from-config-datasource(verify_new) --to-schema prisma/schema.prisma` prints "This is an empty migration". The control run against `verify_old` prints the expected F1 delta. **Nothing was lost in the squash.** The scratch databases were dropped afterwards.

### Out-of-feature e2e failures

`register`, `signup-gates`, `two-factor` and `terms` fail locally. Reproduced: `register.spec.ts:8` times out waiting for `getByLabel('Nome')` because navigation to `/register` never finishes. That page loads the external Cloudflare Turnstile widget (`apps/web/src/routes/(auth)/register.tsx:2,124`). The diff touches none of `src/routes/(auth)`, `(public)`, `(onboarding)`, `__root.tsx`, `src/features/auth`, `src/lib`, `src/components`, `src/hooks`, `index.html` or `vite.config.ts` (0 files). Its change to `e2e/support.ts` only adds exports. **These failures are unrelated to this diff.**

## Coverage

Recomputed from the code (route handlers, schemas, `detectImageType`, `updateMember`), from the framework (Fastify `bodyLimit`, preHandlers) and from the binding ADRs, not from the author's table.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| MVP roles (3) | `permissions.ts:2` | ADMIN, MANAGER, COMMERCIAL -> C1 (`permissions.spec.ts:6`), C2 (`schema.spec.ts:376`) | - |
| removed roles (2) | ADR-016 | OWNER, VIEWER -> C2, C3, C4, C45 | - |
| last-admin guard decision rows (6) | `member.ts:73-78` + ADR-016 | only active, demote -> C6 · only active, deactivate -> C7 · another active -> C8 · target inactive or not ADMIN -> C9 · race -> C10 (**flaky**) · **inactive ADMINs do not count toward the minimum -> no proof** (mutant `AND active` survived) | inactive-ADMIN row; C10 red at HEAD |
| web role places (2) | `labels.ts:13`, `members.tsx` | invitation -> C13 · member change -> C13, C14 | - |
| logo types (8) | `logo.ts:16-21` | png, jpeg, webp, svg, gif, text, riff-without-webp, empty -> C29 (`logo.spec.ts:15-26`); png, jpeg, webp at the boundary -> C30; svg, text -> C33 | - |
| logo size edges (2) | `logo.ts:3`, `branding.ts:59` | 204800 and 204801 -> C32 | - |
| greeting edges (2) + empty (1) | `branding.schema.ts:8` | 500 and 501 -> C26 · **whitespace-only → 400 (`min(1)`) -> no proof** | whitespace-only greeting |
| invalid color shapes (5) | `branding.schema.ts:7` | the 5 shapes -> C25; uppercase normalized -> C24 | - |
| branding body shape (1) | `branding.schema.ts:16` | **`{}` → 400 (refine) -> no proof** (mutant survived) | empty body |
| writes × role without permission (6) | `branding.routes.ts:22` | 6 combinations -> C28 | - |
| `/settings/organization` states (5) | `organization.tsx` | no logo, logo -> C39 · upload error -> C40 · save success -> C41 · read-only -> C42 | - |
| POST onboarding statuses (3) | route + use case | 200 C15 · 401 C47 · 422 C47 | - |
| GET organization statuses (3 in Surface) | route | 200 C19 · 401 C47 · 403 C47 (404 when the membership is gone and 403 TERMS predate F1 and have tests: `organization.spec.ts:61`, `:30`) | - |
| PATCH branding statuses (4) | route | 200 C22 · 400 C25 · 401 C38 · 403 C28, C38 | - |
| PUT logo statuses (6) | route + `bodyLimit` | 200 C30 · 400 C34 · 401 C38 · 403 C28, C38 · 413 C49 · 422 C32, C33 | - |
| DELETE logo statuses (3) | route | 204 C37 · 401 C38 · 403 C28, C38 | - |
| GET logo statuses (5) | route | 200 C35 · 304 C35 · 401 C38 · 403 C38 · 404 C36 | - |
| PATCH member statuses (6) | route + use case | 200 C8 · 400 C3 · 401 C12 · 403 C12 · 404 C12 · 422 C6, C7 | - |
| POST invitations statuses (6 claimed) | `invitation.ts:56-120`, `openapi.json` | 200, 401, 403, 409 -> C47 · 400 -> C4 · **422 -> claimed by C47 and the plan's Surface, but no proof and no code path** | 422 (phantom) |
| doors (5) | plan Landing | 1 -> C2, C48 + catalog diff · 2 -> C15, C17 · 3 -> C19, C20 · 4 -> C29, C32, C33, C49 · 5 -> C6, C7, C9, C10 (see the rows above) | door 5: inactive-ADMIN row |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary (magic bytes) | `logo.ts` | own layer C29 (`logo.spec.ts:26`, 8 rows) · boundary C30, C33 | yes |
| Decides, proven at the boundary only (last-admin guard: the lock lives in the transaction) | `member.ts:73-78` | one boundary case per decision row: C6, C7, C8, C9, C10 | no - the "inactive ADMINs do not count" row has no case (mutant survived), and C10 is red at HEAD with its own command |
| Entry point that decides nothing (color and greeting validation) | `branding.schema.ts` | accepted input and each rejected input | no - whitespace-only greeting (`min(1)`) and the empty body (`refine`) have no proof (both mutants survived) |
| Instrumentation (GET organization select) | `organization.ts:10-27` | covered by its consumer | yes - C19, C20 (a logo-leak mutant is killed at `organization.spec.ts:247`) |

Swept rows that cite existing code: the authorization row cites `apps/server/src/app.spec.ts:280` ("fails startup when an api v1 route omits requirePermission"), which exists and passes in the gate. The concurrency precedent cites `member.spec.ts:193`, which exists. Every `n/a` row is policy the user approved.

CLAUDE.md compliance of the diff:
- Every new route has `operationId` and `requirePermission` (`branding.routes.ts:31,46,56,69`; preHandlers at `:22,70`). Bodies are Zod `.strict()` (`branding.schema.ts:15,25`). DELETE and GET logo take no body or params.
- Audits carry no PII: logo changes are booleans only (C31), and `brandColor` and `greeting` are organization content.
- No `any`, `@ts-ignore`, `@ts-expect-error`, `console.log` or non-`const` `as` in the product diff (grep over the added lines).
- pt-BR messages are accented correctly ("Não", "saudação", "máximo", "Nenhum logo enviado.").
- The one gap is `withTwoTenants` on the three write endpoints (gap 5).

## Faults injected

Server faults ran in a scratch worktree (`git worktree add --detach <scratch>/wt HEAD`). Web faults were applied to the real tree, because the running `vite dev` stack serves it, and reverted with `git checkout -- src` after each run. The real tree's baseline `git status --porcelain` was empty, and it was empty again at the end. I did not use `git stash`. The migration faults ran against freshly created worker schemas. verify.md caps injection at five; the brief asked for at least one fault per assertion surface, so I ran more. Survivors are marked.

| Mutation | Location | Killed |
| --- | --- | --- |
| remove `FOR UPDATE` from the admin lock | `apps/server/src/modules/organizations/member.ts:77` | yes - C10 `[200, 200]` (3 of 3 full-file runs) |
| count inactive ADMINs too (drop `AND active`) | `member.ts:77` | **no - survived** member.spec (37 of 37) and the whole server suite (303 of 303) |
| guard `<= 1` -> `< 1` | `member.ts:78` | yes - C6, C7 (`expected 200 to be 422`) |
| guard ignores whether the target is active (drop `member.active &&`) | `member.ts:74` | yes - C9 (`expected 422 to be 200`) |
| drop `.toLowerCase()` | `branding.schema.ts:6` | yes - C24 |
| greeting `.max(500)` -> `.max(501)` | `branding.schema.ts:8` | yes - C26 |
| drop `.trim()` on greeting | `branding.schema.ts:8` | yes - C26 |
| drop `.min(1)` on greeting | `branding.schema.ts:8` | **no - survived** branding.spec (18 of 18) |
| drop the empty-body `.refine` | `branding.schema.ts:16` | **no - survived** branding.spec (18 of 18) |
| greeting change left out of the audit | `branding.ts:42` | yes - C23 |
| `null` does not clear a color (`!== undefined` -> truthy) | `branding.ts:32` | yes - C27 |
| WebP accepted on `RIFF` alone (no `WEBP` at offset 8) | `logo.ts:19` | yes - C29 (`riff without webp: expected 'image/webp' to be null`) |
| skip the unsupported-type rejection | `branding.ts:61` | yes - C33 |
| size bound `>` -> `>=` | `branding.ts:59` | yes - C32 |
| remove the route `bodyLimit` | `branding.routes.ts:41` | yes - C49 (`expected 422 to be 413`) |
| ETag compared against a wrong value | `branding.routes.ts:75` | yes - C35 |
| logo bytes added to the GET organization select and schema | `organization.ts:19`, `organization.schema.ts:35` | yes - C20 (`to not include 'logo'`); select-only variant killed C19 and C20 via 500 |
| audit carries a base64 slice | `branding.ts:76` | yes - C31 |
| DELETE keeps the bytes | `branding.ts:91` | yes - C37 (`expected 200 to be 404`) |
| onboarding member role `ADMIN` -> `MANAGER` | `onboarding.ts:35` | yes - C15 |
| onboarding audit role `ADMIN` -> `OWNER` | `onboarding.ts:42` | yes - C16 |
| constant `publicChatKey` | `public-chat-key.ts:6` | yes - C17 (the second onboarding fails) |
| MANAGER gains `organization:update` | `permissions.ts:24` | yes - C1 and C28 |
| invitation role enum accepts `VIEWER` | `invitation.schema.ts:4` | yes - C4 |
| drop `FORCE ROW LEVEL SECURITY` on `AuditLog` from the init | `migrations/20260924120000_init/migration.sql` | yes - C48 (`expected [ 'AuditLog' ] to deeply equal []`) |
| `Role` enum keeps `VIEWER` | init migration | yes - C2 |
| re-add a `Member_one_owner` index | init migration | yes - C2 |
| drop `Invitation_pending_email` | init migration | yes - C48 shell proof exit 1, plus `invitation.spec` "maps a duplicate caught by the unique index" |
| link `/c/` -> `/chat/` | `apps/web/src/features/organizations/branding.ts:15` | yes - C21, C42 |
| `ASSIGNABLE_ROLES` loses COMMERCIAL | `apps/web/src/features/organizations/labels.ts:13` | yes - C13 |
| role-change error shows a generic text | `apps/web/src/routes/_app/settings/members.tsx:101` | yes - C14 |
| upload error shows a generic text; preview never renders; save notice changed | `apps/web/src/routes/_app/settings/organization.tsx:30,269,171` | yes - C40, C39, C41 |
| `useCanUpdate` true for everyone | `organization.tsx:61` | yes - C42 |

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` - exit 0, 31 files and 303 tests passed, 0 failed, web build succeeded. `pnpm api:generate && git diff --exit-code apps/web/src/api apps/server/openapi.json` - exit 0.

The gate is green while C10 is red under its own command. That only means the race test is order-dependent (green inside the whole file, red when filtered). It does not mean C10 holds.

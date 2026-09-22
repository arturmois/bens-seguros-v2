# Org core checks

Profile: standard
Plan: `.specs/features/org-core/plan.md`

36 checks in 3 slices · 7 one-way doors · 0 open

Proof command prefix for the server, omitted below: `pnpm --filter @bens/server exec vitest run`.

## Checks

### S1 - Onboarding · ~10 files · ~45 KB · ~12k

**C1** - `POST /api/v1/onboarding` com `{ name: 'Corretora Azul' }` responde `200` com `role: 'OWNER'`, grava `Member` ativo com `commissionSplitBp` 0, grava `Subscription` `TRIALING` no `Plan` `code: 'trial'` `maxUsers: 5` com `trialEndsAt` a 14 dias, e seta `Session.activeOrganizationId` para o `id` devolvido (AC 1, door 1, door 4)
Proof: `src/modules/organizations/onboarding.spec.ts -t "creates the organization, the owner and the trial"`

**C2** - Nome que gera slug já usado responde `200` com sufixo `-2` (AC 2, door 3)
Proof: `src/modules/organizations/onboarding.spec.ts -t "suffixes a slug that is taken"`

**C3** - O slug de `Ação` é `acao`, o de `Foo Bar!` é `foo-bar`, o de `!!!` é `org`, e um nome de 60 letras `a` vira slug de 48 caracteres (AC 2)
Proof: `src/modules/organizations/onboarding.spec.ts -t "builds the slug from the name"`

**C4** - Com 1 membership e com 2, um novo onboarding responde `200` e a sessão passa a apontar para a organização nova (AC 3)
Proof: `src/modules/organizations/onboarding.spec.ts -t "a later onboarding becomes the active organization"`

**C5** - Com 3 memberships, `POST /api/v1/onboarding` responde `422` `{ error: { code: 'ORG_LIMIT_REACHED', message: 'Você já participa do número máximo de organizações.' } }` e a contagem de organizações do usuário continua 3 (AC 4)
Proof: `src/modules/organizations/onboarding.spec.ts -t "rejects the fourth organization"`

**C6** - `name` de 2 e de 80 caracteres responde `200`. Body com campo extra, sem `name`, `name` de 1 caractere e `name` de 81 caracteres respondem `400` com `error.code` `VALIDATION_ERROR` e não gravam organização (AC 5)
Proof: `src/modules/organizations/onboarding.spec.ts -t "rejects a body that is not a name of 2 to 80 characters"`

**C7** - `POST /api/v1/onboarding` sem sessão responde `401` com `error.code` `UNAUTHENTICATED` (AC 6)
Proof: `src/modules/organizations/onboarding.spec.ts -t "requires a session"`

**C8** - Com o `Plan` `trial` apagado, `POST /api/v1/onboarding` não deixa `Organization`, `Member` nem `activeOrganizationId` da tentativa (AC 7)
Proof: `src/modules/organizations/onboarding.spec.ts -t "rolls back when the subscription insert fails"`

**C9** - Com `MAX_ORGS_PER_USER=1`, o segundo onboarding responde `422` `ORG_LIMIT_REACHED` (AC 4)
Proof: `src/modules/organizations/onboarding.spec.ts -t "honors MAX_ORGS_PER_USER"`

**C10** - O default de `MAX_ORGS_PER_USER` é 3 (AC 4)
Proof: `src/shared/config.spec.ts -t "defaults max orgs per user to 3"`

### S2 - Organização ativa e contexto · ~12 files · ~55 KB · ~18k

**C11** - `POST /api/v1/me/active-organization` com o id de um `Member` ativo responde `200` com esse `organizationId` e o `role`, e a sessão aponta para ele (AC 8)
Proof: `src/modules/organizations/active-organization.spec.ts -t "switches to an active membership"`

**C12** - Id de organização alheia e id de `Member` inativo respondem `404` `NOT_FOUND` e `activeOrganizationId` não muda (AC 9)
Proof: `src/modules/organizations/active-organization.spec.ts -t "hides an organization the user is not an active member of"`

**C13** - Body com campo extra e body sem `organizationId` respondem `400` `VALIDATION_ERROR` (AC 10)
Proof: `src/modules/organizations/active-organization.spec.ts -t "rejects a body that is not the organization id"`

**C14** - `POST /api/v1/me/active-organization` sem sessão responde `401` `UNAUTHENTICATED` (AC 6)
Proof: `src/modules/organizations/active-organization.spec.ts -t "requires a session"`

**C15** - Com termos pendentes, `GET /api/v1/organization` responde `403` `{ error: { code: 'TERMS_NOT_ACCEPTED', message: 'Aceite os termos e a política de privacidade para continuar.' } }` e o body não traz `name` (AC 11)
Proof: `src/modules/organizations/organization.spec.ts -t "blocks a tenant route while terms are pending"`

**C16** - Sem `activeOrganizationId`, `GET /api/v1/organization` responde `403` `{ error: { code: 'NO_ACTIVE_ORGANIZATION', message: 'Nenhuma organização ativa.' } }` (AC 12)
Proof: `src/modules/organizations/organization.spec.ts -t "rejects a tenant route without an active organization"`

**C17** - Com `activeOrganizationId` de um `Member` inativo, `GET /api/v1/organization` e `PATCH /api/v1/organization` respondem `404` `NOT_FOUND` (AC 13)
Proof: `src/modules/organizations/organization.spec.ts -t "rejects a tenant route whose membership is gone"`

**C18** - `GET /api/v1/me` com organização ativa inclui `role` e `permissions` daquele papel para `OWNER`, `ADMIN`, `MANAGER`, `COMMERCIAL` e `VIEWER`. Sem organização ativa, `role` é `null` e `permissions` é `[]`. Sem sessão responde `401` `UNAUTHENTICATED` (AC 14, Surface)
Proof: `src/modules/auth/me.spec.ts -t "reports role and permissions for the active membership"`
Proof: `src/modules/auth/me.spec.ts -t "rejects every invalid session with 401"`

**C19** - `isSuperAdmin` no `/me` é `true` só com a flag e `twoFactorEnabled`; nos outros três pares é `false` (AC 14)
Proof: `src/modules/auth/me.spec.ts -t "only an effective super-admin is a super-admin"`

**C20** - `GET /api/v1/organization` responde `200` com `id`, `name`, `slug` e `role` para `OWNER`, `ADMIN`, `MANAGER`, `COMMERCIAL` e `VIEWER` (AC 15, door 1)
Proof: `src/modules/organizations/organization.spec.ts -t "returns the active organization for every role"`

**C21** - `GET /api/v1/organization` e `PATCH /api/v1/organization` sem sessão respondem `401` `UNAUTHENTICATED` (Surface)
Proof: `src/modules/organizations/organization.spec.ts -t "requires a session"`

**C22** - `PATCH /api/v1/organization` com `{ name: 'Outro Nome' }` feito por `OWNER` e por `ADMIN` responde `200` com o nome novo e o mesmo `slug` (AC 16)
Proof: `src/modules/organizations/organization.spec.ts -t "renames the organization without changing the slug"`

**C23** - `PATCH /api/v1/organization` feito por `MANAGER`, `COMMERCIAL` e `VIEWER` responde `403` `FORBIDDEN` e o `name` não muda (AC 17)
Proof: `src/modules/organizations/organization.spec.ts -t "rejects a rename from a role without organization:update"`

**C24** - `PATCH /api/v1/organization` com campo extra, sem `name`, `name` de 1 caractere e `name` de 81 caracteres responde `400` `VALIDATION_ERROR` (AC 5, Surface)
Proof: `src/modules/organizations/organization.spec.ts -t "rejects a rename that is not a name of 2 to 80 characters"`

**C25** - Montar o app com uma rota `/api/v1` sem `requirePermission` lança, e as rotas `getMe`, `acceptTerms`, `onboardOrganization` e `setActiveOrganization` sobem sem essa permissão (AC 18, door 7)
Proof: `src/app.spec.ts -t "fails startup when an api v1 route omits requirePermission"`

**C26** - O mapa é `OWNER` e `ADMIN`: `organization:read`, `organization:update`; `MANAGER`, `COMMERCIAL`, `VIEWER`: só `organization:read` (door 1)
Proof: `src/shared/permissions.spec.ts -t "matches the role permission snapshot"`

**C27** - Socket com sessão cujo `requireTenant` montaria contexto entra nas salas `user:<userId>` e `org:<organizationId>` (AC 19)
Proof: `src/infrastructure/realtime.spec.ts -t "joins the user and org rooms when the tenant context exists"`

**C28** - Socket com sessão sem organização ativa entra só na sala `user:<userId>` (AC 19)
Proof: `src/infrastructure/realtime.spec.ts -t "joins only the user room without an active organization"`

**C29** - Socket sem sessão é recusado (AC 19)
Proof: `src/infrastructure/realtime.spec.ts -t "rejects a socket without a valid session"`

### S3 - Isolamento · ~8 files · ~40 KB · ~15k

**C30** - `withTenant` da organização A não devolve `Member` da B. Leitura de `Member` fora de `withTenant` e de `withUser` falha (AC 20, door 5)
Proof: `src/infrastructure/database.spec.ts -t "hides the other tenant member and fails with no tenant set"`

**C31** - `withUser` devolve só organizações em que o usuário tem `Member`, e não o `name` de outra corretora (AC 21, door 6)
Proof: `src/infrastructure/database.spec.ts -t "lists only the caller organizations"`

**C32** - `withTwoTenants` em `GET /api/v1/organization`: a resposta do tenant A não contém o `id` da organização B (AC 22)
Proof: `src/modules/organizations/organization.spec.ts -t "does not return the other tenant organization"`

**C33** - `GET /api/v1/examples/commission-preview` responde `404` (AC 23)
Proof: `src/app.spec.ts -t "does not mount the example commission route"`

**C34** - A tabela `Example` não existe no catálogo depois das migrations (AC 23)
Proof: `test/schema.spec.ts -t "has no Example table"`

**C35** - Duas inserções concorrentes de `OWNER` na mesma organização deixam uma linha; a outra falha (AC 24, door 2)
Proof: `src/modules/organizations/onboarding.spec.ts -t "keeps a single owner when two inserts race"`

**C36** - Escrita de `Member` apontando para organização de outro tenant falha (`include` / `connect` que o `Example` cobria) (door 5)
Proof: `src/infrastructure/database.spec.ts -t "rejects a cross-tenant member write"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `POST /api/v1/onboarding` statuses (4) | 200 C1 · 400 C6 · 401 C7 · 422 C5 | - |
| `POST /api/v1/me/active-organization` statuses (4) | 200 C11 · 400 C13 · 401 C14 · 404 C12 | - |
| `GET /api/v1/organization` statuses (4) | 200 C20 · 401 C21 · 403 C15 · 404 C17 | - |
| `PATCH /api/v1/organization` statuses (5) | 200 C22 · 400 C24 · 401 C21 · 403 C23 · 404 C17 | - |
| `GET /api/v1/me` statuses (2) | 200 C18 · 401 C18 | - |
| `Role` (5) | `OWNER` C20 · `ADMIN` C20 · `MANAGER` C20 · `COMMERCIAL` C20 · `VIEWER` C20 | - |
| `organization:read` (5) | `OWNER` C26 · `ADMIN` C26 · `MANAGER` C26 · `COMMERCIAL` C26 · `VIEWER` C26 | - |
| `organization:update` (5) | `OWNER` C22 · `ADMIN` C22 · `MANAGER` C23 · `COMMERCIAL` C23 · `VIEWER` C23 | - |
| name length (4) | 2 C6 · 80 C6 · 1 C6 · 81 C6 | - |
| slug shape (4) | `acao` C3 · `foo-bar` C3 · `org` C3 · 48 C3 | - |
| membership count before onboard (3) | 1 C4 · 2 C4 · 3 C5 | - |
| `MAX_ORGS_PER_USER` assemblies (2) | `loadConfig` C10 · test app C9 | - |
| terms on tenant route (2) | pending C15 · accepted C20 | - |
| active membership (3) | active C11 · inactive C12 · missing C12 | - |
| `/me` permissions presence (2) | with org C18 · without org C18 | - |
| `isSuperAdmin` pairs (4) | flag+2FA C19 · flag only C19 · 2FA only C19 · neither C19 | - |
| socket session (3) | tenant C27 · no org C28 · no session C29 | - |
| permission allowlist (4) | `getMe` C25 · `acceptTerms` C25 · `onboardOrganization` C25 · `setActiveOrganization` C25 | - |
| Landing doors (7) | roles C26 · one owner C35 · slug C2 · trial C1 · member RLS C30 · organization RLS C31 · allowlist C25 | - |
| stored entities (6) | `User` C7 · `Session` C1 · `Organization` C1 · `Member` C1 · `Plan` C1 · `Subscription` C1 | - |

- Claims naming a status code, route or response shape: C1, C5, C6, C7, C11, C12, C15, C16, C17, C21, C23, C33 - each has a proof that crosses the boundary
- No other check claims more than the single case its proof exercises

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decides, reached across a boundary | one at the boundary and one at its own layer | the contract at the boundary; one asserted case per row of the decision table at its own layer |
| Decides, not reached across a boundary | one at its own layer | one asserted case per row of the decision table |
| Entry point that decides nothing | one at the boundary | accepted input, each rejected input, each error path |
| Instrumentation, pass-throughs | none of its own | covered by its consumer's proof |

Evidence:

- onboarding: slug, teto, transação única -> decides, reached at `POST /api/v1/onboarding`
- `requireTenant`: termos, org ativa, membro -> decides, reached at `GET /api/v1/organization`
- `ROLE_PERMISSIONS`: 5 papéis × 2 permissões -> decides, reached at `PATCH` e no snapshot
- rota sem `preHandler` de permissão -> decides at boot, C25
- closest analogue: `apps/server/src/modules/auth/terms.spec.ts`, mesma fronteira de sessão com Postgres real

Cost: as provas de fronteira cobrem cada status nomeado. O mapa de papéis tem o snapshot além do `PATCH`.

## Swept

- validation: C3, C6, C13, C24
- failure modes: C8, C35
- idempotency: n/a - repetir o onboarding cria outra organização até o teto (C4, C5); não há chave de dedup
- authorization: C15, C20, C23, C25; `Origin` em método mutável continua o guard já existente do `auth-core`
- concurrency: C35
- data lifecycle: n/a - organização não expira neste ciclo; o trial só grava `trialEndsAt`
- dependency failure: n/a - sem serviço externo
- state transitions: C1, C4, C11, C12
- observability: n/a - sem log novo exigido; auditoria fica na feature `audit`

## Handoff

- S1 = 12k, S2 = 18k, S3 = 15k, total 45k, under the 150k budget - one builder

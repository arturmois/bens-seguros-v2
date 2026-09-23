# Audit checks

Profile: standard
Plan: `.specs/features/audit/plan.md`

38 checks in 4 slices · 5 one-way doors · 0 open

Proof command prefix for the server, omitted below: `pnpm --filter @bens/server exec vitest run`.

## Checks

### S1 - Papel, desativação e dono · ~8 files · ~40 KB · ~16k

**C1** - `PATCH /api/v1/members/:id` feito por `OWNER` e por `ADMIN`, com `role` `ADMIN`, `MANAGER`, `COMMERCIAL` e `VIEWER`, num membro que não é o dono, responde `200` com esse `role` e grava um `AuditLog` `action: 'member.update'` cujo `changes.role` é `[papel anterior, papel novo]` (AC 1, door 2)
Proof: `src/modules/organizations/member.spec.ts -t "changes a member role and records the audit"`

**C2** - `PATCH` com `active: false` num membro que não é o dono responde `200` com `active: false` e grava `changes.active` igual a `[true, false]` (AC 2)
Proof: `src/modules/organizations/member.spec.ts -t "deactivates a member"`

**C3** - `PATCH` com `active: true` num inativo, com ativos abaixo de `maxUsers`, responde `200` com `active: true` e grava `changes.active` igual a `[false, true]` (AC 3)
Proof: `src/modules/organizations/member.spec.ts -t "reactivates a member under the seat cap"`

**C4** - Reativar quando já há 5 ativos responde `422` `{ error: { code: 'USER_QUOTA_REACHED', message: 'O plano não tem vagas para outro usuário.' } }`, o membro continua inativo, o `role` não muda e não nasce `AuditLog` (AC 4)
Proof: `src/modules/organizations/member.spec.ts -t "rejects a reactivation past the seat cap"`

**C5** - Duas reativações na última vaga deixam 5 ativos: uma resposta `200` e a outra `422` `USER_QUOTA_REACHED` (AC 5)
Proof: `src/modules/organizations/member.spec.ts -t "keeps a single reactivation when two race for the last seat"`

**C6** - `PATCH` no `OWNER` responde `422` `{ error: { code: 'OWNER_IMMUTABLE', message: 'O proprietário não pode ser alterado nem desativado.' } }`, `role` continua `OWNER`, `active` continua `true`, sem `AuditLog` (AC 6)
Proof: `src/modules/organizations/member.spec.ts -t "rejects a change to the owner"`

**C7** - Body com `role: 'OWNER'`, sem `role` e sem `active`, ou com campo extra responde `400` `VALIDATION_ERROR` e não altera o membro (AC 7)
Proof: `src/modules/organizations/member.spec.ts -t "rejects a member body that is not a role or an active flag"`

**C8** - `PATCH` feito por `MANAGER`, `COMMERCIAL` e `VIEWER` responde `403` `FORBIDDEN` e não altera o membro (AC 8, door 5)
Proof: `src/modules/organizations/member.spec.ts -t "rejects a member change from a role without member:update"`

**C9** - `PATCH`, `GET /api/v1/members` e `POST /api/v1/members/:id/transfer-portfolio` sem sessão respondem `401` `UNAUTHENTICATED` (AC 9, AC 17, AC 27)
Proof: `src/modules/organizations/member.spec.ts -t "requires a session"`

**C10** - Com termos pendentes, `PATCH` responde `403` `TERMS_NOT_ACCEPTED` e não altera o membro (AC 10)
Proof: `src/modules/organizations/member.spec.ts -t "blocks a member change while terms are pending"`

**C11** - Id fora da organização responde `404` `{ error: { code: 'NOT_FOUND', message: 'Membro não encontrado.' } }` (AC 11)
Proof: `src/modules/organizations/member.spec.ts -t "returns not found for an unknown member"`

**C12** - Body que repete `role` e `active` atuais responde `200` e não grava outro `AuditLog` (AC 12)
Proof: `src/modules/organizations/member.spec.ts -t "does not record an audit when the member is unchanged"`

**C13** - `ADMIN` que desativa o próprio membro recebe `200`, e o `GET /api/v1/organization` seguinte responde `404` `NOT_FOUND` (AC 13)
Proof: `src/modules/organizations/member.spec.ts -t "deactivates the caller and the next organization read is not found"`

**C14** - `withTwoTenants`: `PATCH` do tenant A no id do tenant B responde `404` e o `role` de B permanece (AC 14)
Proof: `src/modules/organizations/member.spec.ts -t "does not change the other tenant member"`

### S2 - Lista · ~4 files · ~12 KB · ~8k

**C15** - `GET /api/v1/members` feito por `OWNER` e por `ADMIN` responde `200` com `{ items }` de todos os membros, do mais novo para o mais antigo, cada item com `id`, `userId`, `role`, `active`, `email`, `name` e `commissionSplitBp`, inclusive inativo (AC 15)
Proof: `src/modules/organizations/member.spec.ts -t "lists members newest first including inactive"`

**C16** - `GET` feito por `MANAGER`, `COMMERCIAL` e `VIEWER` responde `403` `FORBIDDEN` (AC 16)
Proof: `src/modules/organizations/member.spec.ts -t "rejects listing members without member:update"`

**C17** - `GET` sem sessão responde `401` `UNAUTHENTICATED` (AC 17)
Proof: `src/modules/organizations/member.spec.ts -t "requires a session"`

**C18** - Com termos pendentes, `GET` responde `403` `TERMS_NOT_ACCEPTED` (AC 18)
Proof: `src/modules/organizations/member.spec.ts -t "blocks listing members while terms are pending"`

**C19** - `withTwoTenants`: a lista do tenant A não contém o `id` de membro do tenant B (AC 19)
Proof: `src/modules/organizations/member.spec.ts -t "hides the other tenant from the member list"`

### S3 - Transferência · ~6 files · ~25 KB · ~14k

**C20** - `POST /api/v1/members/:id/transfer-portfolio` feito por `OWNER` e por `ADMIN`, com `toMemberId` de outro membro ativo e `portfolioMoves` vazio, responde `200` `{ transferred: 0 }` e grava `AuditLog` `action: 'portfolio.transfer'` com `fromMemberId`, `toMemberId` e `transferred: 0` (AC 20, door 4)
Proof: `src/modules/organizations/member.spec.ts -t "transfers an empty portfolio and records the audit"`

**C21** - Um move registrado que devolve `2` faz o `POST` responder `200` `{ transferred: 2 }`, persiste a escrita desse move e grava `transferred: 2` no mesmo `AuditLog` (AC 21, door 4)
Proof: `src/modules/organizations/member.spec.ts -t "adds the rows a registered move reports"`

**C22** - Um move registrado que lança faz o `POST` responder `500`, reverte a escrita anterior dessa tentativa e não deixa `AuditLog` dela (AC 22)
Proof: `src/modules/organizations/member.spec.ts -t "rolls back the transfer when a move throws"`

**C23** - `toMemberId` igual ao id da origem responde `422` `{ error: { code: 'SAME_MEMBER', message: 'A carteira não pode ser transferida para o mesmo membro.' } }` e não grava `AuditLog` (AC 23)
Proof: `src/modules/organizations/member.spec.ts -t "rejects a transfer to the same member"`

**C24** - Destino inativo responde `422` `{ error: { code: 'TARGET_INACTIVE', message: 'O destino da carteira precisa estar ativo.' } }` e não grava `AuditLog` (AC 24)
Proof: `src/modules/organizations/member.spec.ts -t "rejects a transfer to an inactive member"`

**C25** - Origem ou destino fora da organização responde `404` `NOT_FOUND` e não altera membro de outro tenant (AC 25)
Proof: `src/modules/organizations/member.spec.ts -t "returns not found when the transfer target is missing"`

**C26** - `POST` feito por `MANAGER`, `COMMERCIAL` e `VIEWER` responde `403` `FORBIDDEN` (AC 26, door 5)
Proof: `src/modules/organizations/member.spec.ts -t "rejects a transfer from a role without portfolio:transfer"`

**C27** - `POST` sem sessão responde `401` `UNAUTHENTICATED` (AC 27)
Proof: `src/modules/organizations/member.spec.ts -t "requires a session"`

**C28** - Com termos pendentes, `POST` responde `403` `TERMS_NOT_ACCEPTED` (AC 28)
Proof: `src/modules/organizations/member.spec.ts -t "blocks a transfer while terms are pending"`

**C29** - Body sem `toMemberId` ou com campo extra responde `400` `VALIDATION_ERROR` e não grava `AuditLog` (AC 29)
Proof: `src/modules/organizations/member.spec.ts -t "rejects a transfer body that is not a member id"`

**C30** - `withTwoTenants`: transferir com o tenant A o id do tenant B responde `404` (AC 30)
Proof: `src/modules/organizations/member.spec.ts -t "does not transfer the other tenant member"`

### S4 - Trilha, carteira e isolamento · ~8 files · ~20 KB · ~12k

**C31** - `audit.record` com `email`, `name`, `phone`, `document`, `documentEncrypted`, `token`, `password`, `ipAddress` e `userAgent`, inclusive aninhados, ao lado de `role: ['VIEWER', 'ADMIN']`, grava `"[alterado]"` nessas chaves e mantém `role` (AC 31, door 2)
Proof: `src/modules/audit/audit.spec.ts -t "redacts personal fields and keeps the role"`

**C32** - A linha grava `actorUserId` igual ao `userId` do contexto e não contém o e-mail do ator (AC 32)
Proof: `src/modules/audit/audit.spec.ts -t "stores the actor user id and not the email"`

**C33** - `withTwoTenants`: trilha gravada no tenant A não é lida pelo tenant B (AC 33, door 1)
Proof: `src/modules/audit/audit.spec.ts -t "hides an audit log from the other tenant"`

**C34** - `scopeFor` devolve `{ salespersonId: ctx.userId }` para `COMMERCIAL` e `{}` para `OWNER`, `ADMIN`, `MANAGER` e `VIEWER` (AC 34, door 3)
Proof: `src/shared/scope.spec.ts -t "scopes only the commercial role to their user"`

**C35** - `withTwoSalespeople` devolve dois `RequestContext` com o mesmo `organizationId`, `userId` distinto, `role: 'COMMERCIAL'` e um `Member` ativo para cada um (AC 35)
Proof: `src/modules/organizations/member.spec.ts -t "builds two commercial contexts in one organization"`

**C36** - `AuditLog` tem RLS `ENABLE` + `FORCE`, política `tenant_isolation` e um índice único que inclui `organizationId` (AC 36, door 1)
Proof: `test/schema.spec.ts -t "isolates audit logs by tenant"`

**C37** - O snapshot de `ROLE_PERMISSIONS` tem `member:update` e `portfolio:transfer` só em `OWNER` e `ADMIN` (AC 37, door 5)
Proof: `src/shared/permissions.spec.ts -t "matches the role permission snapshot"`

**C38** - O boot recusa rota `/api/v1` sem `requirePermission`, e `printRoutes()` contém `transfer-portfolio` (AC 38)
Proof: `src/app.spec.ts -t "fails startup when an api v1 route omits requirePermission"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `PATCH /api/v1/members/:id` statuses (6) | 200 C1 · 400 C7 · 401 C9 · 403 C8 · 404 C11 · 422 C6 | - |
| `GET /api/v1/members` statuses (3) | 200 C15 · 401 C17 · 403 C16 | - |
| `POST /api/v1/members/:id/transfer-portfolio` statuses (7) | 200 C20 · 400 C29 · 401 C27 · 403 C26 · 404 C25 · 422 C23 · 500 C22 | - |
| assignable `role` (4) | `ADMIN` C1 · `MANAGER` C1 · `COMMERCIAL` C1 · `VIEWER` C1 | - |
| patch forbidden roles (3) | `MANAGER` C8 · `COMMERCIAL` C8 · `VIEWER` C8 | - |
| list forbidden roles (3) | `MANAGER` C16 · `COMMERCIAL` C16 · `VIEWER` C16 | - |
| transfer forbidden roles (3) | `MANAGER` C26 · `COMMERCIAL` C26 · `VIEWER` C26 | - |
| `scopeFor` roles (5) | `COMMERCIAL` C34 · `OWNER` C34 · `ADMIN` C34 · `MANAGER` C34 · `VIEWER` C34 | - |
| redaction keys (9) | `email` C31 · `name` C31 · `phone` C31 · `document` C31 · `documentEncrypted` C31 · `token` C31 · `password` C31 · `ipAddress` C31 · `userAgent` C31 | - |
| `member:update` (5) | `OWNER` C37 · `ADMIN` C37 · `MANAGER` C37 · `COMMERCIAL` C37 · `VIEWER` C37 | - |
| `portfolio:transfer` (5) | `OWNER` C37 · `ADMIN` C37 · `MANAGER` C37 · `COMMERCIAL` C37 · `VIEWER` C37 | - |
| Landing doors (5) | table C36 · record C31 · scopeFor C34 · moves C21 · who C37 | - |
| stored entities (2) | `AuditLog` C31 · `Member` C1 | - |

- Claims naming a status code, route or response shape: C1, C4, C6, C7, C8, C9, C11, C15, C16, C20, C22, C23, C24, C25, C29 - each has a proof that crosses the boundary
- No other check claims more than the single case its proof exercises

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decides, reached across a boundary | one at the boundary and one at its own layer | the contract at the boundary; one asserted case per row of the decision table at its own layer |
| Decides, not reached across a boundary | one at its own layer | one asserted case per row of the decision table |
| Entry point that decides nothing | one at the boundary | accepted input, each rejected input, each error path |
| Instrumentation, pass-throughs | none of its own | covered by its consumer's proof |

Evidence:

- mudar membro: papel, dono, vaga, inalterado -> decides, reached at `PATCH /api/v1/members/:id`
- transferir: destino, lista de moves, corrida não -> decides, reached at `POST /api/v1/members/:id/transfer-portfolio`
- `scopeFor`: 5 papéis -> decides, at `shared/scope.ts` C34
- `audit.record`: 9 chaves -> decides, at `modules/audit` C31
- `ROLE_PERMISSIONS`: duas permissões em 2 de 5 papéis -> decides, snapshot C37
- closest analogue: `apps/server/src/modules/organizations/invitation.spec.ts`, fronteira com Postgres real e rollback na mesma transação

Cost: cada status nomeado tem prova na fronteira. A redação, o `scopeFor` e o predicado RLS têm prova na própria camada, além do endpoint.

## Swept

- validation: C7, C29
- failure modes: C4, C22
- idempotency: C12
- authorization: C8, C10, C16, C26, C37; `Origin` em método mutável continua o guard já existente do `auth-core`
- concurrency: C5
- data lifecycle: n/a - o expurgo de 5 anos é job de outra fase; este ciclo só insere
- dependency failure: n/a - não há chamada externa; o move que lança é C22
- state transitions: C1, C2, C3, C6
- observability: C1, C20 - a trilha é o registro; não há log novo além dela

## Handoff

- S1 = 16k, S2 = 8k, S3 = 14k, S4 = 12k, total 50k, under the 150k budget - one builder

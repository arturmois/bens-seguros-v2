# Invitations checks

Profile: standard
Plan: `.specs/features/invitations/plan.md`

38 checks in 3 slices · 6 one-way doors · 0 open

Proof command prefix for the server, omitted below: `pnpm --filter @bens/server exec vitest run`.

## Checks

### S1 - Enviar o convite · ~14 files · ~55 KB · ~18k

**C1** - `POST /api/v1/invitations` feito por `OWNER` e por `ADMIN`, com `role` `ADMIN`, `MANAGER`, `COMMERCIAL` e `VIEWER`, responde `200` com `id`, `email`, `role`, `status: 'PENDING'` e `expiresAt` a 7 dias, sem o token no corpo e sem criar `Member`. O job `email.send` na mesma transação tem `template: 'invitation'`, `to` igual ao e-mail, `props.organizationName` o nome da corretora e `props.url` = `APP_URL` + `/accept-invitation?token=` + token cru de 32 bytes. A linha guarda o SHA-256 hex desse token e não o cru. O assunto enviado é `Convite para ` + o nome (AC 1, AC 11, door 3)
Proof: `src/modules/organizations/invitation.spec.ts -t "creates a pending invitation and queues the e-mail"`
Proof: `src/emails/send-email.spec.tsx -t "sends the invitation e-mail"`

**C2** - Body com `role: 'OWNER'`, sem `email`, sem `role`, com campo extra ou com e-mail inválido responde `400` `VALIDATION_ERROR` e não grava convite (AC 2)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects a body that is not an email and an invitable role"`

**C3** - `POST /api/v1/invitations` feito por `MANAGER`, `COMMERCIAL` e `VIEWER` responde `403` `FORBIDDEN` e não grava convite (AC 3, door 5)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects an invitation from a role without invitation:create"`

**C4** - `POST`, `GET` e `DELETE /api/v1/invitations` e `POST /api/v1/invitations/accept` sem sessão respondem `401` `UNAUTHENTICATED` (AC 4, AC 24)
Proof: `src/modules/organizations/invitation.spec.ts -t "requires a session"`

**C5** - Com termos pendentes, `POST /api/v1/invitations` responde `403` `TERMS_NOT_ACCEPTED` e não grava convite (AC 5)
Proof: `src/modules/organizations/invitation.spec.ts -t "blocks an invitation while terms are pending"`

**C6** - E-mail de um `Member` ativo e e-mail de um `Member` inativo respondem `409` `{ error: { code: 'ALREADY_MEMBER', message: 'Esta pessoa já é membro da organização.' } }` e não gravam convite (AC 6)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects an invitation for someone who is already a member"`

**C7** - Segundo `POST` para o mesmo e-mail com convite `PENDING` responde `409` `{ error: { code: 'INVITATION_PENDING', message: 'Já existe um convite pendente para este e-mail.' } }` e a contagem continua 1 (AC 7, door 2)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects a second pending invitation for the same email"`

**C8** - `email: 'Artur@Exemplo.com'` fica gravado `artur@exemplo.com` (AC 8)
Proof: `src/modules/organizations/invitation.spec.ts -t "stores the invited email in lowercase"`

**C9** - Com `maxUsers - 1` membros ativos e um convite `PENDING`, um `POST` para outro e-mail responde `200` (AC 9)
Proof: `src/modules/organizations/invitation.spec.ts -t "allows another invitation while a pending one does not consume a seat"`

**C10** - Se `enqueue` lança dentro do `POST`, não fica `Invitation` nem job `email.send` da tentativa (AC 10)
Proof: `src/modules/organizations/invitation.spec.ts -t "rolls back the invitation when enqueue fails"`

**C11** - O mapa fica `OWNER` e `ADMIN` com `invitation:create`; `MANAGER`, `COMMERCIAL` e `VIEWER` sem ela. As permissões de organização não mudam (door 5)
Proof: `src/shared/permissions.spec.ts -t "matches the role permission snapshot"`

### S2 - Lista e revogação · ~8 files · ~30 KB · ~12k

**C12** - `GET /api/v1/invitations` de `OWNER` e de `ADMIN` responde `200` `{ items }` só com `PENDING`, do mais novo para o mais antigo, cada item `id`, `email`, `role`, `expiresAt`. Sem pendente, `items` é `[]` (AC 12)
Proof: `src/modules/organizations/invitation.spec.ts -t "lists pending invitations newest first"`

**C13** - `GET` e `DELETE /api/v1/invitations` feitos por `MANAGER`, `COMMERCIAL` e `VIEWER` respondem `403` `FORBIDDEN` (AC 13)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects listing and revoking without invitation:create"`

**C14** - `DELETE /api/v1/invitations/:id` de um `PENDING` vigente e de um `PENDING` já expirado responde `200` com esse `id` e `status: 'REVOKED'` (AC 14)
Proof: `src/modules/organizations/invitation.spec.ts -t "revokes a pending invitation"`

**C15** - `DELETE` de id inexistente e de id de outro tenant responde `404` `NOT_FOUND` e não altera a linha do outro tenant (AC 15)
Proof: `src/modules/organizations/invitation.spec.ts -t "hides an invitation from another tenant on revoke"`

**C16** - `DELETE` de convite `ACCEPTED` e de convite `REVOKED` responde `422` `{ error: { code: 'INVITATION_CLOSED', message: 'Este convite não está mais aberto.' } }` e o status não muda (AC 16)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects revoking an invitation that is no longer pending"`

**C17** - `GET /api/v1/invitations` no tenant A não contém o `id` do convite do tenant B (AC 17)
Proof: `src/modules/organizations/invitation.spec.ts -t "does not list the other tenant invitation"`

### S3 - Ver e aceitar · ~12 files · ~70 KB · ~28k

**C18** - `GET /api/public/invitations/:token` sem sessão, token cru de um `PENDING` não expirado, responde `200` com `organizationName`, `email`, `role`, `status: 'PENDING'` e `expiresAt` (AC 18)
Proof: `src/modules/organizations/invitation.spec.ts -t "previews a pending invitation without a session"`

**C19** - Token que não casa responde `404` `NOT_FOUND` (AC 19)
Proof: `src/modules/organizations/invitation.spec.ts -t "hides an unknown invitation token"`

**C20** - Token de `PENDING` com `expiresAt` no passado responde `200` `status: 'EXPIRED'` e a linha continua `PENDING` (AC 20)
Proof: `src/modules/organizations/invitation.spec.ts -t "previews an expired invitation as EXPIRED"`

**C21** - Token de `REVOKED` responde `200` `status: 'REVOKED'` (AC 21)
Proof: `src/modules/organizations/invitation.spec.ts -t "previews a revoked invitation"`

**C22** - Token de `ACCEPTED` responde `200` `status: 'ACCEPTED'` (AC 22)
Proof: `src/modules/organizations/invitation.spec.ts -t "previews an accepted invitation"`

**C23** - `POST /api/v1/invitations/accept` com `{ token }` da sessão do mesmo e-mail, sem termos aceitos, com vaga e com menos de 3 memberships, responde `200` com `organizationId` e `role`, grava `Member` ativo `commissionSplitBp` 0, marca o convite `ACCEPTED` e seta `activeOrganizationId`. Não responde `NO_ACTIVE_ORGANIZATION` (AC 23, door 6)
Proof: `src/modules/organizations/invitation.spec.ts -t "accepts the invitation and switches the active organization"`

**C24** - Body do aceite com campo extra ou sem `token` responde `400` `VALIDATION_ERROR` e não cria `Member` (AC 25)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects an accept body that is not the token"`

**C25** - Aceite com e-mail de sessão diferente responde `403` `{ error: { code: 'INVITATION_EMAIL_MISMATCH', message: 'Este convite é para outro e-mail.' } }` e não cria `Member` (AC 26)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects an accept from a different email"`

**C26** - Aceite de `PENDING` expirado responde `422` `{ error: { code: 'INVITATION_EXPIRED', message: 'Este convite expirou.' } }` e não cria `Member` (AC 27)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects an expired invitation"`

**C27** - Aceite de `REVOKED` e de `ACCEPTED` responde `422` `INVITATION_CLOSED` e não cria outro `Member` (AC 28)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects an accept that is no longer open"`

**C28** - Com 5 membros ativos no plano `trial`, o aceite responde `422` `{ error: { code: 'USER_QUOTA_REACHED', message: 'O plano não tem vagas para outro usuário.' } }` e o convite continua `PENDING`. Com 4 ativos e 1 inativo, o aceite responde `200` (AC 29)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects an accept when the plan has no seat left"`

**C29** - Usuário com 3 memberships recebe `422` `{ error: { code: 'ORG_LIMIT_REACHED', message: 'Você já participa do número máximo de organizações.' } }` e o convite continua `PENDING` (AC 30)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects an accept past the organization limit"`

**C30** - Aceite quando o e-mail já é `Member` responde `409` `ALREADY_MEMBER` e o convite continua `PENDING` (AC 31)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects an accept when the email is already a member"`

**C31** - Duas aceitações disputando a última vaga deixam um só `Member` novo: uma resposta `200` e a outra `422` `USER_QUOTA_REACHED` (AC 32)
Proof: `src/modules/organizations/invitation.spec.ts -t "keeps a single new member when two accepts race for the last seat"`

**C32** - Sessão com organização ativa A e token da organização B grava o `Member` em B e passa `activeOrganizationId` para B (AC 33)
Proof: `src/modules/organizations/invitation.spec.ts -t "joins the invited organization even when another one is active"`

**C33** - Se a transação do aceite falha, não fica `Member` novo e o convite continua `PENDING` (AC 34)
Proof: `src/modules/organizations/invitation.spec.ts -t "rolls back the accept when the subscription is missing"`

**C34** - `app.invitation_token` fora de `infrastructure/database.ts` é recusado; dentro dele, não (AC 35, door 4)
Proof: `test/architecture.spec.ts -t "only the database module sets the invitation token"`

**C35** - Com o mailer falhando, a linha `Invitation` continua `PENDING`. A fila `email.send` segue `retry_limit` 3 e `retry_backoff` true (AC 36)
Proof: `src/modules/organizations/invitation.spec.ts -t "keeps the invitation when the mailer fails"`
Proof: `src/emails/send-email.spec.tsx -t "retries a failed send"`

**C36** - `withInvitation` lê a linha pelo hash sem tenant e não lê convite de outro hash. `withTenant` de A não devolve convite de B. Leitura de `Invitation` sem tenant e sem token falha. Escrita dentro de `withInvitation` falha (door 4)
Proof: `src/infrastructure/database.spec.ts -t "reads an invitation by token hash and hides the other tenant"`

**C37** - A política `tenant_isolation` de `Invitation` cita `app.invitation_token` no `USING` e não no `WITH CHECK`. Existe índice único parcial de e-mail `PENDING` e índice único `(organizationId, tokenHash)` (door 1, door 2, door 3, door 4)
Proof: `test/schema.spec.ts -t "isolates invitations by tenant or token hash"`

**C38** - `acceptInvitation` sobe sem `requirePermission`. Uma rota `/api/v1` sem permissão continua derrubando o boot (door 6)
Proof: `src/app.spec.ts -t "fails startup when an api v1 route omits requirePermission"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `POST /api/v1/invitations` statuses (5) | 200 C1 · 400 C2 · 401 C4 · 403 C3 · 409 C6 | - |
| `GET /api/v1/invitations` statuses (3) | 200 C12 · 401 C4 · 403 C13 | - |
| `DELETE /api/v1/invitations/:id` statuses (5) | 200 C14 · 401 C4 · 403 C13 · 404 C15 · 422 C16 | - |
| `GET /api/public/invitations/:token` statuses (2) | 200 C18 · 404 C19 | - |
| `POST /api/v1/invitations/accept` statuses (6) | 200 C23 · 400 C24 · 401 C4 · 403 C25 · 409 C30 · 422 C26 | - |
| preview `status` (4) | `PENDING` C18 · `EXPIRED` C20 · `REVOKED` C21 · `ACCEPTED` C22 | - |
| invitable `role` (4) | `ADMIN` C1 · `MANAGER` C1 · `COMMERCIAL` C1 · `VIEWER` C1 | - |
| `invitation:create` (5) | `OWNER` C11 · `ADMIN` C11 · `MANAGER` C11 · `COMMERCIAL` C11 · `VIEWER` C11 | - |
| create forbidden roles (3) | `MANAGER` C3 · `COMMERCIAL` C3 · `VIEWER` C3 | - |
| list forbidden roles (3) | `MANAGER` C13 · `COMMERCIAL` C13 · `VIEWER` C13 | - |
| stored invitation status (3) | `PENDING` C1 · `ACCEPTED` C23 · `REVOKED` C14 | - |
| revoke closed status (2) | `ACCEPTED` C16 · `REVOKED` C16 | - |
| accept closed status (2) | `REVOKED` C27 · `ACCEPTED` C27 | - |
| seat count (2) | 5 active C28 · 4 active + 1 inactive C28 | - |
| member already (2) | active C6 · inactive C6 | - |
| Landing doors (6) | table C37 · pending unique C7 · token hash C1 · token RLS C36 · who invites C11 · session-only accept C23 | - |
| stored entities (4) | `Invitation` C1 · `Member` C23 · `Session` C23 · `Plan` C28 | - |

- Claims naming a status code, route or response shape: C1, C2, C3, C4, C6, C7, C15, C16, C19, C24, C25, C26, C28, C29, C30 - each has a proof that crosses the boundary
- No other check claims more than the single case its proof exercises

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decides, reached across a boundary | one at the boundary and one at its own layer | the contract at the boundary; one asserted case per row of the decision table at its own layer |
| Decides, not reached across a boundary | one at its own layer | one asserted case per row of the decision table |
| Entry point that decides nothing | one at the boundary | accepted input, each rejected input, each error path |
| Instrumentation, pass-throughs | none of its own | covered by its consumer's proof |

Evidence:

- criar convite: papel, e-mail, duplicata, membro existente, cota que não consome -> decides, reached at `POST /api/v1/invitations`
- aceite: prazo, status, e-mail, vaga, teto de orgs, corrida -> decides, reached at `POST /api/v1/invitations/accept`
- preview: quatro estados de resposta a partir de status e `expiresAt` -> decides, reached at `GET /api/public/invitations/:token`
- `ROLE_PERMISSIONS`: `invitation:create` em 2 de 5 papéis -> decides, snapshot C11
- `withInvitation`: lê pelo hash, não escreve -> decides, at `database.ts` C36
- closest analogue: `apps/server/src/modules/organizations/onboarding.spec.ts`, fronteira com Postgres real e rollback na mesma transação

Cost: cada status nomeado tem prova na fronteira. A corrida da última vaga e o predicado RLS têm prova na própria camada, além do endpoint.

## Swept

- validation: C2, C8, C24
- failure modes: C10, C33
- idempotency: C7
- authorization: C3, C5, C11, C13, C25; `Origin` em método mutável continua o guard já existente do `auth-core`
- concurrency: C31
- data lifecycle: C14, C20 - expirado continua `PENDING` e ainda pode ser revogado; não há expurgo
- dependency failure: C35
- state transitions: C14, C16, C23, C27
- observability: n/a - sem log novo exigido; auditoria fica na feature `audit`

## Handoff

- S1 = 18k, S2 = 12k, S3 = 28k, total 58k, under the 150k budget - one builder

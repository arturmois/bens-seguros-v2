# Health fixes checks

Profile: standard
Plan: `.specs/features/health-fixes/plan.md`

21 checks in 3 slices · 2 one-way doors · 1 open (blocks go-live, fora deste ciclo)

Proof command prefix for the server, omitted below: `pnpm --filter @bens/server exec vitest run`. Commands starting with `rg` or `pnpm` run from the repo root and are written in full.

## Checks

### S1 - Trilha das ações sensíveis · ~9 files · ~90 KB · ~23k

**C1** - `POST /api/v1/invitations` com `role` `COMMERCIAL` responde `200` e deixa exatamente um `AuditLog` `action: 'invitation.create'` com `entityId` = `id` da resposta, `actorUserId` = quem convidou e `changes` = `{ role: 'COMMERCIAL' }` (AC 1, door 1)
Proof: `src/modules/organizations/invitation.spec.ts -t "records invitation.create without the email"`

**C2** - Nenhum campo da linha `invitation.create` (serializada inteira) contém o e-mail convidado (AC 2)
Proof: `src/modules/organizations/invitation.spec.ts -t "records invitation.create without the email"`

**C3** - `DELETE /api/v1/invitations/:id` num pendente responde `200` e deixa um `AuditLog` `action: 'invitation.revoke'` com `entityId` = id do convite e `changes` = `{ status: ['PENDING', 'REVOKED'] }` (AC 3, door 1)
Proof: `src/modules/organizations/invitation.spec.ts -t "records invitation.revoke"`

**C4** - `POST /api/v1/invitations/accept` responde `200` e deixa, no tenant do convite, um `AuditLog` `action: 'invitation.accept'` com `actorUserId` = quem aceitou, `entityId` = id do `Member` criado e `changes` = `{ role: 'COMMERCIAL', invitationId }` (AC 4, door 1)
Proof: `src/modules/organizations/invitation.spec.ts -t "records invitation.accept in the invited organization"`

**C5** - `PATCH /api/v1/organization` responde `200` e deixa um `AuditLog` `action: 'organization.update'` com `entityId` = id da organização e `changes` = `{ name: '[alterado]' }` (AC 5, door 1)
Proof: `src/modules/organizations/organization.spec.ts -t "records organization.update with the name redacted"`

**C6** - `POST /api/v1/onboarding` responde `200` e deixa, na organização nova, um `AuditLog` `action: 'organization.create'` com `actorUserId` = quem criou, `entityId` = `id` da resposta e `changes` = `{ role: 'OWNER' }` (AC 6, door 1)
Proof: `src/modules/organizations/onboarding.spec.ts -t "records organization.create"`

**C7** - Um segundo convite pendente para o mesmo e-mail responde `409` `INVITATION_PENDING` e a organização continua com uma só linha `invitation.create` (AC 7)
Proof: `src/modules/organizations/invitation.spec.ts -t "does not record a rejected duplicate invitation"`

**C8** - Um aceite com o plano cheio responde `422` `USER_QUOTA_REACHED` e a organização não tem linha `invitation.accept` (AC 8)
Proof: `src/modules/organizations/invitation.spec.ts -t "does not record an accept past the seat cap"`

**C9** - `withTwoTenants`: um `AuditLog` gravado no tenant A não aparece lendo `AuditLog` no tenant B (AC 9)
Proof: `src/modules/audit/audit.spec.ts -t "hides an audit log from the other tenant"`

**C21** - As duas ações que já gravavam continuam gravando depois de `audit.record` aceitar `Pick<RequestContext, 'userId'>`: `member.update` com `changes.role` `[anterior, novo]` e `portfolio.transfer` com `transferred` (door 1)
Proof: `src/modules/organizations/member.spec.ts -t "changes a member role and records the audit"`
Proof: `src/modules/organizations/member.spec.ts -t "transfers an empty portfolio and records the audit"`

### S2 - Uma casa por regra e erros com contexto · ~10 files · ~70 KB · ~18k

**C10** - Onboarding e aceite com o usuário no teto respondem `422` `ORG_LIMIT_REACHED`, e a comparação com `maxOrgsPerUser` aparece numa única linha de produção, em `organizations/membership.ts` (AC 10)
Proof: `src/modules/organizations/onboarding.spec.ts -t "rejects the fourth organization"`
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects an accept past the organization limit"`
Proof: `test "$(rg -n '>=\s*maxOrgsPerUser' apps/server/src -g '!*.spec.*' | wc -l)" = 1 && rg -q '>=\s*maxOrgsPerUser' apps/server/src/modules/organizations/membership.ts`

**C11** - `isUniqueViolation` é definida uma vez, em `shared/errors.ts`, e o `409` de convite duplicado e o sufixo de slug continuam funcionando (AC 11)
Proof: `test "$(rg -n 'function isUniqueViolation' apps/server/src | wc -l)" = 1 && rg -q 'export function isUniqueViolation' apps/server/src/shared/errors.ts`
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects a second pending invitation for the same email"`
Proof: `src/modules/organizations/onboarding.spec.ts -t "suffixes a slug that is taken"`

**C12** - Nenhum arquivo de produção contém `'tenant context missing'`, e as rotas usam `currentTenant(request)` (AC 12)
Proof: `! rg -q 'tenant context missing' apps/server/src && test "$(rg -c 'currentTenant\(request\)' apps/server/src/modules/organizations/*.routes.ts | awk -F: '{s+=$2} END {print s}')" = 8`

**C13** - `audit.record` com `changes: { nested: { value: null } }` rejeita com mensagem que contém `changes.nested.value` (AC 13)
Proof: `src/modules/audit/audit.spec.ts -t "names the key path of an unsupported change"`

**C14** - `acceptInvitation` numa organização sem `Subscription` rejeita com mensagem que contém o `organizationId` dessa organização, e o membro não é criado (AC 14)
Proof: `src/modules/organizations/invitation.spec.ts -t "rolls back the accept when the subscription is missing"`

**C15** - `previewStatus` recebe o enum `InvitationStatus` do Prisma e não existe mais `'unexpected invitation status'`; os previews de `PENDING`, `EXPIRED`, `REVOKED` e `ACCEPTED` seguem respondendo (AC 15)
Proof: `! rg -q 'unexpected invitation status' apps/server/src && pnpm typecheck`
Proof: `src/modules/organizations/invitation.spec.ts -t "previews"`

### S3 - Documentação igual ao código · 4 files · ~70 KB · ~18k

**C16** - `docs/architecture.md` §2 descreve `<entidade>.ts`, `<entidade>.routes.ts`, `<entidade>.schema.ts`, `<entidade>.spec.ts` e `index.ts`, com `repository` só quando a query serve dois ou mais arquivos de use case, e o exemplo de use case não chama `commissionRepository` (AC 16, door 2)
Proof: `! rg -q 'commissionRepository|client\.repository\.ts    # funções Prisma' docs/architecture.md && rg -q 'dois ou mais arquivos de use case' docs/architecture.md`

**C17** - A linha `auth` do §3 não cita troca de org ativa e a linha `organizations` cita (AC 17)
Proof: `! rg -q '^\| .auth. .*troca de org ativa' docs/architecture.md && rg -q '^\| .organizations. .*troca da organização ativa' docs/architecture.md`

**C18** - `CLAUDE.md` não contém "o repository recebe esse" (AC 18)
Proof: `! rg -q 'o repository recebe esse' CLAUDE.md && rg -q 'query recebe esse `tx`' CLAUDE.md`

**C19** - A linha AD-008 do `.specs/STATE.md` lista as sete ações e a regra de ação nova (AC 19, door 1)
Proof: `for a in member.update portfolio.transfer invitation.create invitation.revoke invitation.accept organization.create organization.update; do rg -q "^\| AD-008 .*\`$a\`" .specs/STATE.md || exit 1; done && rg -q '^\| AD-008 .*ação nova entra na AD antes do código' .specs/STATE.md`

**C20** - `docs/roadmap.md` registra os placeholders de `documents.ts` como bloqueio de go-live e a subida de `TERMS_VERSION`/`PRIVACY_VERSION` (AC 20)
Proof: `rg -q 'go-live.*documents\.ts|documents\.ts.*go-live' docs/roadmap.md && rg -q 'TERMS_VERSION.*PRIVACY_VERSION' docs/roadmap.md`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| ações auditadas, door 1 (7) | `member.update` C21 · `portfolio.transfer` C21 · `invitation.create` C1 · `invitation.revoke` C3 · `invitation.accept` C4 · `organization.create` C6 · `organization.update` C5 | - |
| falha sem linha de trilha (2) | convite duplicado C7 · aceite sem vaga C8 | - |
| rotas que usam o teto de organizações (2) | onboarding C10 · aceite C10 | - |
| usos de `isUniqueViolation` (3) | `errorHandler` C11 (estrutural) · `invitation.ts` C11 · `onboarding.ts` C11 | - |
| erros de invariante do F-07 (3) | `unexpected audit change` C13 · `Subscription missing` C14 · `unexpected invitation status` C15 | - |
| status de preview (4) | `PENDING` C15 · `EXPIRED` C15 · `REVOKED` C15 · `ACCEPTED` C15 | - |
| documentos (5) | `architecture.md` §2 C16 · `architecture.md` §3 C17 · `CLAUDE.md` C18 · `STATE.md` C19 · `roadmap.md` C20 | - |
| molde de módulo, door 2 (1) | C16 | - |

- Claims naming a status code or response shape: C1, C3, C4, C5, C6, C7, C8, C10 - each proof crosses the HTTP boundary with `app.inject`
- C14 calls the use case directly, because the `500` body hides the message by design (`INTERNAL_ERROR`)

## Test policy

O `CLAUDE.md` já responde às duas perguntas: endpoint → integração com PostgreSQL real (`app.inject`); regra pura → unitário. Os checks S1 e S2 atravessam a rota; C13 e C14 chamam a função porque o `500` esconde a mensagem. Sem linhas novas.

## Swept

- validation: n/a - nenhum schema de entrada muda
- failure modes: C7, C8, C14
- idempotency: n/a - nenhuma rota nova; as tocadas mantêm o comportamento de repetição
- authorization: existing - `requirePermission` nas rotas tocadas, sem mudança; C12 só troca o acesso ao contexto
- concurrency: existing - a linha de trilha entra na mesma transação do ato; os testes de corrida do aceite (`keeps a single new member when two accepts race for the last seat`) continuam
- data lifecycle: n/a - sem backfill de atos passados (plano, Out of scope)
- dependency failure: n/a - nenhuma dependência externa nova
- state transitions: C3 (`PENDING` → `REVOKED`), C4 (`PENDING` → `ACCEPTED`)
- observability: C13, C14 - erro de invariante com o valor que o disparou

## Handoff

- S1 = 23k, `organizations` e `audit`; S2 entra nos mesmos arquivos, 41k; S3 é só documentação, 59k no total, abaixo do budget de 150k - one builder

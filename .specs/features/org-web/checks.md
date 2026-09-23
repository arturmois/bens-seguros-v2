# Org web checks

Profile: standard
Plan: `.specs/features/org-web/plan.md`

43 checks in 5 slices · 3 one-way doors · 0 open

Proof command prefix for the server, omitted below: `pnpm --filter @bens/server exec vitest run`.
Proof command prefix for the web, omitted below: `pnpm --filter @bens/web exec playwright test`.

## Checks

### S1 - Criar a corretora · ~6 files · ~24 KB · ~6k

**C1** - Usuário autenticado, com termos aceitos e sem membership, em `/dashboard` vai para `/onboarding` e vê o título "Criar corretora", o campo "Nome" e o botão "Criar corretora" (AC 1, door 2, door 3)
Proof: `e2e/org-web.spec.ts -g "sends a user without a brokerage to onboarding"`
Proof: `e2e/register.spec.ts -g "the e-mail link signs in"`

**C2** - Enviar o nome "Corretora Azul" chama `POST /api/v1/onboarding` com `{ name: "Corretora Azul" }`, vai para `/dashboard` e o cabeçalho mostra "Corretora Azul" (AC 2)
Proof: `e2e/org-web.spec.ts -g "creates the brokerage and shows its name"`

**C3** - Nome com 1 caractere e nome com 81 caracteres mostram "O nome precisa ter entre 2 e 80 caracteres." e não chamam `POST /api/v1/onboarding` (AC 3)
Proof: `e2e/org-web.spec.ts -g "rejects a brokerage name outside 2 to 80 characters"`

**C4** - `POST /api/v1/onboarding` `422` `ORG_LIMIT_REACHED` mostra "Você já participa do número máximo de organizações." e a URL continua `/onboarding` (AC 4)
Proof: `e2e/org-web.spec.ts -g "shows the organization limit message"`

**C5** - Sem sessão, `/onboarding` vai para `/login` (AC 5)
Proof: `e2e/org-web.spec.ts -g "sends a signed-out visitor away from onboarding"`

**C6** - Com termos pendentes, `/onboarding` vai para `/terms-acceptance` (AC 6)
Proof: `e2e/org-web.spec.ts -g "sends pending terms away from onboarding"`

**C7** - OWNER com uma corretora que envia outro nome válido em `/onboarding` vê esse nome no cabeçalho do `/dashboard` (AC 7)
Proof: `e2e/org-web.spec.ts -g "makes the new brokerage active"`

### S2 - Escolher e trocar · ~8 files · ~32 KB · ~8k

**C8** - `GET /api/v1/me` `200` inclui `organizations` só com memberships `active`, itens `{ id, name, role }`, ordenados por `name` e depois `id`; membership inativo fica de fora; sem ativo, `organizations` é `[]` (AC 8, door 1)
Proof: `src/modules/auth/me.spec.ts -t "lists the active organizations by name"`

**C9** - `GET /api/v1/me` sem sessão válida responde `401` `UNAUTHENTICATED` (AC 8)
Proof: `src/modules/auth/me.spec.ts -t "rejects every invalid session with 401"`

**C10** - Dois memberships ativos e `role` nulo em `/dashboard` vão para `/select-org`, título "Escolher corretora", um botão por nome (AC 9, door 2)
Proof: `e2e/org-web.spec.ts -g "offers every brokerage when none is active"`

**C11** - Acionar o botão de uma corretora chama `POST /api/v1/me/active-organization` com o `organizationId` dela, vai para `/dashboard` e o cabeçalho mostra esse nome (AC 10)
Proof: `e2e/org-web.spec.ts -g "activates the brokerage that was chosen"`

**C12** - Com duas corretoras e uma ativa, o cabeçalho é um botão com o nome da ativa; escolher a outra troca o cabeçalho para esse nome e `GET /api/v1/organization` responde o `id` dela (AC 11)
Proof: `e2e/org-web.spec.ts -g "switches the active brokerage from the header"`

**C13** - Com uma corretora ativa, o cabeçalho mostra o nome como texto e não há botão de troca (AC 12)
Proof: `e2e/org-web.spec.ts -g "shows a single brokerage as text"`

**C14** - Termos pendentes e sem organização ativa: `/dashboard` vai para `/terms-acceptance`, não para `/onboarding` (AC 13, door 3)
Proof: `e2e/org-web.spec.ts -g "sends pending terms to acceptance before onboarding"`

**C15** - `activeOrganizationId` preenchido, `role` nulo e `organizations` com itens: `/dashboard` vai para `/select-org` (AC 14)
Proof: `e2e/org-web.spec.ts -g "asks for a choice when the active membership is gone"`

**C16** - `activeOrganizationId` preenchido, `role` nulo e `organizations` `[]`: `/dashboard` vai para `/onboarding` (AC 14)
Proof: `e2e/org-web.spec.ts -g "sends a user with no active membership to onboarding"`

**C17** - `POST /api/v1/me/active-organization` `404` mostra "Organização não encontrada." e a URL não muda (AC 15)
Proof: `e2e/org-web.spec.ts -g "shows organization not found when the switch fails"`

### S3 - Nome da corretora · ~4 files · ~16 KB · ~4k

**C18** - OWNER em `/settings/organization` vê o título "Corretora", o campo "Nome" com o nome atual, o slug e o botão "Salvar" (AC 16)
Proof: `e2e/org-web.spec.ts -g "shows the brokerage form to the owner"`

**C19** - Salvar "Corretora Verde" chama `PATCH /api/v1/organization` com `{ name: "Corretora Verde" }`, mostra "Nome atualizado." e o slug permanece o mesmo (AC 17)
Proof: `e2e/org-web.spec.ts -g "renames the brokerage and keeps the slug"`

**C20** - Nome com 1 caractere e nome com 81 caracteres em `/settings/organization` mostram "O nome precisa ter entre 2 e 80 caracteres." e não chamam `PATCH /api/v1/organization` (AC 18)
Proof: `e2e/org-web.spec.ts -g "rejects a rename outside 2 to 80 characters"`

**C21** - `VIEWER` vê o nome como texto, sem o botão "Salvar", e a página não chama `PATCH /api/v1/organization` (AC 19)
Proof: `e2e/org-web.spec.ts -g "shows the brokerage read-only to a viewer"`

**C22** - Enquanto `GET /api/v1/organization` não responde, a página mostra "Carregando a corretora…". Se falha, mostra "Não foi possível carregar a corretora." e o botão "Tentar de novo" (AC 20)
Proof: `e2e/org-web.spec.ts -g "shows brokerage loading and error"`

### S4 - Equipe · ~6 files · ~48 KB · ~12k

**C23** - O menu mostra "Corretora" para `OWNER` e para `VIEWER`, e "Equipe" só para quem tem `member:update` (AC 21)
Proof: `e2e/org-web.spec.ts -g "shows Equipe only to someone who can update members"`

**C24** - `VIEWER` em `/settings/members` vê "Você não gerencia a equipe desta corretora." e a página não chama `GET /api/v1/members` nem `GET /api/v1/invitations` (AC 22)
Proof: `e2e/org-web.spec.ts -g "hides team management from a viewer"`

**C25** - OWNER em `/settings/members` vê o título "Equipe" e a linha do proprietário com "Proprietário", sem seletor de papel e sem "Desativar" (AC 23)
Proof: `e2e/org-web.spec.ts -g "shows the owner without role controls"`

**C26** - Os rótulos são `OWNER` "Proprietário", `ADMIN` "Administrador", `MANAGER` "Gerente", `COMMERCIAL` "Comercial", `VIEWER` "Visualizador" (AC 24)
Proof: `e2e/org-web.spec.ts -g "labels every role"`

**C27** - Convite com e-mail válido e papel "Administrador" chama `POST /api/v1/invitations` com `{ email, role: "ADMIN" }` e a lista mostra esse e-mail com "Administrador" (AC 25)
Proof: `e2e/org-web.spec.ts -g "sends an administrator invitation"`

**C28** - E-mail inválido no convite mostra "Informe um e-mail válido." e não chama `POST /api/v1/invitations` (AC 26)
Proof: `e2e/org-web.spec.ts -g "rejects an invalid invitation email"`

**C29** - `POST /api/v1/invitations` `409` `INVITATION_PENDING` mostra "Já existe um convite pendente para este e-mail." (AC 27)
Proof: `e2e/org-web.spec.ts -g "shows a pending invitation conflict"`

**C30** - Sem convite pendente, a página mostra "Nenhum convite pendente." (AC 28)
Proof: `e2e/org-web.spec.ts -g "shows no pending invitations"`

**C31** - Confirmar "Revogar o convite para {email}?" chama `DELETE /api/v1/invitations/:id` e a linha some (AC 29)
Proof: `e2e/org-web.spec.ts -g "revokes an invitation after confirmation"`

**C32** - Mudar o papel de um membro que não é OWNER para "Comercial" chama `PATCH /api/v1/members/:id` com `{ role: "COMMERCIAL" }` e a linha mostra "Comercial" (AC 30)
Proof: `e2e/org-web.spec.ts -g "changes a member role to commercial"`

**C33** - Confirmar "Desativar {nome}?" chama `PATCH /api/v1/members/:id` com `{ active: false }` e a linha mostra "Inativo" (AC 31)
Proof: `e2e/org-web.spec.ts -g "deactivates a member after confirmation"`

**C34** - Confirmar "Transferir a carteira de {origem} para {destino}?" chama `POST /api/v1/members/:id/transfer-portfolio` com `{ toMemberId }` e mostra "Transferidos: {n}." com `n` igual ao `transferred` (AC 32)
Proof: `e2e/org-web.spec.ts -g "confirms a portfolio transfer with the returned count"`

**C35** - Enquanto as listas não respondem, a página mostra "Carregando a equipe…". Se uma falha, mostra "Não foi possível carregar a equipe." e o botão "Tentar de novo" (AC 33)
Proof: `e2e/org-web.spec.ts -g "shows team loading and error"`

**C36** - Mutation de membro ou convite que responde `error.message` mostra essa mensagem e o diálogo de confirmação continua aberto (AC 34)
Proof: `e2e/org-web.spec.ts -g "keeps the confirmation open when the change fails"`

### S5 - Aceitar o convite · ~4 files · ~20 KB · ~5k

**C37** - Sem sessão, `/accept-invitation?token=` de um convite `PENDING` mostra o `organizationName`, o rótulo do papel e o link "Entrar para aceitar" para `/login` com `redirect` de volta, e não chama `POST /api/v1/invitations/accept` (AC 35, door 2)
Proof: `e2e/org-web.spec.ts -g "shows the invitation before sign-in"`

**C38** - A sessão do e-mail do convite, ao acionar "Aceitar convite", chama `POST /api/v1/invitations/accept` com `{ token }`, vai para `/dashboard` e o cabeçalho mostra o nome da corretora (AC 36)
Proof: `e2e/org-web.spec.ts -g "accepts the invitation into the brokerage"`

**C39** - Token desconhecido mostra "Convite não encontrado." e não mostra "Aceitar convite" (AC 37)
Proof: `e2e/org-web.spec.ts -g "shows an unknown invitation as not found"`

**C40** - Preview `status` `EXPIRED` mostra "Este convite expirou." e não mostra "Aceitar convite" (AC 38)
Proof: `e2e/org-web.spec.ts -g "shows an expired invitation"`

**C41** - Preview `status` `REVOKED` e preview `status` `ACCEPTED` mostram "Este convite não está mais aberto." e não mostram "Aceitar convite" (AC 39)
Proof: `e2e/org-web.spec.ts -g "shows a closed invitation"`

**C42** - Aceite `403` `INVITATION_EMAIL_MISMATCH` mostra "Este convite é para outro e-mail." e a URL continua `/accept-invitation` (AC 40)
Proof: `e2e/org-web.spec.ts -g "shows an invitation meant for another email"`

**C43** - Enquanto o preview não responde, a página mostra "Carregando o convite…". A página abre com termos pendentes e sem organização ativa, sem ir para `/onboarding` nem para `/terms-acceptance` (AC 41)
Proof: `e2e/org-web.spec.ts -g "loads the invitation without an active brokerage"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/v1/me` statuses (2) | 200 C8 · 401 C9 | - |
| Landing doors (3) | lista no `/me` C8 · rotas fora do `_app` C1 · ordem do guard C14 | - |
| routes outside `_app` (3) | `/onboarding` C1 · `/select-org` C10 · `/accept-invitation` C37 | - |
| `organizations` rows (5) | ativo entra C8 · inativo fica de fora C8 · ordem por `name` C8 · empate por `id` C8 · vazio `[]` C8 | - |
| guard destinations (5) | sem sessão C5 · termos antes da org C14 · sem membership C1 · role nulo com lista C15 · role nulo sem lista C16 | - |
| role labels (5) | `OWNER` C26 · `ADMIN` C26 · `MANAGER` C26 · `COMMERCIAL` C26 · `VIEWER` C26 | - |
| name bounds (4) | onboarding 1 C3 · onboarding 81 C3 · rename 1 C20 · rename 81 C20 | - |
| invitation preview statuses (4) | `PENDING` C37 · `EXPIRED` C40 · `REVOKED` C41 · `ACCEPTED` C41 | - |
| menu Equipe (2) | com `member:update` C23 · sem `member:update` C23 | - |

- Claims naming a status code, route or response shape: C4, C8, C9, C17, C29, C42 - each has a proof that crosses the boundary
- No other check claims more than the single case its proof exercises

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decides, reached across a boundary | one at the boundary and one at its own layer | the contract at the boundary; one asserted case per row of the decision table at its own layer |
| Decides, not reached across a boundary | one at its own layer | one asserted case per row of the decision table |
| Entry point that decides nothing | one at the boundary | accepted input, each rejected input, each error path |
| Instrumentation, pass-throughs | none of its own | covered by its consumer's proof |

Evidence:

- `organizations` no `/me`: ativo, ordem, vazio -> decides, na camada em `me.ts` C8 e na fronteira do cabeçalho C12
- guard do `_app`: sessão, termos, organização utilizável -> decides, na fronteira das rotas C1, C5, C14, C15, C16
- rótulos de papel: 5 linhas -> decides, na tela C26
- convite na tela: 4 status do preview -> decides, na fronteira C37, C40, C41
- closest analogue: `apps/web/e2e/terms.spec.ts` para o guard, `apps/server/src/modules/auth/me.spec.ts` para o `/me`

Cost: a lista de organizações tem prova na própria camada, além da tela. Cada destino do guard e cada status do preview tem prova na fronteira. Formulários que só repassam o body não ganham prova separada da tela.

## Swept

- validation: C3, C20, C28
- failure modes: C4, C17, C22, C29, C35, C36, C39, C42
- idempotency: n/a - repetir o onboarding cria outra organização (C7); não há chave de retry neste ciclo
- authorization: C5, C6, C14, C21, C23, C24, C43
- concurrency: n/a - a corrida da vaga e do teto de organizações continua nos testes de server já existentes; esta feature não abre escrita nova
- data lifecycle: n/a - nenhuma linha nova; a lista é calculada
- dependency failure: n/a - nenhum serviço externo novo; o e-mail do convite continua o job já existente
- state transitions: C15, C16, C33, C40, C41
- observability: n/a - não há log nem métrica nova; a confirmação visível é C19 e C34

## Handoff

- S1 = 6k, S2 = 8k, S3 = 4k, S4 = 12k, S5 = 5k, total 35k, under the 150k budget - one builder

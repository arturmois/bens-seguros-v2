# F1 identity checks

Profile: standard
Plan: `.specs/features/f1-identity/plan.md`

Provas do server rodam em `apps/server` (`pnpm exec vitest run <arquivo> -t "<nome>"`); as do web, em `apps/web` (`pnpm exec playwright test <arquivo> -g "<nome>"`).

46 checks in 4 slices · 5 one-way doors · 0 open

## Checks

### S1 - Papéis do MVP e a corretora nunca sem ADMIN · ~14 files · ~140 KB · ~35k

**C1** - `ROLE_PERMISSIONS` é exatamente `{ ADMIN: [organization:read, organization:update, invitation:create, member:update, portfolio:transfer], MANAGER: [organization:read], COMMERCIAL: [organization:read] }`, sem `OWNER` nem `VIEWER` (AC 2)
Proof: `src/shared/permissions.spec.ts -t "matches the role permission snapshot"`

**C2** - O enum `Role` do banco tem exatamente os valores `ADMIN`, `MANAGER`, `COMMERCIAL`, nessa ordem, e o índice `Member_one_owner` não existe (door 1, AC 3)
Proof: `test/schema.spec.ts -t "Role holds only ADMIN, MANAGER and COMMERCIAL"`
Proof: `test/schema.spec.ts -t "has no Member_one_owner index"`

**C3** - `PATCH /api/v1/members/:id` com `role` `OWNER` e com `role` `VIEWER` responde `400` e não muda o membro (AC 1)
Proof: `src/modules/organizations/member.spec.ts -t "rejects OWNER and VIEWER as a member role"`

**C4** - `POST /api/v1/invitations` com `role` `OWNER` e com `role` `VIEWER` responde `400` e não cria convite (AC 1)
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects OWNER and VIEWER as an invitation role"`

**C6** - Numa organização com um só ADMIN ativo, `PATCH` com `{ role: 'MANAGER' }` nele responde `422` `{ code: 'LAST_ADMIN', message: 'A corretora precisa de pelo menos um administrador ativo.' }`; o membro continua `ADMIN` ativo e nenhuma linha de `member.update` é gravada (door 5, AC 4)
Proof: `src/modules/organizations/member.spec.ts -t "refuses to demote the last active admin"`

**C7** - Na mesma situação, `PATCH` com `{ active: false }` responde `422 LAST_ADMIN`, sem mudança e sem auditoria (door 5, AC 4)
Proof: `src/modules/organizations/member.spec.ts -t "refuses to deactivate the last active admin"`

**C8** - Numa organização com dois ADMINs ativos, rebaixar um para `COMMERCIAL` responde `200`, grava o papel e registra `member.update` com `changes.role = ['ADMIN', 'COMMERCIAL']` (AC 5)
Proof: `src/modules/organizations/member.spec.ts -t "demotes an admin while another admin is active"`

**C9** - Numa organização com um ADMIN ativo e um ADMIN inativo, rebaixar o inativo responde `200`; e numa com um só ADMIN ativo, desativar um MANAGER responde `200` (a guarda só dispara quando a mudança tira o último ADMIN **ativo**) (door 5, AC 4)
Proof: `src/modules/organizations/member.spec.ts -t "only guards changes that remove the last active admin"`

**C10** - Com exatamente dois ADMINs ativos, dois `PATCH` disparados em paralelo, cada um rebaixando um ADMIN diferente, terminam com exatamente um `200` e um `422 LAST_ADMIN`, e a organização fica com exatamente um ADMIN ativo; repetido 5 vezes (door 5, AC 6)
Proof: `src/modules/organizations/member.spec.ts -t "keeps one admin when two demotions race"`

**C11** - Um ADMIN que rebaixa a si mesmo para `MANAGER`, com outro ADMIN ativo, recebe `200`, e o `GET /api/v1/me` seguinte traz `role: 'MANAGER'` e `permissions: ['organization:read']` (AC 7)
Proof: `src/modules/organizations/member.spec.ts -t "lets an admin demote themself while another admin is active"`

**C12** - `PATCH /api/v1/members/:id` de um membro de outra organização responde `404` e não o altera (`withTwoTenants`); os testes existentes de `401`, `403` e `404` continuam verdes com papéis do MVP
Proof: `src/modules/organizations/member.spec.ts -t "does not change the other tenant member"`
Proof: `src/modules/organizations/member.spec.ts -t "requires a session"`
Proof: `src/modules/organizations/member.spec.ts -t "rejects a member change from a role without member:update"`
Proof: `src/modules/organizations/member.spec.ts -t "returns not found for an unknown member"`

**C13** - Em `/settings/members`, o seletor de papel do convite e o da alteração oferecem exatamente Administrador, Gerente e Comercial (AC 8)
Proof: `e2e/org-web.spec.ts -g "offers only admin, manager and commercial"`

**C14** - Em `/settings/members`, rebaixar o único ADMIN mostra na tela "A corretora precisa de pelo menos um administrador ativo." e o papel exibido continua Administrador (AC 8)
Proof: `e2e/org-web.spec.ts -g "shows the last admin message"`

### S2 - Cadastro vira ADMIN com link do Web Chat · ~10 files · ~80 KB · ~20k

**C15** - `POST /api/v1/onboarding` responde `200` com `role: 'ADMIN'` e `publicChatKey` casando `^[0-9a-f]{32}$`; o `Member` criado tem `role` `ADMIN` e `active`; a `Organization` gravada tem esse mesmo `publicChatKey` (door 2, AC 9)
Proof: `src/modules/organizations/onboarding.spec.ts -t "makes the creator an admin with a public chat key"`

**C16** - O onboarding registra `organization.create` com `changes` igual a `{ role: 'ADMIN' }` (AC 9)
Proof: `src/modules/organizations/onboarding.spec.ts -t "records organization.create"`

**C17** - Três onboardings seguidos produzem três `publicChatKey` distintos, um `INSERT` direto de uma segunda `Organization` com o `publicChatKey` de outra falha por violação de unicidade, e um sem `publicChatKey` falha por `NOT NULL` (door 2, AC 10, AC 11)
Proof: `src/modules/organizations/onboarding.spec.ts -t "gives each organization its own public chat key"`
Proof: `test/schema.spec.ts -t "publicChatKey is unique across organizations"`

**C19** - `GET /api/v1/organization` devolve `publicChatKey`, `brandColor`, `greeting` e `logoUpdatedAt` da organização ativa para `ADMIN`, `MANAGER` e `COMMERCIAL`; para o tenant B, o corpo nunca traz o `publicChatKey` do tenant A (`withTwoTenants`) (AC 12)
Proof: `src/modules/organizations/organization.spec.ts -t "returns the active organization for every role"`
Proof: `src/modules/organizations/organization.spec.ts -t "does not return the other tenant organization"`

**C20** - O corpo de `GET /api/v1/organization` não tem a chave `logo` (os bytes nunca saem por essa rota) (door 3)
Proof: `src/modules/organizations/organization.spec.ts -t "never returns the logo bytes with the organization"`

**C21** - Em `/settings/organization`, depois de criar a corretora, a tela mostra o texto `<origem>/c/<publicChatKey>` com o `publicChatKey` da API, e o botão Copiar deixa exatamente esse texto na área de transferência (AC 13)
Proof: `e2e/org-web.spec.ts -g "shows and copies the web chat link"`

### S3 - Identidade visual · ~10 files · ~70 KB · ~18k

**C22** - `PATCH /api/v1/organization/branding` de um ADMIN com `{ brandColor: '#1a2b3c', greeting: 'Olá! Como podemos ajudar?' }` responde `200` com os dois valores, e o `GET /api/v1/organization` seguinte os traz (AC 14)
Proof: `src/modules/organizations/branding.spec.ts -t "saves the brand color and greeting"`

**C23** - Essa mudança registra `organization.update` com `changes` contendo `brandColor: [null, '#1a2b3c']` e `greeting` (AC 14)
Proof: `src/modules/organizations/branding.spec.ts -t "records organization.update for branding"`

**C24** - `brandColor` `#1A2B3C` é gravado e devolvido como `#1a2b3c` (AC 15)
Proof: `src/modules/organizations/branding.spec.ts -t "lowercases the brand color"`

**C25** - `brandColor` `1a2b3c`, `#1a2b3`, `#1a2b3cd`, `#gggggg` e `red` respondem `400`, e o valor gravado não muda (AC 15)
Proof: `src/modules/organizations/branding.spec.ts -t "rejects a brand color that is not #rrggbb"`

**C26** - `greeting` com 500 caracteres depois do `trim` é aceita (`200`); com 501 responde `400` e nada muda (AC 15)
Proof: `src/modules/organizations/branding.spec.ts -t "bounds the greeting at 500 characters"`

**C27** - Com cor e saudação gravadas, enviar `{ brandColor: null }` apaga só a cor, e `{ greeting: null }` apaga só a saudação (AC 16)
Proof: `src/modules/organizations/branding.spec.ts -t "clears a branding field sent as null"`

**C28** - `MANAGER` e `COMMERCIAL` recebem `403` em `PATCH …/branding`, `PUT …/logo` e `DELETE …/logo` (seis combinações), e nada muda (AC 17)
Proof: `src/modules/organizations/branding.spec.ts -t "rejects branding writes from manager and commercial"`

**C29** - A detecção por magic bytes classifica: PNG → `image/png`, JPEG → `image/jpeg`, WebP → `image/webp`; SVG, GIF, texto, `RIFF` sem `WEBP` e buffer vazio → não suportado (door 4)
Proof: `src/modules/organizations/logo.spec.ts -t "detects the image type from magic bytes"`

**C30** - `PUT /api/v1/organization/logo` de um ADMIN com um PNG, um JPEG e um WebP válidos responde `200` com `logoUpdatedAt` para cada um, e o `GET …/logo` seguinte devolve os mesmos bytes com o `Content-Type` do tipo (AC 18, AC 20)
Proof: `src/modules/organizations/branding.spec.ts -t "stores a png, jpeg or webp logo"`

**C31** - O upload registra `organization.update` com `changes` igual a `{ logo: [false, true] }`, e o JSON da linha não contém nenhum trecho do base64 enviado (AC 18)
Proof: `src/modules/organizations/branding.spec.ts -t "records the logo change without its bytes"`

**C32** - Uma imagem PNG de exatamente 204800 bytes é aceita; uma de 204801 bytes responde `422 LOGO_TOO_LARGE` e o logo anterior continua (door 4, AC 19)
Proof: `src/modules/organizations/branding.spec.ts -t "bounds the logo at 200 KB"`

**C33** - SVG e texto em base64 respondem `422 LOGO_UNSUPPORTED_TYPE`, e nada é gravado (door 4, AC 19)
Proof: `src/modules/organizations/branding.spec.ts -t "rejects a logo that is not png, jpeg or webp"`

**C34** - `image` com caractere fora do alfabeto base64 responde `400`, e nada é gravado (AC 19)
Proof: `src/modules/organizations/branding.spec.ts -t "rejects a logo that is not base64"`

**C35** - `GET /api/v1/organization/logo` com logo gravado devolve `200` e um `ETag`; repetir com `If-None-Match` igual devolve `304` sem corpo (AC 20)
Proof: `src/modules/organizations/branding.spec.ts -t "answers 304 for the same logo etag"`

**C36** - Sem logo gravado, `GET …/logo` responde `404`; com o tenant A tendo logo, o tenant B sem logo recebe `404` (`withTwoTenants`) (AC 20)
Proof: `src/modules/organizations/branding.spec.ts -t "returns 404 when the organization has no logo"`
Proof: `src/modules/organizations/branding.spec.ts -t "never returns the other tenant logo"`

**C37** - `DELETE …/logo` com logo gravado responde `204`; o `GET …/logo` seguinte responde `404`, e `GET /api/v1/organization` traz `logoUpdatedAt: null` (AC 21)
Proof: `src/modules/organizations/branding.spec.ts -t "removes the logo"`

**C38** - Sem sessão, as quatro rotas novas (`PATCH …/branding`, `PUT`/`DELETE`/`GET …/logo`) respondem `401`; com sessão e sem organização ativa, respondem `403 NO_ACTIVE_ORGANIZATION`
Proof: `src/modules/organizations/branding.spec.ts -t "requires a session and an active organization"`

**C39** - Em `/settings/organization`, sem logo a tela mostra "Nenhum logo enviado."; enviar um PNG mostra o preview (`img` com `src` em `/api/v1/organization/logo`); Remover volta a "Nenhum logo enviado." (AC 22)
Proof: `e2e/branding.spec.ts -g "uploads and removes the logo"`

**C40** - Em `/settings/organization`, enviar um arquivo SVG mostra a mensagem do server "Envie uma imagem PNG, JPEG ou WebP." (AC 22)
Proof: `e2e/branding.spec.ts -g "shows the logo error from the server"`

**C41** - Em `/settings/organization`, salvar cor e saudação mostra "Identidade visual atualizada." e, depois de recarregar, os campos trazem os valores salvos (AC 22)
Proof: `e2e/branding.spec.ts -g "saves the brand color and greeting"`

**C42** - Em `/settings/organization`, um COMMERCIAL vê a cor, a saudação e o link, sem campos editáveis nem botões de enviar ou remover logo (AC 22)
Proof: `e2e/branding.spec.ts -g "shows branding read-only without organization:update"`

### S4 - Docs e gate · 3 files · ~60 KB · ~15k

**C43** - `docs/architecture.md` marca `Member` com os três papéis, `publicChatKey` e a identidade visual da `Organization` como [existe] e mantém `Channel` [F2]
Proof: `bash -c 'grep -qE "Member \[existe\] +role ADMIN \| MANAGER \| COMMERCIAL" docs/architecture.md && grep -qE "Organization \[existe\].*publicChatKey" docs/architecture.md && grep -qE "Channel \[F2\]" docs/architecture.md && ! grep -qE "\[F1\] ADMIN \| MANAGER \| COMMERCIAL" docs/architecture.md'`

**C44** - Na seção F2 de `docs/roadmap.md` aparece "canal Web Chat padrão", e na F1 não
Proof: `bash -c 'awk "/^## F2 /,/^## Marco/" docs/roadmap.md | grep -q "canal Web Chat padrão" && ! awk "/^## F1 /,/^## S1 /" docs/roadmap.md | grep -q "canal Web Chat padrão"'`

**C45** - Nenhum arquivo de código do server ou do web que não seja teste (fora do gerado) cita `OWNER`, `VIEWER`, `OWNER_IMMUTABLE` ou `Member_one_owner`; os testes só os citam como entrada recusada (C3, C4)
Proof: `bash -c '! grep -rnE "OWNER|VIEWER|Member_one_owner" apps/server/src apps/web/src --exclude-dir=generated --exclude-dir=api --exclude="*.spec.ts" --exclude="*.spec.tsx"'`

**C48** - `apps/server/prisma/migrations` tem exatamente uma migration, `20260924120000_init`, e ela contém `Invitation_pending_email`, o seed do plano `trial` e `ENABLE`/`FORCE ROW LEVEL SECURITY` para `Member`, `Organization`, `Subscription`, `Invitation` e `AuditLog` (door 1)
Proof: `bash -c 'cd apps/server/prisma/migrations && test "$(ls -d */ | tr -d /)" = 20260924120000_init && f=20260924120000_init/migration.sql && grep -q "Invitation_pending_email" $f && grep -q "0000000000aa., .trial." $f && for t in Member Organization Subscription Invitation AuditLog; do grep -q "ALTER TABLE \"$t\" FORCE ROW LEVEL SECURITY" $f || exit 1; done'`
Proof: `test/schema.spec.ts -t "every tenant table is protected by row security"`

**C46** - Com o docker compose no ar, o gate do repositório passa depois do último commit, e o `pnpm api:generate` não deixa diff em `apps/web/src/api`
Proof: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Proof: `bash -c 'pnpm api:generate >/dev/null && git diff --exit-code apps/web/src/api apps/server/openapi.json'`

**C47** - Os status já existentes de onboarding, organização e convite continuam iguais com os papéis do MVP: `401` sem sessão e `422` na quarta organização (onboarding); `401` sem sessão e `403` sem organização ativa (`GET /api/v1/organization`); `200`, `401`, `403`, `409` e `422` do `POST /api/v1/invitations`
Proof: `src/modules/organizations/onboarding.spec.ts -t "requires a session"`
Proof: `src/modules/organizations/onboarding.spec.ts -t "rejects the fourth organization"`
Proof: `src/modules/organizations/organization.spec.ts -t "requires a session"`
Proof: `src/modules/organizations/organization.spec.ts -t "rejects a tenant route without an active organization"`
Proof: `src/modules/organizations/invitation.spec.ts -t "creates a pending invitation and queues the e-mail"`
Proof: `src/modules/organizations/invitation.spec.ts -t "requires a session"`
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects an invitation from a role without invitation:create"`
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects an invitation for someone who is already a member"`
Proof: `src/modules/organizations/invitation.spec.ts -t "rejects a second pending invitation for the same email"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| papéis do MVP (3) | `ADMIN` C1, C2 · `MANAGER` C1, C2 · `COMMERCIAL` C1, C2 | - |
| papéis que saem (2) | `OWNER` C2, C3, C4, C45 · `VIEWER` C2, C3, C4, C45 | - |
| guarda do último ADMIN (5 linhas) | rebaixar o único ativo C6 · desativar o único ativo C7 · rebaixar com outro ativo C8 · alvo inativo ou não-ADMIN C9 · corrida C10 | - |
| lugares de papel no web (2) | convite C13 · alteração de membro C13, C14 | - |
| tipos de logo (8) | PNG C29, C30 · JPEG C29, C30 · WebP C29, C30 · SVG C29, C33 · GIF C29 · texto C29, C33 · RIFF sem WEBP C29 · vazio C29 | - |
| limites do logo (2 bordas) | 204800 C32 · 204801 C32 | - |
| limites da saudação (2 bordas) | 500 C26 · 501 C26 | - |
| formas inválidas de cor (5) | `1a2b3c` C25 · `#1a2b3` C25 · `#1a2b3cd` C25 · `#gggggg` C25 · `red` C25 | - |
| escritas de branding × papel sem permissão (6) | branding×MANAGER C28 · branding×COMMERCIAL C28 · PUT logo×MANAGER C28 · PUT logo×COMMERCIAL C28 · DELETE logo×MANAGER C28 · DELETE logo×COMMERCIAL C28 | - |
| estados da tela `/settings/organization` (5) | sem logo C39 · com logo C39 · erro do upload C40 · sucesso do salvar C41 · só leitura C42 | - |
| `POST /api/v1/onboarding` statuses (3) | 200 C15 · 401 C47 · 422 C47 | - |
| `GET /api/v1/organization` statuses (3) | 200 C19 · 401 C47 · 403 C47 | - |
| `PATCH /api/v1/organization/branding` statuses (4) | 200 C22 · 400 C25 · 401 C38 · 403 C28, C38 | - |
| `PUT /api/v1/organization/logo` statuses (5) | 200 C30 · 400 C34 · 401 C38 · 403 C28, C38 · 422 C32, C33 | - |
| `DELETE /api/v1/organization/logo` statuses (3) | 204 C37 · 401 C38 · 403 C28, C38 | - |
| `GET /api/v1/organization/logo` statuses (5) | 200 C35 · 304 C35 · 401 C38 · 403 C38 · 404 C36 | - |
| `PATCH /api/v1/members/:id` statuses (6) | 200 C8 · 400 C3 · 401 C12 · 403 C12 · 404 C12 · 422 C6, C7 | - |
| `POST /api/v1/invitations` statuses (6) | 200 C47 · 400 C4 · 401 C47 · 403 C47 · 409 C47 · 422 C47 | - |
| doors (5) | 1 C2, C48 · 2 C15, C17 · 3 C19, C20 · 4 C29, C32, C33 · 5 C6, C7, C9, C10 | - |
| testes do v2 substituídos (2) | "rejects a change to the owner" → C6, C7 · "keeps a single owner when two inserts race" → C10 (o índice que ele provava sai na door 1) | - |

- Claims naming a status code, route or response shape: C3, C4, C6–C12, C15, C19, C20, C22–C28, C30–C38 - cada um tem prova que cruza a fronteira HTTP (`app.inject`)
- Nenhum outro check afirma mais do que o caso que a própria prova exercita
- A conversão de dados das migrations não tem prova: sem produção nem staging publicado, o usuário dispensou o teste (2026-09-24)

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decides, reached across a boundary | one at the boundary and one at its own layer | the contract at the boundary; one asserted case per row of the decision table at its own layer |
| Decides, not reached across a boundary | one at its own layer | one asserted case per row of the decision table |
| Entry point that decides nothing | one at the boundary | accepted input, each rejected input, each error path |
| Instrumentation, pass-throughs | none of its own | covered by its consumer's proof |

Evidence:

- detecção do tipo do logo: 3 assinaturas aceitas + recusa, 4 branch points -> decides, na própria camada C29 e na fronteira C30, C33
- guarda do último ADMIN: alvo ADMIN ativo × mudança tira o papel ou a atividade × contagem, 3 branch points -> decides; o lock só existe na transação, então a prova é na fronteira, uma por linha (C6, C7, C8, C9, C10). Precedente: `member.spec.ts` "keeps a single reactivation when two race for the last seat"
- validação de cor e saudação: Zod na borda -> entry point, provado por entrada aceita e cada recusa (C24–C27)
- migration: o resultado no catálogo é provado (C2, C17); a conversão de dados locais não, por decisão do usuário
- `GET /organization` com campos novos: select -> instrumentation, provada pelo consumidor (C19, C20)

Cost: um unitário de magic bytes, além das provas na fronteira. Sem ele, a tabela de tipos só seria provada por um caminho que não exercita cada linha.

## Swept

- validation: C24, C25, C26, C32, C33, C34
- failure modes: C6, C32 (recusa não grava nada e mantém o anterior)
- idempotency: C35 (ETag/304); o `PATCH` de branding é idempotente por natureza (C27)
- authorization: C28, C38; `requirePermission` obrigatório já é provado pelo boot (`app.spec.ts` "fails startup when an api v1 route omits requirePermission")
- concurrency: C10
- data lifecycle: C37 (remoção do logo); conversão de dados existentes n/a - sem produção nem staging publicado (decisão do usuário)
- dependency failure: n/a - nenhuma dependência externa nova; o logo mora no PostgreSQL
- state transitions: C6, C7, C8, C9 (papel e atividade do membro sob a guarda)
- observability: C23, C31 (auditoria sem PII e sem bytes); nenhum log novo

## Handoff

- S1 ≈ 14 arquivos (permissions + spec, member + schema + spec, invitation schema + spec, onboarding, schema.prisma, migration, schema.spec, factories, labels.ts, members.tsx, org-web e2e) ≈ 140 KB ≈ 35k; S2 entra em onboarding/organization + web settings a ≈ 55k; S3 em branding/logo + e2e a ≈ 73k; S4 docs a ≈ 88k, abaixo do budget de 150k - one builder
- **Settled mid-build:** C45 restrito a código que não é teste - na forma original ele contradizia C3 e C4, que precisam enviar `OWNER` e `VIEWER` como entrada recusada
- **Settled mid-build:** C5 e C18 (e `test/migrations.spec.ts`) removidos a pedido do usuário: sem produção, a conversão de dados da migration não precisa de teste. AC 3 e AC 11 passaram a descrever só o estado final do schema (C2, C17)
- **Settled mid-build:** a pedido do usuário, todas as migrations viraram uma só (`20260924120000_init`), gerada do `schema.prisma` + SQL manual (RLS, políticas, índice parcial, seed). Catálogo comparado com a cadeia antiga + F1 via `pg_dump -s`: só muda a ordem de colunas. Novo C48

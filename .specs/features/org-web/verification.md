# Org web verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 9d2f1c6..90ca899
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Resumo: 36 de 43 checks provados. Das 5 falhas injetadas, 4 sobreviveram. A suíte e2e completa em `90ca899` tem 17 falhas, 15 delas em specs anteriores à feature (login, termos, 2FA, recuperação de senha): depois de um novo login, um usuário com uma única corretora cai em `/select-org`. O gate `lint/typecheck/test/build` passa num worktree limpo em `90ca899`.

Ambiente: no tree real, o client Prisma gerado (`apps/server/src/generated/`, gitignored, de 2026-09-22 18:31) não tem `Invitation` nem `AuditLog`, e o banco `bens` está sem as migrations `20260923001000_invitations` e `20260923020000_audit`. Com isso, `vitest run` no tree real dá 52 falhas e 204 aprovados, e o dev server em `:3001` responde 500 nas rotas de convite. Por isso rodei todas as provas num `git worktree` limpo em `90ca899`, que gera o client no `postinstall` de `pnpm install --offline`. O e2e rodou contra uma stack própria: server `:3101` e web `:3100`, com `APP_URL=http://localhost:3100` e o proxy do vite apontado para `:3101`, só no worktree. O banco foi o `bens_orgweb_verify`, criado para isso com `prisma migrate deploy` e apagado no fim.

## Binding sources

O plano não marca nenhuma fonte como "binding". Tratei as três de `## Sources` como vinculantes, como fez o relatório do `audit`.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/roadmap.md` Fase 4 (linhas 134–161) | yes - telas `(onboarding)/*`, `_app.tsx`, `settings/{organization,members}`, guard `beforeLoad`, aceite "usuário com 2 orgs alterna" | none | - |
| `docs/architecture.md` §6 passos 2, 5, 7 (linhas 277–297) e §9 (linhas 398–435) | yes - o passo 2 lista o onboarding antes do aceite de termos. A door 3 e a AD-005 ativa (`.specs/STATE.md:11`) decidem termos antes, e C6 e C14 seguem a AD-005, a decisão mais recente | none | - |
| `.specs/STATE.md` Phase 4 item 4 (linha 34) | yes - "onboarding, seletor e settings, depois dos termos" | none | - |

## Checks

Provas no worktree limpo em `90ca899`. Servidor: `pnpm --filter @bens/server exec vitest run src/modules/auth/me.spec.ts -t "lists the active organizations by name|rejects every invalid session with 401"`, com 2 aprovados e 5 pulados, os dois nomes listados com ✓. Web: `pnpm --filter @bens/web exec playwright test e2e/org-web.spec.ts e2e/register.spec.ts -g "org web|the e-mail link signs in"`, com 42 testes listados individualmente: 41 aprovados e 1 falho (C16, ver abaixo). C12, C15 e C16 foram repetidos com `--repeat-each`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | sem membership: `/dashboard` → `/onboarding`, título/campo/botão | `org-web.spec.ts:84` ✓; `register.spec.ts:72` ✓ | `org-web.spec.ts:86` `expect(page).toHaveURL('/onboarding')`; `:87` `getByRole('heading', { name: 'Criar corretora' })).toBeVisible()`; `:88` `getByLabel('Nome')).toBeVisible()`; `:89` `getByRole('button', { name: 'Criar corretora' })).toBeVisible()`; `register.spec.ts:79-82` (mesmas quatro) | PASS |
| C2 | "Corretora Azul" → POST body, `/dashboard`, cabeçalho | `:92` ✓ | `org-web.spec.ts:97` `expect((await created).postDataJSON()).toEqual({ name: 'Corretora Azul' })`; `:98` `toHaveURL('/dashboard')`; `:99` `getByText('Corretora Azul')).toBeVisible()` | PASS |
| C3 | 1 e 81 caracteres → mensagem, sem POST | `:102` ✓ | `org-web.spec.ts:109-112` loop `['A', 'A'.repeat(81)]` `getByText('O nome precisa ter entre 2 e 80 caracteres.')).toBeVisible()`; `:114` `expect(calls).toEqual([])` | PASS |
| C4 | 422 `ORG_LIMIT_REACHED` → mensagem, fica em `/onboarding` | `:117` ✓ | `org-web.spec.ts:132-134` `getByText('Você já participa do número máximo de organizações.')).toBeVisible()`; `:135` `toHaveURL('/onboarding')` | PASS |
| C5 | sem sessão `/onboarding` → `/login` | `:138` ✓ | `org-web.spec.ts:140` `expect(page).toHaveURL(/\/login/)` | PASS |
| C6 | termos pendentes `/onboarding` → `/terms-acceptance` | `:143` ✓ | `org-web.spec.ts:147` `expect(page).toHaveURL(/\/terms-acceptance/)` | PASS |
| C7 | OWNER cria outra → nome novo no cabeçalho | `:150` ✓ | `org-web.spec.ts:157` `toHaveURL('/dashboard')`; `:158` `getByText('Corretora Nova')).toBeVisible()` | PASS |
| C8 | `organizations` ativos, `{id,name,role}`, ordem `name` e depois `id`, inativo fora, `[]` | vitest `-t "lists the active organizations by name"` ✓ | `me.spec.ts:224` `.toEqual([])`; `:230-233` `.toEqual([{ id: alfa…, name: 'Alfa', role: 'OWNER' }, { id: beta…, name: 'Beta', … }])`; `:266-269` `.toEqual([{ id: ids[0], name: 'Igual' }, { id: ids[1], name: 'Igual' }])`. **A ordenação não é discriminada:** "Alfa" é criada antes de "Beta", e os dois "Igual" têm ids `uuid(7)` (`schema.prisma:16`), então a ordem de inserção coincide com a ordem por `name` e por `id`. Remover o `.sort(...)` inteiro de `me.ts:34-40` passa (fault F4 sobreviveu) | FAIL |
| C9 | `/me` sem sessão → 401 `UNAUTHENTICATED` | vitest `-t "rejects every invalid session with 401"` ✓ | `me.spec.ts:123` `expect(response.statusCode).toBe(401)`; `:124` `expect(response.json()).toEqual(unauthenticated)`. O teste é anterior à feature (`ce8e7d5`), e o caminho 401 (`requireSession`) não mudou. Vale como guarda de regressão da linha `401` da Surface | PASS |
| C10 | 2 ativos, role nulo → `/select-org`, título, botão por nome | `:161` ✓ | `org-web.spec.ts:168` `toHaveURL('/select-org')`; `:169` `getByRole('heading', { name: 'Escolher corretora' })`; `:170-171` `getByRole('button', { name: alfa.name / beta.name })).toBeVisible()` | PASS |
| C11 | botão → POST com `organizationId`, `/dashboard`, cabeçalho | `:174` ✓ | `org-web.spec.ts:183` `expect((await chosen).postDataJSON()).toEqual({ organizationId: alfa.id })`; `:184` `toHaveURL('/dashboard')`; `:185` `getByText(alfa.name)).toBeVisible()` | PASS |
| C12 | cabeçalho é botão; trocar muda o nome e o `GET /organization` devolve o `id` | `:188` - **instável**: falhou 2 de 8 execuções (1 na suíte completa e 1 em `--repeat-each=6`) com `Expected: <alfa.id> Received: <beta.id>` em `:201` | `org-web.spec.ts:196` `getByRole('button', { name: alfa.name })).toBeVisible()` é satisfeito pelo próprio botão de opção "alfa" do menu aberto (`_app.tsx:143-152`), que já está visível antes da troca. Não prova que o cabeçalho mudou e não espera a mutation, então o `fetch` de `:197-201` corre contra ela | FAIL |
| C13 | uma corretora → texto, sem botão | `:204` ✓ | `org-web.spec.ts:209` `getByText(created.name)).toBeVisible()`; `:210` `getByRole('button', { name: created.name })).toHaveCount(0)` | PASS |
| C14 | termos pendentes, sem org → `/terms-acceptance`, não `/onboarding` | `:213` ✓ | `org-web.spec.ts:217` `toHaveURL(/\/terms-acceptance/)`; `:218` `not.toHaveURL(/\/onboarding/)` | PASS |
| C15 | `activeOrganizationId` **preenchido**, role nulo, lista → `/select-org` | `:221` - **instável**: 3 falhas em 8 (`apiResponse.json: Response has been disposed` / `route.fetch: Test ended` em `:227-228`) | `org-web.spec.ts:233` `toHaveURL('/select-org')`. A precondição não se estabelece: o login novo em `:232` cria uma sessão com `activeOrganizationId` nulo (nenhum hook de sessão o define; o próprio spec diz isso em `:27`), e o route só anula `role` (`:229`). O cenário é o mesmo de C10. Com o guard trocado para `if (me.activeOrganizationId) return null` (F1), passa | FAIL |
| C16 | `activeOrganizationId` **preenchido**, role nulo, `[]` → `/onboarding` | `:236` - falhou na execução focada da suíte org-web e na suíte completa (`route.fetch: Test ended`), passou nas repetições | `org-web.spec.ts:248` `toHaveURL('/onboarding')`. Mesma precondição ausente de C15 (login novo em `:247`). F1 sobreviveu | FAIL |
| C17 | 404 na troca → "Organização não encontrada.", URL igual | `:251` ✓ | `org-web.spec.ts:265` `getByText('Organização não encontrada.')).toBeVisible()`; `:266` `toHaveURL('/select-org')` | PASS |
| C18 | OWNER: título, campo com nome, slug, "Salvar" | `:269` ✓ | `org-web.spec.ts:275` heading `'Corretora'`; `:276` `getByLabel('Nome')).toHaveValue(created.name)`; `:277` `getByText(created.slug)`; `:278` button `'Salvar'` | PASS |
| C19 | "Corretora Verde" → PATCH body, "Nome atualizado.", slug igual | `:281` ✓ | `org-web.spec.ts:292` `postDataJSON()).toEqual({ name: 'Corretora Verde' })`; `:293` `getByText('Nome atualizado.')`; `:294` `getByText(created.slug)).toBeVisible()` | PASS |
| C20 | rename 1 e 81 → mensagem, sem PATCH | `:297` ✓ | `org-web.spec.ts:308-311` loop `getByText('O nome precisa ter entre 2 e 80 caracteres.')`; `:313` `expect(calls).toEqual([])` | PASS |
| C21 | VIEWER: nome **como texto**, sem "Salvar", sem PATCH | `:316` ✓ | `org-web.spec.ts:330` `getByRole('button', { name: 'Salvar' })).toHaveCount(0)` (F5 morto aqui); `:331` `expect(patches).toEqual([])`. Mas `:329` `page.getByText(created.name)).toBeVisible()` busca a página toda, e o cabeçalho renderiza o mesmo nome como `<span>` (`_app.tsx:115`). A asserção passa na primeira sondagem, quando só o cabeçalho existe (o `GET /organization` ainda está em voo), e não prova o `<p>{organization.name}</p>` de `organization.tsx:81` | FAIL |
| C22 | "Carregando a corretora…"; falha → mensagem + "Tentar de novo" | `:335` ✓ | `org-web.spec.ts:358` `getByText('Carregando a corretora…')`; `:360` `getByText('Não foi possível carregar a corretora.')`; `:361` button `'Tentar de novo'` | PASS |
| C23 | menu "Corretora" para OWNER e VIEWER; "Equipe" só com `member:update` | `:364` ✓ | `org-web.spec.ts:369-370` links `'Corretora'`/`'Equipe'` visíveis (OWNER); `:378` `'Corretora'` visível; `:379` `getByRole('link', { name: 'Equipe' })).toHaveCount(0)` (VIEWER) | PASS |
| C24 | VIEWER em `/settings/members`: mensagem, sem GET members/invitations | `:382` ✓ | `org-web.spec.ts:396` `getByText('Você não gerencia a equipe desta corretora.')`; `:397` `expect(calls).toEqual([])` | PASS |
| C25 | OWNER: título "Equipe", linha "Proprietário", sem seletor, sem "Desativar" | `:400` ✓ | `org-web.spec.ts:407` heading `'Equipe'`; `:408` `row.getByText('Proprietário')`; `:409` `row.getByRole('button', { name: 'Desativar' })).toHaveCount(0)`; `:410` `row.getByLabel(\`Papel de ${owner.email}\`)).toHaveCount(0)` | PASS |
| C26 | cinco rótulos | `:413` ✓ | `org-web.spec.ts:425-427` loop `['Proprietário', 'Administrador', 'Gerente', 'Comercial', 'Visualizador']` `members.locator('span', { hasText: label })).toBeVisible()` | PASS |
| C27 | convite ADMIN → POST `{ email, role: 'ADMIN' }`, lista com "Administrador" | `:430` ✓ | `org-web.spec.ts:440` `postDataJSON()).toEqual({ email, role: 'ADMIN' })`; `:442` `row.getByText('Administrador')).toBeVisible()` | PASS |
| C28 | e-mail inválido → mensagem, sem POST | `:445` ✓ | `org-web.spec.ts:458` `getByText('Informe um e-mail válido.')`; `:459` `expect(calls).toEqual([])` | PASS |
| C29 | 409 `INVITATION_PENDING` → mensagem | `:462` ✓ | `org-web.spec.ts:482` `getByText('Já existe um convite pendente para este e-mail.')).toBeVisible()` | PASS |
| C30 | "Nenhum convite pendente." | `:485` ✓ | `org-web.spec.ts:491` `getByText('Nenhum convite pendente.')).toBeVisible()` | PASS |
| C31 | confirmar revogação → DELETE, linha some | `:494` ✓ | `org-web.spec.ts:504` `getByRole('dialog', { name: \`Revogar o convite para ${email}?\` })`; `:509` `await removed` (DELETE `/api/v1/invitations/`); `:510` `expect(row).toHaveCount(0)` | PASS |
| C32 | papel → PATCH `{ role: 'COMMERCIAL' }`, linha "Comercial" | `:513` ✓ | `org-web.spec.ts:528` `postDataJSON()).toEqual({ role: 'COMMERCIAL' })`; `:530` `row.locator('span', { hasText: 'Comercial' })).toBeVisible()` | PASS |
| C33 | confirmar desativação → PATCH `{ active: false }`, "Inativo" | `:533` ✓ | `org-web.spec.ts:544` dialog `\`Desativar ${NAME}?\``; `:547` `postDataJSON()).toEqual({ active: false })`; `:548` `row.getByText('Inativo')).toBeVisible()` | PASS |
| C34 | confirmar transferência → POST `{ toMemberId }`, "Transferidos: {n}." com `n` = `transferred` | `:551` ✓ | `org-web.spec.ts:568` `expect(body.toMemberId).toEqual(expect.any(String))`, que não confere o id do destino; `:569` `getByText('Transferidos: 0.')`, com o server real sempre devolvendo 0. Um `n` fixo passa (F2 sobreviveu). O título `:562-564` usa `NAME` para origem e destino, então a ordem origem/destino também não é discriminada | FAIL |
| C35 | "Carregando a equipe…"; falha → mensagem + "Tentar de novo" | `:572` ✓ | `org-web.spec.ts:599` `getByText('Carregando a equipe…')`; `:601` `getByText('Não foi possível carregar a equipe.')`; `:602` button `'Tentar de novo'` | PASS |
| C36 | mutation de **membro ou convite** com `error.message` → mensagem, diálogo aberto | `:605` ✓ | `org-web.spec.ts:630` `dialog.getByText('O plano não tem vagas para outro usuário.')).toBeVisible()`; `:631` `expect(dialog).toBeVisible()`. Só o caso "desativar membro" é exercitado. Revogar convite e transferir carteira com falha ficam sem prova, e engolir a falha da revogação passa (F3 sobreviveu) | FAIL |
| C37 | sem sessão: `organizationName`, rótulo, link `/login?redirect=`, sem POST accept | `:634` ✓ | `org-web.spec.ts:646` heading `created.name`; `:647` `getByText('Gerente')`; `:648-651` link `'Entrar para aceitar'` `toHaveAttribute('href', /\/login\?redirect=.*accept-invitation.*token/)`; `:652` `expect(calls).toEqual([])` | PASS |
| C38 | aceitar → POST `{ token }`, `/dashboard`, cabeçalho | `:655` ✓ | `org-web.spec.ts:684` `postDataJSON()).toEqual({ token })`; `:685` `toHaveURL('/dashboard')`; `:686` `getByText(created.name)).toBeVisible()` | PASS |
| C39 | token desconhecido → "Convite não encontrado.", sem "Aceitar convite" | `:689` ✓ | `org-web.spec.ts:691` `getByText('Convite não encontrado.')`; `:692` button `'Aceitar convite'` `toHaveCount(0)` | PASS |
| C40 | `EXPIRED` → "Este convite expirou." | `:695` ✓ | `org-web.spec.ts:709` `getByText('Este convite expirou.')`; `:710` `toHaveCount(0)` | PASS |
| C41 | `REVOKED` e `ACCEPTED` → "Este convite não está mais aberto." | `:713` ✓ | `org-web.spec.ts:714-729` loop `['REVOKED', 'ACCEPTED']` `getByText('Este convite não está mais aberto.')).toBeVisible()`; `:729` `toHaveCount(0)` | PASS |
| C42 | 403 `INVITATION_EMAIL_MISMATCH` → mensagem, fica em `/accept-invitation` | `:734` ✓ | `org-web.spec.ts:744` `getByText('Este convite é para outro e-mail.')`; `:745` `toHaveURL(/\/accept-invitation/)` | PASS |
| C43 | "Carregando o convite…"; abre com termos pendentes e sem org | `:748` ✓ | `org-web.spec.ts:769` `getByText('Carregando o convite…')`; `:770` `toHaveURL(/\/accept-invitation/)`; `:772` heading `'Convite Aberto'`; `:773` `not.toHaveURL(/\/onboarding|\/terms-acceptance/)` | PASS |

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /api/v1/me` statuses (2) | plan Surface | 200 C8 (`me.spec.ts:230`, corpo) + `me.spec.ts:47` · 401 C9 | - |
| Landing doors (3) | plan Landing | door 1 C8 · door 2 C1/C10/C43 · door 3 ordem sessão→termos C5/C6/C14; "organização utilizável = `activeOrganizationId` **com** `role` não nulo" sem prova (F1 sobreviveu) | door 3: `activeOrganizationId` preenchido + `role` nulo |
| routes outside `_app` (3) | plan Landing door 2 / arch §9 | `/onboarding` C1 · `/select-org` C10 · `/accept-invitation` C37/C43 | - |
| `organizations` rows (5) | plan AC 8 | ativo entra C8 · inativo fora C8 (`Aaa` excluída, `me.spec.ts:266`) · vazio C8 (`:224`) · ordem por `name` sem discriminação (inserção = ordem alfabética; F4 sobreviveu) · empate por `id` sem discriminação (`uuid(7)`: inserção = ordem de id) | ordem por `name`; empate por `id` |
| guard destinations (5) | `account.ts:8-27` + door 3 | sem sessão C5 · termos antes C14/C6 · sem membership C1 · role nulo com lista C15: precondição ausente · role nulo sem lista C16: precondição ausente | role nulo com lista (C15); role nulo sem lista (C16) |
| role labels (5) | plan AC 24 | os cinco em C26 (`org-web.spec.ts:425-427`) | - |
| name bounds (4) | plan AC 3 / AC 18 | onboarding 1/81 C3 · rename 1/81 C20 | - |
| invitation preview statuses (4) | server `getPublicInvitation200Status` (PENDING, EXPIRED, REVOKED, ACCEPTED) | PENDING C37 · EXPIRED C40 · REVOKED/ACCEPTED C41 | - |
| menu Equipe (2) | plan AC 21 | com C23 `:370` · sem C23 `:379` | - |
| *(sem linha)* falha de mutation com diálogo (3) | plan AC 34 + `members.tsx:326-347` | desativar C36 · revogar convite sem prova (F3 sobreviveu) · transferir carteira sem prova | revogar convite; transferir carteira |
| *(sem linha)* cabeçalho após a troca (2) | plan AC 11 | botão com o nome da ativa C12 `:194` · nome escolhido no cabeçalho: `:196` casa com o botão de opção do menu, não com o cabeçalho | nome escolhido no cabeçalho |
| *(sem linha)* contagem `transferred` (n) | plan AC 32 | só `n = 0` (`:569`); valor constante passa (F2) | `n` ≠ 0 |
| *(sem linha)* entrada de `/accept-invitation` sem token (1) | plan Observable "sem token cai no AC 37" | C39 usa um token desconhecido (`nao-existe`, 404 do server). O ramo `!token` de `accept-invitation.tsx:34-40` não é exercitado | sem token |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary | `apps/server/src/modules/auth/me.ts` (`organizations`) | própria camada C8 + fronteira do cabeçalho C12 | no - a linha "ordem" da tabela de decisão não tem caso discriminante (F4 sobreviveu), e C12 é instável |
| Decides, not reached across a boundary | `features/organizations/account.ts` (guard) | um caso por destino (5): C1, C5, C14, C15, C16 | no - C15/C16 não estabelecem `activeOrganizationId` preenchido (F1 sobreviveu) |
| Decides, not reached across a boundary | `features/organizations/labels.ts` | 5 rótulos C26 | yes |
| Decides, not reached across a boundary | `routes/(onboarding)/accept-invitation.tsx` (4 status do preview) | C37, C40, C41 | yes |
| Entry point that decides nothing | `onboarding.tsx`, `select-org.tsx`, `organization.tsx`, `members.tsx`, `AcceptForm` | entrada aceita, cada rejeição, cada caminho de erro | no - sem prova para: erro do `PATCH /organization` (`organization.tsx:63-65`), erro da troca de papel (`members.tsx:99-103`), erro de revogar e de transferir (`members.tsx:343-347`). Onboarding (C2/C3/C4), select-org (C11/C17), convite (C27/C28/C29) e aceite (C38/C42) atendem |
| Instrumentation, pass-throughs | `e2e/support.ts` (`onboard`, `clearActiveOrganization`), `src/api/**` gerado, `me.schema.ts` | coberto pelos consumidores | yes |

## Faults injected

Cada falha num `git worktree add --detach <scratchpad>/wt-<id> HEAD` próprio, com `pnpm install --offline` e, para o web, uma stack própria em `:3200/:3201`. O `git status --porcelain` do tree real estava vazio antes e continuou vazio depois de cada remoção (`git worktree remove --force`).

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 guard ignora `role` nulo: `if (me.activeOrganizationId) return null` | `apps/web/src/features/organizations/account.ts:25` | no - C15 `:221` ✓ e C16 `:236` ✓ passam com a mutação. Numa primeira execução o C16 falhou, mas por `route.fetch: Test ended` (a instabilidade de `:227`), não pela asserção. Na segunda, os dois passaram |
| F2 contagem fixa: `` onDone(`Transferidos: 0.`) `` | `apps/web/src/routes/_app/settings/members.tsx:342` | no - C34 `:551` ✓ |
| F3 falha da revogação engolida: `revoke.mutateAsync(…).catch(() => undefined)` | `apps/web/src/routes/_app/settings/members.tsx:329` | no - C36 `:605` ✓ e C31 `:494` ✓ |
| F4 sem ordenação: remove `.sort(...)` | `apps/server/src/modules/auth/me.ts:34-40` | no - C8 `-t "lists the active organizations by name"` ✓ (2 execuções) |
| F5 VIEWER ganha o formulário: `canUpdate = permissions.includes('organization:read')` | `apps/web/src/routes/_app/settings/organization.tsx:45` | yes - C21 `org-web.spec.ts:330` `toHaveCount(0)`: Expected 0, Received 1 |

## Gate

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` num worktree limpo em `90ca899`: exit 0. Biome checou 158 arquivos sem erro, o typecheck passou, a suíte teve 31 arquivos e **256 aprovados, 0 falhos**, e o build do web e do server passou.
- O mesmo `pnpm test` no tree real (server) dá 52 falhos e 204 aprovados. A causa é só o ambiente: o client Prisma gerado e gitignored está desatualizado e falta `auditLog`/`invitation`, por exemplo `TypeError: Cannot read properties of undefined (reading 'create')`. Nada disso é código do diff.
- E2E completo (`pnpm --filter @bens/web exec playwright test`, 81 testes) em `90ca899`: **64 aprovados, 17 falhos**. Fora de org-web, falham `login.spec.ts:14/26/80/92/105/168`, `terms.spec.ts:14/57/147`, `two-factor.spec.ts:17/35/52/81/110` e `password-reset.spec.ts:22`. O motivo é um só: o login cria uma sessão sem `activeOrganizationId`, e o novo guard do `_app` manda até quem tem uma única corretora para `/select-org` (por exemplo, `login.spec.ts:19` Expected `/settings/security`, Received `/select-org`). O `onboard(api)` que o diff acrescentou a esses specs põe a organização ativa só na sessão da API, não na do navegador. As outras duas falhas são C12 (`org-web.spec.ts:201`) e C16 (`route.fetch: Test ended`). Essa suíte roda no job `e2e` do CI a cada push em `main`.

**Ranked gaps**

1. Guard com `activeOrganizationId` preenchido e `role` nulo sem prova. A precondição não se estabelece, F1 sobreviveu e os testes são instáveis. C15 `org-web.spec.ts:221-233`, C16 `:236-248`.
2. Regressão e2e fora dos checks: 15 testes existentes (login, termos, 2FA, recuperação de senha) falham em `90ca899`, porque um usuário com uma única corretora cai em `/select-org` a cada login (`account.ts:24-27` + login sem organização ativa).
3. Ordenação de `organizations` sem prova, porque a inserção coincide com a ordem esperada. F4 sobreviveu. C8 `me.spec.ts:230`, `:266`.
4. Falha de mutation no diálogo cobre só "desativar"; revogar e transferir ficam sem prova. F3 sobreviveu. C36 `org-web.spec.ts:605-631`.
5. `Transferidos: {n}` provado só com `n = 0`, e `toMemberId` só como `any(String)`. F2 sobreviveu. C34 `org-web.spec.ts:568-569`.
6. Troca pelo cabeçalho instável (2 de 8) e asserção satisfeita pelo botão de opção do menu. C12 `org-web.spec.ts:196`, `:201`.
7. "Nome como texto" do VIEWER satisfeito pelo cabeçalho, não pela página. C21 `org-web.spec.ts:329`.
8. Caminhos de erro de entradas sem prova (Test policy): `organization.tsx:63-65`, `members.tsx:99-103`, e o ramo sem token de `accept-invitation.tsx:34-40`.

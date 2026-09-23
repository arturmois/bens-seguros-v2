# Org web verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 9d2f1c6..c445910
**Round**: 3 - scoped
**Verifier**: independent sub-agent (author != verifier)

Resumo: os 50 checks estão provados em `c445910`. As duas lacunas da rodada 2 foram fechadas. A falha da troca pelo cabeçalho agora tem prova: o C17 ganhou um segundo teste, em `org-web.spec.ts:327`. O `ON DELETE SET NULL` de `User.lastActiveOrganizationId` também tem prova, no C50 novo (`schema.spec.ts:391`). As 4 falhas injetadas nas superfícies novas foram mortas. A linha de Test policy "Entry point that decides nothing" agora está atendida. A suíte e2e completa passa com 84 de 84, e o gate passa com 262 testes, sem o timeout de SMTP do Mailpit nesta rodada.

Escopo: segui "Re-verifying after a fix". O diff do fix (`16dbd6f..c445910`) mexe só em testes e em specs. Ele adiciona um teste em `apps/web/e2e/org-web.spec.ts`, que empurra 20 linhas para baixo tudo o que vem a partir de `:327`, e um teste em `apps/server/test/schema.spec.ts`. Também muda `checks.md`, `verification.md` e as lições. Nenhum arquivo de `src/` nem de `prisma/` mudou. Rodei de novo, em `c445910`, as provas dos 50 checks e verifiquei por inteiro o C17 e o C50. Atualizei as citações do `org-web.spec.ts` e conferi com `sed -n` que cada linha citada a partir de `:327` ainda traz o mesmo assert, agora 20 linhas abaixo. Nas tabelas, `verified at c445910` quer dizer que reli o assert nesta rodada. `carried from 16dbd6f` quer dizer que o assert veio da rodada 2 sem mudança, e a citação +20 foi conferida quando é o caso.

Ambiente: as provas de `HEAD` e o e2e completo rodaram no tree real, contra o `pnpm dev` que já estava de pé (web `:3000` → server `:3001`, banco `bens`). O `git status --porcelain` do tree real estava vazio antes e continuou vazio no fim. Cada falha rodou num `git worktree add --detach <scratchpad>/wt3-*` próprio, com `pnpm install --offline`. O gate rodou num worktree limpo, o `wt3-clean`. Para as falhas do web, montei uma stack própria. O server `:3101` veio do `wt3-clean`, com `APP_URL=http://localhost:3100` e o banco `bens_orgweb_verify3`, criado com `prisma migrate deploy` e os grants de `bens_app`. O web `:3100` veio do worktree de cada falha, com o proxy do vite apontado para `:3101` só nesse worktree.

A primeira execução das falhas do web rodou sem `E2E_DATABASE_URL`. Por isso, o fixture `clearRateLimits` (`support.ts:25-33`) limpou a tabela `RateLimit` do banco `bens`, e não a do banco temporário. Esse é o mesmo efeito do e2e comum, e só mexe em contadores de rate limit. Um controle com o web limpo bateu depois em 429 no sign-up do banco temporário. Reiniciei o server e rodei tudo de novo com `E2E_DATABASE_URL` apontado para o banco temporário. O controle limpo passou 2 de 2, e as duas falhas foram mortas nos mesmos asserts da primeira execução. No fim, parei as stacks, apaguei o banco (`DROP DATABASE bens_orgweb_verify3 WITH (FORCE)`) e removi os worktrees (`git worktree remove --force` + `prune`).

## Binding sources

Carried from 16dbd6f. O fix não mexeu na interface: nenhum arquivo de `apps/web/src` nem de `apps/server/src` mudou em `16dbd6f..c445910`. Não há tela nova a comparar.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/roadmap.md` Fase 4 (linhas 134–161) | yes - carried from 90ca899 | none | - |
| `docs/architecture.md` §6 (linhas 277–297), §9 (398–435), tabela de módulos (linha 162) | yes - carried from 16dbd6f | none | - |
| `.specs/STATE.md` Phase 4 item 4 (linha 34), AD-001 (linha 7) | yes - carried from 16dbd6f | none | - |

## Checks

Provas rodadas em `c445910`, duas invocações:

- **Servidor.** `pnpm --filter @bens/server exec vitest run src/modules/auth/me.spec.ts src/modules/auth/sign-in.spec.ts test/schema.spec.ts -t "lists the active organizations by name|orders organizations by name, then by id|rejects every invalid session with 401|starts the session in the last active organization|falls back to the only active organization|leaves the organization open when there is a choice|remembers the organization that was made active|forgets the last active organization when it is deleted" --reporter=verbose`. Saiu com **8 aprovados e 23 pulados**, e os 8 nomes aparecem listados com ✓. Um deles é `test/schema.spec.ts > identity tables > forgets the last active organization when it is deleted`.
- **Web.** `pnpm --filter @bens/web exec playwright test e2e/org-web.spec.ts e2e/register.spec.ts -g "<45 nomes do checks.md, escapados>" --reporter=list`. Saiu com **45 aprovados**, cada um listado com ✓ em `file:line`, e entre eles `e2e/org-web.spec.ts:327:3 › org web › keeps the screen when the header switch fails`. A lista de `test(` do arquivo (`grep -n "^  test("`) mostra cada nome uma única vez.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | sem membership: `/dashboard` → `/onboarding`, título/campo/botão | `org-web.spec.ts:115` ✓; `register.spec.ts:72` ✓ | `org-web.spec.ts:117` `toHaveURL('/onboarding')`; `:118` heading `'Criar corretora'`; `:119` `getByLabel('Nome')`; `:120` button `'Criar corretora'`; `register.spec.ts:79-82`. carried from 16dbd6f | PASS |
| C2 | "Corretora Azul" → POST body, `/dashboard`, cabeçalho | `:123` ✓ | `org-web.spec.ts:128` `postDataJSON()).toEqual({ name: 'Corretora Azul' })`; `:129` `toHaveURL('/dashboard')`; `:130` `getByText('Corretora Azul')`. carried from 16dbd6f | PASS |
| C3 | 1 e 81 caracteres → mensagem, sem POST | `:133` ✓ | `org-web.spec.ts:140-143` loop `['A', 'A'.repeat(81)]` `getByText('O nome precisa ter entre 2 e 80 caracteres.')`; `:145` `expect(calls).toEqual([])`. carried from 16dbd6f | PASS |
| C4 | 422 `ORG_LIMIT_REACHED` → mensagem, fica em `/onboarding` | `:148` ✓ | `org-web.spec.ts:163-165` `getByText('Você já participa do número máximo de organizações.')`; `:166` `toHaveURL('/onboarding')`. carried from 16dbd6f | PASS |
| C5 | sem sessão `/onboarding` → `/login` | `:169` ✓ | `org-web.spec.ts:171` `toHaveURL(/\/login/)`. carried from 16dbd6f | PASS |
| C6 | termos pendentes `/onboarding` → `/terms-acceptance` | `:174` ✓ | `org-web.spec.ts:178` `toHaveURL(/\/terms-acceptance/)`. carried from 16dbd6f | PASS |
| C7 | OWNER cria outra → nome novo no cabeçalho | `:181` ✓ | `org-web.spec.ts:188` `toHaveURL('/dashboard')`; `:189` `getByText('Corretora Nova')`. carried from 16dbd6f | PASS |
| C8 | `organizations` ativos `{id,name,role}`, ordem `name` e depois `id`, inativo fora, `[]` | vitest `me.spec.ts` "lists the active organizations by name" ✓ e "orders organizations by name, then by id" ✓ | `me.spec.ts:225` `.toEqual([])`; `:228-235` Beta criada antes de Alfa, esperado `[Alfa, Beta]`; `:268-271` empate e `Aaa` inativa fora; `:284-289` `rows.toSorted(byNameThenId)).toEqual([...])`. carried from 16dbd6f | PASS |
| C9 | `/me` sem sessão → 401 `UNAUTHENTICATED` | vitest `me.spec.ts` "rejects every invalid session with 401" ✓ | `me.spec.ts:124` `expect(response.statusCode).toBe(401)`; `:125` `expect(response.json()).toEqual(unauthenticated)`. carried from 16dbd6f | PASS |
| C10 | 2 ativos, role nulo → `/select-org`, título, botão por nome | `:192` ✓ | `org-web.spec.ts:199` `toHaveURL('/select-org')`; `:200` heading `'Escolher corretora'`; `:201-202` um botão por nome. carried from 16dbd6f | PASS |
| C11 | botão → POST com `organizationId`, `/dashboard`, cabeçalho | `:205` ✓ | `org-web.spec.ts:214` `postDataJSON()).toEqual({ organizationId: alfa.id })`; `:215` `toHaveURL('/dashboard')`; `:216` `getByText(alfa.name)`. carried from 16dbd6f | PASS |
| C12 | o cabeçalho é um botão com o nome da ativa; a troca muda o nome e o `GET /organization` responde o `id` | `:219` ✓ | `org-web.spec.ts:229` troca 200; `:231` `header.getByRole('button', { name: beta.name })).toHaveCount(0)`; `:232` `… alfa.name })).toHaveCount(1)`; `:237` `expect(body.id).toBe(alfa.id)`. carried from 16dbd6f | PASS |
| C13 | uma corretora → texto, sem botão | `:258` ✓ | `org-web.spec.ts:263` `getByRole('banner').getByText(created.name)).toBeVisible()`; `:264` `getByRole('button', { name: created.name })).toHaveCount(0)`. carried from 16dbd6f | PASS |
| C14 | termos pendentes, sem org → `/terms-acceptance`, não `/onboarding` | `:267` ✓ | `org-web.spec.ts:271` `toHaveURL(/\/terms-acceptance/)`; `:272` `not.toHaveURL(/\/onboarding/)`. carried from 16dbd6f | PASS |
| C15 | `activeOrganizationId` preenchido, role nulo, lista → `/select-org` | `:275` ✓ | `org-web.spec.ts:285` `activeOrganizationId).toBe(created.id)`; `:286` `role).toBeNull()`; `:287` `organizations…).toEqual([guest.own?.id])`; `:289` `toHaveURL('/select-org')`. carried from 16dbd6f | PASS |
| C16 | `activeOrganizationId` preenchido, role nulo, `[]` → `/onboarding` | `:292` ✓ | `org-web.spec.ts:302` `activeOrganizationId).toBe(created.id)`; `:303` `role).toBeNull()`; `:304` `organizations).toEqual([])`; `:306` `toHaveURL('/onboarding')`. carried from 16dbd6f | PASS |
| C17 | `POST /api/v1/me/active-organization` 404 → "Organização não encontrada." e a URL não muda, a partir de `/select-org` **e** do cabeçalho | `:309` ✓; `:327` ✓ | `/select-org`: `org-web.spec.ts:323` `getByText('Organização não encontrada.')`; `:324` `toHaveURL('/select-org')`. Cabeçalho: `:331-336` responde 404 `NOT_FOUND` ao `POST`; `:339` parte de `/settings/organization`; `:341-342` abre o seletor em `beta` e escolhe `alfa`; `:343` `expect(header.getByText('Organização não encontrada.')).toBeVisible()`; `:344` `expect(page).toHaveURL('/settings/organization')`. A tela de partida não é `/dashboard`, o destino do sucesso (`_app.tsx:124`), então o assert de URL discrimina. F8 foi morta em `:343` e F9 em `:344`. verified at c445910 | PASS |
| C18 | OWNER: título, campo com o nome, slug, "Salvar" | `:347` ✓ | `org-web.spec.ts:353` heading `'Corretora'`; `:354` `getByLabel('Nome')).toHaveValue(created.name)`; `:355` `getByText(created.slug)`; `:356` button `'Salvar'`. carried from 16dbd6f (citação +20 conferida em c445910) | PASS |
| C19 | "Corretora Verde" → PATCH body, "Nome atualizado.", slug igual | `:359` ✓ | `org-web.spec.ts:370` `postDataJSON()).toEqual({ name: 'Corretora Verde' })`; `:371` `getByText('Nome atualizado.')`; `:372` `getByText(created.slug)`. carried from 16dbd6f (+20 conferida) | PASS |
| C20 | rename com 1 e 81 → mensagem, sem PATCH | `:375` ✓ | `org-web.spec.ts:386-389` loop `['A', 'A'.repeat(81)]` com a mensagem; `:391` `expect(calls).toEqual([])`. carried from 16dbd6f (+20 conferida) | PASS |
| C21 | VIEWER: nome **como texto**, sem "Salvar", sem PATCH | `:414` ✓ | `org-web.spec.ts:427` `const content = page.locator('section')`; `:429` `content.getByText(created.name, { exact: true })).toBeVisible()`; `:430` `content.getByLabel('Nome')).toHaveCount(0)`; `:431` button `'Salvar'` `toHaveCount(0)`; `:432` `expect(patches).toEqual([])`. carried from 16dbd6f (+20 conferida) | PASS |
| C22 | "Carregando a corretora…"; falha → mensagem e "Tentar de novo" | `:436` ✓ | `org-web.spec.ts:459` `getByText('Carregando a corretora…')`; `:461` `getByText('Não foi possível carregar a corretora.')`; `:462` button `'Tentar de novo'`. carried from 16dbd6f (+20 conferida) | PASS |
| C23 | menu "Corretora" para OWNER e VIEWER; "Equipe" só com `member:update` | `:465` ✓ | `org-web.spec.ts:470-471` links `'Corretora'`/`'Equipe'` visíveis; `:479` `'Corretora'` visível; `:480` `getByRole('link', { name: 'Equipe' })).toHaveCount(0)`. carried from 16dbd6f (+20 conferida) | PASS |
| C24 | VIEWER em `/settings/members`: mensagem, sem GET de membros/convites | `:483` ✓ | `org-web.spec.ts:497` `getByText('Você não gerencia a equipe desta corretora.')`; `:498` `expect(calls).toEqual([])`. carried from 16dbd6f (+20 conferida) | PASS |
| C25 | OWNER: título "Equipe", linha "Proprietário", sem seletor, sem "Desativar" | `:501` ✓ | `org-web.spec.ts:508` heading `'Equipe'`; `:509` `row.getByText('Proprietário')`; `:510` `Desativar` `toHaveCount(0)`; `:511` ``row.getByLabel(`Papel de ${owner.email}`)).toHaveCount(0)``. carried from 16dbd6f (+20 conferida) | PASS |
| C26 | cinco rótulos | `:514` ✓ | `org-web.spec.ts:526-528` loop `['Proprietário', 'Administrador', 'Gerente', 'Comercial', 'Visualizador']` visíveis. carried from 16dbd6f (+20 conferida) | PASS |
| C27 | convite ADMIN → POST `{ email, role: 'ADMIN' }`, lista com "Administrador" | `:531` ✓ | `org-web.spec.ts:541` `postDataJSON()).toEqual({ email, role: 'ADMIN' })`; `:543` `row.getByText('Administrador')`. carried from 16dbd6f (+20 conferida) | PASS |
| C28 | e-mail inválido → mensagem, sem POST | `:546` ✓ | `org-web.spec.ts:559` `getByText('Informe um e-mail válido.')`; `:560` `expect(calls).toEqual([])`. carried from 16dbd6f (+20 conferida) | PASS |
| C29 | 409 `INVITATION_PENDING` → mensagem | `:563` ✓ | `org-web.spec.ts:583` `getByText('Já existe um convite pendente para este e-mail.')`. carried from 16dbd6f (+20 conferida) | PASS |
| C30 | "Nenhum convite pendente." | `:586` ✓ | `org-web.spec.ts:592` `getByText('Nenhum convite pendente.')`. carried from 16dbd6f (+20 conferida) | PASS |
| C31 | confirmar a revogação → DELETE, a linha some | `:595` ✓ | `org-web.spec.ts:605` dialog ``Revogar o convite para ${email}?``; `:610` `await removed`; `:611` `expect(row).toHaveCount(0)`. carried from 16dbd6f (+20 conferida) | PASS |
| C32 | papel → PATCH `{ role: 'COMMERCIAL' }`, linha "Comercial" | `:614` ✓ | `org-web.spec.ts:629` `postDataJSON()).toEqual({ role: 'COMMERCIAL' })`; `:631` `row.locator('span', { hasText: 'Comercial' })`. carried from 16dbd6f (+20 conferida) | PASS |
| C33 | confirmar a desativação → PATCH `{ active: false }`, "Inativo" | `:634` ✓ | `org-web.spec.ts:645` dialog ``Desativar ${NAME}?``; `:648` `postDataJSON()).toEqual({ active: false })`; `:649` `row.getByText('Inativo')`. carried from 16dbd6f (+20 conferida) | PASS |
| C34 | confirmar a transferência → POST `{ toMemberId }` e "Transferidos: {n}." | `:652` ✓ | `org-web.spec.ts:670-672` dialog com origem e destino; `:676` pathname da origem; `:677` `postDataJSON()).toEqual({ toMemberId: destination })`; `:663` resposta reescrita com `transferred: 7`; `:678` `getByText('Transferidos: 7.')`. carried from 16dbd6f (+20 conferida) | PASS |
| C35 | "Carregando a equipe…"; falha → mensagem e "Tentar de novo" | `:681` ✓ | `org-web.spec.ts:708` `getByText('Carregando a equipe…')`; `:710` `getByText('Não foi possível carregar a equipe.')`; `:711` button `'Tentar de novo'`. carried from 16dbd6f (+20 conferida) | PASS |
| C36 | mutation de membro ou convite com `error.message` → mensagem, diálogo aberto | `:714` ✓ | Desativar `org-web.spec.ts:753-754`; transferir `:760-761`; revogar `:768-769` e `:771` `expect(invitation).toHaveCount(1)`; papel `:774` `getByText(failures.role ?? '')`. carried from 16dbd6f (+20 conferida) | PASS |
| C37 | sem sessão: `organizationName`, rótulo, link `/login?redirect=`, sem POST de aceite | `:777` ✓ | `org-web.spec.ts:789` heading `created.name`; `:790` `getByText('Gerente')`; `:791-794` link `'Entrar para aceitar'` `toHaveAttribute('href', /\/login\?redirect=.*accept-invitation.*token/)`; `:795` `expect(calls).toEqual([])`. carried from 16dbd6f (+20 conferida) | PASS |
| C38 | aceitar → POST `{ token }`, `/dashboard`, cabeçalho | `:798` ✓ | `org-web.spec.ts:827` `postDataJSON()).toEqual({ token })`; `:828` `toHaveURL('/dashboard')`; `:829` `getByText(created.name)`. carried from 16dbd6f (+20 conferida) | PASS |
| C39 | token desconhecido → "Convite não encontrado.", sem "Aceitar convite" | `:832` ✓ | `org-web.spec.ts:833` loop com e sem token; `:835` `getByText('Convite não encontrado.')`; `:836` `toHaveCount(0)`. carried from 16dbd6f (+20 conferida) | PASS |
| C40 | `EXPIRED` → "Este convite expirou." | `:840` ✓ | `org-web.spec.ts:854` `getByText('Este convite expirou.')`; `:855` `toHaveCount(0)`. carried from 16dbd6f (+20 conferida) | PASS |
| C41 | `REVOKED` e `ACCEPTED` → "Este convite não está mais aberto." | `:858` ✓ | `org-web.spec.ts:859` loop `['REVOKED', 'ACCEPTED']` com a mensagem; `:874` `toHaveCount(0)`. carried from 16dbd6f (+20 conferida) | PASS |
| C42 | 403 `INVITATION_EMAIL_MISMATCH` → mensagem, fica em `/accept-invitation` | `:879` ✓ | `org-web.spec.ts:889` `getByText('Este convite é para outro e-mail.')`; `:890` `toHaveURL(/\/accept-invitation/)`. carried from 16dbd6f (+20 conferida) | PASS |
| C43 | "Carregando o convite…"; abre com termos pendentes e sem org | `:893` ✓ | `org-web.spec.ts:914` `getByText('Carregando o convite…')`; `:915` `toHaveURL(/\/accept-invitation/)`; `:917` heading `'Convite Aberto'`; `:918` `not.toHaveURL(…)` para `/onboarding` ou `/terms-acceptance`. carried from 16dbd6f (+20 conferida) | PASS |
| C44 | login com a última organização ainda ativa → sessão nela | vitest `sign-in.spec.ts` "starts the session in the last active organization" ✓ | `sign-in.spec.ts:208` `expect(await activeOrganizationOf(await signInAgain(email))).toBe(first)`. carried from 16dbd6f | PASS |
| C45 | última com `Member` desativado e uma única outra ativa → sessão nessa outra | vitest "falls back to the only active organization" ✓ | `sign-in.spec.ts:220` precondição da última; `:231` `.toBe(own.json().id)`; `:235` `.toBe(single.ids[0])`. carried from 16dbd6f | PASS |
| C46 | sem última e com duas ativas → `null`; sem `Member` ativo → `null` | vitest "leaves the organization open when there is a choice" ✓ | `sign-in.spec.ts:241` `.toBeNull()`; `:245-246` `.toBeNull()`. carried from 16dbd6f | PASS |
| C47 | onboarding, troca e aceite gravam `User.lastActiveOrganizationId` | vitest "remembers the organization that was made active" ✓ | `sign-in.spec.ts:252` `.toBe(second)`; `:258` `.toBe(first)`; `:265` `lastActiveOrganizationOf(guest.userId)).toBe(first)`. carried from 16dbd6f | PASS |
| C48 | troca pelo cabeçalho, sair e entrar → `/dashboard` com a segunda | `org-web.spec.ts:240` ✓ | `org-web.spec.ts:250` troca 200; `:254` `toHaveURL('/dashboard')`; `:255` `header.getByRole('button', { name: alfa.name })).toBeVisible()`. carried from 16dbd6f | PASS |
| C49 | PATCH `/organization` com `error.message` → mensagem, campo mantém o valor | `:394` ✓ | `org-web.spec.ts:409` `getByText('Não foi possível renomear agora.')).toBeVisible()`; `:410` `getByLabel('Nome')).toHaveValue('Corretora Recusada')`; `:411` `getByText('Nome atualizado.')).toHaveCount(0)`. carried from 16dbd6f (+20 conferida) | PASS |
| C50 | apagar a `Organization` em `User.lastActiveOrganizationId` mantém o `User` e zera o campo | vitest `test/schema.spec.ts` "forgets the last active organization when it is deleted" ✓ | `schema.spec.ts:403-406` insere o `User` com `lastActiveOrganizationId` = a organização; `:408` `DELETE FROM … "Organization"`; `:409-411` lê o `User` pelo `id`; `:418` `expect(remembered).toEqual([{ last: null }])`, que afirma as duas metades: a linha continua (uma linha, não `[]`) e o campo fica `null`. O schema do worker é montado a partir dos `migration.sql` (`setup-db.ts:60-67`) e recriado a cada execução (`:79-88`), então o teste lê a constraint da migration real (`migration.sql:5`). F10 (RESTRICT) e F11 (CASCADE) foram mortas. verified at c445910 | PASS |

Notas de precisão (não bloqueiam):

- O teste do cabeçalho responde o 404 com `route.fulfill`, sem chegar ao server. Isso segue o C17 de `/select-org` e o texto do AC 15, que trata da resposta, não da causa.
- O `catch` de `_app.tsx:125-128` tem um segundo ramo, a mensagem genérica "Não foi possível concluir. Tente de novo." para um erro que não é `ApiError`. Esse ramo não tem prova, como o mesmo padrão em `select-org.tsx:38`, `onboarding.tsx:40`, `organization.tsx:65` e `members.tsx:101/266/345`. O plano não nomeia esse ramo, e as rodadas 1 e 2 não o contaram como membro. Registro aqui para uma decisão fora desta feature.
- Carried from 16dbd6f: `enterApp` (`org-web.spec.ts:29`) usa `toHaveURL('/dashboard')`, e quem sustenta a entrada é o assert do `banner` em `:30`.

## Coverage

As linhas `switch failure screens` e `User.lastActiveOrganizationId relation` foram recalculadas em c445910. As demais são carried from 16dbd6f, com as citações de `org-web.spec.ts` a partir de `:327` atualizadas em +20. Nenhum arquivo de `src/` mudou, então nenhuma outra autoridade mudou.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| switch failure screens (2) | plan AC 15 ("permanecer na tela de onde partiu a troca") e Flow 4 (`/select-org` e o seletor do cabeçalho). No código, os dois chamadores de `useSetActiveOrganization` com tratamento de falha são `select-org.tsx:38` e `_app.tsx:125-128` (`rg -n "useSetActiveOrganization" apps/web/src`) | `/select-org` C17 `org-web.spec.ts:323-324` · cabeçalho C17 `:343-344`, partindo de `/settings/organization` (F8 e F9 mortas). verified at c445910 | - |
| `User.lastActiveOrganizationId` relation (2) | plan Relations (linha 56): "apagar a organização zera o campo (`SetNull`)" e "só vale no login se ainda houver `Member` ativo". O `checks.md` conta 1 membro, e o segundo já está provado na linha de organização inicial | `SetNull` ao apagar C50 `schema.spec.ts:418` (F10 e F11 mortas) · só com `Member` ativo C45 `sign-in.spec.ts:231`. verified at c445910 | - |
| `GET /api/v1/me` statuses (2) | plan Surface | 200 C8 (`me.spec.ts:232`) · 401 C9 (`me.spec.ts:124`). carried from 16dbd6f | - |
| Landing doors (4) | plan Landing | door 1 C8 · door 2 C1/C10/C37/C43 · door 3 C5/C6/C14/C15/C16 · door 4 C44–C48 e C50. carried from 16dbd6f | - |
| routes outside `_app` (3) | plan Landing door 2 | `/onboarding` C1 · `/select-org` C10 · `/accept-invitation` C37/C43. carried from 16dbd6f | - |
| `organizations` rows (5) | plan AC 8 | ativo `me.spec.ts:232` · inativo fora `:268` · vazio `:225` · ordem `:228-235` · empate por `id` `:284-289`. carried from 16dbd6f | - |
| guard destinations (5) | `account.ts:8-27` e door 3 | C5 · C14/C6 · C1 · C15 `:285-289` · C16 `:302-306`. carried from 16dbd6f | - |
| role labels (5) | plan AC 24 | os cinco em C26 (`org-web.spec.ts:526-528`). carried from 16dbd6f | - |
| name bounds (4) | plan AC 3 / AC 18 | onboarding 1/81 C3 `:140-143` · rename 1/81 C20 `:386-389`. carried from 16dbd6f | - |
| invitation preview statuses (4) | server `getPublicInvitation200Status` | PENDING C37 · EXPIRED C40 · REVOKED/ACCEPTED C41. carried from 16dbd6f | - |
| menu Equipe (2) | plan AC 21 | com C23 `:471` · sem C23 `:480`. carried from 16dbd6f | - |
| initial organization of a session (5) | plan AC 42 e `active-organization.ts:23-37` | C44 `sign-in.spec.ts:208` · C45 `:231` · C45 `:235` · C46 `:241` · C46 `:246`. carried from 16dbd6f | - |
| writers of the last organization (3) | `onboarding.ts:47`, `organizations/active-organization.ts:17`, `invitation.ts:233` | `sign-in.spec.ts:252` · `:258` · `:265`. carried from 16dbd6f | - |
| session creation paths (3) | plan Flow 8 e `auth.ts:77-88` | login C44–C46 · 2FA `two-factor.spec.ts:65-66`, verde na suíte completa · link de verificação sem membership prévio (`register.spec.ts:79`). carried from 16dbd6f | - |
| mutation failure shown (5) | plan AC 34 e AC 44 | desativar `:753-754` · revogar `:768-771` · transferir `:760-761` · papel `:774` · renomear C49 `:409-410`. carried from 16dbd6f | - |
| header after the switch (2) | plan AC 11 | botão da ativa `:224`/`:30` · nome escolhido `:231-232` e `id` `:237`. carried from 16dbd6f | - |
| `transferred` count (n) | plan AC 32 | `n = 7` `:663`, `:678`; `toMemberId` `:677`; origem `:676`. carried from 16dbd6f | - |
| `/accept-invitation` without a token (1) | plan Observable | C39 `org-web.spec.ts:833`. carried from 16dbd6f | - |

Varredura por conjuntos sem linha: o fix não adicionou ramo de código, só testes. As duas enumerações que a rodada 2 achou sem linha agora têm linha no `checks.md` e prova. Reli `Relations`, `Surface` e `Landing` do plano (linhas 54-80) e não há outro conjunto sem linha.

## Test policy rows

A linha "Entry point that decides nothing" foi rejulgada em c445910. As demais são carried from 16dbd6f: o fix não mexeu em nenhum arquivo que essas linhas classificam. Os arquivos tocados são testes (`org-web.spec.ts`, `schema.spec.ts`), e nenhuma linha classifica testes.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary | `apps/server/src/modules/auth/me.ts` (`organizations`, `byNameThenId`) | própria camada C8 `me.spec.ts:276-289` e `:228-235` · fronteira C12 `org-web.spec.ts:231-237` | yes - carried from 16dbd6f |
| Decides, not reached across a boundary | `apps/server/src/modules/auth/active-organization.ts` `initialOrganization` | 5 casos: C44 `:208`, C45 `:231`/`:235`, C46 `:241`/`:246` | yes - carried from 16dbd6f |
| Decides, not reached across a boundary | `features/organizations/account.ts` (guard) | um caso por destino (5): C1, C5, C14, C15, C16 | yes - carried from 16dbd6f |
| Decides, not reached across a boundary | `features/organizations/labels.ts` | 5 rótulos C26 | yes - carried from 16dbd6f |
| Decides, not reached across a boundary | `routes/(onboarding)/accept-invitation.tsx` (4 status do preview e sem token) | C37, C39, C40, C41 | yes - carried from 16dbd6f |
| Entry point that decides nothing | `onboarding.tsx`, `select-org.tsx`, `organization.tsx`, `members.tsx`, `AcceptForm`, seletor do cabeçalho (`_app.tsx:103-158`) | entrada aceita, cada rejeição, cada caminho de erro | yes - verified at c445910. O caminho de erro do seletor do cabeçalho agora tem prova: C17 `org-web.spec.ts:343-344`, com F8 e F9 mortas. Os demais seguem atendidos: onboarding C2/C3/C4 · select-org C11/C17 · organização C19/C20/C49 · membros C27/C28/C29/C32/C36 · aceite C38/C42 · cabeçalho com sucesso C12 |
| Instrumentation, pass-throughs | `assignActiveOrganization`, `auth.ts:77-88`, `e2e/support.ts`, `src/api/**` gerado, `me.schema.ts` | coberto pelos consumidores: C44–C48 | yes - carried from 16dbd6f |

A migration `20260923133344_user_last_active_organization` não é classificada por nenhuma linha da Test policy. Ela é provada pelo C50, na própria camada do banco.

## Faults injected

F8–F11 foram verified at c445910, nas superfícies que o fix criou. F1–F7 são carried from 16dbd6f: o código que elas mutam (`account.ts`, `members.tsx`, `me.ts`, `active-organization.ts`, `organization.tsx`) não mudou em `16dbd6f..c445910`, e os testes que as mataram passaram de novo em c445910. O `git status --porcelain` do tree real estava vazio antes e continuou vazio depois da remoção dos worktrees. Nenhum `git stash` foi usado. O controle limpo (`wt3-clean` no `:3100`/`:3101`, com o banco temporário) passou os 2 testes usados contra F8 e F9.

| Mutation | Location | Killed |
| --- | --- | --- |
| F8 o seletor do cabeçalho engole a falha: o `setFailure(…)` do `catch` vira `void error` | `apps/web/src/routes/_app.tsx:125-128` | yes - C17 `org-web.spec.ts:343` `getByRole('banner').getByText('Organização não encontrada.')` element(s) not found; o C12 (`:219`) passou com a mesma mutação |
| F9 o seletor do cabeçalho sai da tela na falha: `await navigate({ to: '/dashboard' })` depois do `setFailure` | `apps/web/src/routes/_app.tsx:128` | yes - C17 `org-web.spec.ts:344` Expected `/settings/organization`, Received `/dashboard`; `:343` passou, então este assert pega a navegação sozinho |
| F10 a FK passa a `ON DELETE RESTRICT` | `apps/server/prisma/migrations/20260923133344_user_last_active_organization/migration.sql:5` | yes - C50 `schema.spec.ts:408` `violates RESTRICT setting of foreign key constraint "User_lastActiveOrganizationId_fkey"` |
| F11 a FK passa a `ON DELETE CASCADE` (a linha do `User` some junto) | `migration.sql:5` | yes - C50 `schema.spec.ts:418` `expected [] to deeply equal [ { last: null } ]` |
| F1 guard ignora `role` nulo | `apps/web/src/features/organizations/account.ts:25` | yes - carried from 16dbd6f (C15 `:289`, C16 `:306`) |
| F2 contagem fixa `Transferidos: 0.` | `apps/web/src/routes/_app/settings/members.tsx:342` | yes - carried from 16dbd6f (C34, hoje `:678`) |
| F3 falha da revogação engolida | `apps/web/src/routes/_app/settings/members.tsx:329` | yes - carried from 16dbd6f (C36, hoje `:768`) |
| F4 sem ordenação | `apps/server/src/modules/auth/me.ts:34` | yes - carried from 16dbd6f (C8 `me.spec.ts:232`) |
| F5 `initialOrganization` ignora o `Member` ativo | `apps/server/src/modules/auth/active-organization.ts:34` | yes - carried from 16dbd6f (C45 `sign-in.spec.ts:231`) |
| F6 sem gravar `User.lastActiveOrganizationId` | `apps/server/src/modules/auth/active-organization.ts:15-18` | yes - carried from 16dbd6f (C47 `sign-in.spec.ts:252`, C48) |
| F7 VIEWER sem o nome da página | `apps/web/src/routes/_app/settings/organization.tsx:81` | yes - carried from 16dbd6f (C21, hoje `:429`) |

## Gate

Verified at c445910.

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` num worktree limpo em `c445910`: exit 0. O Biome checou 158 arquivos sem correções e o typecheck passou. O `pnpm test` rodou **31 arquivos, com 262 aprovados e 0 falhos**: são os 261 da rodada 2 mais o C50. O build do web e do server passou. O timeout de 20 s do SMTP contra o Mailpit (`email.spec.tsx` / `send-email.spec.tsx`) não apareceu nesta execução.
- O e2e completo (`pnpm --filter @bens/web exec playwright test`) rodou contra o dev stack do tree real em `c445910`: **84 aprovados, 0 falhos**. São os 83 da rodada 2 mais o teste novo do cabeçalho.

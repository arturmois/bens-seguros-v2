# Org web verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 9d2f1c6..16dbd6f
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Resumo: os 49 checks estão provados em `16dbd6f`. As 7 falhas injetadas foram mortas: as 4 que sobreviveram na rodada 1 e 3 novas na superfície da door 4 e do C21. A suíte e2e completa passa (83 de 83), e as 15 regressões da rodada 1 sumiram. O gate passa com 261 testes. O veredito continua FAIL por duas lacunas de cobertura que a varredura desta rodada encontrou e por uma linha de Test policy não atendida:

- a falha da troca de corretora feita **pelo cabeçalho** (AC 15, `_app.tsx:125-128`) não tem prova. O C17 só cobre a troca a partir de `/select-org`;
- o `SetNull` de `User.lastActiveOrganizationId` quando a organização é apagada, que está no `Relations` do plano, não tem check nem teste.

Escopo: segui "Re-verifying after a fix". Rodei de novo, em `16dbd6f`, as provas dos 49 checks. Verifiquei por inteiro o que não era PASS na rodada 1 (C8, C12, C15, C16, C21, C34, C36), os checks novos (C44–C49) e todo check cujo teste o diff do fix mexeu. O helper `enterApp` de `org-web.spec.ts:28-31` mudou, então todo teste que o chama entrou nessa conta. Nas linhas da tabela, `verified at 16dbd6f` quer dizer que reli o assert; `carried from 90ca899` quer dizer que o assert não mudou (só a linha citada foi atualizada).

Ambiente: as provas de `HEAD` rodaram no tree real. O servidor rodou com `vitest`. O e2e rodou contra o `pnpm dev` que já estava de pé (web `:3000` → server `:3001`, banco `bens` com `20260923133344_user_last_active_organization` aplicada). O `git status --porcelain` do tree real estava vazio antes e continuou vazio no fim. As falhas rodaram em `git worktree add --detach` próprios em `<scratchpad>/wt-f1..f7`, cada um com `pnpm install --offline`. O gate rodou num worktree limpo, `wt-gate`. Para as falhas do web, montei uma stack própria: server `:3101`, com `APP_URL=http://localhost:3100`, e web `:3100`, com o proxy do vite apontado para `:3101` só no worktree. O banco foi o `bens_orgweb_verify2`, criado com `prisma migrate deploy` e os grants de `bens_app` de `docker/postgres/init/01-app-role.sh`. Uma execução de controle com server e web limpos passou nos 6 testes usados contra as falhas. No fim, parei as stacks, apaguei o banco (`DROP DATABASE … WITH (FORCE)`) e removi os worktrees (`git worktree remove --force` + `prune`).

## Binding sources

Carried from 90ca899. Nenhuma tela do web mudou no fix (o `git diff --stat 90ca899..HEAD` só mostra arquivos de `apps/web/e2e/`). A door 4 mexeu na sessão, então li de novo, em `16dbd6f`, as linhas de sessão das fontes: `docs/architecture.md:162`, onde `auth` é dono de `User` e `Session`, e `:285-287`, onde a request monta o tenant a partir de `session.activeOrganizationId`. A door 4 grava em `User`, uma tabela do próprio `auth`, e continua a ler o tenant da sessão validada. Não há contradição.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/roadmap.md` Fase 4 (linhas 134–161) | yes - carried from 90ca899 | none | - |
| `docs/architecture.md` §6 (linhas 277–297), §9 (398–435), tabela de módulos (linha 162) | yes - linhas 162 e 285–287 relidas em 16dbd6f para a door 4 | none | - |
| `.specs/STATE.md` Phase 4 item 4 (linha 34), AD-001 (linha 7) | yes - AD-001 relida: o tenant continua vindo de `session.activeOrganizationId` | none | - |

## Checks

Provas rodadas em `16dbd6f`, duas invocações:

- **Servidor.** `pnpm --filter @bens/server exec vitest run src/modules/auth/me.spec.ts src/modules/auth/sign-in.spec.ts -t "lists the active organizations by name|orders organizations by name, then by id|rejects every invalid session with 401|starts the session in the last active organization|falls back to the only active organization|leaves the organization open when there is a choice|remembers the organization that was made active" --reporter=verbose`. Saiu com **7 aprovados, 12 pulados** e os 7 nomes listados com ✓.
- **Web.** `pnpm --filter @bens/web exec playwright test e2e/org-web.spec.ts e2e/register.spec.ts -g "<44 nomes do checks.md>"`. Saiu com **44 aprovados**, cada um listado com ✓ em `file:line`. Confirmei com `grep` que cada nome existe exatamente uma vez em `apps/web/e2e`.
- **Repetição.** C12, C15, C16, C21 e C48 rodaram com `--repeat-each=5`: **25 aprovados**. Na rodada 1, C12, C15 e C16 falhavam de forma intermitente.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | sem membership: `/dashboard` → `/onboarding`, título/campo/botão | `org-web.spec.ts:115` ✓; `register.spec.ts:72` ✓ | `org-web.spec.ts:117` `toHaveURL('/onboarding')`; `:118` heading `'Criar corretora'`; `:119` `getByLabel('Nome')`; `:120` button `'Criar corretora'`; `register.spec.ts:79-82` (as mesmas quatro). carried from 90ca899 | PASS |
| C2 | "Corretora Azul" → POST body, `/dashboard`, cabeçalho | `:123` ✓ | `org-web.spec.ts:128` `postDataJSON()).toEqual({ name: 'Corretora Azul' })`; `:129` `toHaveURL('/dashboard')`; `:130` `getByText('Corretora Azul')`. carried from 90ca899 | PASS |
| C3 | 1 e 81 caracteres → mensagem, sem POST | `:133` ✓ | `org-web.spec.ts:140-143` loop `['A', 'A'.repeat(81)]` `getByText('O nome precisa ter entre 2 e 80 caracteres.')`; `:145` `expect(calls).toEqual([])`. carried from 90ca899 | PASS |
| C4 | 422 `ORG_LIMIT_REACHED` → mensagem, fica em `/onboarding` | `:148` ✓ | `org-web.spec.ts:163-165` `getByText('Você já participa do número máximo de organizações.')`; `:166` `toHaveURL('/onboarding')`. carried from 90ca899 | PASS |
| C5 | sem sessão `/onboarding` → `/login` | `:169` ✓ | `org-web.spec.ts:171` `toHaveURL(/\/login/)`. carried from 90ca899 | PASS |
| C6 | termos pendentes `/onboarding` → `/terms-acceptance` | `:174` ✓ | `org-web.spec.ts:178` `toHaveURL(/\/terms-acceptance/)`. carried from 90ca899 | PASS |
| C7 | OWNER cria outra → nome novo no cabeçalho | `:181` ✓ | `org-web.spec.ts:188` `toHaveURL('/dashboard')`; `:189` `getByText('Corretora Nova')`. carried from 90ca899 | PASS |
| C8 | `organizations` ativos `{id,name,role}`, ordem `name` e depois `id`, inativo fora, `[]` | vitest `me.spec.ts:221` ✓ e `:276` ✓ | `me.spec.ts:225` `.toEqual([])`. `:228-235`: "Beta" é criada **antes** de "Alfa" e o esperado é `[{ id: alfa…, name: 'Alfa', role: 'OWNER' }, { id: beta…, name: 'Beta', … }]`, então a ordem de inserção já não coincide com a esperada. `:268-271` `[{ id: ids[0], name: 'Igual' }, { id: ids[1], … }]`, com `Aaa` inativa fora. `:284-289` na própria camada: `rows.toSorted(byNameThenId)).toEqual([{a,Alfa},{b,Alfa},{a,Beta},{c,Beta}])`, com o empate por `id` discriminado (entrada `b` antes de `a`). F4 foi morta em `:232`. verified at 16dbd6f | PASS |
| C9 | `/me` sem sessão → 401 `UNAUTHENTICATED` | vitest `me.spec.ts:98` ✓ | `me.spec.ts:124` `expect(response.statusCode).toBe(401)`; `:125` `expect(response.json()).toEqual(unauthenticated)`. carried from 90ca899 | PASS |
| C10 | 2 ativos, role nulo → `/select-org`, título, botão por nome | `:192` ✓ | `org-web.spec.ts:199` `toHaveURL('/select-org')`; `:200` heading `'Escolher corretora'`; `:201-202` `getByRole('button', { name: alfa.name / beta.name })`. A precondição é o `clearActiveOrganization` de `:197`, que agora também zera `lastActiveOrganizationId` (`support.ts:97-107`). verified at 16dbd6f | PASS |
| C11 | botão → POST com `organizationId`, `/dashboard`, cabeçalho | `:205` ✓ | `org-web.spec.ts:214` `postDataJSON()).toEqual({ organizationId: alfa.id })`; `:215` `toHaveURL('/dashboard')`; `:216` `getByText(alfa.name)`. verified at 16dbd6f (mesma precondição de `:210`) | PASS |
| C12 | o cabeçalho é um botão com o nome da ativa; a troca muda o nome e o `GET /organization` responde o `id` | `:219` ✓, 5/5 em repetição | `org-web.spec.ts:224` `enterApp(page, beta.name)`, com o nome da ativa no `banner` (`:30`). `:229` `expect((await switched).status()).toBe(200)` espera a mutation. `:231` `header.getByRole('button', { name: beta.name })).toHaveCount(0)` e `:232` `header.getByRole('button', { name: alfa.name })).toHaveCount(1)`: o menu fechado (`_app.tsx:123`) deixa no `banner` só o botão da ativa, e um cabeçalho que não trocasse manteria o botão `beta`. `:237` `expect(body.id).toBe(alfa.id)`. verified at 16dbd6f | PASS |
| C13 | uma corretora → texto, sem botão | `:258` ✓ | `org-web.spec.ts:263` `getByRole('banner').getByText(created.name)).toBeVisible()`; `:264` `getByRole('button', { name: created.name })).toHaveCount(0)`. verified at 16dbd6f | PASS |
| C14 | termos pendentes, sem org → `/terms-acceptance`, não `/onboarding` | `:267` ✓ | `org-web.spec.ts:271` `toHaveURL(/\/terms-acceptance/)`; `:272` `not.toHaveURL(/\/onboarding/)`. carried from 90ca899 | PASS |
| C15 | `activeOrganizationId` preenchido, role nulo, lista → `/select-org` | `:275` ✓, 5/5 | A precondição agora é real e está afirmada. A convidada tem a própria "Propria" e aceita "Sumida", que vira a última (door 4). O login novo cai em "Sumida" (`:282`), e o membro é desativado (`:283`). `:285` `expect(me.activeOrganizationId).toBe(created.id)`; `:286` `expect(me.role).toBeNull()`; `:287` `organizations…).toEqual([guest.own?.id])`; `:289` `toHaveURL('/select-org')`. F1 foi morta em `:289`. verified at 16dbd6f | PASS |
| C16 | `activeOrganizationId` preenchido, role nulo, `[]` → `/onboarding` | `:292` ✓, 5/5 | `org-web.spec.ts:302` `activeOrganizationId).toBe(created.id)`; `:303` `role).toBeNull()`; `:304` `organizations).toEqual([])`; `:306` `toHaveURL('/onboarding')`. F1 foi morta em `:306`. verified at 16dbd6f | PASS |
| C17 | 404 na troca → "Organização não encontrada.", URL igual | `:309` ✓ | `org-web.spec.ts:323` `getByText('Organização não encontrada.')`; `:324` `toHaveURL('/select-org')`. carried from 90ca899. Só a partir de `/select-org` (ver Coverage) | PASS |
| C18 | OWNER: título, campo com o nome, slug, "Salvar" | `:327` ✓ | `org-web.spec.ts:333` heading `'Corretora'`; `:334` `getByLabel('Nome')).toHaveValue(created.name)`; `:335` `getByText(created.slug)`; `:336` button `'Salvar'`. verified at 16dbd6f (entra por `enterApp`) | PASS |
| C19 | "Corretora Verde" → PATCH body, "Nome atualizado.", slug igual | `:339` ✓ | `org-web.spec.ts:350` `postDataJSON()).toEqual({ name: 'Corretora Verde' })`; `:351` `getByText('Nome atualizado.')`; `:352` `getByText(created.slug)`. verified at 16dbd6f | PASS |
| C20 | rename com 1 e 81 → mensagem, sem PATCH | `:355` ✓ | `org-web.spec.ts:366-369` loop `getByText('O nome precisa ter entre 2 e 80 caracteres.')`; `:371` `expect(calls).toEqual([])`. verified at 16dbd6f | PASS |
| C21 | VIEWER: nome **como texto**, sem "Salvar", sem PATCH | `:394` ✓, 5/5 | `org-web.spec.ts:407` `const content = page.locator('section')`, que é só o conteúdo da página (`organization.tsx:27`; o cabeçalho é `<header>`, `_app.tsx:73`). `:409` `content.getByText(created.name, { exact: true })).toBeVisible()`; `:410` `content.getByLabel('Nome')).toHaveCount(0)`; `:411` button `'Salvar'` `toHaveCount(0)`; `:412` `expect(patches).toEqual([])`. F7 (sem o `<p>{organization.name}</p>` de `organization.tsx:81`) foi morta em `:409`. verified at 16dbd6f | PASS |
| C22 | "Carregando a corretora…"; falha → mensagem e "Tentar de novo" | `:416` ✓ | `org-web.spec.ts:439` `getByText('Carregando a corretora…')`; `:441` `getByText('Não foi possível carregar a corretora.')`; `:442` button `'Tentar de novo'`. verified at 16dbd6f | PASS |
| C23 | menu "Corretora" para OWNER e VIEWER; "Equipe" só com `member:update` | `:445` ✓ | `org-web.spec.ts:450-451` links `'Corretora'`/`'Equipe'` visíveis para o OWNER; `:459` `'Corretora'` visível; `:460` `getByRole('link', { name: 'Equipe' })).toHaveCount(0)` para o VIEWER. verified at 16dbd6f | PASS |
| C24 | VIEWER em `/settings/members`: mensagem, sem GET de membros/convites | `:463` ✓ | `org-web.spec.ts:477` `getByText('Você não gerencia a equipe desta corretora.')`; `:478` `expect(calls).toEqual([])`. verified at 16dbd6f | PASS |
| C25 | OWNER: título "Equipe", linha "Proprietário", sem seletor, sem "Desativar" | `:481` ✓ | `org-web.spec.ts:488` heading `'Equipe'`; `:489` `row.getByText('Proprietário')`; `:490` `row.getByRole('button', { name: 'Desativar' })).toHaveCount(0)`; `:491` ``row.getByLabel(`Papel de ${owner.email}`)).toHaveCount(0)``. verified at 16dbd6f | PASS |
| C26 | cinco rótulos | `:494` ✓ | `org-web.spec.ts:506-508` loop `['Proprietário', 'Administrador', 'Gerente', 'Comercial', 'Visualizador']` `members.locator('span', { hasText: label })).toBeVisible()`. verified at 16dbd6f | PASS |
| C27 | convite ADMIN → POST `{ email, role: 'ADMIN' }`, lista com "Administrador" | `:511` ✓ | `org-web.spec.ts:521` `postDataJSON()).toEqual({ email, role: 'ADMIN' })`; `:523` `row.getByText('Administrador')`. verified at 16dbd6f | PASS |
| C28 | e-mail inválido → mensagem, sem POST | `:526` ✓ | `org-web.spec.ts:539` `getByText('Informe um e-mail válido.')`; `:540` `expect(calls).toEqual([])`. verified at 16dbd6f | PASS |
| C29 | 409 `INVITATION_PENDING` → mensagem | `:543` ✓ | `org-web.spec.ts:563` `getByText('Já existe um convite pendente para este e-mail.')`. verified at 16dbd6f | PASS |
| C30 | "Nenhum convite pendente." | `:566` ✓ | `org-web.spec.ts:572` `getByText('Nenhum convite pendente.')`. verified at 16dbd6f | PASS |
| C31 | confirmar a revogação → DELETE, a linha some | `:575` ✓ | `org-web.spec.ts:585` ``getByRole('dialog', { name: `Revogar o convite para ${email}?` })``; `:590` `await removed` (DELETE em `/api/v1/invitations/`); `:591` `expect(row).toHaveCount(0)`. verified at 16dbd6f | PASS |
| C32 | papel → PATCH `{ role: 'COMMERCIAL' }`, linha "Comercial" | `:594` ✓ | `org-web.spec.ts:609` `postDataJSON()).toEqual({ role: 'COMMERCIAL' })`; `:611` `row.locator('span', { hasText: 'Comercial' })`. verified at 16dbd6f | PASS |
| C33 | confirmar a desativação → PATCH `{ active: false }`, "Inativo" | `:614` ✓ | `org-web.spec.ts:625` dialog ``Desativar ${NAME}?``; `:628` `postDataJSON()).toEqual({ active: false })`; `:629` `row.getByText('Inativo')`. verified at 16dbd6f | PASS |
| C34 | confirmar a transferência → POST `{ toMemberId }` e "Transferidos: {n}." com `n` = `transferred` | `:632` ✓ | `org-web.spec.ts:650-652` dialog ``Transferir a carteira de Carla Origem para ${NAME}?``: origem e destino têm nomes distintos, então a ordem é discriminada. `:656` `pathname).toBe(`/api/v1/members/${origin}/transfer-portfolio`)`; `:657` `postDataJSON()).toEqual({ toMemberId: destination })`. `:643` reescreve a resposta para `transferred: 7`, e `:658` `getByText('Transferidos: 7.')`. F2 foi morta em `:658`. verified at 16dbd6f | PASS |
| C35 | "Carregando a equipe…"; falha → mensagem e "Tentar de novo" | `:661` ✓ | `org-web.spec.ts:688` `getByText('Carregando a equipe…')`; `:690` `getByText('Não foi possível carregar a equipe.')`; `:691` button `'Tentar de novo'`. verified at 16dbd6f | PASS |
| C36 | mutation de membro ou convite com `error.message` → mensagem, diálogo aberto | `:694` ✓ | Desativar: `org-web.spec.ts:733` `dialog.getByText(failures.deactivate)`, `:734` `expect(dialog).toBeVisible()`. Transferir: `:740`, `:741`. Revogar: `:748`, `:749`, e `:751` `expect(invitation).toHaveCount(1)`. Papel (sem diálogo): `:754` `getByText(failures.role)`. F3 foi morta em `:748`. verified at 16dbd6f | PASS |
| C37 | sem sessão: `organizationName`, rótulo, link `/login?redirect=`, sem POST de aceite | `:757` ✓ | `org-web.spec.ts:769` heading `created.name`; `:770` `getByText('Gerente')`; `:771-774` link `'Entrar para aceitar'` `toHaveAttribute('href', /\/login\?redirect=.*accept-invitation.*token/)`; `:775` `expect(calls).toEqual([])`. carried from 90ca899 | PASS |
| C38 | aceitar → POST `{ token }`, `/dashboard`, cabeçalho | `:778` ✓ | `org-web.spec.ts:807` `postDataJSON()).toEqual({ token })`; `:808` `toHaveURL('/dashboard')`; `:809` `getByText(created.name)`. carried from 90ca899 | PASS |
| C39 | token desconhecido → "Convite não encontrado.", sem "Aceitar convite" | `:812` ✓ | `org-web.spec.ts:813` loop `['/accept-invitation?token=nao-existe', '/accept-invitation']`, que agora cobre também o ramo sem token (`accept-invitation.tsx:34-40`); `:815` `getByText('Convite não encontrado.')`; `:816` button `'Aceitar convite'` `toHaveCount(0)`. verified at 16dbd6f | PASS |
| C40 | `EXPIRED` → "Este convite expirou." | `:820` ✓ | `org-web.spec.ts:834` `getByText('Este convite expirou.')`; `:835` `toHaveCount(0)`. carried from 90ca899 | PASS |
| C41 | `REVOKED` e `ACCEPTED` → "Este convite não está mais aberto." | `:838` ✓ | `org-web.spec.ts:839-854` loop `['REVOKED', 'ACCEPTED']` `getByText('Este convite não está mais aberto.')`; `:854` `toHaveCount(0)`. carried from 90ca899 | PASS |
| C42 | 403 `INVITATION_EMAIL_MISMATCH` → mensagem, fica em `/accept-invitation` | `:859` ✓ | `org-web.spec.ts:869` `getByText('Este convite é para outro e-mail.')`; `:870` `toHaveURL(/\/accept-invitation/)`. carried from 90ca899 | PASS |
| C43 | "Carregando o convite…"; abre com termos pendentes e sem org | `:873` ✓ | `org-web.spec.ts:894` `getByText('Carregando o convite…')`; `:895` `toHaveURL(/\/accept-invitation/)`; `:897` heading `'Convite Aberto'`; `:898` `not.toHaveURL(/\/onboarding|\/terms-acceptance/)`. carried from 90ca899 | PASS |
| C44 | login com a última organização ainda ativa → sessão nela, mesmo com outra ativa | vitest `sign-in.spec.ts:202` ✓ | `sign-in.spec.ts:203` `ownerOf('Primeira', 'Segunda')` (duas ativas, a última é "Segunda"); `:205-206` troca para "Primeira"; `:208` `expect(await activeOrganizationOf(await signInAgain(email))).toBe(first)`, lido de `GET /api/v1/me` (`:161-165`). verified at 16dbd6f | PASS |
| C45 | a última com `Member` desativado e uma única outra ativa → sessão nessa outra | vitest `:211` ✓ | `sign-in.spec.ts:220` `lastActiveOrganizationOf(guest.userId)).toBe(owner.ids[0])` (a precondição da última está afirmada); `:228` desativação 200; `:231` `activeOrganizationOf(await signInAgain(guestEmail))).toBe(own.json().id)`. Sem última e com uma ativa: `:235` `.toBe(single.ids[0])`. F5 foi morta em `:231`. verified at 16dbd6f | PASS |
| C46 | sem última e com duas ativas → `null`; sem `Member` ativo → `null` | vitest `:238` ✓ | `sign-in.spec.ts:241` `activeOrganizationOf(await signInAgain(two.email))).toBeNull()`; `:245` e `:246` `.toBeNull()` para quem não tem organização. verified at 16dbd6f | PASS |
| C47 | onboarding, troca e aceite gravam `User.lastActiveOrganizationId` | vitest `:249` ✓ | Onboarding: `sign-in.spec.ts:252` `lastActiveOrganizationOf(owner.userId)).toBe(second)`. Troca: `:258` `.toBe(first)`. Aceite: `:265` `lastActiveOrganizationOf(guest.userId)).toBe(first)`. F6 foi morta em `:252`. verified at 16dbd6f | PASS |
| C48 | troca pelo cabeçalho, sair e entrar → `/dashboard` com a segunda no cabeçalho | `org-web.spec.ts:240` ✓, 5/5 | `org-web.spec.ts:250` troca 200 para `alfa`; `:251-252` "Sair" → `/login`; `:254` `toHaveURL('/dashboard')`; `:255` `header.getByRole('button', { name: alfa.name })).toBeVisible()`. A última criada é `beta`, então só a gravação da troca leva a `alfa`. F6 foi morta neste teste. verified at 16dbd6f | PASS |
| C49 | PATCH `/organization` com `error.message` → mensagem, o campo mantém o valor | `:374` ✓ | `org-web.spec.ts:389` `getByText('Não foi possível renomear agora.')).toBeVisible()`; `:390` `getByLabel('Nome')).toHaveValue('Corretora Recusada')`; `:391` `getByText('Nome atualizado.')).toHaveCount(0)`. verified at 16dbd6f | PASS |

Notas de precisão (não bloqueiam):

- `enterApp` (`org-web.spec.ts:29`) usa `toHaveURL('/dashboard')`, que pode ser satisfeito por um instante antes do redirect do guard. Com a F6, esse passo passou e a falha só apareceu na linha seguinte, `:30`. Quem sustenta a entrada no app é o assert do `banner` em `:30`, não o da URL.
- Nenhum teste cobre a última organização inativa com **duas** outras ativas, cujo resultado esperado é `null`. Pelo código (`active-organization.ts:34-36`), esse caso cai no mesmo ramo que o C46 já prova, então a tabela de decisão está coberta linha a linha.

## Coverage

Verified at 16dbd6f, exceto onde a linha diz `carried from 90ca899`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /api/v1/me` statuses (2) | plan Surface | 200 C8 (`me.spec.ts:232`) · 401 C9 (`me.spec.ts:124`). carried from 90ca899: o fix só extraiu o `sort` (`me.ts:34`, `:47-57`) | - |
| Landing doors (4) | plan Landing | door 1 C8 · door 2 C1/C10/C37/C43 · door 3: ordem C5/C6/C14 e "utilizável" (`activeOrganizationId` com `role`) C15/C16 (F1 morta) · door 4 C44–C47 e C48 | - |
| routes outside `_app` (3) | plan Landing door 2 | `/onboarding` C1 · `/select-org` C10 · `/accept-invitation` C37/C43. carried from 90ca899 | - |
| `organizations` rows (5) | plan AC 8 | ativo entra `me.spec.ts:232` · inativo fora `:268` (`Aaa` excluída) · vazio `:225` · ordem por `name` `:228-235`, com inserção inversa (F4 morta) · empate por `id` `:284-289`, na própria camada | - |
| guard destinations (5) | `account.ts:8-27` e door 3 | sem sessão C5 · termos antes C14/C6 · sem membership C1 · role nulo com lista C15 (`:285-289`) · role nulo sem lista C16 (`:302-306`); F1 morta nas duas | - |
| role labels (5) | plan AC 24 | os cinco em C26 (`org-web.spec.ts:506-508`). carried from 90ca899 | - |
| name bounds (4) | plan AC 3 / AC 18 | onboarding 1/81 C3 · rename 1/81 C20. carried from 90ca899 | - |
| invitation preview statuses (4) | server `getPublicInvitation200Status` | PENDING C37 · EXPIRED C40 · REVOKED/ACCEPTED C41. carried from 90ca899 | - |
| menu Equipe (2) | plan AC 21 | com C23 `:451` · sem C23 `:460` | - |
| initial organization of a session (5) | plan AC 42 / door 4 e `active-organization.ts:23-37` | última com membro ativo C44 `sign-in.spec.ts:208` · última inativa e uma única ativa C45 `:231` · sem última e uma única ativa C45 `:235` · duas ativas sem última C46 `:241` · nenhuma ativa C46 `:246` | - |
| writers of the last organization (3) | quem chama `assignActiveOrganization`: `onboarding.ts:47`, `organizations/active-organization.ts:17`, `invitation.ts:233` | onboarding `sign-in.spec.ts:252` · troca `:258` · aceite `:265` (F6 morta) | - |
| session creation paths (3) | plan Flow 8 ("login, link de verificação, 2FA") e o hook único `auth.ts:77-88` | login por e-mail C44–C46 · 2FA: `two-factor.spec.ts:65-66` (`toHaveURL('/dashboard')` e heading `Olá, ${NAME}` depois do código, com uma corretora; sem o hook, o guard mandaria para `/select-org`), na suíte completa verde · link de verificação: não há membership antes da primeira verificação (login sem verificar dá 403, `sign-in.spec.ts:28`), então o resultado é sempre `null`; `register.spec.ts:79` cai em `/onboarding` | - |
| mutation failure shown (5) | plan AC 34 e AC 44; `members.tsx:95-103`, `:326-347`; `organization.tsx:63-65` | desativar `:733-734` · revogar `:748-751` (F3 morta) · transferir `:740-741` · mudar papel `:754` · renomear C49 `:389-390` | - |
| header after the switch (2) | plan AC 11 | botão com o nome da ativa `org-web.spec.ts:224`/`:30` · nome escolhido no cabeçalho `:231-232` e `id` `:237` | - |
| `transferred` count (n) | plan AC 32 | `n = 7` vindo da resposta reescrita (`:643`, `:658`), `toMemberId` do destino `:657` e `:id` da origem `:656` (F2 morta) | - |
| `/accept-invitation` without a token (1) | plan Observable, "sem token cai no AC 37" | C39 `org-web.spec.ts:813` (`'/accept-invitation'`) | - |
| *(sem linha)* origem da troca que falha (2) | plan AC 15 ("permanecer na tela de onde partiu a troca") e Flow 4 ("`/select-org` e o seletor do cabeçalho") | `/select-org` C17 `:323-324` · cabeçalho: o `catch` de `_app.tsx:125-128` mostra `failure` em `:155`, mas nenhum teste falha o `POST /api/v1/me/active-organization` a partir do cabeçalho. `rg -n "active-organization" apps/web/e2e` só tem o `route.fulfill` 404 de `:315`, e ele roda em `/select-org` | cabeçalho |
| *(sem linha)* `Relations` `User.lastActiveOrganizationId` (2) | plan Relations | "só vale com `Member` ativo" C45 `sign-in.spec.ts:231` · "apagar a organização zera o campo (`SetNull`)": a constraint existe (`migration.sql:5` `ON DELETE SET NULL`, `schema.prisma` `onDelete: SetNull`), mas nenhum check ou teste a afirma. `rg -n "organization\.(delete\|deleteMany)"` só acha `database.spec.ts:271,281`, que não lê `User` | `SetNull` ao apagar |

## Test policy rows

Verified at 16dbd6f, exceto onde a linha diz `carried from 90ca899`.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary | `apps/server/src/modules/auth/me.ts` (`organizations`, `byNameThenId`) | própria camada: C8 unitário `me.spec.ts:276-289` e integração `:228-235` · fronteira: cabeçalho C12 `org-web.spec.ts:231-237` | yes |
| Decides, not reached across a boundary | `apps/server/src/modules/auth/active-organization.ts` `initialOrganization` (só o hook do próprio `auth` chama, em `auth.ts:83`) | uma linha da tabela por caso: 5 casos C44 `:208`, C45 `:231`/`:235`, C46 `:241`/`:246` | yes |
| Decides, not reached across a boundary | `features/organizations/account.ts` (guard) | um caso por destino (5): C1, C5, C14, C15, C16 | yes |
| Decides, not reached across a boundary | `features/organizations/labels.ts` | 5 rótulos C26. carried from 90ca899 | yes |
| Decides, not reached across a boundary | `routes/(onboarding)/accept-invitation.tsx` (4 status do preview e sem token) | C37, C39, C40, C41 | yes |
| Entry point that decides nothing | `onboarding.tsx`, `select-org.tsx`, `organization.tsx`, `members.tsx`, `AcceptForm`, seletor do cabeçalho (`_app.tsx:103-158`) | entrada aceita, cada rejeição, cada caminho de erro | no - o caminho de erro do seletor do cabeçalho (`_app.tsx:125-128`) não tem prova. Os demais atendem: onboarding C2/C3/C4 · select-org C11/C17 · organização C19/C20/C49 · membros C27/C28/C29, papel C32 e falha `:754`, diálogo C36 · aceite C38/C42 · cabeçalho com sucesso C12 |
| Instrumentation, pass-throughs | `assignActiveOrganization` (`active-organization.ts:5-19`), `auth.ts:77-88` (hook que só repassa), `e2e/support.ts` (`clearActiveOrganization`, `signUp`), `src/api/**` gerado, `me.schema.ts` | coberto pelos consumidores: C47/C48 e C44–C46 | yes |

## Faults injected

Verified at 16dbd6f. Cada falha rodou num `git worktree add --detach <scratchpad>/wt-fN HEAD` próprio, com `pnpm install --offline`. As do web rodaram contra a stack `:3100`/`:3101` com o banco `bens_orgweb_verify2`, e o servidor dela era o do worktree da falha (F6) ou o do worktree limpo (F1, F2, F3, F7). O `git status --porcelain` do tree real estava vazio antes e continuou vazio depois da remoção dos worktrees. Nenhum `git stash` foi usado.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 guard ignora `role` nulo: `if (me.activeOrganizationId) return null` | `apps/web/src/features/organizations/account.ts:25` | yes - C15 `org-web.spec.ts:289` Expected `/select-org`, Received `/dashboard`; C16 `:306` Expected `/onboarding`, Received `/dashboard` |
| F2 contagem fixa: `` onDone(`Transferidos: 0.`) `` | `apps/web/src/routes/_app/settings/members.tsx:342` | yes - C34 `org-web.spec.ts:658` `getByText('Transferidos: 7.')` element(s) not found |
| F3 falha da revogação engolida: `revoke.mutateAsync(…).catch(() => undefined)` | `apps/web/src/routes/_app/settings/members.tsx:329` | yes - C36 `org-web.spec.ts:748` `dialog.getByText(failures.revoke)` element(s) not found |
| F4 sem ordenação: `.sort(byNameThenId)` removido | `apps/server/src/modules/auth/me.ts:34` | yes - C8 `me.spec.ts:232` (`lists the active organizations by name` ×, Expected/Received com a ordem trocada) |
| F5 `initialOrganization` ignora o `Member` ativo: `if (last) return last` | `apps/server/src/modules/auth/active-organization.ts:34` | yes - C45 `sign-in.spec.ts:231` Expected a organização própria, Received a desativada |
| F6 `assignActiveOrganization` deixa de gravar `User.lastActiveOrganizationId` | `apps/server/src/modules/auth/active-organization.ts:15-18` | yes - C47 `sign-in.spec.ts:252` (Received `null`); C48 `org-web.spec.ts:240` falhou em `enterApp` (`:30`, `banner` sem `beta`), porque sem a última gravada o login com duas corretoras não entra no app |
| F7 o VIEWER perde o nome da página: `<p>{organization.name}</p>` → `null` | `apps/web/src/routes/_app/settings/organization.tsx:81` | yes - C21 `org-web.spec.ts:409` `content.getByText(created.name, { exact: true })` element(s) not found |

Não injetei falha no C12, no C49 nem no unitário `byNameThenId`, por causa do teto de 7 (uma por superfície). Os asserts desses três foram lidos acima.

## Gate

Verified at 16dbd6f.

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` num worktree limpo em `16dbd6f`: exit 0. O Biome checou 158 arquivos sem correções, o typecheck passou, a suíte teve **31 arquivos e 261 aprovados, 0 falhos**, e o build do web e do server passou.
- E2E completo (`pnpm --filter @bens/web exec playwright test`) contra o dev stack do tree real em `16dbd6f`: **83 aprovados, 0 falhos** (na rodada 1 foram 64 aprovados e 17 falhos). Os specs de login, termos, 2FA e recuperação de senha voltaram a passar.

**Ranked gaps**

1. A falha da troca de corretora pelo cabeçalho não tem prova (AC 15, "permanecer na tela de onde partiu a troca"; Test policy "Entry point", "each error path"). C17 só cobre `/select-org`. Arquivo: `apps/web/src/routes/_app.tsx:125-128`, `:155`; nenhum teste.
2. O `SetNull` de `User.lastActiveOrganizationId` ao apagar a organização (plan `Relations`) não tem check nem teste. `apps/server/prisma/migrations/20260923133344_user_last_active_organization/migration.sql:5`; nenhum teste.

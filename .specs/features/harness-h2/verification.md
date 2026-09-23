# Harness H2 verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 9b2d097..a885893
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Os onze checks passam em `HEAD` (`a885893`), cada um com evidência localizada, e o gate do repositório está verde. O achado `I1` da rodada 1 foi resolvido: o texto novo do `CLAUDE.md:15`–`16` agora bate com o código.

**Histórico.** Rodada 1 (`e6c1b8e`): FAIL por um único achado, `I1`. O `CLAUDE.md:15` dizia que fora do tenant existiam **só** `withUser`, `withInvitation` e `withoutTenant`, este para "tabelas de identidade e fila", mas o código lê identidade pelo client direto e usa `withoutTenant` só para a fila. A correção `a885893` mexe só no `CLAUDE.md` (+2 −2): nomeia o client direto e o Better Auth como o caminho das tabelas de identidade, reserva `withoutTenant` para a fila e cita `assignActiveOrganization` na linha da organização ativa.

**Escopo desta rodada.** Pelo `verify.md`, a rodada 2 re-roda todas as provas em `HEAD`, julga de novo o `I1` contra o código e atualiza as citações do único arquivo que a correção tocou (`CLAUDE.md`). O resto é herdado de `e6c1b8e`, e cada seção diz de onde veio.

## Binding sources

*carried from e6c1b8e*

Nenhuma fonte vinculante. O `checks.md` roda sob `light`, sem `plan.md`, e a seção `## Intent` faz o papel do plano. A correção não tocou interface nenhuma, então o passo 1 não se aplica.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| none - no binding source | n/a | none | - |

## Checks

*verified at a885893.* Provas re-rodadas em `HEAD` com `bash -c '<prova>'`, cada uma com o próprio exit code (C1–C10 numa só invocação, C11 à parte). As citações do `CLAUDE.md` foram conferidas de novo em `HEAD`: a correção trocou duas linhas por outras duas, então os números ficaram iguais (`:15`, `:16`, `:21`, `:43`, `:48`, `:50`). As demais citações são de arquivos que a correção não tocou e foram confirmadas pelo grep das provas.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | o exemplo de use case abre `deps.db.withTenant(ctx, async (tx) =>`; o arquivo não tem `$transaction` | prova do C1, exit 0 | `docs/architecture.md:140` - `return deps.db.withTenant(ctx, async (tx) => {   // RLS: fora do withTenant a tabela falha`; `grep "\$transaction"` não acha nada | PASS |
| C2 | a anatomia do módulo diz `(tx, ctx)` e não tem mais `sempre recebem (db, ctx)` | prova do C2, exit 0 | `docs/architecture.md:121` - `client.repository.ts    # funções Prisma; sempre recebem (tx, ctx), o tx de db.withTenant` | PASS |
| C3 | a seção Tenant do CLAUDE.md nomeia os 8 termos, e a regra de rota nomeia `SESSION_ONLY` | prova do C3 (loop de 9 termos), exit 0 | `CLAUDE.md:15` - `` fora do tenant: tabelas de identidade (sem RLS: `User`, `Session`…) pelo client direto ou pelo Better Auth; `withUser` (… AD-006); `withInvitation` (… AD-007); `withoutTenant` (fila) ``; `CLAUDE.md:16` - `` (`activeOrganizationId`: inicial no hook de sessão do Better Auth, trocada por `assignActiveOrganization`, AD-010) e é validada contra `Member` por `requireTenant` ``; `CLAUDE.md:21` - `` a lista `SESSION_ONLY`, de rotas sem tenant, não cresce sem AD `` | PASS |
| C4 | todo helper citado existe no código com esse nome | prova do C4, exit 0 | `apps/server/src/infrastructure/database.ts:44` - `withUser<T>(userId: string, …)`; `:53` - `withInvitation<T>(tokenHash: string, …)`; `:62` - `withoutTenant<T>(run: …)`; `apps/server/src/modules/organizations/tenant-context.ts:21` - `const SESSION_ONLY = new Set([`; `:51` - `export function requireTenant(deps: TenantDeps)` | PASS |
| C5 | a seção Testes exige que o teste falhe sem o comportamento e que a precondição seja criada no banco, citando L-031..L-033 | prova do C5, exit 0 | `CLAUDE.md:48` (entre `## Testes` em `:43` e `## Antes` em `:50`) - `` **O teste falha se o comportamento for removido:** … crie no banco a precondição que o critério descreve, não num mock de resposta (L-031, L-032, L-033). `` | PASS |
| C6 | a skill some de `.agents/skills/`, do symlink e do `skills-lock.json`, que segue JSON válido | prova do C6, exit 0 | `skills-lock.json` carrega com `json.load` e não tem a chave; `test ! -e .agents/skills/vercel-react-best-practices` e `test ! -L .claude/skills/vercel-react-best-practices` passam | PASS |
| C7 | nenhuma superfície que instrui o agente cita a skill; no roadmap ela só aparece nos registros H1/H2 | prova do C7, exit 0 | ocorrências só em `docs/roadmap.md:103` (seção `## Checkpoint H1`) e `docs/roadmap.md:171` (seção `## Checkpoint H2`); `grep -rln` em `CLAUDE.md .agents docs/architecture.md docs/migration.md` não acha nada | PASS |
| C8 | o roadmap não cita `audit.repository.ts` nem `with-two-*`; a Fase 4 cita `test/factories.ts` | prova do C8, exit 0 | `docs/roadmap.md:141` - `` `test/factories.ts` (`withTwoTenants`, `withTwoSalespeople`); `` | PASS |
| C9 | o Checkpoint H2 tem `Resultado (2026-09-23)`, `Aplicado` e `Mantido` | prova do C9, exit 0 | `docs/roadmap.md:168` - `**Resultado (2026-09-23):**`; `:171` - `**Aplicado:**`; `:172` - `**Mantido:**` | PASS |
| C10 | `.harness-eval/` e `__pycache__/` são ignorados e não aparecem no `git status` | prova do C10, exit 0 | `.gitignore:15` - `.harness-eval/`; `.gitignore:16` - `__pycache__/`; `git status --porcelain` em `HEAD` lista só `verification.md` e `prompts/prompt-05.md` | PASS |
| C11 | o gate passa depois do commit, com o docker compose no ar | `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, exit 0 | lint: `Checked 158 files … No fixes applied.`; typecheck de web e server `Done`; test: `Test Files 31 passed (31)`, `Tests 262 passed (262)`; build do server `Done`, do web `✓ built` | PASS |
| I1 | (Intent) a nova regra de tenant do CLAUDE.md não diz nada falso sobre o código | leitura de `database.ts`, `tenant-context.ts`, `auth.ts`, `me.ts`, `auth/active-organization.ts`, `organizations/active-organization.ts`, `onboarding.ts` e `invitation.ts`; `grep` de `db.<model>.` e dos helpers no código de produção | `CLAUDE.md:15`, identidade pelo client direto ou pelo Better Auth: `apps/server/src/modules/organizations/tenant-context.ts:36` - `const session = await deps.db.session.findUnique({`; `apps/server/src/modules/auth/me.ts:10` - `deps.db.session.findUnique({`; `apps/server/src/modules/organizations/invitation.ts:199` - `deps.db.user.findUniqueOrThrow({`; `apps/server/src/modules/auth/auth.ts:34` - `database: prismaAdapter(db, …)`. `User`/`Session` sem RLS: as migrations só ativam RLS em `AuditLog`, `Example`, `Invitation`, `Member`, `Organization` e `Subscription`. `withoutTenant` (fila): o único uso em produção é `apps/server/src/modules/auth/auth.ts:26` - `db.withoutTenant((tx) => enqueueEmail(queue, tx, payload))`. `CLAUDE.md:16`, valor inicial: `auth.ts:77`–`83` - `databaseHooks.session.create.before` → `activeOrganizationId: await initialOrganization(db, session.userId)`; troca: `apps/server/src/modules/auth/active-organization.ts:10`–`12` - `tx.session.update({ … data: { activeOrganizationId: organizationId } })`, chamado por `organizations/active-organization.ts:17`, `onboarding.ts:47` e `invitation.ts:233`; validação: `tenant-context.ts:41` - `findActiveMember(deps.db, user.userId, session.activeOrganizationId)` | PASS |

### Julgamento das provas (nível e amostragem)

*carried from e6c1b8e* (a correção não mudou prova nenhuma, e o julgamento de nível vale igual)

- **C1, C2, C8, C9:** o grep lê o próprio texto que é a obrigação. Para uma mudança só de documentação, esse nível basta.
- **C3:** a prova confirma que os termos aparecem, mas não que a frase esteja certa. A exatidão foi conferida à mão (`I1`). É uma lacuna do tipo de prova, não do texto do check. Em `a885893` os nove termos continuam presentes.
- **C4:** a regex `^\s+<nome><T>\(` casa com as definições reais (`database.ts:44/53/62`), não com as chamadas.
- **C5:** o grep de `falha` é frouxo, mas a linha que casa (`CLAUDE.md:48`) é exatamente a regra nova.
- **C6:** cobre os três lugares onde a skill existia. Na rodada 1 também conferi que as 9 chaves do lock batem com os diretórios e os symlinks.
- **C7 e C10:** foram redigidos de novo antes do commit, um para excluir só os registros históricos H1/H2 e o outro para incluir `__pycache__`. Nenhum dos dois ficou mais fraco. `prompts/prompt-h2.md:15` cita a skill, mas é o prompt histórico, fora das superfícies que instruem o agente.
- **C11:** o gate completo rodou em `a885893`. Confirma que nenhuma referência de código quebrou e não prova nada sobre o texto.

### Exatidão do texto novo em relação ao código

*`CLAUDE.md:15`–`16` verified at a885893; o resto carried from e6c1b8e*

- **`CLAUDE.md:15`: agora correto (`I1` resolvido).** As tabelas de identidade (`User`, `Session`, e também `TermsAcceptance` em `apps/server/src/modules/auth/terms.ts:27`, que o "…" cobre) são lidas pelo client direto ou pelo adapter do Better Auth, e nenhuma delas tem RLS. `withUser` e `withInvitation` são usados como descrito (`membership.ts:4`, `me.ts:22`, `invitation.ts:154/187/207`, `onboarding.ts:33`, `auth/active-organization.ts:24`). `withoutTenant` aparece só na fila (`auth.ts:26`). A frase normativa ("Ler tabela com RLS fora do tenant de outro jeito … pede AD e política RLS") não afirma nada sobre o código de hoje.
- **Nota, não é achado:** o comentário em `apps/server/src/infrastructure/database.ts:60` ainda descreve `withoutTenant` como "for user-level tables (identity) and the queue". Isso é o que o helper *permite*, não como é usado hoje. O `CLAUDE.md` descreve o uso e é mais estreito, sem contradizer o comportamento. Além disso, `database.ts` está fora do diff desta feature.
- **Nota, não é achado:** tabelas de identidade também são tocadas *dentro* de transações. `initialOrganization` lê `User` no `withUser` (`auth/active-organization.ts:25`), e `assignActiveOrganization` grava `Session`/`User` no `withTenant` (`auth/active-organization.ts:10`–`18`). O `CLAUDE.md:15` não diz "só", então isso não o contradiz.
- **`CLAUDE.md:16`: correto e agora completo.** A nota da rodada 1 ("definida no hook" estava incompleto) foi resolvida, porque a linha cita `assignActiveOrganization`. Isso bate com a AD-010 (`.specs/STATE.md:16`). A função fica em `apps/server/src/modules/auth/active-organization.ts:5`. O arquivo `apps/server/src/modules/organizations/active-organization.ts` é só um chamador dela (`setActiveOrganization`).
- **`CLAUDE.md:15`, "Módulo de domínio usa só `withTenant`":** é regra para o futuro. `auth` e `organizations` são módulos de identidade e tenancy. Não é achado.
- **`CLAUDE.md:21`:** correto (`apps/server/src/app.ts:100`; `tenant-context.ts:21`–`27`).
- **`docs/architecture.md:121` e `:140`, `docs/roadmap.md:141` e `:168`–`172`, e as remoções:** conferidos na rodada 1 e fora do diff da correção.

## Coverage

*carried from e6c1b8e*

Não foi recalculada, porque o perfil é `light`. O join do autor em `checks.md` (6 propostas do H2, 3 caminhos de banco, 2 portas de rota, 3 lugares da skill) foi relido, e cada membro tem uma prova com exit 0 acima. A *exatidão* da frase sobre os caminhos fora do tenant, que a tabela não cobria, é o `I1`, e ele agora passa.

## Gate

*verified at a885893*

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` - 262 passed, 0 failed (31 arquivos de teste), exit 0 em `a885893`.

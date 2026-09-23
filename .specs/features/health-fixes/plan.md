# Health fixes

> Entre a Fase 4 e a Fase 5. Correções da auditoria de saúde do codebase (2026-09-23): F-01, F-02, F-03, F-05, F-06, F-07 e a metade "teto de organizações" do F-04. A quota de usuários (`assertQuota`) continua na Fase 5, como o `prompt-05.md` já define. Este plano para antes dos checks.

## Problem

A AD-008 e o `CLAUDE.md` mandam gravar "toda ação sensível" na trilha, mas nenhum documento diz quais ações são sensíveis. Hoje só `member.update` e `portfolio.transfer` gravam. Convidar alguém com papel, aceitar convite (que cria `Member`), revogar convite, renomear a corretora e criar a corretora não deixam rastro. Um agente da Fase 5 decide sozinho o que auditar, e o Verifier não tem critério para cobrar.

O `docs/architecture.md` §2 manda criar `<x>.repository.ts`, um arquivo por use case e `<x>.presenter.ts`. Nenhum módulo em disco faz isso: `organizations/invitation.ts` agrupa cinco use cases com Prisma inline. O §3 põe a troca de organização ativa no `auth`, e ela mora em `organizations/active-organization.ts`. Um agente que abre a Fase 5 recebe dois moldes contraditórios.

O teto de organizações por usuário (`countMemberships` ≥ `maxOrgsPerUser`) está copiado em `onboarding.ts:34` e `invitation.ts:207`, com o mesmo erro declarado duas vezes (`ORG_LIMIT` e `orgLimit`). `isUniqueViolation` está copiado em dois arquivos, e oito handlers repetem `if (!ctx) throw new Error('tenant context missing')`. Três erros de invariante não dizem o valor que os disparou (`'Subscription missing'`, `'unexpected invitation status'`, `'unexpected audit change'`).

Os Termos e a Política exibidos no web têm `[INSERIR CNPJ]`, `[INSERIR RAZÃO SOCIAL]` e outros cinco placeholders. O adiamento foi decidido em `.specs/features/terms/plan.md:117`, mas o roadmap não o registra como bloqueio de go-live.

Sem incidente: ainda não há cliente. Quem paga é o próximo agente e o primeiro cliente real.

Com isso pronto: cada ação sensível tem nome e linha na trilha, o documento descreve o código que existe, as regras duplicadas têm uma casa só, e o go-live não acontece com termos incompletos.

## Flow

Reusa `audit.record` (AD-008), `withTenant`, `AppError` e `currentUser` como molde do helper de tenant. Não cria módulo, tabela nem rota.

1. rotas de `organizations` (exists) → `currentTenant(request)` (new, no door - placement ao lado de `requireTenant`) devolve o `RequestContext`
2. `organizations` (exists) `createInvitation`, `revokeInvitation`, `acceptInvitation`, `renameOrganization`, `onboard` → `audit.record` (exists) na mesma transação grava `AuditLog` (exists) com a `action` da door 1
3. `organizations` (exists) `onboard` e `acceptInvitation` → `assertOrgLimit` (new, no door - placement em `membership.ts`) → `422 ORG_LIMIT_REACHED`
4. `shared/errors.ts` (exists) exporta `isUniqueViolation`; `errorHandler`, `invitation.ts` e `onboarding.ts` o usam
5. docs (exists): `docs/architecture.md` §2/§3/§4, `CLAUDE.md`, `.specs/STATE.md` AD-008 (door 1) e `docs/roadmap.md` recebem o molde da door 2 e o bloqueio de go-live

## Impact

| Front | What changes |
| --- | --- |
| domain | termo existente **ação sensível** (AD-008): era "toda", sem lista; passa a ser a lista fechada da door 1. Quem ramifica hoje: `member.ts` (2 chamadas) e o Verifier de toda feature futura |
| domain | `audit.record` passa a aceitar `Pick<RequestContext, 'userId'>` no lugar de `RequestContext`: o aceite e o onboarding só têm `UserContext`. Quem chama hoje: `member.ts` |
| stored data | `AuditLog` ganha linhas novas daqui em diante. Nada a migrar: sem backfill de atos passados |
| docs | o molde de módulo do §2 passa a ser o do código. Quem ramifica: todo agente que cria módulo (Fase 5 em diante) |
| API | nenhuma rota muda de assinatura, status ou body |

## Relations

None - no stored-data shape change. `AuditLog` já existe; só entram linhas.

## Surface

None - nothing consumed outside. As respostas das rotas tocadas não mudam.

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. Lista de ações auditadas | `action` gravada em `AuditLog`, lista fechada na AD-008: `member.update`, `portfolio.transfer`, `invitation.create`, `invitation.revoke`, `invitation.accept`, `organization.create`, `organization.update`. Ação nova entra na AD antes do código. `changes` por ação: `invitation.create` `{ role }`; `invitation.revoke` `{ status: ['PENDING','REVOKED'] }`; `invitation.accept` `{ role, invitationId }` com `entityId` = `Member.id`; `organization.create` `{ role: 'OWNER' }`; `organization.update` `{ name }` (redigido para `"[alterado]"` pela AD-008) | auditar também `setActiveOrganization` e aceite de termos: troca de organização é navegação, não muda poder de ninguém; o aceite de termos já tem registro próprio versionado (`TermsAcceptance`). Deixar "toda ação sensível" sem lista: é o problema |
| 2. Molde de módulo | `<entidade>.ts` (use cases da entidade, Prisma inline dentro do `withTenant`), `<entidade>.routes.ts`, `<entidade>.schema.ts`, `<entidade>.spec.ts`, `index.ts`. `<entidade>.repository.ts` só quando a mesma query serve dois ou mais arquivos de use case; `<entidade>.presenter.ts` só onde há PII mascarada por papel; um arquivo por use case só quando o arquivo da entidade passar de ~300 linhas | manter o molde atual do doc (repository + um arquivo por use case desde o início): nenhum módulo em disco o segue, e "complexity must be earned" não o justifica para CRUD de uma query |

- Nada mais neste ciclo é difícil de reverter: os helpers são internos, e as mensagens de erro de invariante não são contrato (500 com `INTERNAL_ERROR`).

## Criteria

### S1: Trilha das ações sensíveis (P1)

Cada ação da door 1 grava uma linha, na mesma transação do ato, sem PII.

**Acceptance Criteria**

1. WHEN OWNER ou ADMIN cria um convite THEN o sistema SHALL gravar um `AuditLog` com `action` `invitation.create`, `entityId` = id do convite, `actorUserId` = usuário da sessão e `changes` = `{ role }` com o papel convidado
2. The system SHALL NOT gravar o e-mail convidado em nenhum campo do `AuditLog` de `invitation.create`
3. WHEN OWNER ou ADMIN revoga um convite pendente THEN o sistema SHALL gravar `action` `invitation.revoke`, `entityId` = id do convite e `changes` = `{ status: ['PENDING', 'REVOKED'] }`
4. WHEN um usuário aceita um convite THEN o sistema SHALL gravar, na organização do convite, `action` `invitation.accept` com `actorUserId` = quem aceitou, `entityId` = id do `Member` criado e `changes` = `{ role, invitationId }`
5. WHEN OWNER ou ADMIN renomeia a organização THEN o sistema SHALL gravar `action` `organization.update`, `entityId` = id da organização e `changes` = `{ name: '[alterado]' }`
6. WHEN um usuário cria uma organização pelo onboarding THEN o sistema SHALL gravar, na organização nova, `action` `organization.create`, `actorUserId` = esse usuário, `entityId` = id da organização e `changes` = `{ role: 'OWNER' }`
7. IF a criação do convite falha com `409 INVITATION_PENDING` THEN o sistema SHALL NOT deixar linha `invitation.create` para esse e-mail
8. IF o aceite falha com `422 USER_QUOTA_REACHED` THEN o sistema SHALL NOT deixar linha `invitation.accept`
9. WHEN um ato é gravado em uma organização THEN a linha SHALL NOT aparecer ao ler `AuditLog` no tenant de outra organização

**Independent test:** criar, revogar e aceitar convite, renomear e criar organização pela API, e ler `AuditLog` no `withTenant` de cada organização.

### S2: Uma casa por regra e erros com contexto (P2)

As regras duplicadas passam a existir uma vez, e o erro de invariante diz o que o disparou.

**Acceptance Criteria**

10. IF o usuário já participa de `MAX_ORGS_PER_USER` organizações THEN o onboarding e o aceite de convite SHALL responder `422` com código `ORG_LIMIT_REACHED`, a partir de uma única função de checagem em `organizations/membership.ts`
11. The system SHALL definir `isUniqueViolation` uma única vez, em `shared/errors.ts`, e `invitation.ts`, `onboarding.ts` e `errorHandler` SHALL usá-la
12. The system SHALL obter o contexto de tenant nas rotas por `currentTenant(request)`, sem nenhuma ocorrência de `'tenant context missing'` no código de produção
13. IF `audit.record` recebe em `changes` um valor `null`, `undefined` ou de tipo não serializável THEN o erro SHALL citar o caminho da chave (ex.: `changes.nested.value`)
14. IF uma organização não tem `Subscription` na checagem de vaga THEN o erro SHALL citar o `organizationId` dessa organização
15. The system SHALL tipar o status do convite com o enum do Prisma em `previewStatus`, sem ramo `throw` para status desconhecido

**Independent test:** as suítes de onboarding, convite e audit; `rg` pelas strings antigas.

### S3: Documentação igual ao código (P2)

**Acceptance Criteria**

16. The system SHALL descrever em `docs/architecture.md` §2 ("Anatomia de um módulo") o molde da door 2, com o exemplo de use case do §2 usando Prisma inline dentro do `withTenant`
17. The system SHALL listar a troca de organização ativa na linha `organizations` do §3, e não na linha `auth`
18. The system SHALL trocar em `CLAUDE.md` "o repository recebe esse `tx`" por uma frase que valha para query inline e para `<x>.repository.ts`
19. The system SHALL listar na AD-008 (`.specs/STATE.md`) as sete ações da door 1 e a regra "ação nova entra na AD antes do código"
20. The system SHALL registrar em `docs/roadmap.md` os placeholders de `apps/web/src/features/legal/documents.ts` como bloqueio de go-live, com a exigência de subir `TERMS_VERSION`/`PRIVACY_VERSION` ao preenchê-los

**Independent test:** leitura dos trechos e `rg` pelas frases antigas.

## Out of scope

| Excluded | Why |
| --- | --- |
| Preencher os placeholders jurídicos | exige razão social, CNPJ, endereço e DPO reais; só o registro do bloqueio entra aqui |
| `assertQuota` (quota de usuários) | Fase 5, `billing/index.ts`, como o `prompt-05.md` define |
| Tela de auditoria e rota de listagem | `migration.md`: tela de auditoria é de fase posterior |
| Backfill de atos passados | não há cliente; as linhas antigas não existem para reconstruir |
| Reativação de membro no web, `errorMessage` no web, mover `Field`/`FormAlert`, `userId`/`organizationId` no log | achados F-08 a F-10: "corrigir quando tocar" |
| Auditar `setActiveOrganization` e aceite de termos | door 1: navegação e registro próprio |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Perfil da verificação | `standard` | mesmo perfil da Fase 4 (`.specs/STATE.md`) | n |
| Nome das ações | `<entidade>.<verbo>` em inglês, como `member.update` | identificadores em inglês (`CLAUDE.md`) e o padrão já gravado | n |

**Open questions:**

| # | Kind | Question | Until answered |
| --- | --- | --- | --- |
| 1 | blocks go-live | razão social, CNPJ, endereço, e-mail de contato e DPO para os Termos e a Política | os Termos não podem ser aceitos por cliente real |

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| API rotas de convite e organização tocadas | error shape and codes | existing - códigos e status não mudam; AC 7, AC 8, AC 10 |
| API rotas tocadas | versioning, rate limit | n/a - nenhuma assinatura muda |
| documento `docs/architecture.md` §2 | what the reader does next | AC 16 - copiar o molde ao criar módulo |
| documento `.specs/STATE.md` AD-008 | what the reader does next | AC 19 - acrescentar a ação na AD antes de codar |
| documento `docs/roadmap.md` | what the reader does next | AC 20 - preencher e subir versão antes do go-live |
| screen | empty, loading, error | n/a - nenhuma tela muda |

## Sources

- Auditoria de saúde (conversa de 2026-09-23) - achados F-01 a F-07
- `.specs/STATE.md` AD-008 - trilha sem PII, `audit.record` na mesma transação
- `prompts/prompt-05.md` - `assertQuota` fica na Fase 5

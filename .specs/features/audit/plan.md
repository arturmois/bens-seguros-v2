# Audit

> Fase 4, feature 3 de 4. Ciclo próprio. Depois: `org-web`. A revisão deste plano foi delegada neste turno ("faça vc a revisão"): o autor conferiu ADR-010, ADR-004, ADR-005, `migration.md` e o prompt da fase, e segue para os checks.

## Problem

A corretora já tem dono, membros e convite, mas ninguém muda o papel de quem entrou, ninguém desativa quem saiu, e nada registra esse ato. O índice do OWNER único existe e a API não o usa: dá para imaginar um segundo dono ou um dono desativado no dia em que a rota aparecer. O COMMERCIAL da próxima fase não tem de onde copiar o filtro da carteira, e a transferência citada no roadmap não tem função para estender quando contato, proposta e conversa existirem. Quem paga é a corretora que precisa trocar a equipe antes da Fase 6. Sem incidente: ainda não há cliente.

Com isso pronto, OWNER ou ADMIN altera papel, desativa e reativa membro, transfere a carteira do que já existir, e cada um desses atos fica numa trilha sem PII. O filtro da carteira e o helper de dois vendedores ficam prontos para os módulos seguintes.

## Flow

Reusa `requireTenant`, `withTenant`, o índice `Member_one_owner` e a trava `SELECT … FROM "Subscription" FOR UPDATE` do aceite de convite. Não cria contato, proposta nem conversa.

1. `PATCH /api/v1/members/:id` entra com `requireTenant` (exists) e `member:update` (door 5) → `organizations` (exists) grava o `Member` (exists) e `audit.record` (door 2) na mesma transação → `200`
2. `GET /api/v1/members` entra com `requireTenant` (exists) e `member:update` (door 5) → lista os membros que o RLS devolve → `200`
3. `POST /api/v1/members/:id/transfer-portfolio` entra com `requireTenant` (exists) e `portfolio:transfer` (door 5) → `organizations` (exists) roda `portfolioMoves` (door 4) e `audit.record` (door 2) na mesma transação → `200`
4. `scopeFor` (door 3) não é rota: o repository futuro aplica o retorno na query. `withTwoSalespeople` (exists, em `test/factories.ts`) só monta dois contextos `COMMERCIAL`

## Impact

| Front | What changes |
| --- | --- |
| domain | novo termo: **trilha** — um ato sensível gravado sem PII. Vive em `audit` |
| domain | `member:update` e `portfolio:transfer` entram no mapa. Quem ramifica hoje: `ROLE_PERMISSIONS` em `shared/permissions.ts` (`OWNER` e `ADMIN`; os outros papéis ficam sem elas) |
| domain | `scopeFor` passa a existir. Quem ramifica daqui para a frente: todo repository de carteira (ADR-010). Neste ciclo ninguém além do teste chama |
| stored data | `AuditLog` nasce vazia (door 1). `Member` não muda de forma; papel e `active` já existem |
| API | três rotas novas sob `/api/v1/members`. Quem ramifica hoje: o teste de boot que exige `requirePermission` |

## Relations

- Uma organização tem muitos `AuditLog`.
- Um `AuditLog` guarda um ator (`userId` da sessão) e um `entityId`. Não aponta para e-mail.
- `portfolioMoves` começa vazio: zero linhas de carteira até uma fase posterior acrescentar um move.

## Surface

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `PATCH /api/v1/members/:id` | `role?` entre `ADMIN`, `MANAGER`, `COMMERCIAL`, `VIEWER`; `active?` boolean. Pelo menos um. `.strict()` | `id`, `userId`, `role`, `active`, `email`, `name`, `commissionSplitBp` | 200, 400, 401, 403, 404, 422 |
| `GET /api/v1/members` | nenhum | `{ items }` com os mesmos campos, do mais novo para o mais antigo, inclusive inativo | 200, 401, 403 |
| `POST /api/v1/members/:id/transfer-portfolio` | `{ toMemberId }` `.strict()` | `{ transferred }` | 200, 400, 401, 403, 404, 422, 500 |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. Trilha persistida | tabela `AuditLog` com `organizationId`, RLS `ENABLE` + `FORCE` e política `tenant_isolation`: `USING` e `WITH CHECK` só `organizationId = app.tenant_id`. Sem predicado de token nem de `userId` | tabela global sem tenant: o ator de outra corretora leria o ato. `AuditLogArchive`: a architecture já descartou |
| 2. `audit.record` | `audit.record(tx, ctx, { action, entityId, changes })`. `changes` é jsonb. Chave `email`, `name`, `phone`, `document`, `documentEncrypted`, `token`, `password`, `ipAddress` ou `userAgent` — em qualquer nível — vira o valor `"[alterado]"`. O resto fica. A linha guarda `actorUserId = ctx.userId`, nunca o e-mail | gravar o body cru: o e-mail do membro entraria na trilha. Omitir a redação e confiar no chamador: o próximo módulo esquece |
| 3. `scopeFor` | `COMMERCIAL` devolve `{ salespersonId: ctx.userId }`; `OWNER`, `ADMIN`, `MANAGER` e `VIEWER` devolvem `{}` | filtrar carteira no RLS: a ADR-004 separa tenant de carteira, e o repository é quem devolve 404 |
| 4. Gancho da carteira | `portfolioMoves` é uma lista de `(tx, fromUserId, toUserId) => Promise<number>`. Nasce vazia. `transferred` é a soma. O `salespersonId` que uma fase futura gravar é o `userId` do membro | criar `Contact` agora: o prompt da fase proíbe a Fase 6. Transferir por `memberId`: a ADR-010 amarra a carteira em `salespersonId = userId` |
| 5. Quem gere membro | `member:update` e `portfolio:transfer` só em `OWNER` e `ADMIN` | os cinco papéis: no legado o `MANAGER` não gere membros, e o convite já fechou essa porta |

- Nada mais neste ciclo é difícil de reverter. O índice `Member_one_owner` já existe. A vaga na reativação lê `Plan.maxUsers` que o `org-core` já gravou (`trial` = 5).

## Criteria

### S1: Papel, desativação e dono (P1)

OWNER ou ADMIN muda o papel, desativa e reativa. O dono não se mexe. Reativar ocupa vaga.

**Acceptance Criteria**

1. WHEN um `OWNER` ou `ADMIN` envia `PATCH /api/v1/members/:id` com `role` `ADMIN`, `MANAGER`, `COMMERCIAL` ou `VIEWER` num membro que não é o dono THEN o sistema SHALL responder `200` com esse `role` e gravar, na mesma transação, um `AuditLog` `action: 'member.update'` cujo `changes.role` é `[papel anterior, papel novo]`.
2. WHEN o `PATCH` traz `active: false` num membro que não é o dono THEN o sistema SHALL responder `200` com `active: false` e gravar `changes.active` igual a `[true, false]`.
3. WHEN o `PATCH` traz `active: true` num membro inativo e os membros ativos são menos que `maxUsers` THEN o sistema SHALL responder `200` com `active: true` e gravar `changes.active` igual a `[false, true]`.
4. IF a reativação faria os ativos passarem de `maxUsers` (5 no plano `trial`) THEN o sistema SHALL responder `422` `{ error: { code: 'USER_QUOTA_REACHED', message: 'O plano não tem vagas para outro usuário.' } }`, o membro continua inativo, o `role` não muda e não nasce `AuditLog`.
5. IF duas reativações disputam a última vaga THEN o sistema SHALL deixar os ativos iguais a `maxUsers`: uma resposta `200` e a outra `422` com `error.code` `USER_QUOTA_REACHED`.
6. IF o membro alvo é o `OWNER` THEN o `PATCH` SHALL responder `422` `{ error: { code: 'OWNER_IMMUTABLE', message: 'O proprietário não pode ser alterado nem desativado.' } }`, com `role` `OWNER` e `active` `true`, sem `AuditLog`.
7. IF o body traz `role: 'OWNER'`, omite `role` e `active`, ou traz campo extra THEN o sistema SHALL responder `400` com `error.code` `VALIDATION_ERROR` e não alterar o membro.
8. IF o papel da sessão é `MANAGER`, `COMMERCIAL` ou `VIEWER` THEN o `PATCH` SHALL responder `403` com `error.code` `FORBIDDEN` e não alterar o membro.
9. IF não há sessão THEN o `PATCH` SHALL responder `401` com `error.code` `UNAUTHENTICATED`.
10. WHILE os termos estão pendentes, WHEN o `PATCH` roda THEN o sistema SHALL responder `403` com `error.code` `TERMS_NOT_ACCEPTED` e não alterar o membro.
11. IF o id não existe nesta organização THEN o sistema SHALL responder `404` `{ error: { code: 'NOT_FOUND', message: 'Membro não encontrado.' } }` e não alterar membro de outro tenant.
12. WHEN o body repete o `role` e o `active` atuais THEN o sistema SHALL responder `200` e não gravar outro `AuditLog`.
13. WHEN um `ADMIN` desativa o próprio membro THEN o `PATCH` SHALL responder `200` e o `GET /api/v1/organization` seguinte dessa sessão SHALL responder `404` com `error.code` `NOT_FOUND`.
14. WHEN `withTwoTenants` faz o `PATCH` com o tenant A no id do tenant B THEN o sistema SHALL responder `404` e o `role` do membro B SHALL permanecer o anterior.

**Independent test:** `PATCH` de papel como OWNER, ler o `AuditLog`, e o `PATCH` no OWNER.

### S2: Lista (P1)

Quem gere membro vê a equipe, inclusive quem foi desativado.

**Acceptance Criteria**

15. WHEN `OWNER` ou `ADMIN` envia `GET /api/v1/members` THEN o sistema SHALL responder `200` com `{ items }` de todos os membros da organização, do mais novo para o mais antigo, cada item com `id`, `userId`, `role`, `active`, `email`, `name` e `commissionSplitBp`, inclusive inativo.
16. IF o papel não tem `member:update` THEN o `GET` SHALL responder `403` com `error.code` `FORBIDDEN`.
17. IF não há sessão THEN o `GET` SHALL responder `401` com `error.code` `UNAUTHENTICATED`.
18. WHILE os termos estão pendentes, WHEN o `GET` roda THEN o sistema SHALL responder `403` com `error.code` `TERMS_NOT_ACCEPTED`.
19. WHEN `withTwoTenants` lista com o tenant A THEN o sistema SHALL não devolver o `id` de membro do tenant B.

**Independent test:** criar dois membros, desativar um, listar.

### S3: Transferência (P1)

OWNER ou ADMIN move a carteira para outro membro ativo. Sem tabelas de carteira, a soma é zero e o gancho fica para a fase que tiver a tabela.

**Acceptance Criteria**

20. WHEN `OWNER` ou `ADMIN` envia `POST /api/v1/members/:id/transfer-portfolio` com `toMemberId` de outro membro ativo e `portfolioMoves` está vazio THEN o sistema SHALL responder `200` com `{ transferred: 0 }` e gravar um `AuditLog` `action: 'portfolio.transfer'` com `fromMemberId`, `toMemberId` e `transferred: 0`.
21. WHEN um move registrado devolve `2` THEN o sistema SHALL responder `200` com `{ transferred: 2 }`, persistir a escrita desse move e gravar `transferred: 2` no mesmo `AuditLog`, na mesma transação.
22. IF um move registrado lança THEN o sistema SHALL responder `500`, reverter a escrita dos moves anteriores dessa tentativa e não deixar `AuditLog` dela.
23. IF `toMemberId` é o próprio id THEN o sistema SHALL responder `422` `{ error: { code: 'SAME_MEMBER', message: 'A carteira não pode ser transferida para o mesmo membro.' } }` e não gravar `AuditLog`.
24. IF o destino está inativo THEN o sistema SHALL responder `422` `{ error: { code: 'TARGET_INACTIVE', message: 'O destino da carteira precisa estar ativo.' } }` e não gravar `AuditLog`.
25. IF a origem ou o destino não existe nesta organização THEN o sistema SHALL responder `404` com `error.code` `NOT_FOUND` e não alterar membro de outro tenant.
26. IF o papel da sessão não tem `portfolio:transfer` THEN o `POST` SHALL responder `403` com `error.code` `FORBIDDEN`.
27. IF não há sessão THEN o `POST` SHALL responder `401` com `error.code` `UNAUTHENTICATED`.
28. WHILE os termos estão pendentes, WHEN o `POST` roda THEN o sistema SHALL responder `403` com `error.code` `TERMS_NOT_ACCEPTED`.
29. IF o body omite `toMemberId` ou traz campo extra THEN o sistema SHALL responder `400` com `error.code` `VALIDATION_ERROR` e não gravar `AuditLog`.
30. WHEN `withTwoTenants` transfere com o tenant A o id do tenant B THEN o sistema SHALL responder `404`.

**Independent test:** transferir com a lista vazia e ler o `AuditLog`; repetir com um move que devolve `2` e com um move que lança.

### S4: Trilha, carteira e isolamento (P1)

A função de trilha redacta PII. O filtro e o helper nascem antes das tabelas que vão usá-los.

**Acceptance Criteria**

31. WHEN `audit.record` recebe `changes` com `email`, `name`, `phone`, `document`, `documentEncrypted`, `token`, `password`, `ipAddress` e `userAgent`, inclusive aninhados, ao lado de `role: ['VIEWER', 'ADMIN']` THEN o sistema SHALL gravar `"[alterado]"` em cada uma dessas chaves e manter `role` igual a `['VIEWER', 'ADMIN']`.
32. The system SHALL gravar `actorUserId` igual ao `userId` do contexto e não gravar o e-mail do ator na linha.
33. WHEN `withTwoTenants` grava a trilha no tenant A THEN o tenant B SHALL não ler essa linha.
34. The system SHALL fazer `scopeFor` devolver `{ salespersonId: ctx.userId }` para `COMMERCIAL` e `{}` para `OWNER`, `ADMIN`, `MANAGER` e `VIEWER`.
35. WHEN `withTwoSalespeople` roda numa organização THEN o sistema SHALL devolver dois `RequestContext` com o mesmo `organizationId`, `userId` distinto, `role: 'COMMERCIAL'` e um `Member` ativo para cada um.
36. The system SHALL proteger `AuditLog` com RLS `ENABLE` + `FORCE` e a política `tenant_isolation`, e o único da tabela SHALL incluir `organizationId`.
37. The system SHALL incluir `member:update` e `portfolio:transfer` só nos arrays de `OWNER` e `ADMIN` no snapshot de `ROLE_PERMISSIONS`.
38. The system SHALL recusar o boot se uma rota `/api/v1` nova de membros não declarar `requirePermission`, e `printRoutes()` SHALL conter `transfer-portfolio`.

**Independent test:** `audit.record` com e-mail no `changes`, `scopeFor` nos cinco papéis, e o teste de schema da política.

## Out of scope

| Excluded | Why |
| --- | --- |
| Tela de membros, onboarding e seletor | feature `org-web` |
| `GET` da trilha e a tela de auditoria | a listagem acompanha a tela; a architecture põe as duas no módulo, o roadmap deixa a tela para depois |
| Auditoria de login | `AuditLog` é tenant-scoped e o login não tem tenant (já registrado no plano do `auth-core`) |
| Expurgo de trilha acima de 5 anos | job da architecture; não bloqueia gravar o ato |
| `Contact`, `Client`, proposta, conversa e o 404 de carteira nessas tabelas | Fase 6+; o gancho é `portfolioMoves` e o filtro é `scopeFor` |
| Alterar `commissionSplitBp` | o campo já existe e volta na resposta; mudar o split não está no roadmap desta fase |
| `assertQuota`, `requireFeature`, bloqueio `402` | Fase 5; a vaga aqui é a contagem de ativos contra `Plan.maxUsers` |
| Passar o OWNER para outra pessoa | o índice `Member_one_owner` continua sendo a única origem do dono |

## Assumptions

Os códigos, as mensagens e o gancho vazio acima já são critério. A revisão do plano, que o processo pedia a uma pessoa, foi feita pelo autor a pedido do usuário neste turno, contra os ADRs 004, 005 e 010, `docs/migration.md` (Auth / Organizations) e o prompt da Fase 4.

**Open questions:** none - all resolved or logged above.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| API `PATCH /api/v1/members/:id` | error shape and codes | AC 4, AC 6, AC 7, AC 8, AC 9, AC 10, AC 11 |
| API `PATCH /api/v1/members/:id` | empty state | n/a - um membro, não uma coleção |
| API `GET /api/v1/members` | empty state | n/a - o onboarding sempre cria o OWNER, e a lista o inclui |
| API `GET /api/v1/members` | ordering | AC 15 |
| API `GET /api/v1/members` | error shape and codes | AC 16, AC 17, AC 18 |
| API `POST /api/v1/members/:id/transfer-portfolio` | error shape and codes | AC 22, AC 23, AC 24, AC 25, AC 26, AC 27, AC 28, AC 29 |
| API `POST /api/v1/members/:id/transfer-portfolio` | destructive action confirms | n/a - sem tela neste ciclo; o POST é a própria ação |
| all new member routes | versioning | n/a - o prefixo `/api/v1` já é o contrato (ADR-007) |
| all new member routes | rate limit | n/a - o limite de escrita da Fase 3 já cobre método mutável |
| screen | empty, loading, error | n/a - sem tela neste ciclo |

## Sources

- `docs/architecture.md` §4 módulo `audit`, §7 carteira e §8 `POST /api/v1/members/:id/transfer-portfolio` — `audit.record` sem PII, `changes` com `"[alterado]"`, transferência ADMIN/OWNER
- `docs/migration.md` "Auth / Organizations" — OWNER único e não removível; mudança de papel auditada; transferência de carteira
- ADR-004, ADR-005 e ADR-010 — RLS sem bypass, permissão nomeada, `scopeFor` e `portfolio:transfer`

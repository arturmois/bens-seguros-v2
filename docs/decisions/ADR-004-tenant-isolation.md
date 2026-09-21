# ADR-004 — Isolamento de tenant na aplicação (sem RLS por ora)

**Status:** aceito · **Data:** 2026-09-21

## Context
O legado aplica RLS (`SET LOCAL app.current_tenant`) em 23 tabelas, mas:
- usa `prismaAdmin` (bypass) em 28 arquivos: worker inteiro, billing, PDFs, aprovação de comissão;
- precisa de uma role `app_user` criada manualmente;
- `db:reset` não reaplica as políticas, o que causa crash loop e login com falha silenciosa;
- tem políticas "permissivas" com escape `IS NULL` para Member, Invitation e WebhookEvent.

A proteção real, portanto, já depende de a aplicação usar o client certo.

## Decision
O isolamento é garantido na aplicação, em camadas:
1. `organizationId` vem **apenas** da sessão validada contra `Member`.
2. Todo repository recebe `ctx` e filtra por `organizationId` (+ `salespersonId` para COMMERCIAL). Registro de outro tenant retorna 404.
3. **Extensão do Prisma** (guard) que lança erro quando uma operação em modelo tenant-scoped não tem `organizationId` no `where`.
4. **FKs compostas** `(id, organizationId)` nas relações críticas, para que o banco rejeite referências cruzadas.
5. Jobs usam um `RequestContext` de sistema com `organizationId` explícito e o mesmo caminho de repository.
6. **Testes cross-tenant obrigatórios** por endpoint (`withTwoTenants()`), rodando no CI.

## Why
**Ameaça mitigada:** vazamento entre tenants por filtro esquecido, IDOR e referência cruzada. As camadas 2–4 cobrem isso com custo baixo, e a 6 prova que funciona. O RLS do legado não protegia contra o principal vetor que resta (o código escolher o client de bypass), e custava operação e confiabilidade.

## Alternatives considered
- **Manter RLS:** defesa real contra SQL injection e bugs de ORM. Mas com Prisma parametrizado o risco de injection é baixo. O custo inclui transação por request, `SET LOCAL`, role separada, políticas a manter a cada migration, bypass para jobs e testes mais lentos.
- **Schema/banco por tenant:** isolamento máximo, mas migrations N vezes. É desproporcional.

## Trade-offs
- Um `$queryRaw` sem filtro escapa do guard. Regra: SQL cru só em repository, sempre com `organizationId` parametrizado, e revisado em PR.
- Não há defesa no nível do banco se a aplicação for comprometida.

## Consequences
- **Gatilho para adotar RLS:** exigência contratual ou regulatória (auditoria/certificação), acesso de terceiros ao banco (BI, réplica de leitura para clientes) ou uso de SQL cru em larga escala. Se adotado, deve vir **sem client de bypass**: jobs definem o tenant como qualquer request. Testes: suíte cross-tenant rodando com a role restrita.

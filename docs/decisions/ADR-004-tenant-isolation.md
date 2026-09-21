# ADR-004 — Isolamento de tenant com RLS no PostgreSQL

**Status:** aceito (revisado) · **Data:** 2026-09-21 · **Revisão:** 2026-09-21 — substitui a decisão original "isolamento na aplicação, sem RLS" (ver *Histórico*)

## Context
O legado aplica RLS (`SET LOCAL app.current_tenant`) em 23 tabelas, mas:
- usa `prismaAdmin` (bypass) em 28 arquivos: worker inteiro, billing, PDFs, aprovação de comissão;
- precisa de uma role `app_user` criada manualmente;
- `db:reset` não reaplica as políticas, o que causa crash loop e login com falha silenciosa;
- tem políticas "permissivas" com escape `IS NULL` para Member, Invitation e WebhookEvent.

A decisão original do v2 foi isolar na aplicação, com um guard do Prisma que recusava queries sem
`organizationId`. Na Fase 2, um verificador independente achou, em 4 rodadas, mais de 25 formas de
query que passavam pelo guard (relação `organization`, `connect`/`set` pela relação pai/filho,
`_count: true`, `upsert` com dois tenants…). O guard é uma lista de formatos proibidos sobre uma API
grande e que muda a cada versão do Prisma; cada correção fechava um formato e a rodada seguinte
achava outro. Além disso, a FK composta compartilha a coluna `organizationId`, então toda escrita
pela relação pode reescrever o tenant de uma linha.

## Decision
O PostgreSQL garante o isolamento, com **RLS forçado em toda tabela tenant-scoped** e **sem client
de bypass**:
1. `organizationId` vem **apenas** da sessão validada contra `Member` (inalterado).
2. **Role da aplicação sem bypass.** Runtime, testes e pg-boss conectam como `bens_app`
   (`NOSUPERUSER NOBYPASSRLS`, não é owner das tabelas). Só o Prisma CLI usa o owner
   (`MIGRATION_DATABASE_URL`). O server recusa subir com role superuser ou `BYPASSRLS`.
3. **Política por tabela**, na migration que cria a tabela:
   `ENABLE` + `FORCE ROW LEVEL SECURITY` e
   `CREATE POLICY tenant_isolation … USING ("organizationId" = current_setting('app.tenant_id')::uuid) WITH CHECK (…)`.
4. **Tenant por transação:** todo acesso a tabela tenant-scoped passa por
   `db.withTenant(ctx, async (tx) => …)`, que faz `set_config('app.tenant_id', …, true)`. Fora dela,
   a query falha (não há tenant na sessão). Jobs e super-admin iteram as orgs e abrem `withTenant`
   por org.
5. **Repositories não filtram nem gravam `organizationId`**: o default da coluna é o tenant da
   transação e o RLS filtra. O filtro de carteira (`scopeFor`, ADR-010) continua no repository.
6. **FKs compostas** `(id, organizationId)` em toda relação entre models tenant-scoped, e **todo
   índice único** de tabela tenant-scoped inclui `organizationId`: checagens de integridade ignoram
   RLS, e uma FK ou um único global revelaria se um valor existe em outro tenant.
7. **Testes:** um teste de schema falha em tabela com `organizationId` sem RLS forçado e política,
   em único sem o tenant e em relação sem FK composta; `withTwoTenants()` por endpoint.

## Why
**Ameaça mitigada:** vazamento entre tenants por filtro esquecido, IDOR, referência cruzada e SQL
cru. O RLS vale para qualquer forma de query — `include`, `_count`, escrita aninhada, SQL cru — sem
que a aplicação precise prever cada uma. Os problemas do legado ficam fechados: não há client de
bypass (item 2), o role de dev e CI vem de um script de init versionado, as políticas estão nas
migrations (o reset as reaplica) e não há escape `IS NULL`.

Spike de 2026-09-21 (Prisma 7.10 + PostgreSQL 18): os ataques das 4 rodadas foram recusados pelo
banco (`42501`, `P2025`, `P2018`, `P2003`) e o `enqueue(tx)` do pg-boss funciona na transação do
tenant. Custo medido: ~1 ms por transação.

## Alternatives considered
- **Guard sintático no Prisma (decisão original):** 4 rodadas de verificação `FAIL`; restringe o produto (sem escrita aninhada, sem leitura via `Organization`) e não cobre SQL cru.
- **Extensão do Prisma que fixa o tenant por query** (`$transaction([set_config, query])`): ignora a transação interativa em curso (doc do Prisma 7, issue #20678) e quebraria o enfileiramento transacional (ADR-006).
- **Conectar como owner e `SET LOCAL ROLE` por transação:** uma query fora de `withTenant` rodaria como owner e veria tudo.
- **Schema/banco por tenant:** isolamento máximo, mas migrations N vezes. Desproporcional.

## Trade-offs
- Dois roles e duas URLs de banco; o role de produção é provisionado na Fase 13.
- Cada tabela tenant-scoped pede ~4 linhas de SQL na sua migration (o Prisma não modela RLS); o teste de schema pega o esquecimento.
- Tenant errado vira lista vazia ou "não encontrado", não um erro que aponta a query; os testes `withTwoTenants` compensam.
- Toda leitura de tabela tenant-scoped abre uma transação.

## Consequences
- `Organization` fica sem RLS até a Fase 4, que decide sua política junto com `Member`/`Invitation` (`app.user_id`).
- O guard sintático e suas restrições saem do código.

## Histórico
- 2026-09-21 (original): isolamento na aplicação em camadas (filtro em todo repository, guard do Prisma, FKs compostas nas relações críticas, testes cross-tenant); RLS rejeitado pelo custo operacional do legado.
- 2026-09-21: FK composta passa a valer para toda relação entre models tenant-scoped.
- 2026-09-21 (esta revisão): RLS adotado; guard removido. Evidência: `.specs/features/tenant-guard/verification.md` e o spike.

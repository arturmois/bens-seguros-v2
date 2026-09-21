# Tenant RLS - checks

Profile: standard
Plan: `.specs/features/tenant-rls/plan.md`

16 checks in 3 slices · 6 one-way doors · 0 open

Todas as provas rodam em `apps/server` com o Postgres do docker compose no ar (roles do script
`docker/postgres/init/01-app-role.sql` aplicados). Abreviação: `VT <arquivo> -t "<nome>"` =
`pnpm --filter @bens/server exec vitest run <arquivo> -t "<nome>"`.

## Checks

### S1 - O banco isola os tenants · 4 files · 30 KB · ~8k

**C1** - Dentro de `withTenant(A)`, cada uma das 8 formas de leitura (`findMany` sem `where`, `findUnique` pelo id de uma linha de B, `count`, `aggregate`, `groupBy`, `organization.findMany` com `include: { examples: true }`, `organization.findMany` com `include: { _count: true }`, SQL cru `SELECT … FROM "Example"`) retorna só linhas de A: nenhum id de B aparece, a contagem de B vem `0` e o `findUnique` de B vem `null` (AC 1)
Proof: `VT src/infrastructure/database.spec.ts -t "reads only the tenant rows in every read shape"`

**C2** - Dentro de `withTenant(A)`, cada uma das 5 escritas em B (`create` com `organizationId` B, `updateMany` do escalar para B, `update` com `organization.connect` B, `upsert` com `create` em B, `children.create` com `organizationId` B) falha com Prisma `P2039`, e depois as linhas de A e de B têm os mesmos ids e `organizationId` (AC 2)
Proof: `VT src/infrastructure/database.spec.ts -t "rejects every write into another tenant"`

**C3** - Dentro de `withTenant(A)`, cada uma das 5 referências a uma linha de B (`parent.connect`, `children.connect`, `children.set`, `children.connectOrCreate` com `where` de B, `organization.update` com `examples.connect` de B) falha com um de `P2025`, `P2018`, `P2003` ou `P2039`, e nenhuma linha de A ou B muda de `organizationId` ou `parentId` (AC 3)
Proof: `VT src/infrastructure/database.spec.ts -t "cannot link or move another tenant's row"`

**C4** - Fora de `withTenant`, `db.example.findMany()`, `db.example.count()` e `db.example.create` falham com erro do banco, e a contagem de linhas (medida depois, dentro de `withTenant`) não muda (AC 4)
Proof: `VT src/infrastructure/database.spec.ts -t "fails outside withTenant"`

**C5** - `create` dentro de `withTenant(A)` sem `organizationId` grava a linha com `organizationId` = A (AC 5)
Proof: `VT src/infrastructure/database.spec.ts -t "fills organizationId from the tenant"`

**C6** - Dentro de `withTenant(A)`, `update` com `parentId` de outra linha de A grava o vínculo; com `parentId` de uma linha de B falha com `P2003` e o `parentId` continua o anterior (AC 6)
Proof: `VT src/infrastructure/database.spec.ts -t "links rows only within the tenant"`

### S2 - Nada roda com bypass · 7 files · 25 KB · ~7k

**C7** - O server sai com código 1 e escreve o nome do role no stderr quando `DATABASE_URL` conecta como superuser (`bens`) (AC 7)
Proof: `VT test/boot.spec.ts -t "refuses to boot with a role that bypasses row security"`

**C8** - O client de `createDependencies` conecta como `bens_app`, que não é superuser nem `BYPASSRLS`; o schema do pg-boss do worker pertence a `bens_app`; o `prisma.config.ts` lê `MIGRATION_DATABASE_URL` (AC 8)
Proof: `VT src/infrastructure/database.spec.ts -t "connects as the application role"`

**C9** - `queue.enqueue(tx, …)` dentro de `withTenant(A)`: com commit o job é processado; com rollback nenhum job existe (AC 9)
Proof: `VT src/infrastructure/queue.spec.ts -t "enqueues inside a tenant transaction"`

**C10** - Depois de 10 transações `withTenant(A)` (5 com commit, 5 com rollback), 10 queries fora de `withTenant` falham todas, e uma transação `withTenant(B)` seguinte vê só linhas de B (AC 10)
Proof: `VT src/infrastructure/database.spec.ts -t "does not leak the tenant to the next transaction"`

### S3 - O schema não abre brecha · 3 files · 12 KB · ~3k

**C11** - No schema do worker, toda tabela com a coluna `organizationId` tem `relrowsecurity` e `relforcerowsecurity` verdadeiros e a política `tenant_isolation` (AC 11)
Proof: `VT test/schema.spec.ts -t "every tenant table is protected by row security"`

**C12** - O checker de C11 aponta uma tabela sintética com `organizationId` criada sem RLS num schema descartável (AC 11)
Proof: `VT test/schema.spec.ts -t "flags a tenant table without row security"`

**C13** - No schema do worker, todo índice único de tabela tenant-scoped inclui `organizationId`, e o checker aponta um índice único sintético sem ela (AC 12)
Proof: `VT test/schema.spec.ts -t "every unique index of a tenant table includes organizationId"`

**C14** - O teste de FK composta continua: passa no `schema.prisma` real e aponta `Item.product` num schema sintético (AC 13)
Proof: `VT test/schema.spec.ts -t "every relation between tenant-scoped models uses a composite foreign key"`
Proof: `VT test/schema.spec.ts -t "flags a relation between tenant-scoped models without organizationId"`

**C15** - Nenhum arquivo de `apps/server/src` contém `createTenantGuard`, `TenantGuardError` ou `readModels` (AC 14)
Proof: `VT test/architecture.spec.ts -t "has no syntactic tenant guard"`

**C16** - Uma rota que viola o isolamento (`create` com `organizationId` de outro tenant dentro de `withTenant`) responde `500 INTERNAL_ERROR` com `requestId` igual ao `x-request-id` (Flow hop 5)
Proof: `VT src/app.spec.ts -t "surfaces a row security violation as a generic 500"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| formas de leitura (8) | C1, table-driven sobre as 8 | - |
| formas de escrita em outro tenant (5) | C2, table-driven sobre as 5 | - |
| referências a linha de outro tenant (5) | C3, table-driven sobre as 5 | - |
| operações fora de `withTenant` (3) | `findMany` C4 · `count` C4 · `create` C4 | - |
| vínculo por FK escalar (2) | mesmo tenant C6 · outro tenant `P2003` C6 | - |
| startup config: role da conexão (4) | server (boot) C7 · test harness C8 · pg-boss C8 · Prisma CLI (`MIGRATION_DATABASE_URL`) C8 | - |
| transação e pool (2) | commit C10 · rollback C10 | - |
| `enqueue` na transação de tenant (2) | commit C9 · rollback C9 | - |
| proteção de tabela tenant-scoped (3) | `ENABLE` C11, C12 · `FORCE` C11, C12 · política `tenant_isolation` C11, C12 | - |
| invariantes de schema (3) | RLS C11 · unicidade com tenant C13 · FK composta C14 | - |
| doors do plano (6) | role sem bypass C7, C8 · política por tabela C11 · tenant por transação C10 · default do tenant C5 · unicidade C13 · pg-boss no role da aplicação C8, C9 | - |

- Claims que citam código de erro do Prisma: C2 (`P2039`), C3, C6 (`P2003`) - todos atravessam o banco real
- Claim que cita status HTTP: C16 (`500`) - atravessa o Fastify por `app.inject`

## Test policy

O `CLAUDE.md` responde o nível para regra pura e endpoint; esta feature é infraestrutura cuja
decisão mora no banco (políticas) e cuja entrada é uma função de transação.

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decides, reached across a boundary | one at the boundary **and** one at its own layer | the contract at the boundary; one asserted case per row of the decision table at its own layer |
| Instrumentation, pass-throughs | none of its own | covered by its consumer's proof |

Evidence:

- políticas `tenant_isolation` (SQL nas migrations): decidem leitura (`USING`) e escrita (`WITH CHECK`) -> decides; a própria camada é o banco, provada por C1–C6 contra o PostgreSQL real, e a presença em cada tabela por C11
- checagem de role no boot (`server.ts`): decide sair ou subir -> decides; provada no boundary do processo por C7
- `withTenant` (`database.ts`): abre a transação e fixa o tenant, sem ramificação -> instrumentation, coberta por C1–C6, C9, C10
- análogo no repo: `test/architecture.spec.ts` e o teste de FK composta - checker testado contra o real e contra um caso sintético

Cost: 6 provas de comportamento no banco, 1 no boot, 3 de schema, 1 de arquitetura, 1 HTTP.

## Swept

- validation: n/a - a feature não recebe input de usuário; o tenant vem do `ctx`
- failure modes: C2, C3, C4, C9
- idempotency: n/a - nenhuma operação nova que possa ser repetida; `set_config` é por transação
- authorization: C1, C2, C3 - o tenant é a fronteira de autorização; RBAC é da Fase 4
- concurrency: C10 - transações concorrentes no pool não herdam o tenant uma da outra (`set_config` local)
- data lifecycle: C2 - uma linha nunca muda de tenant
- dependency failure: C7 - role errado no ambiente impede o boot
- state transitions: n/a - não há máquina de estados
- observability: C7 (o boot imprime o role) e existing - `shared/errors.ts` loga `unhandled error` com `requestId`

## Handoff

- S1 + S2 + S3 ≈ 20 arquivos (database, specs, config, server, dependencies, harness, prisma config/schema/migration, compose, init script, CI, docs) ≈ 95 KB ≈ 24k tokens; abaixo do budget de 150k - one builder

# Tenant RLS - checks

Profile: standard
Plan: `.specs/features/tenant-rls/plan.md`

21 checks in 4 slices (C17-C21 na rodada 2) · 7 one-way doors · 0 open

Todas as provas rodam em `apps/server` com o Postgres do docker compose no ar (roles do script
`docker/postgres/init/01-app-role.sql` aplicados). Abreviação: `VT <arquivo> -t "<nome>"` =
`pnpm --filter @bens/server exec vitest run <arquivo> -t "<nome>"`.

## Checks

### S1 - O banco isola os tenants · 4 files · 30 KB · ~8k

**C1** - Dentro de `withTenant(A)`, cada uma das 8 formas de leitura (`findMany` sem `where`, `findUnique` pelo id de uma linha de B, `count`, `aggregate`, `groupBy`, `organization.findMany` com `include: { examples: true }`, `organization.findMany` com `include: { _count: true }`, SQL cru `SELECT … FROM "Example"`) retorna só linhas de A: nenhum id de B aparece, a contagem de B vem `0` e o `findUnique` de B vem `null` (AC 1)
Proof: `VT src/infrastructure/database.spec.ts -t "reads only the tenant rows in every read shape"`

**C2** - Dentro de `withTenant(A)`, das 5 escritas em B, `create` com `organizationId` B, `updateMany` do escalar para B, `update` com `organization.connect` B e `upsert` com `create` em B falham com Prisma `P2039`; `children.create` com `organization.connect` B conclui gravando o filho em A (herda o tenant do pai pela FK composta). Depois, as linhas de B são idênticas às de antes e toda linha de A tem `organizationId` A (AC 2) — **corrigido no build: a versão anterior esperava `P2039` também do `children.create`**
Proof: `VT src/infrastructure/database.spec.ts -t "rejects every write into another tenant"`

**C3** - Dentro de `withTenant(A)`, das 5 referências a uma linha de B, `parent.connect`, `children.connect` e `examples.connect` a partir de `Organization` falham com um de `P2025`, `P2018`, `P2003` ou `P2039`; `children.set` e `children.connectOrCreate` concluem sem erro porque a linha de B é invisível (o `set` fica sem filhos, o `connectOrCreate` cria um filho novo em A). Depois, as linhas de B são idênticas, as linhas de A que já existiam mantêm `organizationId` e `parentId`, e toda linha de A tem `organizationId` A (AC 3) — **corrigido no build: a versão anterior esperava erro também do `set` e do `connectOrCreate`**
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

**C13** - No schema do worker, todo índice único de tabela tenant-scoped inclui `organizationId` (a chave primária fica de fora: ids são UUID v7 gerados no server, nunca vêm do input), e o checker aponta um índice único sintético sem ela (AC 12)
Proof: `VT test/schema.spec.ts -t "every unique index of a tenant table includes organizationId"`

**C14** - O teste de FK composta continua: passa no `schema.prisma` real e aponta `Item.product` num schema sintético (AC 13)
Proof: `VT test/schema.spec.ts -t "every relation between tenant-scoped models uses a composite foreign key"`
Proof: `VT test/schema.spec.ts -t "flags a relation between tenant-scoped models without organizationId"`

**C15** - Nenhum arquivo de `apps/server/src` contém `createTenantGuard`, `TenantGuardError` ou `readModels` (AC 14)
Proof: `VT test/architecture.spec.ts -t "has no syntactic tenant guard"`

**C16** - Uma rota que viola o isolamento (`create` com `organizationId` de outro tenant dentro de `withTenant`) responde `500 INTERNAL_ERROR` com `requestId` igual ao `x-request-id` (Flow hop 5)
Proof: `VT src/app.spec.ts -t "surfaces a row security violation as a generic 500"`

### S4 - Rodada 2 · 6 files · 40 KB · ~10k

**C17** - Dentro de `withTenant(A)` e fora de `withTenant`, `organization.delete({ where: { id: B } })` e `organization.update({ where: { id: B }, data: { id: <novo> } })` falham com Prisma `P2003`, e as linhas de B continuam idênticas (AC 15)
Proof: `VT src/infrastructure/database.spec.ts -t "does not reach tenant rows through Organization"`

**C18** - No schema do worker, nenhuma FK de tabela tenant-scoped para tabela sem `organizationId` usa `CASCADE`, `SET NULL` ou `SET DEFAULT`; o checker aponta uma FK sintética `ON DELETE CASCADE` e outra `ON UPDATE CASCADE` (AC 16)
Proof: `VT test/schema.spec.ts -t "foreign keys to unguarded tables never cascade"`

**C19** - Nenhum arquivo de `apps/server/src` fora de `infrastructure/database.ts` cita `app.tenant_id`, e o checker aponta um arquivo sintético que cita (AC 17)
Proof: `VT test/architecture.spec.ts -t "only the database module sets the tenant"`

**C20** - Nenhum schema exportado de `modules/**/*.schema.ts` com nome terminado em `Input` aceita `id`, e o checker aponta um `ZodObject` sintético com `id` (AC 18)
Proof: `VT test/architecture.spec.ts -t "input schemas never accept an id"`

**C21** - `assertRowSecurityApplies` lança `RowSecurityBypassError` para um role `BYPASSRLS` não superuser e para o superuser `bens`, e não lança para `bens_app` (AC 7, AC 19)
Proof: `VT src/infrastructure/database.spec.ts -t "refuses every role that bypasses row security"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| formas de leitura (8) | C1, table-driven sobre as 8 | - |
| formas de escrita em outro tenant (6) | C2, table-driven sobre as 6 (`update` do escalar incluído na rodada 2) | - |
| escritas que alcançam tenant por `Organization` (2) | `delete` C17 · troca de `id` C17 | - |
| referências a linha de outro tenant (7) | C3, table-driven sobre as 7 (`examples.set` e `examples.connectOrCreate` a partir de `Organization` incluídos na rodada 2) | - |
| operações fora de `withTenant` (3) | `findMany` C4 · `count` C4 · `create` C4 | - |
| vínculo por FK escalar (2) | mesmo tenant C6 · outro tenant `P2003` C6 | - |
| startup config: role da conexão (4) | server (boot) C7 · test harness C8 · pg-boss C8 · Prisma CLI (`MIGRATION_DATABASE_URL`) C8 | - |
| transação e pool (2) | commit C10 · rollback C10 | - |
| `enqueue` na transação de tenant (2) | commit C9 · rollback C9 | - |
| proteção de tabela tenant-scoped (3) | `ENABLE` C11, C12 · `FORCE` C11, C12 · política `tenant_isolation` C11, C12 (C12 com um caso sintético por cláusula na rodada 2) | - |
| ações de FK para tabela sem RLS (2) | `ON DELETE` C18 · `ON UPDATE` C18 | - |
| roles no boot (3) | superuser C7, C21 · `BYPASSRLS` C21 · `bens_app` C21 | - |
| invariantes de schema e código (6) | RLS C11 · unicidade com tenant C13 · FK composta C14 · FK sem cascade C18 · tenant só em `database.ts` C19 · sem `id` no input C20 | - |
| doors do plano (7) | FK para tabela sem RLS C17, C18 · role sem bypass C7, C8 · política por tabela C11 · tenant por transação C10 · default do tenant C5 · unicidade C13 · pg-boss no role da aplicação C8, C9 | - |

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

- **Boundary:** C1-C16 closed at the commit `feat(server): isolate tenants with row level security` (gate green, 74 passed; `pnpm dev` boots as `bens_app`)
- **Settled mid-build:** C2 and C3 corrected (Prisma absorbs `children.create` via the parent's tenant, and `set`/`connectOrCreate` against an invisible row finish without error; B is untouched in every case — asserted as an invariant); C13 excludes primary keys (server-generated UUID v7); Landing door 1 literal corrected (grants go straight to `bens_app`, no `app_rw` group role); Prisma 7 `migrate dev` does not run `generate`
- **Abandoned:** none
- **Boundary:** C17-C21 closed at the commit `fix(server): stop cascades from Organization reaching tenant rows` (round 2; gate green, 79 passed). C2 and C3 gained the plan-named members the round 1 report found untested; C12 has one synthetic case per protection clause
- **Settled mid-build:** round 1 edits to plan AC 2, AC 3 and door 5 are the C2/C3/C13 corrections listed above; `organization examples.set` fails with `P2014` (required relation), added to the accepted codes
- **Abandoned:** none

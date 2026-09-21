# Tenant guard - checks

Profile: standard
Plan: `.specs/features/tenant-guard/plan.md`

27 checks in 4 slices (C20-C27 adicionados na rodada 2) · 4 one-way doors · 0 open

Todas as provas rodam em `apps/server` com o Postgres do docker compose no ar. Abreviação usada
abaixo: `VT <arquivo> -t "<nome>"` = `pnpm --filter @bens/server exec vitest run <arquivo> -t "<nome>"`.

## Checks

### S1 - Operações de topo carregam o tenant · 2 files · 16 KB · ~4k

**C1** - Cada uma das 13 operações com `where` (`findUnique`, `findUniqueOrThrow`, `findFirst`, `findFirstOrThrow`, `findMany`, `update`, `updateMany`, `updateManyAndReturn`, `delete`, `deleteMany`, `count`, `aggregate`, `groupBy`) sem `organizationId` lança `TenantGuardError` no guard (AC 1)
Proof: `VT src/infrastructure/database.spec.ts -t "rejects every where-operation without organizationId"`

**C2** - As mesmas 13 operações pelo client `db` lançam `TenantGuardError`, e depois delas as linhas do tenant continuam com o mesmo `count` e o mesmo `name` (nenhum SQL de escrita rodou) (AC 1)
Proof: `VT src/infrastructure/database.spec.ts -t "rejects every where-operation on the client and changes no rows"`

**C3** - Com `where.organizationId` (direto ou em `id_organizationId`) a query roda e retorna só linhas do tenant: `findFirst` do tenant B pelo id de uma linha de A retorna `null`, e `findUnique` por `id_organizationId` de A retorna a linha (AC 2)
Proof: `VT src/infrastructure/database.spec.ts -t "returns only the tenant rows when organizationId is present"`

**C4** - Os 6 formatos não literais do filtro lançam `TenantGuardError`: `{ equals }`, `{ in }`, `undefined`, só dentro de `AND`, só dentro de `OR`, só dentro de `NOT`; os 2 formatos aceitos (string direta, chave composta `id_organizationId`) não lançam (AC 3)
Proof: `VT src/infrastructure/database.spec.ts -t "accepts only a literal organizationId filter"`

**C5** - Cada uma das 3 operações de criação (`create`, `createMany`, `createManyAndReturn`) lança `TenantGuardError` quando alguma linha de `data` não tem `organizationId` string, inclusive uma única linha ruim entre linhas válidas (AC 4)
Proof: `VT src/infrastructure/database.spec.ts -t "rejects every create operation with a row missing organizationId"`

**C6** - `upsert` lança `TenantGuardError` sem tenant no `where` e sem `create.organizationId` (AC 5)
Proof: `VT src/infrastructure/database.spec.ts -t "requires the tenant on both sides of an upsert"`

**C7** - Uma operação fora das 17 conhecidas (`findRaw`, `aggregateRaw`, um nome inventado) lança `TenantGuardError` citando `is not supported` (AC 6)
Proof: `VT src/infrastructure/database.spec.ts -t "fails closed on an unknown operation"`

**C8** - Cada um dos 4 caminhos de update (`update`, `updateMany`, `updateManyAndReturn`, `upsert.update`) que define `organizationId` em `data` lança `TenantGuardError` (AC 7)
Proof: `VT src/infrastructure/database.spec.ts -t "never moves a row to another tenant"`

**C9** - Pelo client `db`, um `updateMany` do tenant A que tenta gravar `organizationId` de B lança `TenantGuardError` e as linhas continuam em A (AC 7)
Proof: `VT src/infrastructure/database.spec.ts -t "rejects moving rows between tenants on the client"`

**C10** - Operações em `Organization` (sem `organizationId`) passam sem validação: `findMany({ take: 1 })` resolve um array (AC 8)
Proof: `VT src/infrastructure/database.spec.ts -t "leaves models without organizationId alone"`

### S2 - Referências aninhadas não cruzam tenants · 3 files · 17 KB · ~5k

**C11** - `connect` e `set` sem `organizationId` para model tenant-scoped lançam `TenantGuardError` em cada uma das 6 posições aninhadas (`create`, `createMany.data`, `update`, `upsert.create`, `upsert.update`, `connectOrCreate.create`), e com `organizationId` não lançam (AC 9)
Proof: `VT src/infrastructure/database.spec.ts -t "checks connect and set at every nested position"`

**C12** - `connectOrCreate` para model tenant-scoped sem `organizationId` no `where` lança `TenantGuardError` citando `connectOrCreate on` (AC 10)
Proof: `VT src/infrastructure/database.spec.ts -t "checks connects inside nested creates, connectOrCreate and set"`

**C13** - Pelo client `db`, `connect` sem tenant a uma linha de outro tenant lança `TenantGuardError` citando `data.parent.connect on Example without organizationId` (AC 9)
Proof: `VT src/infrastructure/database.spec.ts -t "rejects a nested connect to a tenant-scoped row without organizationId"`

**C14** - Um `connect` com o filtro de A apontando para uma linha de B falha com Prisma `P2025`, e o `parentId` da linha de A continua `null` (AC 11)
Proof: `VT src/infrastructure/database.spec.ts -t "does not find a foreign row through a tenant-filtered connect"`

**C15** - Criar em A uma linha com `parentId` de uma linha de B falha com Prisma `P2003`, e nenhuma linha com aquele `name` existe em A (AC 12)
Proof: `VT src/infrastructure/database.spec.ts -t "lets the composite foreign key reject a parent id from another tenant"`

**C16** - `findFirst` com filtro de A e `include: { children: true, organization: true }` retorna exatamente os filhos de A (`['child-1']`), todos com `organizationId` de A, e a organização de A; sem o filtro, lança `TenantGuardError` (AC 13)
Proof: `VT src/infrastructure/database.spec.ts -t "allows include of relations under a tenant filter and still guards the root"`

### S3 - Todo client guardado, falha fechada · 3 files · 12 KB · ~3k

**C17** - Dentro de `db.$transaction`, `tx.example.findMany` sem tenant lança `TenantGuardError`, e com tenant retorna linhas (AC 14)
Proof: `VT src/infrastructure/database.spec.ts -t "guards the transaction client too"`

**C18** - `readModels` lança quando o client não tem `_runtimeDataModel` ou quando ele tem formato inesperado; no client real classifica `Example` como tenant-scoped e `Organization` como não, e mapeia a relação `parent` para `Example` (AC 15, AC 16)
Proof: `VT src/infrastructure/database.spec.ts -t "reads the model classification from the Prisma runtime and fails closed"`

**C19** - O teste de schema falha para cada relação entre models tenant-scoped cujos `fields` não incluem `organizationId`: passa no `schema.prisma` real e aponta `Item.product` num schema sintético com FK simples (AC 17)
Proof: `VT test/schema.spec.ts -t "every relation between tenant-scoped models uses a composite foreign key"`
Proof: `VT test/schema.spec.ts -t "flags a relation between tenant-scoped models without organizationId"`

### S4 - Rodada 2: fechar os caminhos que o Verifier abriu · 3 files · 20 KB · ~5k

**C20** - No guard, escrever a relação `organization` de um model tenant-scoped lança `TenantGuardError` em cada um dos 4 caminhos de update (`update`, `updateMany`, `updateManyAndReturn`, `upsert.update`) e dentro de um `update` aninhado de filho, para cada uma das 6 operações (`connect`, `connectOrCreate`, `create`, `update`, `upsert`, `disconnect`) (AC 18)
Proof: `VT src/infrastructure/database.spec.ts -t "never writes the tenant relation"`

**C21** - Pelo client `db`, `example.update` e `example.upsert` com `data`/`update` `{ organization: { connect: { id: B } } }` lançam `TenantGuardError`, e a linha continua com `organizationId` de A (AC 7, AC 18)
Proof: `VT src/infrastructure/database.spec.ts -t "rejects moving a row through the organization relation"`

**C22** - No guard, um model sem `organizationId` cujo `data` escreve numa relação tenant-scoped lança `TenantGuardError` para cada uma das 11 operações aninhadas (`connect`, `connectOrCreate`, `create`, `createMany`, `set`, `update`, `updateMany`, `upsert`, `delete`, `deleteMany`, `disconnect`), em `create`, `update` e `upsert`; um `update` só com escalares não lança (AC 8, AC 19)
Proof: `VT src/infrastructure/database.spec.ts -t "rejects nested writes into tenant-scoped relations from unguarded models"`

**C23** - Pelo client `db`, `organization.update({ where: { id: A }, data: { examples: { connect: { id: <linha de B> } } } })` lança `TenantGuardError` e a linha continua em B (AC 19)
Proof: `VT src/infrastructure/database.spec.ts -t "rejects moving rows into an organization through its relation"`

**C24** - Um client criado por `createDatabase` com uma `DATABASE_URL` inalcançável rejeita as 13 operações sem tenant com `TenantGuardError`, nunca com erro de conexão — o guard lança antes de qualquer SQL ser enviado (AC 1)
Proof: `VT src/infrastructure/database.spec.ts -t "rejects before sending any SQL"`

**C25** - `connectOrCreate` sem `organizationId` no `where` lança `TenantGuardError` em cada uma das 6 posições aninhadas de C11, e com `organizationId` não lança (AC 10)
Proof: `VT src/infrastructure/database.spec.ts -t "checks connectOrCreate at every nested position"`

**C26** - `findFirst` com filtro de A e `select: { children: { select: { name: true, organizationId: true } } }` retorna exatamente `[{ name: 'child-s', organizationId: A }]`; sem o filtro, lança `TenantGuardError` (AC 13)
Proof: `VT src/infrastructure/database.spec.ts -t "allows select of relations under a tenant filter"`

**C27** - Uma rota que dispara o guard responde `500` com `{ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.', details: { requestId } } }`, `requestId` igual ao header `x-request-id`, e o corpo não contém `organizationId` (Flow hop 4)
Proof: `VT src/app.spec.ts -t "surfaces a tenant guard violation as a generic 500"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| operações com `where` (13) | guard: C1, table-driven sobre as 13 · client: C2, table-driven sobre as 13 | - |
| operações de criação (3) | `create` C5 · `createMany` C5 · `createManyAndReturn` C5 | - |
| `upsert` (2 lados) | `where` C6 · `create` C6 | - |
| formatos de filtro rejeitados (6) | `{ equals }` C4 · `{ in }` C4 · `undefined` C4 · `AND` C4 · `OR` C4 · `NOT` C4 | - |
| formatos de filtro aceitos (2) | string direta C3, C4 · `id_organizationId` C3, C4 | - |
| operações desconhecidas (3) | `findRaw` C7 · `aggregateRaw` C7 · nome inventado C7 | - |
| updates que mudam o tenant (4) | `update` C8 · `updateMany` C8, C9 · `updateManyAndReturn` C8 · `upsert.update` C8 | - |
| posições aninhadas (6) | `create` C11 · `createMany.data` C11 · `update` C11 · `upsert.create` C11 · `upsert.update` C11 · `connectOrCreate.create` C11 | - |
| operações de referência aninhada (3) | `connect` C11, C13 · `set` C11 · `connectOrCreate.where` C12 | - |
| erros do banco em referência cruzada (2) | `P2025` C14 · `P2003` C15 | - |
| clients da aplicação (2) | `db` C2 · `tx` C17 | - |
| classificação de models (2) | tenant-scoped (`Example`) C18 · não tenant-scoped (`Organization`) C10, C18 | - |
| portas de falha fechada do metadado (2) | ausente C18 · formato inesperado C18 | - |
| startup config: instalação do guard (3) | `server.ts` C2 via `createDependencies` compartilhado · `test/app.ts` C2 · `scripts/export-openapi.ts` C2 via `createDependencies` compartilhado | - |
| updates que mudam o tenant pela relação (5) | `update` C20, C21 · `updateMany` C20 · `updateManyAndReturn` C20 · `upsert.update` C20, C21 · `update` aninhado C20 | - |
| operações na relação `organization` (6) | `connect` C20 · `connectOrCreate` C20 · `create` C20 · `update` C20 · `upsert` C20 · `disconnect` C20 | - |
| escritas aninhadas a partir de model sem tenant (11) | `connect` C22, C23 · `connectOrCreate` C22 · `create` C22 · `createMany` C22 · `set` C22 · `update` C22 · `updateMany` C22 · `upsert` C22 · `delete` C22 · `deleteMany` C22 · `disconnect` C22 | - |
| `connectOrCreate` por posição aninhada (6) | `create` C25 · `createMany.data` C25 · `update` C25 · `upsert.create` C25 · `upsert.update` C25 · `connectOrCreate.create` C25 | - |
| leitura de relações sob filtro (2) | `include` C16 · `select` C26 | - |
| "nenhum SQL" do AC 1 (13) | C24, table-driven sobre as 13 | - |
| superfície do erro (Flow hop 4) (1) | `500 INTERNAL_ERROR` + `requestId` C27 | - |
| doors do plano (4) | extensão única C2, C17 · datamodel interno C18 · create só pelo escalar C5 · FK composta C15, C19 | - |

- Os três assemblies usam o mesmo `createDependencies` → `createDatabase`; C2 prova o do harness e o
  Verifier lê as linhas de `server.ts` e do script
- Claims que citam código de erro do Prisma: C14 (`P2025`), C15 (`P2003`) - ambos atravessam o banco real
- Nenhum outro check afirma mais do que o caso que sua prova exercita

## Test policy

O `CLAUDE.md` responde o nível só para "regra pura" e "endpoint"; o guard é um terceiro caso:
uma tabela de decisão pura (`createTenantGuard`) alcançada através de um boundary (o client Prisma
estendido).

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decides, reached across a boundary | one at the boundary **and** one at its own layer | the contract at the boundary; one asserted case per row of the decision table at its own layer |
| Instrumentation, pass-throughs | none of its own | covered by its consumer's proof |

Evidence:

- `apps/server/src/infrastructure/database.ts` `createTenantGuard`: despacha sobre 3 grupos de operação (criação, `where`, desconhecida), 2 formatos aceitos de filtro, 6 posições aninhadas × 3 operações de referência, `upsert` com 2 lados -> decides
- `apps/server/src/infrastructure/database.ts` `readModels`: valida o metadado e deriva a classificação por campo -> decides
- `apps/server/src/infrastructure/database.ts` `createDatabase`/extensão: repassa `model`, `operation`, `args` ao guard e chama `query(args)` -> instrumentation
- análogo no repo: `test/architecture.spec.ts` - checker puro testado por tabela (`describe('checker')`) mais uma asserção sobre a árvore real

Cost: 6 provas novas na camada própria (C1, C4, C5, C7, C8, C11), 3 no boundary (C2, C9, C18) e 2 do teste de schema (C19).

## Swept

- validation: C4, C5, C6
- failure modes: C2, C9, C14, C15
- idempotency: n/a - o guard é uma checagem sem estado por chamada; nada é gravado por ele
- authorization: C1, C2, C3, C11, C13 - o tenant é a fronteira de autorização aqui; RBAC é da Fase 4
- concurrency: n/a - o guard é síncrono e sem estado; o mapa de models é montado uma vez na construção e nunca muda
- data lifecycle: C8, C9 - uma linha nunca muda de tenant
- dependency failure: C18 - metadado do Prisma ausente ou alterado por upgrade
- state transitions: C8 - `organizationId` de uma linha é imutável
- observability: existing - `shared/errors.ts` registra o erro não mapeado como `unhandled error` com `requestId` e responde `500`

## Handoff

- S1 + S2 + S3 = `database.ts` 7.9 KB + `database.spec.ts` 7.9 KB + `schema.prisma` 1.4 KB + `test/schema.spec.ts` novo ~3 KB ≈ 20 KB ≈ 5k tokens; bem abaixo do budget de 150k - one builder

- **Boundary:** C1-C19 closed at the commit `fix(server): keep rows in their tenant and prove the tenant guard` (proofs green; `pnpm lint && pnpm typecheck && pnpm test && pnpm build` - 79 passed)
- **Settled mid-build:** none
- **Abandoned:** none
- **Boundary:** C20-C27 closed at the commit `fix(server): close tenant moves through relations in the tenant guard` (round 2; `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green)
- **Settled mid-build:** AC 8 amended and AC 19 added (user, round 2); AC 1 kept and proven by C24 (user, round 2)
- **Abandoned:** none

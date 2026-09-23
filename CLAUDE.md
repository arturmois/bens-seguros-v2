# Bens Seguros v2

ERP SaaS multi-tenant para corretoras de seguros. Modular monolith: `apps/server` (Fastify) + `apps/web` (Vite + React + TanStack Router).

**Leia antes de mudar código:** `docs/architecture.md` (arquitetura), `docs/decisions/` (ADRs), `docs/migration.md` (regras de negócio e checklist de paridade), `docs/roadmap.md` (fase atual).

Legado (somente referência de regras, não de arquitetura): `github.com/arturmois/bens-seguros`.

## Regras

- **Complexity must be earned.** Nada de camada, package, pattern ou abstração sem um problema concreto de hoje.
- **Módulos:** `apps/server/src/modules/<x>/`. Um módulo importa outro só via `modules/<y>/index.ts` e escreve apenas nas próprias tabelas. Use case = função `(deps, ctx, input)`. Sem classes, sem DI container, sem decorators.
- **Tenant:**
  - o PostgreSQL isola por RLS (ADR-004): todo acesso a tabela com `organizationId` passa por `db.withTenant(ctx, tx => …)`; a query recebe esse `tx` (inline no use case, ou em `<x>.repository.ts` quando reusada) e **não** filtra nem grava `organizationId` — só `scopeFor(ctx)` (carteira do COMMERCIAL);
  - fora do tenant: tabelas de identidade (sem RLS: `User`, `Session`…) pelo client direto ou pelo Better Auth; `withUser` (membership do próprio usuário, AD-006); `withInvitation` (convite pelo hash do token, AD-007); `withoutTenant` (fila). Módulo de domínio usa só `withTenant`. Ler tabela com RLS fora do tenant de outro jeito (webhook, cron que varre organizações) pede AD e política RLS, não um helper novo;
  - a organização ativa vem da sessão (`activeOrganizationId`: inicial no hook de sessão do Better Auth, trocada por `assignActiveOrganization`, AD-010) e é validada contra `Member` por `requireTenant`;
  - toda tabela nova com `organizationId` leva, na própria migration, RLS `ENABLE` + `FORCE` e a política `tenant_isolation` (o teste de schema falha sem elas); único sempre inclui `organizationId`; FK para `Organization` é `onDelete: Restrict, onUpdate: Restrict`;
  - ids são gerados no server: schema de entrada (`<x>Input`) nunca aceita `id`;
  - o tenant nunca vem do request;
  - registro de outro tenant ou fora da carteira → 404.
- **Toda rota:** schema Zod `.strict()`, `operationId` estável e `requirePermission(...)` (o boot falha sem ela em `/api/v1`; a lista `SESSION_ONLY`, de rotas sem tenant, não cresce sem AD).
- **Toda transação sensível:** `audit.record(tx, ctx, …)` **sem PII**.
- **Jobs:** apenas via `infrastructure/queue.ts` (`enqueue(tx, …)` dentro da transação). Handlers idempotentes. Nunca importar `pg-boss` direto.
- **Dinheiro:** inteiros em centavos; percentuais em basis points; operações via `shared/money.ts`.
- **TypeScript strict:** zero `any`, `@ts-ignore`, `@ts-expect-error`; evitar `as` (só em testes). Sem `console.log` (use o logger). Secrets só via `shared/config.ts`.
- **Idioma:** identificadores e comentários em inglês; textos de UI e mensagens de erro em pt-BR com acentuação correta.
- **Web:**
  - dados via hooks gerados pelo Orval (`src/api/`, não editar à mão; rodar `pnpm api:generate`);
  - filtros em search params do router;
  - 4 estados (vazio, carregando, erro, sucesso) em toda listagem.

## Processo por feature: escolher o nível de spec

Ao receber o prompt de uma feature ou fase, **antes de codar**, declare em 1–2 linhas qual processo usar e por quê. Depois siga-o até o Verifier. **Toda implementação usa um dos dois, sem exceção** (inclusive infraestrutura, tooling e bug fix): o Verifier independente e o histórico em `.specs/` são o motivo.

| Processo | Quando usar |
| --- | --- |
| **`tlc-spec-lean`** (padrão) | Toda mudança que não pede o driven, inclusive infraestrutura e bug fix. Mudança pequena (menos de ~3 arquivos, sem porta de mão única): só `checks.md` com `## Intent`, como a skill permite. Em feature com regras de negócio: máquina de estados, cálculo, permissões ou carteira, integração externa. Os itens da checklist do `migration.md` viram critérios EARS verificáveis |
| **`tlc-spec-driven`** | Só quando a feature é grande **e** incerta: muitas partes móveis, várias sessões de trabalho, decisões ainda abertas que precisam de registro (ex.: o chat inteiro, a integração com o Asaas). Justifique por que o lean não basta |

Na dúvida entre lean e driven, escolha o **lean**. Se a escolha envolver decisão de produto, pergunte ao usuário (em pt-BR, uma pergunta por vez, com recomendação).

## Testes

- **Regra pura:** teste unitário cobrindo todas as transições.
- **Endpoint:** teste de integração com PostgreSQL real (`app.inject`), incluindo `withTwoTenants` e, onde houver carteira, `withTwoSalespeople`.
- **Não mockar o banco** (nem queries, nem repositories).
- **O teste falha se o comportamento for removido:** semeie dados que um valor constante ou a ordem de inserção não satisfaçam, e crie no banco a precondição que o critério descreve, não num mock de resposta (L-031, L-032, L-033).

## Antes de declarar pronto

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Todos precisam passar contra **esta** mudança. Se algum falhar, corrija a causa: nunca enfraqueça asserts nem pule hooks.

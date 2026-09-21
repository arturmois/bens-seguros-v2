# ADR-005 — RBAC por mapa estático de permissões (CASL removido)

**Status:** aceito · **Data:** 2026-09-21

## Context
O legado usa CASL (ações × Subject) com 5 roles fixas e um overlay de entitlements do plano. A regra de carteira do vendedor está na especificação, mas não é aplicada.

## Decision
- `shared/permissions.ts` define `Permission` como um union de ações de negócio (`proposal:write`, `commission:approve-admin`, `client:lgpd-delete`, `chat:attend`, `portfolio:transfer`, …) e `ROLE_PERMISSIONS: Record<Role, readonly Permission[]>`.
- As rotas declaram `requirePermission(p)`.
- O **escopo de carteira** do COMMERCIAL é aplicado nas queries via `scopeFor(ctx)` (regras em ADR-010).
- **Entitlements do plano** são uma checagem separada (`requireFeature`, `assertQuota`, bloqueio 402).
- O web recebe `permissions[]` no `/me`, usado apenas para UX.

## Why
Com 5 roles fixas, uma tabela explícita é mais legível e testável que regras de ability. A regra condicional (dono do registro) fica no único lugar seguro, que é a query.

## Alternatives considered
- **CASL:** justificável com muitas regras por atributo, o que não é o caso.
- **Access control do Better Auth:** não usamos o plugin de organização (ADR-003).

## Trade-offs
Roles customizáveis por tenant exigiriam mover o mapa para o banco. Não é requisito hoje.

## Consequences
- Um teste falha se alguma rota registrada não declarar permissão.
- Um snapshot da matriz role × permissão serve de documentação viva.

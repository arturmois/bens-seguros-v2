# ADR-007 — Zod como fonte da verdade; OpenAPI → Orval enxuto

**Status:** aceito · **Data:** 2026-09-21

## Context
No legado, o Orval gera hooks, tipos e Zod (~37k LOC) e exige o server rodando. As respostas usam o envelope `{ success, data, meta }`.

## Decision
- Schemas Zod por módulo (`<x>.schema.ts`) validam a entrada, serializam a saída e geram o OpenAPI (`@fastify/swagger` + `fastify-type-provider-zod`).
- `operationId` é obrigatório e estável, porque dá nome aos hooks.
- `scripts/export-openapi.ts` monta o app **sem `listen`** e grava o `openapi.json`.
- `pnpm api:generate` roda o export e depois o **Orval**, que gera apenas hooks do TanStack Query + tipos (**sem Zod**) em `apps/web/src/api/`.
- O mutator (`lib/http.ts`) usa `fetch` com `credentials: 'include'` e converte `{ error }` em `ApiError`.
- Os wrappers de mutation (toast e invalidação) ficam em `features/*/hooks`.
- O CI falha se o código gerado estiver desatualizado.
- **Sem envelope:** sucesso = status HTTP + recurso; erro = `{ error: { code, message, details? } }`.

## Why
- Com ~120 endpoints, os hooks escritos à mão somariam ~1.200 linhas mantidas manualmente. Com o Orval, essas linhas são geradas e ninguém as mantém.
- Gerar a partir do `openapi.json` exportado elimina a dependência do server rodando.
- O Zod gerado para formulários raramente servia sem ajustes. Os schemas de formulário ficam na feature.

## Alternatives considered
- **`openapi-typescript` + `openapi-fetch` com hooks à mão:** menos código gerado, mais código mantido.
- **tRPC / ts-rest:** acoplariam o web a código do server e perderiam o OpenAPI como contrato aberto.

## Trade-offs
- Renomear um `operationId` renomeia hooks e quebra imports no web. O erro é detectado pelo typecheck, e a regra é tratar o `operationId` como API pública.

## Consequences
Fluxo para mudar a API: editar o schema → `pnpm api:generate` → o typecheck do web aponta o que quebrou.

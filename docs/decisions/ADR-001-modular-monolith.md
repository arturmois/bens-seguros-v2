# ADR-001 — Modular monolith com 2 apps

**Status:** aceito · **Data:** 2026-09-21

## Context
O legado tem 6 apps (`web`, `server`, `worker`, `chat-server`, `chat-worker`, `widget`) e 11 packages internos. A complexidade vem da distribuição, não do domínio:
- HTTP interno com HMAC entre processos;
- JWT próprio para o socket;
- contato duplicado em dois bancos;
- DI container;
- deploys separados;
- dependency-cruiser para conter a erosão entre packages.

O produto ainda está em desenvolvimento, sem carga que exija escala independente.

## Decision
Apenas `apps/server` (Fastify: HTTP, WebSocket, jobs, regras de negócio) e `apps/web` (Next.js: UI).
- O backend é organizado em `src/modules/<domínio>`, com a API pública de cada módulo em `index.ts`.
- Não há `packages/*`.
- A composição de dependências é explícita, em `dependencies.ts`, sem container de DI.

## Why
- Chamadas entre domínios viram chamadas de função: tipadas, transacionais e sem rede.
- Um único deploy, um único processo para observar e um único lugar para encontrar cada regra.
- As fronteiras são mantidas por convenção + um teste de imports, que é barato e suficiente para o tamanho do time.

## Alternatives considered
- **Manter microserviços do chat:** justificável só com escala ou disponibilidade independente, o que ainda não existe.
- **Monorepo com `packages/core` compartilhado:** só faz sentido com vários consumidores do domínio; no novo desenho só o server consome.
- **Nx/Turborepo com boundaries:** ferramental pesado para 2 apps.

## Trade-offs
- Um bug que derrube o processo derruba HTTP, socket e jobs juntos. Mitigações: restart automático, jobs idempotentes com retry e health checks.
- Um job pesado pode competir por CPU com a API. Mitigação: concorrência limitada por fila.

## Consequences
- **Gatilho para extrair um processo** (mesmo código, outro entrypoint `worker.ts`): a latência p95 da API subir por causa de jobs, necessidade de mais de 1 réplica da API (ver ADR-006 sobre o Baileys) ou necessidade de deploy independente. Documentar num novo ADR ao acontecer.
- Não compartilhar tipos por import entre `web` e `server`: o contrato é o OpenAPI (ADR-007).

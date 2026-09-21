# ADR-009 — Frontend: Vite + React + TanStack Router (SPA estática)

**Status:** aceito · **Data:** 2026-09-21

## Context
- O legado usa Next.js 16 no modo "Server Components por padrão", mas na prática os dados vêm de hooks do TanStack Query no client, e há uma API separada (Fastify).
- O produto é um painel autenticado e muito interativo: Kanban, filtros, chat em tempo real.
- SEO só importa na landing.

## Decision
- **Vite + React 19 + TanStack Router** (file-based, code splitting automático), como SPA estática servida pelo Caddy.
- Guard de autenticação no `beforeLoad` do layout `_app`, com `ensureQueryData(/me)` → redirect para `/login`.
- Prefetch nos `loader`s com `queryClient.ensureQueryData`.
- Filtros e paginação em **search params validados com Zod**. Não há `nuqs` nem store global.
- Páginas públicas (landing, termos, privacidade, planos) **pré-renderizadas no build**.
- O widget é a rota `embed.chat.$channelId`, carregada por um iframe injetado pelo `public/widget.js`.
- UI: shadcn/ui + Tailwind 4, React Hook Form, TanStack Table, `dnd-kit`, `recharts`, Sonner.

## Why
- Nenhum recurso do Next seria usado de verdade: sem SSR útil num painel logado, sem Server Actions (a API é o backend), e Server Components exigiriam repassar o cookie e duplicar o fetch.
- Sem runtime do web em produção, há um container a menos.
- Um modelo mental só (tudo é client), sem a fronteira `"use client"`, que é uma fonte frequente de bugs para agentes.
- O port das telas do legado é direto: elas já eram componentes client com hooks do Orval.

## Alternatives considered
- **Next.js usado como SPA:** funciona, mas carrega um runtime e conceitos sem uso.
- **Next.js com RSC e hydration:** dois caminhos de fetch para manter.
- **React Router v7 (framework mode):** equivalente, mas as rotas e search params tipados do TanStack Router se integram melhor ao TanStack Query.

## Trade-offs
- Diverge da preferência inicial por Next.js.
- A checagem de sessão no client causa um instante de loading antes do redirect.
- Se surgir uma área pública rica em SEO (portal do segurado, blog), ela pode ser um site separado.

## Consequences
- As telas portadas do legado trocam `next/link`, `next/navigation` e `next/image` por equivalentes do TanStack Router e `<img>`.
- CSP e headers da SPA ficam no Caddyfile.

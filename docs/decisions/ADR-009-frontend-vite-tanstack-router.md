# ADR-009 — Frontend: Vite + React + TanStack Router (SPA estática)

**Status:** aceito, revisado em 2026-09-23 (pivot para o MVP) · **Data:** 2026-09-21

## Revisão (pivot para o MVP, 2026-09-23)
A decisão foi reavaliada contra os requisitos do MVP (`docs/architecture-analysis.md` §5): Next.js
full-stack (opção A) e Next.js + backend separado (opção B) contra a SPA atual (B′). **Mantida a SPA
Vite + TanStack Router.**
- **Por quê:** o Next.js não resolve nenhum requisito do MVP que a stack atual não resolva, e piora
  dois: realtime (Route Handlers não fazem WebSocket; exigiria custom server) e jobs (sem worker de
  longa duração natural). A stack atual já tem Socket.IO autenticado, pg-boss e testes com
  `app.inject` + PostgreSQL real; trocar reescreveria auth, tenancy e rotas.
- **Onde o Next.js ganharia:** metatags dinâmicas numa página pública. A única no MVP é o link do Web
  Chat, e o que importa ali é o preview no WhatsApp (nome e logo da corretora). A API serve um HTML
  mínimo com Open Graph em `/c/:slug`, que carrega a SPA.
- **O que muda abaixo:** o widget (`embed.chat.$channelId` + `public/widget.js`) dá lugar à rota
  pública `/c/:slug` (ADR-014); a página de planos (`pricing`) sai com o billing (ADR-011, ADR-017).

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

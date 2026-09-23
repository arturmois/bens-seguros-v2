# Bens Seguros v2

ERP SaaS multi-tenant para corretoras de seguros. Monólito modular: `apps/server` (Fastify) + `apps/web` (Vite + React + TanStack Router).

**Fase atual:** 4 (auth + organizações) fechada; próxima é billing — ver [`docs/roadmap.md`](docs/roadmap.md).

## Docs para agentes e humanos

| Doc | Uso |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Regras do repo (tenant, módulos, testes, processo) |
| [`docs/architecture.md`](docs/architecture.md) | Arquitetura aprovada (o que existe vs planejado) |
| [`docs/decisions/`](docs/decisions/) | ADRs |
| [`docs/migration.md`](docs/migration.md) | Paridade com o legado |
| [`docs/roadmap.md`](docs/roadmap.md) | Fases |
| [`.specs/`](.specs/) | Plans, checks, lessons, estado |

## Pré-requisitos

- Node `>=24` (ver `.nvmrc`)
- pnpm `12.x` (`packageManager` no `package.json`)
- Docker (Postgres, MinIO, Mailpit via `docker compose`)

## Setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm --filter @bens/server db:deploy   # ou db:migrate em dev
```

## Comandos

```bash
pnpm dev              # server + web em paralelo
pnpm lint             # Biome
pnpm typecheck
pnpm test             # Vitest (precisa do Postgres do compose)
pnpm build
pnpm api:generate     # OpenAPI → Orval (commitar o resultado)
pnpm e2e              # Playwright (web); no CI roda só em push em main
```

Gate antes de declarar pronto (mesmo do `CLAUDE.md`):

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Apps

- **Server** (`apps/server`): API `/api/v1`, Better Auth, RLS, pg-boss, Socket.IO
- **Web** (`apps/web`): SPA; hooks em `src/api/` são gerados — não editar à mão

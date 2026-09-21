# ADR-008 — Deploy em VPS única: Caddy serve a SPA e faz proxy da API

**Status:** aceito · **Data:** 2026-09-21

## Context
No legado, o web fica na Vercel, e server, workers, chat, Mongo, Redis e PG ficam na VPS atrás de nginx, com deploys separados.

## Decision
- **Serviços** em `docker-compose.prod.yml` na VPS:
  - **`caddy`:** imagem com o build estático do web embutido; TLS automático, SPA fallback e headers de segurança.
  - **`server`:** Node 24.
  - **`postgres`.**
  - **`migrate`:** one-shot, roda `prisma migrate deploy`.
- **Mesma origem:** `/api/*` e `/socket.io/*` vão para o server, o resto é o SPA. `/embed/*` permite ser embutido em iframe.
- **CI** no GitHub Actions: Biome, typecheck, Vitest com Postgres como `service`, `api:generate` + checagem de diff, build, e Playwright em `main`.
- **Deploy** em tag `v*`: imagens `server` e `caddy-web` no GHCR → SSH → `pull`, `run --rm migrate`, `up -d` → health check. O rollback é o redeploy da tag anterior.
- **Backup:** `pg_dump` diário para o R2, com 30 dias de retenção e restore testado mensalmente.
- **Observabilidade:** Sentry com alertas, monitor externo em `/api/ready` e alertas operacionais para o super-admin.

## Why
- Um alvo de deploy e a mesma origem (sem CORS e sem cookie cross-site).
- O web não tem runtime, então há um container Node a menos.

## Alternatives considered
- **Web na Vercel:** tem preview por PR, mas traz cookies cross-site e dois pipelines.
- **Container Node para o web:** desnecessário para uma SPA estática.
- **Kubernetes / Coolify:** desproporcionais para um único host.

## Trade-offs
- A VPS é um ponto único de falha. Mitigações: backup testado, `restart: unless-stopped` e runbook de restore.
- Não há preview por PR. Se fizer falta, um staging pode subir no mesmo compose em outro subdomínio.

## Consequences
O PostgreSQL pode migrar para um serviço gerenciado trocando só a `DATABASE_URL`.

# Runbook: staging

Staging é o mesmo `docker-compose.prod.yml` da produção, numa VPS, com outro `SITE_ADDRESS`
(ADR-008). Nada aqui roda sozinho: cada passo é executado por quem tem acesso à VPS, com o ok do
responsável pelo projeto. A validação local da mesma pilha é `node scripts/staging-smoke.mjs up` seguido de `node scripts/staging-smoke.mjs all` (o `all` não sobe a pilha).

Pré-requisitos na VPS: Docker Engine com o plugin Compose, as portas 80 e 443 livres e acesso ao
repositório.

## DNS

1. Crie um registro `A` (e `AAAA`, se houver IPv6) de `staging.<domínio>` apontando para a VPS.
2. Espere `dig +short staging.<domínio>` devolver o IP da VPS. O Caddy só obtém o certificado
   Let's Encrypt quando o nome já resolve para a máquina e as portas 80/443 estão abertas.

## .env

1. `git clone` do repositório na VPS e `cd` para ele.
2. `cp .env.prod.example .env` e preencha todos os valores:
   - `SITE_ADDRESS=staging.<domínio>` e `APP_URL=https://staging.<domínio>`;
   - `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`: `openssl rand -hex 24` (caracteres seguros em URL);
   - `BETTER_AUTH_SECRET`: `openssl rand -base64 32`;
   - `SMTP_URL` e `EMAIL_FROM` do Resend;
   - `TURNSTILE_SECRET_KEY` e `TURNSTILE_SITE_KEY` do site no Cloudflare Turnstile (o compose não sobe sem elas).
3. `chmod 600 .env`. O arquivo nunca vai para o git (`.gitignore`).

## Subir a pilha

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build --wait
```

No primeiro boot do volume, o Postgres roda `docker/postgres/init/01-app-role.sh` e cria o role
`bens_app` com `APP_DB_PASSWORD`. Num banco que já existe (volume antigo), rode o mesmo script à mão:

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec \
  -e APP_DB_PASSWORD="$(grep ^APP_DB_PASSWORD= .env | cut -d= -f2)" \
  postgres /docker-entrypoint-initdb.d/01-app-role.sh
```

O serviço `migrate` aplica as migrations como owner e termina; o `server` só sobe depois dele. O
`Caddyfile` serve a SPA e repassa `/api` e `/socket.io` ao `server`.

## Verificar

1. `docker compose -f docker-compose.prod.yml --env-file .env ps`: `migrate` com `exited (0)`,
   `server` e `postgres` `running (healthy)`, `caddy` `running` (sem healthcheck: o passo 2 passa por ele).
2. `curl https://staging.<domínio>/api/health` devolve `{"status":"ok"}`.
3. `curl -I http://staging.<domínio>/` devolve `308` para `https://`.
4. No navegador: criar conta, confirmar pelo e-mail, entrar e sair.
5. O e2e contra o staging, de uma máquina com o repositório:
   `E2E_BASE_URL=https://staging.<domínio> pnpm e2e` — exige acesso ao Postgres (`E2E_DATABASE_URL`)
   e à caixa de e-mail de teste; sem isso, fique no passo 4.

## Rollback

1. `git checkout <tag ou commit anterior>` na VPS.
2. `docker compose -f docker-compose.prod.yml --env-file .env up -d --build --wait`.
3. Migrations não voltam sozinhas: se a versão nova aplicou uma migration incompatível com a
   anterior, restaure o backup do banco antes (backup e restore são da Fase 12–13). Até lá, o
   staging pode ser recriado do zero: `docker compose -f docker-compose.prod.yml --env-file .env
   down --volumes` apaga **todos** os dados do staging.

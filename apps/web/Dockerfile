# Web image = Caddy serving the static SPA and proxying the API (ADR-008). Build from the repository
# root: docker build -f apps/web/Dockerfile .

FROM node:24.21.0-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @bens/web
COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN pnpm --filter @bens/web build

FROM caddy:2.11.4-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv

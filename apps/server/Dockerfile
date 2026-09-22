# Server image (ADR-008). Build from the repository root:
#   docker build -f apps/server/Dockerfile --target runtime .
# Targets: `runtime` (the API, non-root) and `migrate` (one-shot `prisma migrate deploy`, as owner).

FROM node:24.21.0-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# Every workspace dependency with the lockfile as is; postinstall runs `prisma generate`.
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/prisma.config.ts apps/server/
COPY apps/server/prisma apps/server/prisma
RUN pnpm install --frozen-lockfile --filter @bens/server
COPY tsconfig.base.json ./
COPY apps/server apps/server
RUN pnpm --filter @bens/server build

# The Prisma CLI, the schema and the migrations; nothing that serves requests.
FROM build AS migrate
WORKDIR /repo/apps/server
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# Production dependencies only. Scripts are skipped: the Prisma client is already compiled in dist.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @bens/server

FROM node:24.21.0-slim AS runtime
ENV NODE_ENV=production
# Same layout as the workspace, so pnpm's relative symlinks resolve.
WORKDIR /repo/apps/server
COPY --from=prod-deps /repo/node_modules /repo/node_modules
COPY --from=prod-deps /repo/apps/server/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
COPY apps/server/package.json ./
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]

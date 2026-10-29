# syntax=docker/dockerfile:1.7
#
# One Dockerfile, five targets. Build from the repo root:
#
#   docker build --target api     -t onstage-api .
#   docker build --target worker  -t onstage-worker .
#   docker build --target web     -t onstage-web .
#   docker build --target admin   -t onstage-admin .
#   docker build --target migrate -t onstage-migrate .   # run once per release, before api
#
# Configuration comes from environment variables at runtime (see .env.example);
# nothing secret is baked into an image. The mobile app is not built here —
# it ships through EAS (apps/mobile/eas.json).

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
# openssl: Prisma's query engine links against it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1 \
    npm_config_update_notifier=false

# ── Server side: shared + api + worker ───────────────────────────────────────
FROM base AS server-build
COPY . .
RUN npm ci -w @onstage/shared -w @onstage/api -w @onstage/worker --include-workspace-root \
      --no-audit --no-fund \
 && npm run build -w @onstage/shared \
 && npm run db:generate -w @onstage/api \
 && npm run build -w @onstage/api \
 && npm run build -w @onstage/worker

# Applies pending Prisma migrations, then exits. Needs DATABASE_URL.
FROM server-build AS migrate
CMD ["npm", "run", "db:migrate", "-w", "@onstage/api"]

FROM server-build AS server-runtime
RUN npm prune --omit=dev -w @onstage/shared -w @onstage/api -w @onstage/worker \
      --include-workspace-root --no-audit --no-fund
ENV NODE_ENV=production

FROM base AS api
ENV NODE_ENV=production
COPY --from=server-runtime /repo /repo
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM base AS worker
ENV NODE_ENV=production
COPY --from=server-runtime /repo /repo
USER node
CMD ["node", "apps/worker/dist/main.js"]

# ── Next.js apps (standalone output) ────────────────────────────────────────
FROM base AS web-build
COPY . .
RUN npm ci -w @onstage/shared -w @onstage/web --include-workspace-root --no-audit --no-fund \
 && npm run build -w @onstage/shared \
 && npm run build -w @onstage/web

FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=web-build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM base AS admin-build
COPY . .
RUN npm ci -w @onstage/shared -w @onstage/admin --include-workspace-root --no-audit --no-fund \
 && npm run build -w @onstage/shared \
 && npm run build -w @onstage/admin

FROM base AS admin
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=admin-build --chown=node:node /repo/apps/admin/.next/standalone ./
COPY --from=admin-build --chown=node:node /repo/apps/admin/.next/static ./apps/admin/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]

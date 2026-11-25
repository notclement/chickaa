# syntax=docker/dockerfile:1
# NoChickenCall: one container serves the API (/api/v1) and the PWA (everything else).

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile
COPY . .
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST=/app/web \
    MIGRATIONS_DIR=/app/migrations \
    RUN_MIGRATIONS_ON_START=true
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
# The API is bundled into dist/ (no node_modules needed at runtime).
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/migrations ./migrations
COPY --from=build /app/apps/web/dist ./web
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/v1/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

# API image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t riad-api .
# On start it applies pending Prisma migrations, then serves on :4000.

FROM node:24-bookworm-slim AS base
# OpenSSL for the Prisma engines.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter "@riad/api..."
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @riad/shared build \
  && pnpm --filter @riad/api exec prisma generate \
  && pnpm --filter @riad/api build

FROM base AS runtime
ENV NODE_ENV=production \
    API_PORT=4000 \
    OCR_CACHE_DIR=/data/ocr
# Dev dependencies stay: the Prisma CLI (migrations) and tsx (seed) run in this image.
COPY --from=build --chown=node:node /repo /repo
RUN mkdir -p /data/ocr && chown node:node /data/ocr
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]

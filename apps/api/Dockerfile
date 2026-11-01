# API image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t riad-api .
# On start it applies pending Prisma migrations, then serves on :4000.

FROM node:24-bookworm-slim AS base
# OpenSSL for the Prisma engines.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter "@riad/api..."
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @riad/shared build \
  && pnpm --filter @riad/api exec prisma generate \
  && pnpm --filter @riad/api build
# A copy of the API with production dependencies only (no compilers, test or lint tools).
# Prisma (migrations) and tsx (seed) are production dependencies for that reason.
RUN pnpm --filter @riad/api deploy --prod /out \
  && rm -rf /out/test \
  && cd /out && ./node_modules/.bin/prisma generate
# Never read on this server: source maps, Prisma builds for other databases (we use
# PostgreSQL), TypeScript (an optional Prisma peer) and sharp's Alpine/musl binaries.
RUN cd /out/node_modules/.pnpm \
  && rm -rf typescript@* @img+sharp-libvips-linuxmusl-* @img+sharp-linuxmusl-* \
  && find . -type f -name '*.map' -delete \
  && find . -type f -path '*prisma*' \( -name '*mysql*' -o -name '*sqlite*' -o -name '*sqlserver*' -o -name '*cockroachdb*' \) -delete

FROM base AS runtime
ENV NODE_ENV=production \
    API_PORT=4000 \
    OCR_CACHE_DIR=/data/ocr
WORKDIR /app
COPY --from=build --chown=node:node /out /app
RUN mkdir -p /data/ocr && chown node:node /data/ocr
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]

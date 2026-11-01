# Web image (Next.js standalone server). Build from the repository root:
#   docker build -f apps/web/Dockerfile -t riad-web --build-arg NEXT_PUBLIC_SITE_URL=https://riad.example.com .
# NEXT_PUBLIC_* values are compiled into the browser bundle, so they are build arguments.

FROM node:24-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@riad/web..."
COPY packages/shared packages/shared
COPY apps/web apps/web
# Public address printed in the check-in QR codes (empty = the browser's origin).
ARG NEXT_PUBLIC_SITE_URL=
# Empty = same origin: the reverse proxy routes /api/v1/socket.io to the API.
ARG NEXT_PUBLIC_SOCKET_URL=
ENV NODE_ENV=production \
    BUILD_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    API_INTERNAL_URL=http://api:4000 \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
RUN pnpm --filter @riad/shared build && cd apps/web && npx next build
# Not needed at runtime: TypeScript and sharp's Alpine/musl binaries (the image is Debian).
RUN cd apps/web/.next/standalone/node_modules/.pnpm \
  && rm -rf typescript@* @img+sharp-libvips-linuxmusl-* @img+sharp-linuxmusl-*

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

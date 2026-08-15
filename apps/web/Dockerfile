# Build context must be the repo root (npm workspaces), not apps/web - run
# from there.
#
# Two runtime variants, selected with --target (the default, if omitted, is
# runtime-bundled):
#
#   runtime-bundled  (default) - bundles a background Valkey server, so
#     `docker run --rm -p 3000:3000 <image>` gets retries, concurrency, and
#     per-domain cooldowns with no external setup. Its queue data isn't
#     persisted across container restarts.
#   runtime-external - no bundled Valkey, smaller image. Point REDIS_URL at
#     your own Redis/Valkey instance for the same queuing behavior, with
#     data that survives this container restarting - the server also
#     resumes any crawl still running when it last stopped. Falls back to
#     the default sequential queue if REDIS_URL is unset.
#
# Build:
#   docker build -f apps/web/Dockerfile -t zod-crawler-web .
#   docker build -f apps/web/Dockerfile --target runtime-external -t zod-crawler-web:slim .
#
# Run against your own persistent Redis/Valkey, with a volume for the
# sample cache too so a resumed crawl doesn't have to re-fetch everything
# (see apps/web/README.md's "Advanced queuing" section):
#   docker run --rm -p 3000:3000 \
#     -v "$(pwd)/cache:/cache" -e CACHE_DIR=/cache \
#     -e REDIS_URL=redis://your-valkey-host:6379 \
#     zod-crawler-web:slim

FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/pipeline/package.json packages/pipeline/package.json
COPY packages/pipeline-node/package.json packages/pipeline-node/package.json
COPY packages/components/package.json packages/components/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/pipeline packages/pipeline
COPY packages/pipeline-node packages/pipeline-node
COPY packages/components packages/components
COPY apps/web apps/web
# @zod-crawler/components isn't in tsconfig.server.json's reference graph -
# vite build resolves it from packages/components/dist via its exports map,
# so it needs building explicitly before the client bundle does.
RUN npx tsc -b packages/components
RUN npm run build --workspace=@zod-crawler/web

# bullmq/ioredis are optional peer dependencies (see apps/web/README.md's
# "Advanced queuing" section) - npm ci above doesn't install them on its
# own. Both runtime variants need them, only runtime-bundled additionally
# needs the Valkey server itself.
RUN npm install --no-save --omit=dev bullmq@^6 ioredis@^6

RUN npm prune --omit=dev

FROM node:24-alpine AS runtime-external
WORKDIR /app

COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages/core/package.json packages/core/package.json
COPY --from=builder --chown=node:node /app/packages/core/dist packages/core/dist
COPY --from=builder --chown=node:node /app/packages/pipeline/package.json packages/pipeline/package.json
COPY --from=builder --chown=node:node /app/packages/pipeline/dist packages/pipeline/dist
COPY --from=builder --chown=node:node /app/packages/pipeline-node/package.json packages/pipeline-node/package.json
COPY --from=builder --chown=node:node /app/packages/pipeline-node/dist packages/pipeline-node/dist
COPY --from=builder --chown=node:node /app/apps/web/package.json apps/web/package.json
COPY --from=builder --chown=node:node /app/apps/web/dist apps/web/dist
USER node

ENV PORT=3000
EXPOSE 3000

CMD ["node", "apps/web/dist/server/server/index.js"]

FROM runtime-external AS runtime-bundled
USER root
RUN apk add --no-cache valkey
COPY --chown=node:node apps/web/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh
USER node

ENV REDIS_URL=redis://127.0.0.1:6379
ENTRYPOINT ["./docker-entrypoint.sh"]

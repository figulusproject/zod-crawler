# Build context must be the repo root (npm workspaces), not apps/cli - run
# from there.
#
# Two runtime variants, selected with --target (the default, if omitted, is
# runtime-bundled):
#
#   runtime-bundled  (default) - bundles a background Valkey server, so
#     --redis-url/REDIS_URL-backed retries, concurrency, and per-domain
#     cooldowns work with no external setup. Its queue data isn't persisted
#     across container restarts, which is fine for a single crawl run.
#   runtime-external - no bundled Valkey, smaller image. Point REDIS_URL at
#     your own Redis/Valkey instance instead. Falls back to the default
#     sequential queue if REDIS_URL is unset.
#
# Build:
#   docker build -f apps/cli/Dockerfile -t zod-crawler .
#   docker build -f apps/cli/Dockerfile --target runtime-external -t zod-crawler:slim .
#
# Run (mount a host directory to collect the generated schema/cache):
#   docker run --rm -v "$(pwd)/out:/out" zod-crawler \
#     --ids "1,2,3" --url-template "https://example.com/items/{id}" --output /out

FROM node:24-alpine AS builder
WORKDIR /app

# Copy manifests first so `npm ci` is cached across source-only changes.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/pipeline/package.json packages/pipeline/package.json
COPY packages/pipeline-node/package.json packages/pipeline-node/package.json
COPY apps/cli/package.json apps/cli/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/pipeline packages/pipeline
COPY packages/pipeline-node packages/pipeline-node
COPY apps/cli apps/cli
# Builds apps/cli's full project-reference closure (core, pipeline, pipeline-node) - apps/web isn't copied into this context.
RUN npx tsc -b apps/cli && chmod +x apps/cli/dist/index.js

# bullmq/ioredis are optional peer dependencies (see apps/cli/README.md's
# "Advanced queuing" section) - npm ci above doesn't install them on its
# own. Both runtime variants need them, only runtime-bundled additionally
# needs the Valkey server itself.
RUN npm install --no-save --omit=dev bullmq@^6 ioredis@^6

# Drop devDependencies (typescript, vitest, @types/node, ...) and TS
# sources - already compiled, not needed at runtime. `npm prune` prunes in
# place rather than reinstalling node_modules from scratch.
RUN npm prune --omit=dev \
  && find packages apps -maxdepth 2 -type d -name src -prune -exec rm -rf {} + \
  && find packages apps -maxdepth 2 -name "*.tsbuildinfo" -delete

FROM node:24-alpine AS runtime-external
WORKDIR /app

# Runs as the non-root "node" user (built into the base image, uid 1000)
# rather than the default root - otherwise every file this writes into a
# bind-mounted --output directory comes out root-owned on the host,
# unremovable without sudo.
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/cli ./apps/cli
USER node

ENTRYPOINT ["node", "apps/cli/dist/index.js"]

FROM runtime-external AS runtime-bundled
USER root
RUN apk add --no-cache valkey
COPY --chown=node:node apps/cli/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh
USER node

ENV REDIS_URL=redis://127.0.0.1:6379
ENTRYPOINT ["./docker-entrypoint.sh"]

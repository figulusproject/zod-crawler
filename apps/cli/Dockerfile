# Build context must be the repo root (npm workspaces), not apps/cli - run
# from there.
#
# Build:
#   docker build -f apps/cli/Dockerfile -t zod-crawler .
#
# Run (mount a host directory to collect the generated schema/cache):
#   docker run --rm -v "$(pwd)/out:/out" zod-crawler \
#     --ids "1,2,3" --url-template "https://example.com/items/{id}" --output /out

FROM node:22-alpine AS builder
WORKDIR /app

# Copy manifests first so `npm ci` is cached across source-only changes.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/cli/package.json apps/cli/package.json
RUN npm ci

COPY tsconfig.json tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/cli apps/cli
RUN npm run build

# Drop devDependencies (typescript, vitest, @types/node, ...) and TS
# sources - already compiled, not needed at runtime. `npm prune` prunes in
# place rather than reinstalling node_modules from scratch.
RUN npm prune --omit=dev \
  && find packages apps -maxdepth 2 -type d -name src -prune -exec rm -rf {} + \
  && find packages apps -maxdepth 2 -name "*.tsbuildinfo" -delete

FROM node:22-alpine AS runtime
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

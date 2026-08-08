FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/web apps/web
RUN npm run build --workspace=@zod-crawler/web

RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app

COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages/core/package.json packages/core/package.json
COPY --from=builder --chown=node:node /app/packages/core/dist packages/core/dist
COPY --from=builder --chown=node:node /app/apps/web/package.json apps/web/package.json
COPY --from=builder --chown=node:node /app/apps/web/dist apps/web/dist
USER node

ENV PORT=3000
EXPOSE 3000

CMD ["node", "apps/web/dist/server/server/index.js"]

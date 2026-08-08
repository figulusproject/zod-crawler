# zod-crawler

> _Everyone has the right to resist occupation._

Sometimes, you need to work with an API that isn't well-documented. `zod-crawler` is here to help!

`zod-crawler` makes several requests to a specified API route, in order to understand what data it returns. This retrieved data will be used to generate a `zod` schema for the route.

This is perfect for use with tools like [up-fetch](https://github.com/L-Blondy/up-fetch), which is designed for automatic response parsing using an input schema.

## Quickstart

```bash
npx @zod-crawler/cli \
  --ids "1,2,3" \
  --url-template "https://example.com/items/{id}" \
  --output ./out
```

This writes an inferred `./out/schema.ts` and caches every fetched response
under `./out/cache/`, so re-running the same command doesn't refetch. See
the CLI package's README for the full flag list.

## Apps/Packages

- [CLI](/apps/cli/) | A full-featured CLI tool
- [Core Library](/packages/core/) | Can be called from other ECMAScript projects

## Zod Compatibility

Designed for Zod v4 natively, not backwards-compatible with Zod v3 (uses new `z.uuid()`, `z.url()`, etc syntax).

## Development

This is an npm workspaces monorepo (`packages/*` for libraries, `apps/*`
for runnable tools).

```bash
npm install
npm run build       # tsc -b across the whole project
npm run typecheck   # tsc -b --force
npm test            # vitest run
npm run format      # prettier --write .
```

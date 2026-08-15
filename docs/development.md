# Development

This is an npm workspaces monorepo: `packages/*` for libraries, `apps/*` for runnable tools, `tools/*` for the Cloudflare Workers backing `zodcrawler.figulus.dev` (the docs/demo router and the demo's CORS proxy).

```bash
npm install
npm run build       # tsc -b, then builds @zod-crawler/web and @zod-crawler/web-demo (Vite, outside the tsc -b graph)
npm run typecheck   # tsc -b --force, then web/web-demo/cors-proxy/site-router individually (same reason)
npm test            # vitest run, project node + cors-proxy + site-router
npm run test:browser # vitest run, project pipeline-browser - Playwright/Chromium, kept separate since it needs a browser
npm run coverage    # vitest run --project node --coverage, same thresholds CI enforces
npm run format      # prettier --write .
```

`npm test` does not run the `pipeline-browser` project - run `npm run test:browser` for that too before considering the suite green.

## Web app dev server

```bash
npm install
npm run dev
```

This starts the [`@zod-crawler/web`](web.md) Express server (`server/`) and the Vite dev server (`src/`) together, proxying API requests from the client to the server. `@zod-crawler/web-demo` is a plain Vite app instead (`npm run dev --workspace=@zod-crawler/web-demo`), with no server of its own.

## Cloudflare Workers (`tools/*`)

`tools/cors-proxy` and `tools/site-router` are Wrangler-managed Workers, not Node apps - each has its own `dev`/`deploy` scripts:

```bash
npm run dev --workspace=@zod-crawler/cors-proxy
npm run dev --workspace=@zod-crawler/site-router
```

`npm run typecheck`/`npm test` at the root already cover both.

## Docs

This site is built with [docsify](https://docsify.js.org) and lives under `docs/`, with no build step - docsify renders the Markdown client-side.

```bash
npm run docs
```

Serves the site at `http://localhost:3000` with live reload, so editing any file under `docs/` refreshes the browser automatically. Pass a different port with `npm run docs -- --port <port>`.

# Development

This is an npm workspaces monorepo (`packages/*` for libraries, `apps/*` for runnable tools).

```bash
npm install
npm run build       # tsc -b across the whole project
npm run typecheck   # tsc -b --force
npm test            # vitest run
npm run format      # prettier --write .
```

## Web app dev server

```bash
npm install
npm run dev
```

This starts the [`@zod-crawler/web`](web.md) Express server (`server/`) and the Vite dev server (`src/`) together, proxying API requests from the client to the server.

## Docs

This site is built with [docsify](https://docsify.js.org) and lives under `docs/`, with no build step - docsify renders the Markdown client-side.

```bash
npm run docs
```

Serves the site at `http://localhost:3000` with live reload, so editing any file under `docs/` refreshes the browser automatically. Pass a different port with `npm run docs -- --port <port>`.

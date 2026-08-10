# @zod-crawler/web

[![CI](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/docker/v/figulusproject/zod-crawler-web?sort=semver&label=docker)](https://hub.docker.com/r/figulusproject/zod-crawler-web)

> _Everyone has the right to resist occupation._

A Docker-deployed single-page UI for the same crawl pipeline behind [`zod-crawler`](../cli). Submit ids, a URL template, and a few flags, and watch the fetch/infer/validate run live instead of reading it off a terminal.

## Usage

```bash
docker run --rm -p 3000:3000 figulusproject/zod-crawler-web
```

Then open `http://localhost:3000`. Fill in the ids (or paste a list), a URL template like `https://example.com/items/{id}`, and submit. Progress streams in per-id as each sample is fetched, followed by the generated schema, the validation summary, and any crawl candidates found along the way, which you can review and re-feed straight into another run.

## Development

```bash
npm install
npm run dev
```

This starts the Express server (`server/`) and the Vite dev server (`src/`) together, proxying API requests from the client to the server. See the root README for the full monorepo dev commands.

## Advanced queuing (optional)

Setting the `REDIS_URL` environment variable (alongside `PORT`) switches
every crawl on this server to a [BullMQ](https://bullmq.io)-backed queue
instead of the default sequential one - retries with backoff for transient
failures, immediate skip for permanent ones, and per-domain cooldowns.
[Valkey](https://valkey.io) is the recommended server to point it at, not
Redis itself - see the [CLI README](../cli#advanced-queuing-optional) for
why and for the full behavior, which is identical here, just server-wide
instead of per-run. Requires installing the optional `bullmq`/`ioredis`
peer dependencies yourself (`npm install bullmq ioredis`) - not included in
the published Docker image.

## How it works

The server wraps [`@zod-crawler/core`](../../packages/core) the same way the CLI does: fetching and caching each sample, merging shapes to infer a Zod schema, and validating every cached sample against it. Instead of printing to a terminal, it streams `FetchProgressEvent`s and the final result to the browser over Server-Sent Events (`POST /api/crawl` to start a run, `GET /api/crawl/:jobId/events` to follow it).

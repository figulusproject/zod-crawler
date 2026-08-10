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
instead of per-run.

The default `figulusproject/zod-crawler-web` Docker image already bundles
`bullmq`/`ioredis` and a background Valkey server, with `REDIS_URL` preset
to it, so `docker run --rm -p 3000:3000 figulusproject/zod-crawler-web`
gets all of the above with no setup. That Valkey instance isn't persisted
across container restarts, which only matters if a crawl is still queued
when the container stops. For a production deployment backed by your own,
persistent Redis/Valkey instance, use the smaller
`figulusproject/zod-crawler-web:slim` tag instead and set `REDIS_URL`
yourself - it has no bundled Valkey and falls back to the default
sequential queue if `REDIS_URL` is unset.

Outside Docker (`npm run build && npm start`), install the optional
`bullmq`/`ioredis` peer dependencies yourself (`npm install bullmq
ioredis`) before setting `REDIS_URL`.

### Surviving a server restart

With `REDIS_URL` set, the server also registers each crawl still in
progress in Redis and, on startup, resumes anything left running from
before it last stopped - reconnecting to the same BullMQ queue a crashed
process was using instead of losing that work. This needs a Redis/Valkey
instance that itself survives the restart, which the default, bundled
Valkey does not (see above) - point `REDIS_URL` at your own persistent
instance (the `slim` tag, typically alongside Docker Compose) for this to
do anything.

Resuming the queue alone only avoids re-doing fetches still in flight at
the moment of the crash; anything already fetched is cached to a
per-job directory that, by default, lives under the OS temp directory and
is lost on restart just like the queue would be without `REDIS_URL`. Set
`CACHE_DIR` to a persistent, ideally volume-mounted directory to carry
that cache across restarts too, so a resumed crawl only re-fetches what
was still outstanding, not everything:

```bash
docker run --rm -p 3000:3000 \
  -v $(pwd)/cache:/cache -e CACHE_DIR=/cache \
  -e REDIS_URL=redis://your-valkey-host:6379 \
  figulusproject/zod-crawler-web:slim
```

## How it works

The server wraps [`@zod-crawler/core`](../../packages/core) the same way the CLI does: fetching and caching each sample, merging shapes to infer a Zod schema, and validating every cached sample against it. Instead of printing to a terminal, it streams `FetchProgressEvent`s and the final result to the browser over Server-Sent Events (`POST /api/crawl` to start a run, `GET /api/crawl/:jobId/events` to follow it).

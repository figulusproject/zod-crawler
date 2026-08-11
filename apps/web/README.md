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

See the [docs site](/docs/web.md) for local development, advanced
queuing via `REDIS_URL`, and surviving a server restart.

## How it works

The server wraps [`@zod-crawler/core`](../../packages/core) the same way the CLI does: fetching and caching each sample, merging shapes to infer a Zod schema, and validating every cached sample against it. Instead of printing to a terminal, it streams `FetchProgressEvent`s and the final result to the browser over Server-Sent Events (`POST /api/crawl` to start a run, `GET /api/crawl/:jobId/events` to follow it).

# Web

A Docker-deployed single-page UI for the same crawl pipeline behind [`zod-crawler`](cli.md). Submit ids, a URL template, and a few flags, and watch the fetch/infer/validate run live instead of reading it off a terminal.

## Usage

```bash
docker run --rm -p 3000:3000 figulusproject/zod-crawler-web
```

Then open `http://localhost:3000`. Fill in the ids (paste a list, or upload a `.txt`, `.json`, `.yaml`/`.yml`, or `.csv` file of them), a URL template like `https://example.com/items/{id}`, and submit. Progress streams in per-id as each sample is fetched, followed by the generated schema, the validation summary, and any crawl candidates found along the way, which you can review, save in any of those same four formats, and re-feed straight into another run (see [Crawling further](crawling-further.md)).

## Docker

The default tag above bundles `bullmq`/`ioredis` and a background Valkey server, with `REDIS_URL` preset to it, so [advanced queuing](advanced-queuing.md) (retries, concurrency, per-domain cooldowns) works with no setup. That bundled Valkey instance isn't persisted across container restarts, which only matters if a crawl is still queued when the container stops.

For a production deployment backed by your own, persistent Redis/Valkey instance, use the smaller `figulusproject/zod-crawler-web:slim` tag instead and set `REDIS_URL` yourself - it has no bundled Valkey and falls back to the default sequential queue if `REDIS_URL` is unset. Unlike the CLI's one-shot crawls, the web app is a long-running server that's typically paired with a long-running Valkey, so Docker Compose is a better fit here than a bare `docker run`:

```yaml
# docker-compose.yml
services:
  web:
    image: figulusproject/zod-crawler-web:slim
    ports:
      - "3000:3000"
    environment:
      REDIS_URL: redis://valkey:6379
      CACHE_DIR: /cache
    volumes:
      - cache:/cache
      # - ./cache:/cache  # bind mount instead, if you want the cache directory browsable from the host
    depends_on:
      - valkey
    networks:
      - zod-crawler

  valkey:
    image: valkey/valkey:8-alpine
    networks:
      - zod-crawler

networks:
  zod-crawler:

volumes:
  cache:
```

```bash
docker compose up
```

`web` reaches `valkey` over the `zod-crawler` network by service name, the same way the CLI's `docker network` example does. The named `cache` volume is Docker-managed storage that survives `docker compose down` (drop it with `docker compose down -v`, or swap it for the commented-out bind mount to keep the cache as a plain host directory instead).

`REDIS_URL` and `CACHE_DIR` together are also what let the server survive a restart without losing in-flight crawls or re-fetching what's already cached - see [Advanced queuing](advanced-queuing.md#surviving-a-server-restart).

Outside Docker (`npm run build && npm start`), install the optional `bullmq`/`ioredis` peer dependencies yourself (`npm install bullmq ioredis`) before setting `REDIS_URL`.

## How it works

The server wraps [`@zod-crawler/core`](core-usage.md) the same way the CLI does: fetching and caching each sample, merging shapes to infer a Zod schema, and validating every cached sample against it. Instead of printing to a terminal, it streams `FetchProgressEvent`s and the final result to the browser over Server-Sent Events (`POST /api/crawl` to start a run, `GET /api/crawl/:jobId/events` to follow it).

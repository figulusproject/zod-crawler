# CLI

Fetches a set of JSON API responses, caches them to disk, and generates a Zod v4 schema that validates all of them. It then checks its own work by parsing every cached sample against the schema it just generated.

## Usage

```bash
npx @zod-crawler/cli \
  --ids "1,2,3" \
  --url-template "https://example.com/items/{id}" \
  --output ./out
```

This writes `./out/schema.ts` and caches each raw response under `./out/cache/`. Re-running the same command reuses the cache instead of re-fetching. Delete `./out/cache/` (or point `--output` elsewhere) to force a fresh fetch.

See [Flags](flags.md) for the full flag list.

## Docker

`figulusproject/zod-crawler-cli` ships as a Docker image, as an alternative to `npx`:

```bash
docker run --rm -v "$(pwd)/out:/out" figulusproject/zod-crawler-cli \
  --ids "1,2,3" \
  --url-template "https://example.com/items/{id}" \
  --output /out
```

This default tag bundles `bullmq`/`ioredis` and a background Valkey server, with `REDIS_URL` preset to it, so [advanced queuing](advanced-queuing.md) (retries, concurrency, per-domain cooldowns) works with no setup - just add `--concurrency`:

```bash
docker run --rm -v "$(pwd)/out:/out" figulusproject/zod-crawler-cli \
  --ids "1,2,3" \
  --url-template "https://example.com/items/{id}" \
  --output /out \
  --concurrency 4
```

That bundled Valkey instance isn't persisted across container restarts, which is fine for a single run - a crawl is a one-shot process, not a long-running server. For a Redis/Valkey instance shared across multiple runs, use the smaller `figulusproject/zod-crawler-cli:slim` tag instead and point `--redis-url`/`REDIS_URL` at your own instance. `:slim` has no bundled Valkey and falls back to the default sequential queue if neither is set:

```bash
docker network create zod-crawler
docker run -d --rm --network zod-crawler --name valkey -p 6379:6379 valkey/valkey:8-alpine

docker run --rm --network zod-crawler -v "$(pwd)/out:/out" figulusproject/zod-crawler-cli:slim \
  --ids "1,2,3" \
  --url-template "https://example.com/items/{id}" \
  --output /out \
  --redis-url redis://valkey:6379 \
  --concurrency 4
```

(The shared `docker network` and `--name valkey` are what let the CLI container resolve `redis://valkey:6379` by name - the CLI container can't reach `localhost:6379` on the host the way a plain `npx` invocation could.)

Outside Docker (`npx @zod-crawler/cli` directly on the host), advanced queuing requires installing BullMQ's client libraries yourself, since they're optional peer dependencies:

```bash
npm install bullmq ioredis
```

## Example

```bash
npx @zod-crawler/cli \
  --ids "1,2,3" \
  --url-template "https://jsonplaceholder.typicode.com/todos/{id}" \
  --output ./out \
  --schema-name TodoSchema
```

```ts
// ./out/schema.ts
import { z } from "zod";

export const TodoSchema = z.object({
  completed: z.boolean(),
  id: z.int(),
  title: z.string(),
  userId: z.int(),
});
```

The CLI also prints a validation summary (how many of the cached samples parsed successfully against the generated schema) and exits non-zero if any didn't.

## How it works

This is a thin wrapper around [`@zod-crawler/core`](core-usage.md). It fetches each id, caching raw responses to disk and resuming from cache on re-runs, merges the samples' shapes to infer a Zod schema, validates every cached sample against that schema in-process, and writes the result.

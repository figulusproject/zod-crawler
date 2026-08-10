# @zod-crawler/cli

[![CI](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@zod-crawler%2Fcli.svg)](https://badge.fury.io/js/@zod-crawler%2Fcli)
[![Docker version](https://img.shields.io/docker/v/figulusproject/zod-crawler-cli?sort=semver&label=docker)](https://hub.docker.com/r/figulusproject/zod-crawler-cli)

> _Everyone has the right to resist occupation._

Fetches a set of JSON API responses, caches them to disk, and generates a
Zod v4 schema that validates all of them. It then checks its own work by
parsing every cached sample against the schema it just generated.

## Usage

```bash
npx @zod-crawler/cli \
  --ids "1,2,3" \
  --url-template "https://example.com/items/{id}" \
  --output ./out
```

This writes `./out/schema.ts` and caches each raw response under
`./out/cache/`. Re-running the same command reuses the cache instead of
re-fetching. Delete `./out/cache/` (or point `--output` elsewhere) to force
a fresh fetch.

### Flags

| Flag                      | Required                                 | Description                                                                                                                                                                                                                                                            |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ids`                   | one of `--ids`/`--ids-file`              | Comma-separated list of ids (or full URLs, if `--url-template` is omitted).                                                                                                                                                                                            |
| `--ids-file`              | one of `--ids`/`--ids-file`              | Path to a file with one id (or URL) per line. Blank lines are ignored.                                                                                                                                                                                                 |
| `--output`                | yes                                      | Directory to write `schema.ts` and the `cache/` directory into.                                                                                                                                                                                                        |
| `--url-template`          | no                                       | A URL containing an `{id}` placeholder, e.g. `https://example.com/items/{id}`. If omitted, each id from `--ids`/`--ids-file` is fetched as-is, so you can pass complete URLs directly instead.                                                                         |
| `--delay`                 | no (default `7500`)                      | Milliseconds to wait between fetches, to stay polite to whatever API you're pointed at. Only applied between real network fetches - cached ids never wait.                                                                                                             |
| `--schema-name`           | no (default `InferredSchema`)            | Name of the exported `const` in the generated schema file.                                                                                                                                                                                                             |
| `--emit-crawl-candidates` | no (default off)                         | Also write `crawl-candidates.txt`: ids/URLs found in the fetched samples that look worth fetching next. See "Crawling further" below.                                                                                                                                  |
| `--zod-transformers`      | no (default off)                         | Generated fields that would otherwise inline an empty-string-as-undefined union instead import `emptyStringAsUndefined` from `zod-transformers`. Install `zod-transformers` alongside `zod` in whatever project consumes the generated `schema.ts` if you enable this. |
| `--stop-on-error`         | no (default off)                         | By default, a failed fetch (a non-2xx response, a network error, etc.) is logged and skipped, and the crawl continues with the rest of the ids. Set this to abort the whole run on the first failed fetch instead.                                                     |
| `--redis-url`             | no (default off, or `REDIS_URL` env var) | Switches fetching to a [BullMQ](https://bullmq.io)-backed queue against this instance instead of the plain sequential queue. [Valkey](https://valkey.io) recommended - see "Advanced queuing" below.                                                                   |
| `--concurrency`           | no (default `1`)                         | How many fetches run at once. Only valid alongside `--redis-url`/`REDIS_URL`.                                                                                                                                                                                          |

### Example

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

The CLI also prints a validation summary (how many of the cached samples
parsed successfully against the generated schema) and exits non-zero if any
didn't.

## Crawling further

`--ids`/`--ids-file` is a fixed list - this tool doesn't crawl on its own.
`--emit-crawl-candidates` gets you most of the way there: it looks at the
samples you just fetched for fields worth fetching next (an id/URL that
varies from sample to sample, not a fixed constant) and writes them to
`crawl-candidates.txt`, one per line, in the same format `--ids-file`
reads. Review the list, delete anything you don't want, and feed it back in
for the next hop.

For example, crawling the OpenLibrary API for a handful of works surfaces
each work's authors as `authors.author.key` entries like
`/authors/OL26320A` (while correctly leaving out `authors.type.key`, a
constant `/type/author_role` tag on every entry that isn't actually worth
crawling):

```bash
npx @zod-crawler/cli \
  --ids "OL27448W,OL1168083W" \
  --url-template "https://openlibrary.org/works/{id}.json" \
  --output ./works \
  --emit-crawl-candidates

grep '^/authors/' ./works/crawl-candidates.txt > ./authors-to-crawl.txt

npx @zod-crawler/cli \
  --ids-file ./authors-to-crawl.txt \
  --url-template "https://openlibrary.org{id}.json" \
  --output ./authors
```

(Note the second `--url-template` has no `/` before `{id}`: the discovered
values already start with one, since that's how they appeared in the raw
JSON.) `crawl-candidates.txt` never includes this run's own seed ids, or
anything already sitting in this output dir's `cache/` from a previous run.

## Advanced queuing (optional)

By default, fetches run one at a time, `--delay` milliseconds apart, with no
retries - a failed fetch is logged and skipped (unless `--stop-on-error` is
set). Passing `--redis-url` (or setting `REDIS_URL`) switches to a
[BullMQ](https://bullmq.io)-backed queue instead, which adds:

- **Retries with backoff** for transient failures (429, 5xx, network
  errors) - up to 3 attempts, exponential backoff. A permanent failure
  (any other 4xx, e.g. 404 or 403) is still skipped immediately, no retries.
- **Concurrency** via `--concurrency` (default `1`, same pacing as the
  default queue unless raised).
- **Per-domain cooldowns**: `--delay` becomes a per-domain pace instead of a
  global one when ids are full URLs spanning multiple hosts (no
  `--url-template`, or ids fetched from `--emit-crawl-candidates` output) -
  each host gets its own independent `--delay`-spaced cooldown instead of
  all requests sharing one clock. Ids used with `--url-template` all hit the
  same host regardless, so they still share one cooldown bucket - identical
  pacing to the default queue.

`--redis-url`/`REDIS_URL` name the wire protocol
[BullMQ](https://bullmq.io)/[ioredis](https://github.com/redis/ioredis)
speak, not a recommendation to run Redis itself. Run
[Valkey](https://valkey.io) instead: since March 2024 Redis has shipped
under the RSALv2/SSPLv1 dual license, neither of which is OSI-approved open
source, while Valkey is the Linux Foundation-governed, community-maintained
fork that stayed on the original BSD-3-Clause license Redis used through
to version 7.2 - a drop-in, wire-compatible replacement, so nothing here needs
to know the difference.

Via `npx @zod-crawler/cli`, this requires installing BullMQ's client
libraries yourself, since they're optional peer dependencies (not pulled in
by default):

```bash
npm install bullmq ioredis
```

```bash
docker run -d --rm -p 6379:6379 valkey/valkey:8-alpine

npx @zod-crawler/cli \
  --ids "1,2,3" \
  --url-template "https://example.com/items/{id}" \
  --output ./out \
  --redis-url redis://localhost:6379 \
  --concurrency 4
```

The default `figulusproject/zod-crawler-cli` Docker image already bundles
`bullmq`/`ioredis` and a background Valkey server, with `REDIS_URL` preset
to it, so advanced queuing works with no setup:

```bash
docker run --rm -v "$(pwd)/out:/out" figulusproject/zod-crawler-cli \
  --ids "1,2,3" \
  --url-template "https://example.com/items/{id}" \
  --output /out \
  --concurrency 4
```

That Valkey instance isn't persisted across container restarts, which is
fine for a single run. For a Redis/Valkey instance shared across multiple
runs, use the smaller `figulusproject/zod-crawler-cli:slim` tag instead
and pass `--redis-url`/`REDIS_URL` yourself - it has no bundled Valkey and
falls back to the default sequential queue if neither is set.

## How it works

This is a thin wrapper around [`@zod-crawler/core`](../../packages/core).
It fetches each id, caching raw responses to disk and resuming from cache
on re-runs, merges the samples' shapes to infer a Zod schema, validates
every cached sample against that schema in-process, and writes the result.
See that package's README for the underlying inference engine.

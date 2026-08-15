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

Writes an inferred `./out/schema.ts` from the fetched samples. See [CLI](cli.md) for the full flag list and caching behavior, or [Web](web.md) for a browser UI instead.

## Zod compatibility

Designed for Zod v4 natively, not backwards-compatible with Zod v3 (uses new `z.uuid()`, `z.url()`, `z.int()`, etc syntax).

## Pick a starting point

- [`@zod-crawler/cli`](cli.md): a full-featured CLI tool
- [`@zod-crawler/web`](web.md): a Docker-deployed single-page UI for the same pipeline
- [Demo](demo.md): a browser-only version of the Web UI, no server required
- [`@zod-crawler/core`](core-usage.md): the schema-inference engine both of the above wrap, usable directly from other ECMAScript projects

## Once you're up and running

- [Flags](flags.md): the CLI's full flag reference
- [Crawling further](crawling-further.md): discovering and feeding in ids to fetch next
- [Advanced queuing](advanced-queuing.md): BullMQ/Valkey-backed retries, concurrency, and per-domain cooldowns
- [Development](development.md): working on this repo itself

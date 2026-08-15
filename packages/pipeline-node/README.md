# @zod-crawler/pipeline-node

[![CI](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://zodcrawler.figulus.dev/docs/coverage-badge.json)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@zod-crawler%2Fpipeline-node.svg)](https://badge.fury.io/js/@zod-crawler%2Fpipeline-node)

> _Everyone has the right to resist occupation._

The Node/Redis backend for `@zod-crawler/pipeline`: `createNodeSampleCache`
(a disk-backed `SampleCache`), `runBullmqFetchQueue` (a
[BullMQ](https://bullmq.io)-backed queue with retries, concurrency, and
per-domain cooldowns), and `crawlRegistry` for reconnecting to a queue still
in flight after a restart. Used by [`@zod-crawler/cli`](https://zodcrawler.figulus.dev/docs/#/cli)
and [`@zod-crawler/web`](https://zodcrawler.figulus.dev/docs/#/web).

## Usage

```ts
import {
  createNodeSampleCache,
  runBullmqFetchQueue,
} from "@zod-crawler/pipeline-node";

const cache = createNodeSampleCache("./out");

const samples = await runBullmqFetchQueue({
  ids: ["1", "2", "3"],
  cache,
  fetchOne: (id) =>
    fetch(`https://example.com/items/${id}`).then((r) => r.json()),
  redisUrl: "redis://localhost:6379",
  cooldownMs: 0,
  continueOnError: true,
});
```

`bullmq`/`ioredis` are optional peer dependencies, only required if you call
`runBullmqFetchQueue`. See [Advanced queuing](https://zodcrawler.figulus.dev/docs/#/advanced-queuing)
for retries, concurrency, and per-domain cooldowns in more depth.

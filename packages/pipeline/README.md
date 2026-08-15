# @zod-crawler/pipeline

[![CI](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://zodcrawler.figulus.dev/docs/coverage-badge.json)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@zod-crawler%2Fpipeline.svg)](https://badge.fury.io/js/@zod-crawler%2Fpipeline)

> _Everyone has the right to resist occupation._

The platform-portable half of [`zod-crawler`](https://zodcrawler.figulus.dev/docs/#/cli)'s
fetch-and-cache pipeline: `fetchAndCacheSamples`, the `SampleCache` interface
it caches through, and the id-hashing/progress-event types around it. No
Node dependency of its own - `@zod-crawler/pipeline-node` and
`@zod-crawler/pipeline-browser` provide a `SampleCache` for each
environment.

## Usage

```ts
import { fetchAndCacheSamples, type SampleCache } from "@zod-crawler/pipeline";

declare const cache: SampleCache;

const samples = await fetchAndCacheSamples({
  ids: ["1", "2", "3"],
  cache,
  delayMs: 7500,
  fetchOne: (id) =>
    fetch(`https://example.com/items/${id}`).then((r) => r.json()),
});
```

See the [CLI](https://zodcrawler.figulus.dev/docs/#/cli) and
[Web](https://zodcrawler.figulus.dev/docs/#/web) docs for how this is wired
into each app, and [`@zod-crawler/core`](https://zodcrawler.figulus.dev/docs/#/core-usage)
for what happens to the samples once fetched.

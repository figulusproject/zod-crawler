# @zod-crawler/pipeline-browser

[![CI](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://zodcrawler.figulus.dev/docs/coverage-badge.json)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@zod-crawler%2Fpipeline-browser.svg)](https://badge.fury.io/js/@zod-crawler%2Fpipeline-browser)

> _Everyone has the right to resist occupation._

The browser backend for `@zod-crawler/pipeline`: `createCacheApiSampleCache`
(a `SampleCache` backed by the Cache API) and `createBrowserUrlFetcher` (a
`fetch`-based fetcher that retries through a CORS proxy only when a direct
request throws). Runs the whole crawl pipeline client-side with no server -
see it in use at [zodcrawler.figulus.dev/demo](https://zodcrawler.figulus.dev/demo).

## Usage

```ts
import {
  createCacheApiSampleCache,
  createBrowserUrlFetcher,
} from "@zod-crawler/pipeline-browser";
import { fetchAndCacheSamples } from "@zod-crawler/pipeline";

const cache = createCacheApiSampleCache();
const fetchOne = createBrowserUrlFetcher();

const samples = await fetchAndCacheSamples({
  ids: ["1", "2", "3"],
  cache,
  delayMs: 7500,
  fetchOne: (id) => fetchOne(`https://example.com/items/${id}`),
});
```

See the [Web](https://zodcrawler.figulus.dev/docs/#/web) docs for the
equivalent server-backed app this runs entirely in-browser.

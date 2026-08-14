# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `@zod-crawler/pipeline`: a new package, split out of `@zod-crawler/core`, holding the platform-portable half of the crawl pipeline (`fetchAndCacheSamples`, the `SampleCache` interface, `hashId`, `hasCachedSample`, `fetchProgressEvent`) with zero Node dependency of its own.
- `@zod-crawler/pipeline-node`: a new package holding the Node/Redis backend (`createNodeSampleCache`, `runBullmqFetchQueue`, `domainCooldownGate`, `redisConnection`, `crawlRegistry`), depending on `@zod-crawler/pipeline`. `apps/cli` and `apps/web`'s server now branch on `redisUrl` themselves to pick `fetchAndCacheSamples` or `runBullmqFetchQueue`, instead of that branch living inside a single fetch function.
- `@zod-crawler/pipeline-browser`: a new package with `createCacheApiSampleCache`, a browser `SampleCache` backed by the Cache API, and `createBrowserUrlFetcher`, a `fetch`-based fetcher that retries through a CORS proxy only when a direct request throws (network/CORS failure), remembering per-job which origins already needed the proxy.
- `apps/web-demo`: a new client-only Vite/React app rendering the same `CrawlForm`/`JobList`/`JobDetail` as `apps/web`, running a full crawl (`fetchAndCacheSamples` -> `inferSchema` -> `validateSamples` -> `findCrawlCandidates`) entirely in a browser Web Worker with no server, using `@zod-crawler/pipeline-browser`'s cache and fetcher and `prettier/standalone` for formatting. Deployed at https://zodcrawler.figulus.dev/demo. A crawl doesn't survive a page refresh (no SSE/job registry, unlike `apps/web`) - a refresh just restarts.
- `@zod-crawler/components`: a new shared shadcn/Tailwind UI package holding the UI and crawl components moved out of `apps/web`, so `apps/web` and `apps/web-demo` render from the same components.
- `tools/cors-proxy`: a self-hosted CORS proxy at `zodcrawler.figulus.dev/proxy` that the demo falls back to when a target API doesn't allow direct cross-origin fetches, rate-limited per IP and capped daily.
- `tools/site-router`: routes `zodcrawler.figulus.dev`'s docs, the new demo, and everything else to the right place.

## [1.1.0] - 2026-08-12

### Added

- `@zod-crawler/core`: `fetchAndCacheSamples` accepts an optional `redisUrl`, switching fetches to a [BullMQ](https://bullmq.io)-backed queue instead of the plain sequential one. Adds retries with exponential backoff for transient failures (429, 5xx, network errors), immediate skip-without-retry for permanent ones (any other 4xx, e.g. 404/403), a `concurrency` option, and per-domain cooldowns shared across every concurrent crawl hitting that domain (one clock per host, not one per crawl, and different hosts still don't wait on each other). `bullmq`/`ioredis` are optional peer dependencies, dynamically imported only when `redisUrl` is set, so the default queue never requires them.
- `@zod-crawler/cli`: `--redis-url`/`REDIS_URL` and `--concurrency` flags, wiring the above into the CLI. Requires `npm install bullmq ioredis` yourself - not included in the published Docker image. The flag/env var name the wire protocol BullMQ/ioredis speak, not a recommendation to run Redis itself - [Valkey](https://valkey.io) is the recommended, drop-in-compatible server (see the CLI README's "Advanced queuing" section for why).
- `@zod-crawler/web`: a `REDIS_URL` environment variable (alongside the existing `PORT`) switches every crawl on that server instance to the same BullMQ-backed queue. Same optional-install/Valkey recommendation as the CLI.
- Docker images: both `figulusproject/zod-crawler-web` and `figulusproject/zod-crawler-cli` now publish two tags each. The default (`latest`, `<version>`) bundles `bullmq`/`ioredis` plus a background Valkey server with `REDIS_URL` preset to it, so retries/concurrency/per-domain cooldowns work out of the box with no external setup - its queue data isn't persisted across container restarts. The `slim`-tagged variant is the same image without the bundled Valkey (smaller), for pointing `REDIS_URL`/`--redis-url` at your own persistent instance instead.
- `@zod-crawler/web`: with `REDIS_URL` set, the server now survives a restart mid-crawl. Each crawl registers itself in Redis and gets a BullMQ queue name derived from its own job id instead of a random one, so on startup the server reconnects to any queue still in flight from before it last stopped rather than losing that work. A new `CACHE_DIR` environment variable makes the on-disk sample cache durable across restarts too (point it at a named or mounted volume), so a resumed crawl only re-fetches whatever was still outstanding; without it, resume still reconnects the queue but re-fetches everything, since the default cache directory doesn't survive a container restart on its own.
- `@zod-crawler/web`: the client now tracks multiple crawl jobs at once instead of just the most recent one. A sidebar lists every active or recently-finished job, with a pinned "New crawl" action so another can be started while one's still running, and a new `GET /api/crawls` endpoint lets the page reconnect to and catch up on every still-running or recently-finished job after a refresh, including per-id progress that already completed before the reconnect.
- `@zod-crawler/cli`: a `--detach`/`-d` flag runs the crawl as a background process and returns immediately, printing its pid, output directory, and a log file path (`<output>/zod-crawler.log`) capturing everything it would otherwise print to the terminal. There's no subcommand yet to check on a detached run's status - the pid/log/output directory printed at start are the only way to check on it for now.
- `@zod-crawler/core`: `crawlCandidatesToTxt`/`crawlCandidatesToJson`/`crawlCandidatesToYaml`/`crawlCandidatesToCsv`, converting a `CrawlCandidateField[]` into each of those formats, and the matching read side - `parseIdsFromTxt`/`parseIdsFromJson`/`parseIdsFromYaml`/`parseIdsFromCsv` and `crawlCandidatesFormatFromExtension` - which flattens any of the four back into a single id list with no per-field distinction.
- `@zod-crawler/web`: the crawl candidates list gains global and per-field select-all/select-none controls, and a save-to-file button (`txt`/JSON/YAML/CSV) for the current selection, instead of only being re-feedable back into the ids field.
- `@zod-crawler/cli`: `--crawl-candidates-format` (`txt`/`json`/`yaml`/`csv`, default `txt`) picks the format `--emit-crawl-candidates` writes its file in. Only valid alongside `--emit-crawl-candidates`.
- `@zod-crawler/cli`: `--ids-file` now accepts `.json`, `.yaml`/`.yml`, and `.csv` in addition to `.txt`, sniffed from the file's extension, so a crawl candidates file written in any of those formats can be fed straight back in.
- `@zod-crawler/web`: an "Upload file" control next to the ids field accepts a `.txt`/`.json`/`.yaml`/`.yml`/`.csv` file and merges its ids into the field, same formats as above.
- Docs: a docsify-based documentation site under `docs/`, published at https://zodcrawler.figulus.dev, with dedicated pages for CLI/Web/Core usage, the full flag reference, crawling further, advanced queuing, and repo development.
- Dev: test coverage tracking via vitest and `@vitest/coverage-v8` (`npm run coverage`), enforced as CI thresholds (95% statements/lines, 93% functions, 90% branches), plus a coverage badge alongside the CI/npm badges, auto-updated on pushes to `main`.

### Changed

- `@zod-crawler/cli`: upgraded to `zod-cli-flags@1.0.2`. The `Usage:` line printed on invalid arguments is now generated from the flag declarations instead of a separately hand-maintained string, so it can't drift out of sync with the actual flags - it can't yet express "exactly one of `--ids`/`--ids-file`" as a group like the old string did ([zod-cli-flags#7](https://github.com/figulusproject/zod-cli-flags/issues/7)).
- `@zod-crawler/cli`, `@zod-crawler/web`, `@zod-crawler/core`, and the root README now link out to the docs site above for flags, Docker/advanced-queuing setup, and other details instead of duplicating them, so each README stays brief.
- `@zod-crawler/cli`'s `--delay` and `@zod-crawler/web`'s `delayMs` now enforce a 100ms minimum instead of allowing 0, which disabled fetch pacing entirely.

## [1.0.1] - 2026-08-09

### Changed

- A failed fetch (a non-2xx response, a network error, etc.) is now a soft failure by default: it's logged and the run continues with the rest of the ids, instead of aborting the whole crawl. Previously any failed fetch aborted the entire run. Use `continueOnError: false` (core), `--stop-on-error` (CLI), or the web app's toggle to restore that behavior.

## [1.0.0] - 2026-08-08

### Changed

- First stable release - no functional changes from `0.1.0`.

### Fixed

- `apps/cli` Docker image: `npm run build` also built `@zod-crawler/web`, which the image's build context never copied in, failing with `TS5083: Cannot read file 'apps/web/tsconfig.server.json'`. The build now runs `tsc -b apps/cli`, scoped to `apps/cli` and its `packages/core` reference.

## [0.1.0] - 2026-08-08

### Added

- `@zod-crawler/core`: `inferSchema(samples, schemaName, useZodTransformers?)`, a pure function that infers a Zod v4 schema from a set of sampled JSON values. Merges differently-shaped samples, and detects optional fields, enums/literals, coerced dates (including multi-date lists), safe-int-vs-bigint, and path-shaped reference-key prefixes (`z.string().startsWith(...)`). The optional third argument switches generated empty-string-as-undefined fields to import `emptyStringAsUndefined` from [`zod-transformers`](https://www.npmjs.com/package/zod-transformers) instead of inlining the equivalent union.
- `@zod-crawler/core`: `evalGeneratedSchema`/`validateSamples`, an in-process round-trip validator (`new Function`-based, no subprocess) for the schema source `inferSchema` produces.
- `@zod-crawler/core`: `findCrawlCandidates(samples)`, which finds fields worth fetching next by reusing the same reference-detection heuristics behind `startsWith(...)`. A field identical across every sample is excluded automatically as a constant, not a crawl target.
- `@zod-crawler/core`: `fetchAndCacheSamples`/`createUrlFetcher`/`hasCachedSample`, the shared fetch/cache pipeline behind both the CLI and web app. Caches raw responses to disk keyed by a content hash of each id/URL, resumes from cache on re-runs, and reports progress through an injectable `onProgress` callback so each caller can render it its own way (console output for the CLI, SSE messages for the web app).
- `@zod-crawler/cli` (`zod-crawler` on the command line): fetches a set of JSON API responses via a pluggable fetcher, caches them to disk (resuming from cache on re-runs, keyed by a content hash of each id/URL), and writes the inferred, Prettier-formatted schema plus a validation summary. Flags: `--ids`/`--ids-file`, `--output`, `--url-template`, `--delay`, `--schema-name`, `--emit-crawl-candidates`, `--zod-transformers`. Arguments are parsed with [`zod-cli-flags`](https://github.com/figulusproject/zod-cli-flags).
- `@zod-crawler/web`: a Docker-deployed single-page UI for the same crawl pipeline (Vite/React/shadcn client, Express server), streaming live per-id fetch progress over Server-Sent Events instead of blocking on one request. Submits ids/URL template/delay/schema name/flags to `POST /api/crawl`, then follows `GET /api/crawl/:jobId/events` for progress, the generated schema, validation results, and crawl candidates.
- CI workflow (`ci.yml`): runs typecheck, tests, and format checks on push/PR across Node 20/22/24.

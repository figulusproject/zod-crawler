# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-08-08

### Added

- `@zod-crawler/core`: `inferSchema(samples, schemaName, useZodTransformers?)`, a pure function that infers a Zod v4 schema from a set of sampled JSON values. Merges differently-shaped samples, and detects optional fields, enums/literals, coerced dates (including multi-date lists), safe-int-vs-bigint, and path-shaped reference-key prefixes (`z.string().startsWith(...)`). The optional third argument switches generated empty-string-as-undefined fields to import `emptyStringAsUndefined` from [`zod-transformers`](https://www.npmjs.com/package/zod-transformers) instead of inlining the equivalent union.
- `@zod-crawler/core`: `evalGeneratedSchema`/`validateSamples`, an in-process round-trip validator (`new Function`-based, no subprocess) for the schema source `inferSchema` produces.
- `@zod-crawler/core`: `findCrawlCandidates(samples)`, which finds fields worth fetching next by reusing the same reference-detection heuristics behind `startsWith(...)`. A field identical across every sample is excluded automatically as a constant, not a crawl target.
- `@zod-crawler/core`: `fetchAndCacheSamples`/`createUrlFetcher`/`hasCachedSample`, the shared fetch/cache pipeline behind both the CLI and web app. Caches raw responses to disk keyed by a content hash of each id/URL, resumes from cache on re-runs, and reports progress through an injectable `onProgress` callback so each caller can render it its own way (console output for the CLI, SSE messages for the web app).
- `@zod-crawler/cli` (`zod-crawler` on the command line): fetches a set of JSON API responses via a pluggable fetcher, caches them to disk (resuming from cache on re-runs, keyed by a content hash of each id/URL), and writes the inferred, Prettier-formatted schema plus a validation summary. Flags: `--ids`/`--ids-file`, `--output`, `--url-template`, `--delay`, `--schema-name`, `--emit-crawl-candidates`, `--zod-transformers`. Arguments are parsed with [`zod-cli-flags`](https://github.com/figulusproject/zod-cli-flags).
- `@zod-crawler/web`: a Docker-deployed single-page UI for the same crawl pipeline (Vite/React/shadcn client, Express server), streaming live per-id fetch progress over Server-Sent Events instead of blocking on one request. Submits ids/URL template/delay/schema name/flags to `POST /api/crawl`, then follows `GET /api/crawl/:jobId/events` for progress, the generated schema, validation results, and crawl candidates.
- CI workflow (`ci.yml`): runs typecheck, tests, and format checks on push/PR across Node 20/22/24.

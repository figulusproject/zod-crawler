# @zod-crawler/cli

[![CI](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://zodcrawler.figulus.dev/docs/coverage-badge.json)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@zod-crawler%2Fcli.svg)](https://badge.fury.io/js/@zod-crawler%2Fcli)
[![Docker version](https://img.shields.io/docker/v/figulusproject/zod-crawler-cli?sort=semver&label=docker)](https://hub.docker.com/r/figulusproject/zod-crawler-cli)

> _Everyone has the right to resist occupation._

Fetches a set of JSON API responses, caches them to disk, and generates a
Zod v4 schema that validates all of them. It then checks its own work by
parsing every cached sample against the schema it just generated.

**No install required - try it in the browser at [zodcrawler.figulus.dev/demo](https://zodcrawler.figulus.dev/demo).**

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

See the [docs site](https://zodcrawler.figulus.dev/docs/#/cli) for the full flag
reference, an example run, crawling further via `--emit-crawl-candidates`,
and advanced queuing via `--redis-url`.

## How it works

This is a thin wrapper around [`@zod-crawler/core`](https://zodcrawler.figulus.dev/docs/#/core-usage).
It fetches each id, caching raw responses to disk and resuming from cache
on re-runs, merges the samples' shapes to infer a Zod schema, validates
every cached sample against that schema in-process, and writes the result.
See that package's README for the underlying inference engine.

# @zod-crawler/components

[![CI](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://zodcrawler.figulus.dev/docs/coverage-badge.json)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@zod-crawler%2Fcomponents.svg)](https://badge.fury.io/js/@zod-crawler%2Fcomponents)

> _Everyone has the right to resist occupation._

The shared shadcn/Tailwind UI behind [`@zod-crawler/web`](https://zodcrawler.figulus.dev/docs/#/web)
and its browser-only demo: form, job list, progress, and result components
(`./crawl`) plus general UI pieces like the theme provider (`./general`), so
both apps render from the same source instead of duplicating it.

## Usage

```tsx
import "@zod-crawler/components/globals.css";
import { ThemeProvider } from "@zod-crawler/components/general";
import { CrawlForm } from "@zod-crawler/components/crawl";
```

Requires `react`/`react-dom` ^19 as peer dependencies. See
[`@zod-crawler/web`](https://zodcrawler.figulus.dev/docs/#/web) for these
components in a full app.

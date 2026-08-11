# @zod-crawler/core

[![CI](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@zod-crawler%2Fcore.svg)](https://badge.fury.io/js/@zod-crawler%2Fcore)

> _Everyone has the right to resist occupation._

The schema-inference engine behind [`zod-crawler`](../../apps/cli). Give it
a set of JSON samples and it infers a Zod v4 schema that fits all of them.
Pure functions, no I/O: fetching and caching samples is the CLI's job, not
this package's.

## Usage

```ts
import { inferSchema } from "@zod-crawler/core";

const samples = {
  a: { id: 1, status: "active", title: "Hello" },
  b: { id: 2, status: "archived", title: "World", note: "optional field" },
};

const source = inferSchema(samples, "MySchema");
```

```ts
import { z } from "zod";

const strOrUndefined = z
  .union([
    z.string().min(1),
    z
      .string()
      .length(0)
      .transform(() => undefined),
  ])
  .optional();

export const MySchema = z.object({
  id: z.int(),
  status: z
    .string()
    .toLowerCase()
    .pipe(z.enum(["active", "archived"])),
  title: z.string(),
  note: strOrUndefined,
});
```

The keys of the `samples` object (`a`, `b` above) are arbitrary sample ids.
They're only used to scope per-field optionality and enum/date detection
across the sampled instances, and never show up in the generated schema.

See the [docs site](/docs/core-usage.md) for the `useZodTransformers` option,
what field types `inferSchema` detects, finding what to crawl next via
`findCrawlCandidates`, and the rest of the package's exports.

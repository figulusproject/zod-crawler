# @zod-crawler/core

[![CI](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-crawler/actions/workflows/ci.yml)
[![NPM version](https://badge.fury.io/js/@zod-crawler/core.svg)](http://badge.fury.io/js/@zod-crawler/core)

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
across the sampled instances; they never show up in the generated schema.

`inferSchema` takes an optional third argument, `useZodTransformers`
(default `false`). When `true`, fields that would otherwise inline an
empty-string-as-undefined union (like `strOrUndefined` above) instead
import `emptyStringAsUndefined` from
[`zod-transformers`](https://www.npmjs.com/package/zod-transformers):

```ts
const source = inferSchema(samples, "MySchema", true);
```

```ts
import { z } from "zod";
import { emptyStringAsUndefined } from "zod-transformers";

const strOrUndefined = emptyStringAsUndefined(z.string().min(1)).optional();

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

Whichever mode generates it, the schema file itself only ever needs `zod`
(and `zod-transformers`, if enabled) as a dependency of the project that
consumes it.

## What it detects

Beyond basic type inference, `inferSchema` looks across all your samples to
detect:

- **Optional fields**: a key missing from at least one sample becomes `.optional()` (or `strOrUndefined` for plain strings, since APIs often send `""` instead of omitting a key).
- **Enums and literals**: a string field with a small, closed set of repeated values becomes `z.enum([...])`; a field that's identical across every sample becomes `z.literal(...)`.
- **Dates**: recognizable date-shaped strings become `z.coerce.date()`, including fields that occasionally pack multiple dates into one comma-separated string.
- **Bigints**: numeric strings or JSON numbers that exceed `Number.MAX_SAFE_INTEGER` become `z.coerce.bigint()` instead of silently losing precision.
- **Reference-key prefixes**: a field where every value is a path-shaped string (starts with `/`) becomes `z.string().startsWith(...)` scoped to the shared prefix, rather than an overfit enum of the specific values seen so far.

## Finding what to crawl next

`inferSchema` only visits the ids you give it; it doesn't crawl on its own.
`findCrawlCandidates` finds fields worth fetching next, so you can review
them and feed them into another run:

```ts
import { findCrawlCandidates } from "@zod-crawler/core";

findCrawlCandidates(samples);
// [{ path: "authors.author.key", values: ["/authors/OL26320A", "/authors/OL118077A"] }]
```

It reuses the same reference-detection heuristics behind `startsWith(...)`
above: a field is a candidate if every observed value is either an absolute
URL, or a path-shaped `/`-prefixed reference with enough variation that it
wasn't collapsed into a single constant. A field that's identical across
every sample (a fixed taxonomy tag that happens to look like a path, say)
is excluded automatically, since schema detection already tagged it a
literal rather than a reference. See the CLI's `--emit-crawl-candidates`
flag for the actual review-and-feed-back-in loop.

## Other exports

`inferSchema` composes the rest of the package's exports. They're
available individually if you need finer control:

- `rawValueToSchemaJson`, `sortKeys`: turn a raw JSON value into the internal schema-JSON representation this package operates on.
- `mergeSchemaValues`, `deepMerge`: merge two schema-JSON values, producing a union where they disagree.
- `detectLiteralsAndEnumsRecursive`, `applyOptionalKeySuffixRecursive`, `resolveStringFieldSchema`, `resolveIntFieldSchema`, `getOptionalKeysAtPath`: the detection heuristics described above.
- `convertToZod`, `generateZodSchema`: turn a schema-JSON value into Zod source text.
- `evalGeneratedSchema`: turns generated source back into a live `z.ZodTypeAny`, in-process (via `new Function`, not a subprocess). Depends on `convertToZod`'s exact output shape, so call it with the raw string `inferSchema` returned, not a reformatted copy.
- `validateSamples`: the round-trip counterpart to `inferSchema`. Given generated source and a samples object, reports a `Map` of sample id to `ZodError | null`.
- `findCrawlCandidates`: described above.
- `collectStringValuesAtPath`: the raw-value lookup `findCrawlCandidates` and `resolveStringFieldSchema` both use internally.

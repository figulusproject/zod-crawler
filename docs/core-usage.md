# @zod-crawler/core usage

The schema-inference engine behind [the CLI](cli.md) and [the web app](web.md). Give it a set of JSON samples and it infers a Zod v4 schema that fits all of them. Pure functions, no I/O: fetching and caching samples is the CLI/web app's job, not this package's.

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

The keys of the `samples` object (`a`, `b` above) are arbitrary sample ids. They're only used to scope per-field optionality and enum/date detection across the sampled instances, and never show up in the generated schema.

`inferSchema` takes an optional third argument, `useZodTransformers` (default `false`). When `true`, fields that would otherwise inline an empty-string-as-undefined union (like `strOrUndefined` above) instead import `emptyStringAsUndefined` from [`zod-transformers`](https://github.com/figulusproject/zod-transformers):

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

Whichever mode generates it, the schema file itself only ever needs `zod` (and `zod-transformers`, if enabled) as a dependency of the project that consumes it.

## What it detects

Beyond basic type inference, `inferSchema` looks across all your samples to detect:

- **Optional fields**: a key missing from at least one sample becomes `.optional()` (or `strOrUndefined` for plain strings, since APIs often send `""` instead of omitting a key).
- **Enums and literals**: a string field with a small, closed set of repeated values becomes `z.enum([...])`, and a field that's identical across every sample becomes `z.literal(...)`.
- **Dates**: recognizable date-shaped strings become `z.coerce.date()`, including fields that occasionally pack multiple dates into one comma-separated string.
- **Bigints**: numeric strings or JSON numbers that exceed `Number.MAX_SAFE_INTEGER` become `z.coerce.bigint()` instead of silently losing precision.
- **Reference-key prefixes**: a field where every value is a path-shaped string (starts with `/`) becomes `z.string().startsWith(...)` scoped to the shared prefix, rather than an overfit enum of the specific values seen so far. See [Crawling further](crawling-further.md) for how these fields double as crawl candidates.

## Other exports

`inferSchema` composes the rest of the package's exports. They're available individually if you need finer control:

- `rawValueToSchemaJson`, `sortKeys`: turn a raw JSON value into the internal schema-JSON representation this package operates on.
- `mergeSchemaValues`, `deepMerge`: merge two schema-JSON values, producing a union where they disagree.
- `detectLiteralsAndEnumsRecursive`, `applyOptionalKeySuffixRecursive`, `resolveStringFieldSchema`, `resolveIntFieldSchema`, `getOptionalKeysAtPath`: the detection heuristics described above.
- `convertToZod`, `generateZodSchema`: turn a schema-JSON value into Zod source text.
- `evalGeneratedSchema`: turns generated source back into a live `z.ZodTypeAny`, in-process (via `new Function`, not a subprocess). Depends on `convertToZod`'s exact output shape, so call it with the raw string `inferSchema` returned, not a reformatted copy.
- `validateSamples`: the round-trip counterpart to `inferSchema`. Given generated source and a samples object, reports a `Map` of sample id to `ZodError | null`.
- `findCrawlCandidates`: see [Crawling further](crawling-further.md).
- `collectStringValuesAtPath`: the raw-value lookup `findCrawlCandidates` and `resolveStringFieldSchema` both use internally.

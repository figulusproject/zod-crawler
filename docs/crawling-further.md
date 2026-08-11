# Crawling further

`--ids`/`--ids-file` is a fixed list - the [CLI](cli.md) doesn't crawl on its own. `--emit-crawl-candidates` gets you most of the way there: it looks at the samples you just fetched for fields worth fetching next (an id/URL that varies from sample to sample, not a fixed constant) and writes them to `crawl-candidates.txt`, one per line, in the same format `--ids-file` reads. Review the list, delete anything you don't want, and feed it back in for the next hop.

For example, crawling the OpenLibrary API for a handful of works surfaces each work's authors as `authors.author.key` entries like `/authors/OL26320A` (while correctly leaving out `authors.type.key`, a constant `/type/author_role` tag on every entry that isn't actually worth crawling):

```bash
npx @zod-crawler/cli \
  --ids "OL27448W,OL1168083W" \
  --url-template "https://openlibrary.org/works/{id}.json" \
  --output ./works \
  --emit-crawl-candidates

grep '^/authors/' ./works/crawl-candidates.txt > ./authors-to-crawl.txt

npx @zod-crawler/cli \
  --ids-file ./authors-to-crawl.txt \
  --url-template "https://openlibrary.org{id}.json" \
  --output ./authors
```

(Note the second `--url-template` has no `/` before `{id}`: the discovered values already start with one, since that's how they appeared in the raw JSON.) `crawl-candidates.txt` never includes this run's own seed ids, or anything already sitting in this output dir's `cache/` from a previous run.

## Under the hood

[`@zod-crawler/core`](core-usage.md) exports the underlying `findCrawlCandidates` function directly, for use outside the CLI:

```ts
import { findCrawlCandidates } from "@zod-crawler/core";

findCrawlCandidates(samples);
// [{ path: "authors.author.key", values: ["/authors/OL26320A", "/authors/OL118077A"] }]
```

It reuses the same reference-detection heuristics behind schema inference's `startsWith(...)` fields: a field is a candidate if every observed value is either an absolute URL, or a path-shaped `/`-prefixed reference with enough variation that it wasn't collapsed into a single constant. A field that's identical across every sample (a fixed taxonomy tag that happens to look like a path, say) is excluded automatically, since schema detection already tagged it a literal rather than a reference.

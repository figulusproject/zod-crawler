import { hashId } from "./hashId.js";
import type { SampleCache } from "./sampleCache.js";

// Exposed so callers outside the fetch loop (the crawl-candidates filter) can check cache membership using the same cache instance the fetch itself used, without needing the value. Works against any SampleCache implementation - it only ever calls get().
export async function hasCachedSample(
  cache: SampleCache,
  id: string,
): Promise<boolean> {
  return (await cache.get(await hashId(id))) !== undefined;
}

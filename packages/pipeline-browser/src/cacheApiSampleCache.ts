import type { SampleCache } from "@zod-crawler/pipeline";

const CACHE_NAME = "zod-crawler-samples-v1";

// The Cache API only stores Request/Response pairs, not arbitrary key/value data - a fixed same-origin synthetic URL namespace keyed by the sample key is enough, since nothing ever fetches these URLs.
function requestFor(key: string): string {
  return `https://zod-crawler.local/samples/${encodeURIComponent(key)}`;
}

// A SampleCache backed by the browser's Cache API - persists across page reloads and new tabs, same get/set shape as @zod-crawler/pipeline-node's createNodeSampleCache.
export function createCacheApiSampleCache(): SampleCache {
  return {
    async get(key) {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(requestFor(key));
      return response ? await response.text() : undefined;
    },
    async set(key, value) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(requestFor(key), new Response(value));
    },
  };
}

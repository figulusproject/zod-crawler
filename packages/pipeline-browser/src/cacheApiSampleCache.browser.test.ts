import { hashId } from "@zod-crawler/pipeline";
import { afterEach, describe, expect, it } from "vitest";
import { createCacheApiSampleCache } from "./cacheApiSampleCache.js";

const CACHE_NAME = "zod-crawler-samples-v1";

describe("createCacheApiSampleCache (browser)", () => {
  afterEach(async () => {
    await caches.delete(CACHE_NAME);
  });

  it("returns undefined for a key that was never set", async () => {
    const cache = createCacheApiSampleCache();
    expect(await cache.get("missing")).toBeUndefined();
  });

  it("round-trips a value written by set", async () => {
    const cache = createCacheApiSampleCache();
    await cache.set("key", '{"a":1}');
    expect(await cache.get("key")).toBe('{"a":1}');
  });

  it("stores the entry in browser Cache Storage, not just an in-memory wrapper", async () => {
    const cache = createCacheApiSampleCache();
    await cache.set("key", "value");

    const storage = await caches.open(CACHE_NAME);
    const response = await storage.match(
      "https://zod-crawler.local/samples/key",
    );
    expect(await response?.text()).toBe("value");
  });

  it("agrees with hashId's key scheme, so callers using @zod-crawler/pipeline's hasCachedSample see the same entries", async () => {
    const cache = createCacheApiSampleCache();
    await cache.set(await hashId("https://example.com/1"), "{}");
    expect(await cache.get(await hashId("https://example.com/1"))).toBe("{}");
  });
});

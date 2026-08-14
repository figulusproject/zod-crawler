import { describe, expect, it, vi } from "vitest";
import { fetchAndCacheSamples } from "./fetchAndCacheSamples.js";
import { hasCachedSample } from "./hasCachedSample.js";
import type { SampleCache } from "./sampleCache.js";

// A plain in-memory SampleCache, standing in for any real implementation (Node fs-backed, browser Cache API, ...) - fetchAndCacheSamples only ever talks to the SampleCache interface, so this is enough to exercise its own logic without depending on @zod-crawler/pipeline-node.
function createMemorySampleCache(): SampleCache {
  const store = new Map<string, string>();
  return {
    async get(key) {
      return store.get(key);
    },
    async set(key, value) {
      store.set(key, value);
    },
  };
}

describe("fetchAndCacheSamples", () => {
  it("fetches every id on a fresh run, in order", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));

    const samples = await fetchAndCacheSamples({
      ids: ["a", "b"],
      cache: createMemorySampleCache(),
      delayMs: 0,
      fetchOne,
    });

    expect(fetchOne).toHaveBeenCalledTimes(2);
    expect(fetchOne).toHaveBeenNthCalledWith(1, "a");
    expect(fetchOne).toHaveBeenNthCalledWith(2, "b");
    expect(samples).toEqual({ a: { id: "a" }, b: { id: "b" } });
  });

  it("delays between fetches, but not after the last one", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));
    const delayMs = 60;
    // Asserting on the setTimeout call count/args, not elapsed wall-clock time: under v8 coverage instrumentation on a loaded CI runner, a tight elapsed-time ceiling is flaky even though only one delay actually fires.
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    await fetchAndCacheSamples({
      ids: ["a", "b"],
      cache: createMemorySampleCache(),
      delayMs,
      fetchOne,
    });

    // One delay incurred (between "a" and "b"), not two.
    const delayCalls = setTimeoutSpy.mock.calls.filter(
      ([, ms]) => ms === delayMs,
    );
    expect(delayCalls).toHaveLength(1);

    setTimeoutSpy.mockRestore();
  });

  it("does not call fetchOne or delay on a cache hit", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));
    const cache = createMemorySampleCache();

    // First run populates the cache.
    await fetchAndCacheSamples({ ids: ["a"], cache, delayMs: 0, fetchOne });
    expect(fetchOne).toHaveBeenCalledTimes(1);

    // Second run against the same cache should hit it entirely, even with a large delay configured.
    const start = Date.now();
    const samples = await fetchAndCacheSamples({
      ids: ["a"],
      cache,
      delayMs: 5000,
      fetchOne,
    });
    const elapsed = Date.now() - start;

    expect(fetchOne).toHaveBeenCalledTimes(1); // still 1, not called again
    expect(samples).toEqual({ a: { id: "a" } });
    expect(elapsed).toBeLessThan(1000); // no 5s delay incurred
  });

  it("round-trips a bigint field to the same (string) shape on a fresh fetch and on a cache hit", async () => {
    const fetchOne = vi.fn(async () => ({ big: 12345678901234567890n }));
    const cache = createMemorySampleCache();

    const first = await fetchAndCacheSamples({
      ids: ["x"],
      cache,
      delayMs: 0,
      fetchOne,
    });
    const second = await fetchAndCacheSamples({
      ids: ["x"],
      cache,
      delayMs: 0,
      fetchOne,
    });

    expect(first.x).toEqual({ big: "12345678901234567890" });
    expect(second.x).toEqual(first.x);
    expect(fetchOne).toHaveBeenCalledTimes(1);
  });

  it("skips a failed id and continues with the rest, by default", async () => {
    const fetchOne = vi.fn(async (id: string) => {
      if (id === "b") throw new Error("boom");
      return { id };
    });

    const samples = await fetchAndCacheSamples({
      ids: ["a", "b", "c"],
      cache: createMemorySampleCache(),
      delayMs: 0,
      fetchOne,
    });

    expect(fetchOne).toHaveBeenCalledTimes(3);
    expect(samples).toEqual({ a: { id: "a" }, c: { id: "c" } });
  });

  it("stops the whole run on a failed id when continueOnError is false", async () => {
    const fetchOne = vi.fn(async (id: string) => {
      if (id === "b") throw new Error("boom");
      return { id };
    });

    await expect(
      fetchAndCacheSamples({
        ids: ["a", "b", "c"],
        cache: createMemorySampleCache(),
        delayMs: 0,
        fetchOne,
        continueOnError: false,
      }),
    ).rejects.toThrow(/Failed to fetch id "b"/);

    expect(fetchOne).toHaveBeenCalledTimes(2);
  });

  it("leaves already-fetched ids cached when a later id fails (resumability)", async () => {
    const fetchOne = vi.fn(async (id: string) => {
      if (id === "b") throw new Error("boom");
      return { id };
    });
    const cache = createMemorySampleCache();

    await expect(
      fetchAndCacheSamples({
        ids: ["a", "b"],
        cache,
        delayMs: 0,
        fetchOne,
        continueOnError: false,
      }),
    ).rejects.toThrow(/Failed to fetch id "b"/);

    // "a" was cached before "b" failed, a resumed run shouldn't refetch it.
    const resumeFetchOne = vi.fn(async (id: string) => ({ id, resumed: true }));
    await expect(
      fetchAndCacheSamples({
        ids: ["a"],
        cache,
        delayMs: 0,
        fetchOne: resumeFetchOne,
      }),
    ).resolves.toEqual({ a: { id: "a" } });
    expect(resumeFetchOne).not.toHaveBeenCalled();
  });

  it("reports progress for cache hits, fetches, and completions in order", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));
    const cache = createMemorySampleCache();
    const events: string[] = [];

    // Prime the cache for "a" so the second run below exercises the "cached" branch of the progress callback too.
    await fetchAndCacheSamples({ ids: ["a"], cache, delayMs: 0, fetchOne });

    await fetchAndCacheSamples({
      ids: ["a", "b"],
      cache,
      delayMs: 0,
      fetchOne,
      onProgress: (event) =>
        events.push(
          `${event.status} ${event.index + 1}/${event.total} ${event.id}`,
        ),
    });

    expect(events).toEqual(["cached 1/2 a", "fetching 2/2 b", "done 2/2 b"]);
  });

  it("reports an error progress event, with the error message, and moves on", async () => {
    const fetchOne = vi.fn(async (id: string) => {
      if (id === "a") throw new Error("boom");
      return { id };
    });
    const events: { status: string; error?: string }[] = [];

    const samples = await fetchAndCacheSamples({
      ids: ["a", "b"],
      cache: createMemorySampleCache(),
      delayMs: 0,
      fetchOne,
      onProgress: (event) =>
        events.push({ status: event.status, error: event.error }),
    });

    expect(events).toEqual([
      { status: "fetching", error: undefined },
      { status: "error", error: "boom" },
      { status: "fetching", error: undefined },
      { status: "done", error: undefined },
    ]);
    expect(samples).toEqual({ b: { id: "b" } });
  });

  it("reports an error progress event before throwing when continueOnError is false", async () => {
    const fetchOne = vi.fn(async () => {
      throw new Error("boom");
    });
    const events: string[] = [];

    await expect(
      fetchAndCacheSamples({
        ids: ["a"],
        cache: createMemorySampleCache(),
        delayMs: 0,
        fetchOne,
        continueOnError: false,
        onProgress: (event) => events.push(event.status),
      }),
    ).rejects.toThrow();

    expect(events).toEqual(["fetching", "error"]);
  });
});

describe("hasCachedSample", () => {
  it("agrees with fetchAndCacheSamples about which ids are cached", async () => {
    const cache = createMemorySampleCache();
    expect(await hasCachedSample(cache, "a")).toBe(false);

    await fetchAndCacheSamples({
      ids: ["a"],
      cache,
      delayMs: 0,
      fetchOne: vi.fn(async (id: string) => ({ id })),
    });

    expect(await hasCachedSample(cache, "a")).toBe(true);
    expect(await hasCachedSample(cache, "b")).toBe(false);
  });
});

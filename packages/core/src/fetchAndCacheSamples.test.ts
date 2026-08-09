import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAndCacheSamples,
  hasCachedSample,
} from "./fetchAndCacheSamples.js";

describe("fetchAndCacheSamples", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "fetch-cache-test-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("fetches every id on a fresh run, in order", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));

    const samples = await fetchAndCacheSamples({
      ids: ["a", "b"],
      outputDir,
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

    const start = Date.now();
    await fetchAndCacheSamples({
      ids: ["a", "b"],
      outputDir,
      delayMs,
      fetchOne,
    });
    const twoIdsElapsed = Date.now() - start;

    // One delay incurred (between "a" and "b"), not two.
    expect(twoIdsElapsed).toBeGreaterThanOrEqual(delayMs - 10);
    expect(twoIdsElapsed).toBeLessThan(delayMs * 2);
  });

  it("does not call fetchOne or delay on a cache hit", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));

    // First run populates the cache.
    await fetchAndCacheSamples({ ids: ["a"], outputDir, delayMs: 0, fetchOne });
    expect(fetchOne).toHaveBeenCalledTimes(1);

    // Second run against the same outputDir should hit cache entirely, even with a large delay configured.
    const start = Date.now();
    const samples = await fetchAndCacheSamples({
      ids: ["a"],
      outputDir,
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

    const first = await fetchAndCacheSamples({
      ids: ["x"],
      outputDir,
      delayMs: 0,
      fetchOne,
    });
    const second = await fetchAndCacheSamples({
      ids: ["x"],
      outputDir,
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
      outputDir,
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
        outputDir,
        delayMs: 0,
        fetchOne,
        continueOnError: false,
      }),
    ).rejects.toThrow(/Failed to fetch id "b"/);

    expect(fetchOne).toHaveBeenCalledTimes(2);
  });

  it("leaves already-fetched ids cached on disk when a later id fails (resumability)", async () => {
    const fetchOne = vi.fn(async (id: string) => {
      if (id === "b") throw new Error("boom");
      return { id };
    });

    await expect(
      fetchAndCacheSamples({
        ids: ["a", "b"],
        outputDir,
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
        outputDir,
        delayMs: 0,
        fetchOne: resumeFetchOne,
      }),
    ).resolves.toEqual({ a: { id: "a" } });
    expect(resumeFetchOne).not.toHaveBeenCalled();
  });

  it("reports progress for cache hits, fetches, and completions in order", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));
    const events: string[] = [];

    // Prime the cache for "a" so the second run below exercises the "cached" branch of the progress callback too.
    await fetchAndCacheSamples({ ids: ["a"], outputDir, delayMs: 0, fetchOne });

    await fetchAndCacheSamples({
      ids: ["a", "b"],
      outputDir,
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
      outputDir,
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
        outputDir,
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
  let outputDir: string;
  let cacheDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "fetch-cache-test-"));
    cacheDir = path.join(outputDir, "cache");
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("agrees with fetchAndCacheSamples about which ids are cached", async () => {
    expect(await hasCachedSample(cacheDir, "a")).toBe(false);

    await fetchAndCacheSamples({
      ids: ["a"],
      outputDir,
      delayMs: 0,
      fetchOne: vi.fn(async (id: string) => ({ id })),
    });

    expect(await hasCachedSample(cacheDir, "a")).toBe(true);
    expect(await hasCachedSample(cacheDir, "b")).toBe(false);
  });
});

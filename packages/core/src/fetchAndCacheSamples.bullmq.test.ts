import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAndCacheSamples } from "./fetchAndCacheSamples.js";
import { FetchHttpError } from "./urlFetcher.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

describe("fetchAndCacheSamples (redisUrl / BullMQ queue)", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "fetch-cache-bullmq-test-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("fetches every id and caches results, same shape as the sequential queue", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));

    const samples = await fetchAndCacheSamples({
      ids: ["a", "b", "c"],
      outputDir,
      delayMs: 0,
      fetchOne,
      redisUrl: REDIS_URL,
      concurrency: 3,
    });

    expect(fetchOne).toHaveBeenCalledTimes(3);
    expect(samples).toEqual({ a: { id: "a" }, b: { id: "b" }, c: { id: "c" } });
  });

  it("does not call fetchOne again on a cache hit from a prior run", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));

    await fetchAndCacheSamples({
      ids: ["a"],
      outputDir,
      delayMs: 0,
      fetchOne,
      redisUrl: REDIS_URL,
    });
    expect(fetchOne).toHaveBeenCalledTimes(1);

    const samples = await fetchAndCacheSamples({
      ids: ["a"],
      outputDir,
      delayMs: 5000,
      fetchOne,
      redisUrl: REDIS_URL,
    });

    expect(fetchOne).toHaveBeenCalledTimes(1);
    expect(samples).toEqual({ a: { id: "a" } });
  });

  it("skips a permanent HTTP failure (404) without retrying, and continues with the rest", async () => {
    const fetchOne = vi.fn(async (id: string) => {
      if (id === "b") throw new FetchHttpError("not found", 404);
      return { id };
    });

    const samples = await fetchAndCacheSamples({
      ids: ["a", "b", "c"],
      outputDir,
      delayMs: 0,
      fetchOne,
      redisUrl: REDIS_URL,
      concurrency: 3,
    });

    expect(samples).toEqual({ a: { id: "a" }, c: { id: "c" } });
    expect(fetchOne).toHaveBeenCalledTimes(3);
  });

  it("retries a transient HTTP failure (429) with backoff and succeeds", async () => {
    let attempts = 0;
    const fetchOne = vi.fn(async (id: string) => {
      attempts++;
      if (attempts < 2) throw new FetchHttpError("rate limited", 429);
      return { id };
    });

    const samples = await fetchAndCacheSamples({
      ids: ["flaky"],
      outputDir,
      delayMs: 0,
      fetchOne,
      redisUrl: REDIS_URL,
    });

    expect(samples).toEqual({ flaky: { id: "flaky" } });
    expect(attempts).toBe(2);
  }, 15000);

  it("reports a single final error and soft-fails once retries are exhausted", async () => {
    const fetchOne = vi.fn(async () => {
      throw new FetchHttpError("always rate limited", 429);
    });
    const events: { status: string; error?: string }[] = [];

    const samples = await fetchAndCacheSamples({
      ids: ["always-429"],
      outputDir,
      delayMs: 0,
      fetchOne,
      redisUrl: REDIS_URL,
      onProgress: (event) =>
        events.push({ status: event.status, error: event.error }),
    });

    expect(samples).toEqual({});
    expect(events.filter((event) => event.status === "error")).toHaveLength(1);
    expect(fetchOne).toHaveBeenCalledTimes(3);
  }, 20000);

  it("stops and rejects when continueOnError is false, letting in-flight jobs finish first", async () => {
    const fetchOne = vi.fn(async (id: string) => {
      if (id === "bad") throw new FetchHttpError("not found", 404);
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { id };
    });

    await expect(
      fetchAndCacheSamples({
        ids: ["ok-1", "ok-2", "bad"],
        outputDir,
        delayMs: 0,
        fetchOne,
        redisUrl: REDIS_URL,
        concurrency: 3,
        continueOnError: false,
      }),
    ).rejects.toThrow(/Failed to fetch id "bad"/);
  });

  it("paces ids on the same domain by delayMs, but not across different domains", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));
    const start = Date.now();

    await fetchAndCacheSamples({
      ids: [
        "https://a.example.com/1",
        "https://a.example.com/2",
        "https://b.example.com/1",
      ],
      outputDir,
      delayMs: 300,
      fetchOne,
      redisUrl: REDIS_URL,
      concurrency: 3,
    });

    const elapsed = Date.now() - start;
    // a.example.com's two ids are paced 300ms apart; b.example.com's one id runs in parallel, unaffected.
    expect(elapsed).toBeGreaterThanOrEqual(300 - 30);
    expect(elapsed).toBeLessThan(300 * 2);
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FetchHttpError } from "@zod-crawler/core";
import { hashId } from "@zod-crawler/pipeline";
import { Queue } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBullmqFetchQueue } from "./bullmqFetchQueue.js";
import { createNodeSampleCache } from "./nodeSampleCache.js";
import { parseRedisUrl } from "./redisConnection.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

describe("runBullmqFetchQueue", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "fetch-cache-bullmq-test-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("fetches every id and caches results, same shape as the sequential queue", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));

    const samples = await runBullmqFetchQueue({
      ids: ["a", "b", "c"],
      cache: createNodeSampleCache(outputDir),
      cooldownMs: 0,
      fetchOne,
      redisUrl: REDIS_URL,
      concurrency: 3,
      continueOnError: true,
    });

    expect(fetchOne).toHaveBeenCalledTimes(3);
    expect(samples).toEqual({ a: { id: "a" }, b: { id: "b" }, c: { id: "c" } });
  });

  it("does not call fetchOne again on a cache hit from a prior run", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));
    const cache = createNodeSampleCache(outputDir);

    await runBullmqFetchQueue({
      ids: ["a"],
      cache,
      cooldownMs: 0,
      fetchOne,
      redisUrl: REDIS_URL,
      continueOnError: true,
    });
    expect(fetchOne).toHaveBeenCalledTimes(1);

    const samples = await runBullmqFetchQueue({
      ids: ["a"],
      cache,
      cooldownMs: 5000,
      fetchOne,
      redisUrl: REDIS_URL,
      continueOnError: true,
    });

    expect(fetchOne).toHaveBeenCalledTimes(1);
    expect(samples).toEqual({ a: { id: "a" } });
  });

  it("skips a permanent HTTP failure (404) without retrying, and continues with the rest", async () => {
    const fetchOne = vi.fn(async (id: string) => {
      if (id === "b") throw new FetchHttpError("not found", 404);
      return { id };
    });

    const samples = await runBullmqFetchQueue({
      ids: ["a", "b", "c"],
      cache: createNodeSampleCache(outputDir),
      cooldownMs: 0,
      fetchOne,
      redisUrl: REDIS_URL,
      concurrency: 3,
      continueOnError: true,
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

    const samples = await runBullmqFetchQueue({
      ids: ["flaky"],
      cache: createNodeSampleCache(outputDir),
      cooldownMs: 0,
      fetchOne,
      redisUrl: REDIS_URL,
      continueOnError: true,
    });

    expect(samples).toEqual({ flaky: { id: "flaky" } });
    expect(attempts).toBe(2);
  }, 15000);

  it("reports a single final error and soft-fails once retries are exhausted", async () => {
    const fetchOne = vi.fn(async () => {
      throw new FetchHttpError("always rate limited", 429);
    });
    const events: { status: string; error?: string }[] = [];

    const samples = await runBullmqFetchQueue({
      ids: ["always-429"],
      cache: createNodeSampleCache(outputDir),
      cooldownMs: 0,
      fetchOne,
      redisUrl: REDIS_URL,
      continueOnError: true,
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
      runBullmqFetchQueue({
        ids: ["ok-1", "ok-2", "bad"],
        cache: createNodeSampleCache(outputDir),
        cooldownMs: 0,
        fetchOne,
        redisUrl: REDIS_URL,
        concurrency: 3,
        continueOnError: false,
      }),
    ).rejects.toThrow(/Failed to fetch id "bad"/);
  });

  it("paces ids on the same domain by cooldownMs, but not across different domains", async () => {
    const fetchOne = vi.fn(async (id: string) => ({ id }));
    const start = Date.now();

    await runBullmqFetchQueue({
      ids: [
        "https://a.example.com/1",
        "https://a.example.com/2",
        "https://b.example.com/1",
      ],
      cache: createNodeSampleCache(outputDir),
      cooldownMs: 300,
      fetchOne,
      redisUrl: REDIS_URL,
      concurrency: 3,
      continueOnError: true,
    });

    const elapsed = Date.now() - start;
    // a.example.com's two ids are paced 300ms apart; b.example.com's one id runs in parallel, unaffected.
    expect(elapsed).toBeGreaterThanOrEqual(300 - 30);
    expect(elapsed).toBeLessThan(300 * 2);
  });

  it("does not double-enqueue an id already waiting under the same crawlId's queue", async () => {
    // Checked directly against BullMQ, not through runBullmqFetchQueue: a live worker can complete and remove the pre-seeded job before a second add() call observes it, a harmless race that made call-count assertions flaky.
    const crawlId = `test-crawl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const queueName = `zod-crawler-fetch-${crawlId}`;
    const connection = parseRedisUrl(REDIS_URL);
    const queue = new Queue(queueName, { connection });

    // A URL id exercises the hash: BullMQ rejects ":" in raw job ids.
    const id = "https://example.com/x";
    const jobOptions = {
      jobId: await hashId(id),
      removeOnComplete: true,
      removeOnFail: true,
    };

    try {
      const first = await queue.add("fetch", { id, index: 0 }, jobOptions);
      const second = await queue.add("fetch", { id, index: 0 }, jobOptions);

      expect(second.id).toBe(first.id);
      const counts = await queue.getJobCounts("waiting", "active", "delayed");
      expect(counts.waiting + counts.active + counts.delayed).toBe(1);
    } finally {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    }
  });
});

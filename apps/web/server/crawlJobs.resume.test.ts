import { rm } from "node:fs/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  fetchAndCacheSamples,
  listActiveCrawls,
  registerActiveCrawl,
} from "@zod-crawler/core";
import type { CrawlCompleteEvent } from "../shared/events.js";
import type { ResolvedCrawlRequest } from "./requestSchema.js";

// crawlJobs.ts reads REDIS_URL as a module-level const, so it must be set before a dynamic import, not a static one.
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let getJob: typeof import("./crawlJobs.js").getJob;
let resumeActiveCrawls: typeof import("./crawlJobs.js").resumeActiveCrawls;
let resolveJobCacheBaseDir: typeof import("./crawlJobs.js").resolveJobCacheBaseDir;

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: "",
    json: async () => body,
  } as Response;
}

function baseRequest(
  overrides: Partial<ResolvedCrawlRequest>,
): ResolvedCrawlRequest {
  return {
    ids: ["a", "b"],
    urlTemplate: "https://example.com/{id}.json",
    delayMs: 100,
    schemaName: "InferredSchema",
    emitCrawlCandidates: false,
    useZodTransformers: false,
    stopOnError: false,
    ...overrides,
  };
}

describe("crawlJobs (resume)", () => {
  beforeAll(async () => {
    process.env.REDIS_URL = REDIS_URL;
    ({ getJob, resumeActiveCrawls, resolveJobCacheBaseDir } =
      await import("./crawlJobs.js"));
  });

  afterAll(() => {
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resumes a registered crawl, reusing samples already cached before the crash", async () => {
    const jobId = "resume-test-cache-hit";
    const books: Record<string, unknown> = {
      a: { title: "Book A" },
      b: { title: "Book B" },
    };
    const fetchOne = vi.fn(async (url: string) => {
      const id = url.replace("https://example.com/", "").replace(".json", "");
      return jsonResponse(books[id]);
    });
    vi.stubGlobal("fetch", fetchOne);

    // resolveJobCacheBaseDir(jobId) is deterministic, so a prior run's cache under this fixed jobId
    // would otherwise make id "a" look pre-cached before this test seeds it itself.
    const outputDir = resolveJobCacheBaseDir(jobId);
    await rm(outputDir, { recursive: true, force: true });

    // "Before the crash": id "a" was already fetched and cached on disk.
    await fetchAndCacheSamples({
      ids: ["a"],
      outputDir,
      delayMs: 0,
      fetchOne: async (url) => {
        const response = await fetch(url);
        return response.json();
      },
    });
    expect(fetchOne).toHaveBeenCalledTimes(1);

    // "Before the crash": the crawl was registered but never unregistered.
    await registerActiveCrawl(REDIS_URL, jobId, baseRequest({}));

    await resumeActiveCrawls();

    const job = getJob(jobId);
    expect(job).toBeDefined();
    const complete = await new Promise<CrawlCompleteEvent>((resolve) =>
      job!.emitter.once("complete", resolve),
    );

    // Only id "b" was actually re-fetched; "a" came from the pre-existing cache.
    expect(fetchOne).toHaveBeenCalledTimes(2);
    expect(complete.validation.total).toBe(2);

    // The "complete" event fires before runJob's finally block (which unregisters) finishes.
    await vi.waitFor(async () => {
      const entries = await listActiveCrawls(REDIS_URL);
      expect(entries.some((entry) => entry.jobId === jobId)).toBe(false);
    });

    await rm(outputDir, { recursive: true, force: true });
  });

  it("discards a registry entry whose payload no longer passes validation", async () => {
    const jobId = "resume-test-invalid-payload";
    await registerActiveCrawl(REDIS_URL, jobId, { ids: [] });

    await expect(resumeActiveCrawls()).resolves.toBeUndefined();

    expect(getJob(jobId)).toBeUndefined();
    const entries = await listActiveCrawls(REDIS_URL);
    expect(entries.some((entry) => entry.jobId === jobId)).toBe(false);
  });
});

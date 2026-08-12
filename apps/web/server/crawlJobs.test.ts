import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getJob,
  listJobs,
  resumeActiveCrawls,
  startCrawlJob,
} from "./crawlJobs.js";
import type { CrawlCompleteEvent, CrawlErrorEvent } from "../shared/events.js";
import type { ResolvedCrawlRequest } from "./requestSchema.js";

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
    delayMs: 0,
    schemaName: "InferredSchema",
    emitCrawlCandidates: false,
    stopOnError: false,
    ...overrides,
  };
}

describe("crawlJobs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns undefined for an unknown job id", () => {
    expect(getJob("does-not-exist")).toBeUndefined();
  });

  it("runs a job end-to-end: progress events then a complete event with a generated schema", async () => {
    const books: Record<string, unknown> = {
      a: { title: "Book A", pages: 100 },
      b: { title: "Book B", pages: 200 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const id = url.replace("https://example.com/", "").replace(".json", "");
        return jsonResponse(books[id]);
      }),
    );

    const jobId = startCrawlJob(baseRequest({}));
    const job = getJob(jobId);
    expect(job).toBeDefined();

    const statuses: string[] = [];
    job!.emitter.on("progress", (event) => statuses.push(event.status));

    const complete = await new Promise<CrawlCompleteEvent>((resolve) =>
      job!.emitter.once("complete", resolve),
    );

    expect(statuses).toEqual(["fetching", "done", "fetching", "done"]);
    expect(complete.schema).toContain("export const InferredSchema");
    expect(complete.validation.failures).toEqual([]);
    expect(complete.validation.total).toBe(2);
    expect(complete.fetchFailures).toEqual([]);
  });

  it("skips a failed fetch by default and reports it in fetchFailures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/b.json")) {
          return jsonResponse(null, { ok: false, status: 404 });
        }
        return jsonResponse({ title: "Book A" });
      }),
    );

    const jobId = startCrawlJob(baseRequest({}));
    const job = getJob(jobId);

    const complete = await new Promise<CrawlCompleteEvent>((resolve) =>
      job!.emitter.once("complete", resolve),
    );

    expect(complete.fetchFailures).toEqual([
      { id: "b", error: expect.stringContaining("404") as string },
    ]);
    expect(complete.validation.total).toBe(1);
  });

  it("excludes this run's own seed ids from crawl candidates", async () => {
    const books: Record<string, unknown> = {
      a: { title: "Book A", ref: { key: "/other/c" } },
      b: { title: "Book B", ref: { key: "/other/d" } },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const id = url.replace("https://example.com/", "").replace(".json", "");
        return jsonResponse(books[id]);
      }),
    );

    const jobId = startCrawlJob(baseRequest({ emitCrawlCandidates: true }));
    const job = getJob(jobId);

    const complete = await new Promise<CrawlCompleteEvent>((resolve) =>
      job!.emitter.once("complete", resolve),
    );

    expect(complete.candidates).toEqual([
      { path: "ref.key", values: ["/other/c", "/other/d"] },
    ]);
  });

  // Regression test: Node's EventEmitter throws on an unlistened "error" event, which would crash the server, so fetch failures must emit "failed" instead.
  it("does not throw when a fetch fails with no listener attached yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(null, { ok: false, status: 404 })),
    );

    const jobId = startCrawlJob(
      baseRequest({ ids: ["missing"], stopOnError: true }),
    );

    await vi.waitFor(() => {
      expect(getJob(jobId)?.status).toBe("error");
    });

    // status and .error are set together, before the "failed" event fires, so read the stored error rather than re-subscribing to an event that already fired.
    const error = getJob(jobId)?.error as CrawlErrorEvent | undefined;
    expect(error?.message).toMatch(/Failed to fetch id "missing"/);
  });

  it("reports validation failures for a sample that doesn't match the inferred schema", async () => {
    // classifyRawString's date-prefix regex has no trailing anchor, so this tags as "coerce.date" even though the month/day are out of range and z.coerce.date() rejects it at validation time.
    const books: Record<string, unknown> = {
      a: { title: "Book A", releasedAt: "2026-01-01" },
      b: { title: "Book B", releasedAt: "2026-13-45garbage" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const id = url.replace("https://example.com/", "").replace(".json", "");
        return jsonResponse(books[id]);
      }),
    );

    const jobId = startCrawlJob(baseRequest({}));
    const job = getJob(jobId);

    const complete = await new Promise<CrawlCompleteEvent>((resolve) =>
      job!.emitter.once("complete", resolve),
    );

    expect(complete.validation.total).toBe(2);
    expect(complete.validation.failures).toEqual([
      { id: "b", error: expect.any(String) as string },
    ]);
  });

  it("lists an in-flight job so a refreshed page can find it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Promise(() => {})), // never resolves: keeps the job "running" for the duration of this test
    );

    const jobId = startCrawlJob(baseRequest({ ids: ["a"] }));

    const summary = listJobs().find((entry) => entry.jobId === jobId);
    expect(summary).toBeDefined();
    expect(summary?.status).toBe("running");
    expect(summary?.request).toEqual({
      ids: ["a"],
      schemaName: "InferredSchema",
      delayMs: 0,
      urlTemplate: "https://example.com/{id}.json",
    });
  });

  it("does nothing when REDIS_URL isn't configured", async () => {
    await expect(resumeActiveCrawls()).resolves.toBeUndefined();
  });
});

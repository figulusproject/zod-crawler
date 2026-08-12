import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { getJob } from "./crawlJobs.js";

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    json: async () => body,
  } as Response;
}

function notFoundResponse() {
  return { ok: false, status: 404, statusText: "Not Found" } as Response;
}

async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function readFullStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return buffer;
    buffer += decoder.decode(value, { stream: true });
  }
}

describe("POST /api/crawl", () => {
  it("returns 400 with a validation message for an invalid body", async () => {
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/crawl`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { message: string };
      expect(body.message).toEqual(expect.any(String));
      expect(body.message.length).toBeGreaterThan(0);
    });
  });
});

describe("GET /api/crawls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists a just-started job", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ title: "Book A" })),
    );

    await withServer(async (base) => {
      const startResponse = await realFetch(`${base}/api/crawl`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: ["a"],
          urlTemplate: "https://example.com/{id}.json",
          delayMs: 100,
          emitCrawlCandidates: false,
          useZodTransformers: false,
          stopOnError: false,
        }),
      });
      const { jobId } = (await startResponse.json()) as { jobId: string };

      const listResponse = await realFetch(`${base}/api/crawls`);
      const jobs = (await listResponse.json()) as { jobId: string }[];
      expect(jobs.some((job) => job.jobId === jobId)).toBe(true);
    });
  });
});

describe("GET /api/crawl/:jobId/events", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 404 for an unknown job id", async () => {
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/crawl/does-not-exist/events`);
      expect(response.status).toBe(404);
      const body = (await response.json()) as { message: string };
      expect(body.message).toEqual(expect.any(String));
    });
  });

  it("sends the stored result immediately when the job already finished before the client connects", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ title: "Book A" })),
    );

    await withServer(async (base) => {
      const startResponse = await realFetch(`${base}/api/crawl`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: ["a"],
          urlTemplate: "https://example.com/{id}.json",
          delayMs: 100,
          emitCrawlCandidates: false,
          useZodTransformers: false,
          stopOnError: false,
        }),
      });
      const { jobId } = (await startResponse.json()) as { jobId: string };

      await vi.waitFor(() => {
        expect(getJob(jobId)?.status).toBe("done");
      });

      const eventsResponse = await realFetch(
        `${base}/api/crawl/${jobId}/events`,
      );
      const buffer = await readFullStream(eventsResponse);
      expect(buffer).toContain("event: complete");
    });
  });

  it("sends the stored error immediately when the job already failed before the client connects", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => notFoundResponse()),
    );

    await withServer(async (base) => {
      const startResponse = await realFetch(`${base}/api/crawl`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: ["a"],
          urlTemplate: "https://example.com/{id}.json",
          delayMs: 100,
          emitCrawlCandidates: false,
          useZodTransformers: false,
          stopOnError: true,
        }),
      });
      const { jobId } = (await startResponse.json()) as { jobId: string };

      await vi.waitFor(() => {
        expect(getJob(jobId)?.status).toBe("error");
      });

      const eventsResponse = await realFetch(
        `${base}/api/crawl/${jobId}/events`,
      );
      const buffer = await readFullStream(eventsResponse);
      expect(buffer).toContain("event: failed");
    });
  });

  it("streams a live progress event and the completion event to a client connected before the job finishes", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    let resolveB: (() => void) | undefined;
    const bGate = new Promise<void>((resolve) => {
      resolveB = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/b.json")) {
          await bGate;
          return jsonResponse({ title: "Book B" });
        }
        return jsonResponse({ title: "Book A" });
      }),
    );

    await withServer(async (base) => {
      const startResponse = await realFetch(`${base}/api/crawl`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: ["a", "b"],
          urlTemplate: "https://example.com/{id}.json",
          delayMs: 100,
          emitCrawlCandidates: false,
          useZodTransformers: false,
          stopOnError: false,
        }),
      });
      const { jobId } = (await startResponse.json()) as { jobId: string };

      await vi.waitFor(() => {
        expect(getJob(jobId)?.progress.get(0)?.status).toBe("done");
      });
      expect(getJob(jobId)?.status).toBe("running");

      const eventsResponse = await realFetch(
        `${base}/api/crawl/${jobId}/events`,
      );
      const streamPromise = readFullStream(eventsResponse);
      resolveB!();
      const buffer = await streamPromise;

      expect(buffer).toContain('"id":"b"');
      expect(buffer).toContain("event: complete");
    });
  });

  it("streams a live failure event to a client connected before the job fails", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    let resolveB: (() => void) | undefined;
    const bGate = new Promise<void>((resolve) => {
      resolveB = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/b.json")) {
          await bGate;
          return notFoundResponse();
        }
        return jsonResponse({ title: "Book A" });
      }),
    );

    await withServer(async (base) => {
      const startResponse = await realFetch(`${base}/api/crawl`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: ["a", "b"],
          urlTemplate: "https://example.com/{id}.json",
          delayMs: 100,
          emitCrawlCandidates: false,
          useZodTransformers: false,
          stopOnError: true,
        }),
      });
      const { jobId } = (await startResponse.json()) as { jobId: string };

      await vi.waitFor(() => {
        expect(getJob(jobId)?.progress.get(0)?.status).toBe("done");
      });
      expect(getJob(jobId)?.status).toBe("running");

      const eventsResponse = await realFetch(
        `${base}/api/crawl/${jobId}/events`,
      );
      const streamPromise = readFullStream(eventsResponse);
      resolveB!();
      const buffer = await streamPromise;

      expect(buffer).toContain("event: failed");
    });
  });

  it("replays already-known progress to a client connecting after some ids finished", async () => {
    // The app's own outbound fetch (createUrlFetcher) gets stubbed below - capture the real one first so this test can still talk to its own local server over it.
    const realFetch = globalThis.fetch.bind(globalThis);

    let resolveB: (() => void) | undefined;
    const bGate = new Promise<void>((resolve) => {
      resolveB = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/b.json")) {
          await bGate;
          return jsonResponse({ title: "Book B" });
        }
        return jsonResponse({ title: "Book A" });
      }),
    );

    const server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;

    try {
      const startResponse = await realFetch(`${base}/api/crawl`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: ["a", "b"],
          urlTemplate: "https://example.com/{id}.json",
          emitCrawlCandidates: false,
          useZodTransformers: false,
          stopOnError: false,
        }),
      });
      const { jobId } = (await startResponse.json()) as { jobId: string };

      // "a" finishes; "b" stays gated - mirrors a page refresh landing partway through a crawl.
      await vi.waitFor(() => {
        expect(getJob(jobId)?.progress.get(0)?.status).toBe("done");
      });
      expect(getJob(jobId)?.progress.get(1)).toBeUndefined();

      const eventsResponse = await realFetch(
        `${base}/api/crawl/${jobId}/events`,
      );
      const reader = eventsResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!buffer.includes("event: progress")) {
        const { value, done } = await reader.read();
        if (done) throw new Error("stream ended before any progress event");
        buffer += decoder.decode(value, { stream: true });
      }
      await reader.cancel();

      // The very first thing this newly-opened connection sees is "a" already done - not left at "pending" until "b" (still gated) produces the next live event.
      expect(buffer).toContain('"id":"a"');
      expect(buffer).toContain('"status":"done"');

      resolveB?.();
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

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

describe("GET /api/crawl/:jobId/events", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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

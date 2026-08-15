import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserUrlFetcher } from "./browserUrlFetcher.js";

const CORS_PROXY_URL = "https://proxy.example/proxy";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createBrowserUrlFetcher (browser)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the direct response without calling the proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    globalThis.fetch = fetchMock;

    const fetchOne = createBrowserUrlFetcher({
      urlTemplate: "https://example.com/items/{id}",
      corsProxyUrl: CORS_PROXY_URL,
    });
    await expect(fetchOne("1")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/items/1");
  });

  it("falls back to the proxy when the direct fetch throws", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    globalThis.fetch = fetchMock;

    const fetchOne = createBrowserUrlFetcher({
      urlTemplate: "https://example.com/items/{id}",
      corsProxyUrl: CORS_PROXY_URL,
    });
    await expect(fetchOne("1")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://example.com/items/1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${CORS_PROXY_URL}?url=${encodeURIComponent("https://example.com/items/1")}`,
    );
  });

  it("skips the direct attempt for a later id on an origin already known to need the proxy", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ id: 1 }))
      .mockResolvedValueOnce(jsonResponse({ id: 2 }));
    globalThis.fetch = fetchMock;

    const fetchOne = createBrowserUrlFetcher({
      urlTemplate: "https://example.com/items/{id}",
      corsProxyUrl: CORS_PROXY_URL,
    });
    await fetchOne("1");
    fetchMock.mockClear();

    await expect(fetchOne("2")).resolves.toEqual({ id: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${CORS_PROXY_URL}?url=${encodeURIComponent("https://example.com/items/2")}`,
    );
  });

  it("throws a combined error when both the direct fetch and the proxy fail", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("proxy unreachable"));
    globalThis.fetch = fetchMock;

    const fetchOne = createBrowserUrlFetcher({
      urlTemplate: "https://example.com/items/{id}",
      corsProxyUrl: CORS_PROXY_URL,
    });
    await expect(fetchOne("1")).rejects.toThrow(
      /failed directly.*and via the CORS proxy/s,
    );
  });

  it("does not retry via the proxy for a real non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    globalThis.fetch = fetchMock;

    const fetchOne = createBrowserUrlFetcher({
      urlTemplate: "https://example.com/items/{id}",
      corsProxyUrl: CORS_PROXY_URL,
    });
    await expect(fetchOne("1")).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

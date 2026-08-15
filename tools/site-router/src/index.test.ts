import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index.js";

function handle(request: Request): Promise<Response> {
  return worker.fetch(request, env);
}

function requestFor(path: string): Request {
  return new Request(`https://zodcrawler.figulus.dev${path}`);
}

describe("site-router worker", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("redirects the root path to the repo", async () => {
    const response = await handle(requestFor("/"));
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(env.REPO_URL);
  });

  it("redirects an unmatched path to the repo", async () => {
    const response = await handle(requestFor("/some-other-page"));
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(env.REPO_URL);
  });

  it("serves the docsify index at /docs from the assets binding", async () => {
    const response = await handle(requestFor("/docs"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("docsify");
  });

  it("serves a nested docs file with the /docs prefix stripped", async () => {
    const response = await handle(requestFor("/docs/README.md"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("zod-crawler");
  });

  it("404s on a docs path that doesn't exist", async () => {
    const response = await handle(requestFor("/docs/does-not-exist.md"));
    expect(response.status).toBe(404);
  });

  it("proxies /demo to the Vercel origin with the prefix stripped", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("demo body"));
    globalThis.fetch = fetchMock;

    const response = await handle(requestFor("/demo/assets/index.js"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const proxiedRequest = fetchMock.mock.calls[0][0] as Request;
    expect(proxiedRequest.url).toBe(`${env.DEMO_ORIGIN}/assets/index.js`);
    expect(await response.text()).toBe("demo body");
  });

  it("proxies bare /demo to the Vercel origin's root", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("demo root"));
    globalThis.fetch = fetchMock;

    await handle(requestFor("/demo"));
    const proxiedRequest = fetchMock.mock.calls[0][0] as Request;
    expect(proxiedRequest.url).toBe(`${env.DEMO_ORIGIN}/`);
  });

  it("preserves the query string when proxying /demo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = fetchMock;

    await handle(requestFor("/demo/api?foo=bar"));
    const proxiedRequest = fetchMock.mock.calls[0][0] as Request;
    expect(proxiedRequest.url).toBe(`${env.DEMO_ORIGIN}/api?foo=bar`);
  });
});

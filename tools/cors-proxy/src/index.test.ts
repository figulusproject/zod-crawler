import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index.js";

function handle(request: Request): Promise<Response> {
  return worker.fetch(request, env);
}

function requestFor(
  url: string,
  init?: RequestInit & { ip?: string },
): Request {
  const headers = new Headers(init?.headers);
  headers.set("cf-connecting-ip", init?.ip ?? "203.0.113.1");
  return new Request(`https://cors-proxy.example${url}`, {
    ...init,
    headers,
  });
}

describe("cors-proxy worker", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("answers an OPTIONS preflight with the locked CORS origin", async () => {
    const response = await handle(requestFor("/", { method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      env.ALLOWED_ORIGIN,
    );
  });

  it("rejects non-GET methods", async () => {
    const response = await handle(
      requestFor("/?url=https://example.com/1", { method: "POST" }),
    );
    expect(response.status).toBe(405);
  });

  it("rejects a request with no url query parameter", async () => {
    const response = await handle(requestFor("/"));
    expect(response.status).toBe(400);
  });

  it("rejects an unparsable url", async () => {
    const response = await handle(requestFor("/?url=not-a-url"));
    expect(response.status).toBe(400);
  });

  it("rejects a non-http(s) url", async () => {
    const response = await handle(
      requestFor(`/?url=${encodeURIComponent("ftp://example.com/1")}`),
    );
    expect(response.status).toBe(400);
  });

  it("forwards a GET to the target url and locks the CORS origin regardless of the caller's own Origin header", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response('{"id":1}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof fetch;

    const response = await handle(
      requestFor(`/?url=${encodeURIComponent("https://example.com/items/1")}`, {
        headers: { Origin: "https://attacker.example" },
      }),
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com/items/1",
      expect.anything(),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"id":1}');
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      env.ALLOWED_ORIGIN,
    );
  });

  it("returns a 502 when the upstream fetch rejects", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const response = await handle(
      requestFor(`/?url=${encodeURIComponent("https://example.com/1")}`, {
        ip: "203.0.113.2",
      }),
    );

    expect(response.status).toBe(502);
  });

  it("enforces the per-IP rate limit", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as typeof fetch;
    const ip = "203.0.113.3";
    const url = `/?url=${encodeURIComponent("https://example.com/1")}`;

    const responses: Response[] = [];
    for (let i = 0; i < 21; i++) {
      responses.push(await handle(requestFor(url, { ip })));
    }

    expect(responses.slice(0, 20).every((r) => r.status === 200)).toBe(true);
    expect(responses[20].status).toBe(429);
  });
});

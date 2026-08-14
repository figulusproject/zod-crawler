import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "./index.js";

function handle(request: Request): Promise<Response> {
  return worker.fetch(request, env);
}

function requestFor(path: string): Request {
  return new Request(`https://zodcrawler.figulus.dev${path}`);
}

describe("site-router worker", () => {
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
});

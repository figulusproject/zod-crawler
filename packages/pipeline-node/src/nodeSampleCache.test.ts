import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashId } from "@zod-crawler/pipeline";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeSampleCache } from "./nodeSampleCache.js";

describe("createNodeSampleCache", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "node-sample-cache-test-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("returns undefined for a key that was never set", async () => {
    const cache = createNodeSampleCache(outputDir);
    expect(await cache.get("missing")).toBeUndefined();
  });

  it("round-trips a value written by set", async () => {
    const cache = createNodeSampleCache(outputDir);
    await cache.set("key", '{"a":1}');
    expect(await cache.get("key")).toBe('{"a":1}');
  });

  it("creates <outputDir>/cache without the caller having to do it first", async () => {
    const cache = createNodeSampleCache(outputDir);
    await cache.set("key", "value");
    expect((await stat(path.join(outputDir, "cache"))).isDirectory()).toBe(
      true,
    );
  });

  it("records a best-effort manifest entry on set", async () => {
    const cache = createNodeSampleCache(outputDir);
    await cache.set("abc123", '{"id":"abc123"}');

    const manifest = JSON.parse(
      await readFile(path.join(outputDir, "cache", "manifest.json"), "utf8"),
    );
    expect(manifest).toEqual({ abc123: "abc123.json" });
  });

  it("agrees with hashId's key scheme, so callers using @zod-crawler/pipeline's hasCachedSample see the same entries", async () => {
    const cache = createNodeSampleCache(outputDir);
    await cache.set(await hashId("https://example.com/1"), "{}");
    expect(await cache.get(await hashId("https://example.com/1"))).toBe("{}");
  });
});

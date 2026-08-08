import { describe, expect, it } from "vitest";
import { crawlRequestSchema } from "./requestSchema.js";

describe("crawlRequestSchema", () => {
  it("dedupes and trims ids, applying defaults for everything else", () => {
    const result = crawlRequestSchema.safeParse({
      ids: [" a", "b ", "a", "c"],
      emitCrawlCandidates: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ids).toEqual(["a", "b", "c"]);
      expect(result.data.delayMs).toBe(7500);
      expect(result.data.schemaName).toBe("InferredSchema");
      expect(result.data.urlTemplate).toBeUndefined();
      expect(result.data.useZodTransformers).toBe(false);
    }
  });

  it("rejects an empty resolved id list", () => {
    const result = crawlRequestSchema.safeParse({
      ids: [" ", ""],
      emitCrawlCandidates: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a urlTemplate without an {id} placeholder", () => {
    const result = crawlRequestSchema.safeParse({
      ids: ["a"],
      urlTemplate: "https://example.com/fixed.json",
      emitCrawlCandidates: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/\{id\}/);
    }
  });

  it("rejects a schemaName that isn't a valid identifier", () => {
    const result = crawlRequestSchema.safeParse({
      ids: ["a"],
      schemaName: "2Bad",
      emitCrawlCandidates: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer or negative delayMs", () => {
    for (const bad of [-5, 7.5]) {
      const result = crawlRequestSchema.safeParse({
        ids: ["a"],
        delayMs: bad,
        emitCrawlCandidates: false,
      });
      expect(result.success, `delayMs ${bad} should be rejected`).toBe(false);
    }
  });

  it("accepts explicit overrides for delayMs, schemaName, and urlTemplate", () => {
    const result = crawlRequestSchema.safeParse({
      ids: ["a", "b"],
      urlTemplate: "https://example.com/{id}.json",
      delayMs: 0,
      schemaName: "MySchema",
      emitCrawlCandidates: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.urlTemplate).toBe("https://example.com/{id}.json");
      expect(result.data.delayMs).toBe(0);
      expect(result.data.schemaName).toBe("MySchema");
      expect(result.data.emitCrawlCandidates).toBe(true);
    }
  });

  it("passes through an explicit useZodTransformers override", () => {
    const result = crawlRequestSchema.safeParse({
      ids: ["a"],
      emitCrawlCandidates: false,
      useZodTransformers: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.useZodTransformers).toBe(true);
    }
  });
});

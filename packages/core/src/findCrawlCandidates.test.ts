import { describe, expect, it } from "vitest";
import { findCrawlCandidates } from "./findCrawlCandidates.js";
import type { JsonValue } from "./types.js";

describe("findCrawlCandidates", () => {
  it("finds a varying path-reference field nested inside an array, deduped", () => {
    // authors[] each hold a per-item reference (worth crawling) alongside a constant taxonomy tag that shares the same path shape but shouldn't be a crawl target.
    const samples: Record<string, JsonValue> = {
      workA: {
        title: "Book One",
        authors: [
          {
            author: { key: "/authors/OL111A" },
            type: { key: "/type/author_role" },
          },
        ],
      },
      workB: {
        title: "Book Two",
        authors: [
          {
            author: { key: "/authors/OL222A" },
            type: { key: "/type/author_role" },
          },
          {
            author: { key: "/authors/OL333A" },
            type: { key: "/type/author_role" },
          },
        ],
      },
      workC: {
        title: "Book Three",
        authors: [
          // Same author as workA, to prove values are deduped, not just collected once per sample.
          {
            author: { key: "/authors/OL111A" },
            type: { key: "/type/author_role" },
          },
        ],
      },
    };

    const candidates = findCrawlCandidates(samples);

    expect(candidates).toContainEqual({
      path: "authors.author.key",
      values: ["/authors/OL111A", "/authors/OL222A", "/authors/OL333A"],
    });

    // The constant "/type/author_role" tag collapses to a literal, not "startsWith-...", since it's identical across every sample.
    expect(
      candidates.find((c) => c.path === "authors.type.key"),
    ).toBeUndefined();
  });

  it("finds a top-level field that's an absolute URL in every sample", () => {
    const samples: Record<string, JsonValue> = {
      a: { source: "https://example.com/items/1" },
      b: { source: "https://example.com/items/2" },
    };

    const candidates = findCrawlCandidates(samples);

    expect(candidates).toContainEqual({
      path: "source",
      values: ["https://example.com/items/1", "https://example.com/items/2"],
    });
  });

  it("does not flag enum-like or free-text fields as crawl candidates", () => {
    const samples: Record<string, JsonValue> = {
      a: { status: "active", title: "Alpha" },
      b: { status: "archived", title: "Beta" },
      c: { status: "active", title: "Gamma" },
      d: { status: "archived", title: "Delta" },
    };

    expect(findCrawlCandidates(samples)).toEqual([]);
  });

  it("returns an empty array for samples with no reference-like fields", () => {
    const samples: Record<string, JsonValue> = {
      a: { count: 1 },
      b: { count: 2 },
    };

    expect(findCrawlCandidates(samples)).toEqual([]);
  });
});

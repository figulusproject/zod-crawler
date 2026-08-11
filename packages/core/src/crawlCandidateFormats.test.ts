import { describe, expect, it } from "vitest";
import {
  crawlCandidatesToCsv,
  crawlCandidatesToJson,
  crawlCandidatesToTxt,
  crawlCandidatesToYaml,
} from "./crawlCandidateFormats.js";
import type { CrawlCandidateField } from "./findCrawlCandidates.js";

const fields: CrawlCandidateField[] = [
  { path: "authors.author.key", values: ["/authors/OL1A", "/authors/OL2A"] },
  { path: "publisher.key", values: ["/publishers/OL3P"] },
];

describe("crawlCandidatesToTxt", () => {
  it("flattens all fields into a sorted, deduplicated, newline-terminated list", () => {
    expect(crawlCandidatesToTxt(fields)).toBe(
      "/authors/OL1A\n/authors/OL2A\n/publishers/OL3P\n",
    );
  });

  it("deduplicates values shared across fields", () => {
    const txt = crawlCandidatesToTxt([
      { path: "a", values: ["/x/1"] },
      { path: "b", values: ["/x/1", "/x/2"] },
    ]);
    expect(txt).toBe("/x/1\n/x/2\n");
  });

  it("handles no fields", () => {
    expect(crawlCandidatesToTxt([])).toBe("");
  });
});

describe("crawlCandidatesToJson", () => {
  it("maps each path to its values array", () => {
    expect(JSON.parse(crawlCandidatesToJson(fields))).toEqual({
      "authors.author.key": ["/authors/OL1A", "/authors/OL2A"],
      "publisher.key": ["/publishers/OL3P"],
    });
  });

  it("handles no fields", () => {
    expect(JSON.parse(crawlCandidatesToJson([]))).toEqual({});
  });
});

describe("crawlCandidatesToYaml", () => {
  it("emits one block sequence per field", () => {
    expect(crawlCandidatesToYaml(fields)).toBe(
      [
        "authors.author.key:",
        "  - /authors/OL1A",
        "  - /authors/OL2A",
        "publisher.key:",
        "  - /publishers/OL3P",
      ].join("\n"),
    );
  });

  it("quotes values that would otherwise be ambiguous YAML scalars", () => {
    const yaml = crawlCandidatesToYaml([
      { path: "p", values: ["a: b", "- leading dash", ""] },
    ]);
    expect(yaml).toBe(
      ["p:", '  - "a: b"', '  - "- leading dash"', '  - ""'].join("\n"),
    );
  });
});

describe("crawlCandidatesToCsv", () => {
  it("writes a header row followed by one row per index across all fields", () => {
    expect(crawlCandidatesToCsv(fields)).toBe(
      [
        "authors.author.key,publisher.key",
        "/authors/OL1A,/publishers/OL3P",
        "/authors/OL2A,",
      ].join("\n"),
    );
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    const csv = crawlCandidatesToCsv([
      { path: "p", values: ["has,comma", 'has"quote', "has\nnewline"] },
    ]);
    expect(csv).toBe(
      ["p", '"has,comma"', '"has""quote"', '"has' + "\nnewline" + '"'].join(
        "\n",
      ),
    );
  });

  it("handles no fields", () => {
    expect(crawlCandidatesToCsv([])).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import {
  crawlCandidatesFormatFromExtension,
  crawlCandidatesToCsv,
  crawlCandidatesToJson,
  crawlCandidatesToTxt,
  crawlCandidatesToYaml,
  parseIdsFromCsv,
  parseIdsFromJson,
  parseIdsFromTxt,
  parseIdsFromYaml,
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
        "",
      ].join("\n"),
    );
  });

  it("quotes values that would otherwise be ambiguous YAML scalars", () => {
    const yaml = crawlCandidatesToYaml([
      { path: "p", values: ["a: b", "- leading dash", "", "true", "123"] },
    ]);
    expect(yaml).toBe(
      [
        "p:",
        '  - "a: b"',
        '  - "- leading dash"',
        '  - ""',
        '  - "true"',
        '  - "123"',
        "",
      ].join("\n"),
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

describe("parseIdsFromTxt", () => {
  it("trims lines and drops blank ones", () => {
    expect(parseIdsFromTxt(" /a/1 \n\n/a/2\n  \n/a/3")).toEqual([
      "/a/1",
      "/a/2",
      "/a/3",
    ]);
  });

  it("handles empty input", () => {
    expect(parseIdsFromTxt("")).toEqual([]);
  });
});

describe("parseIdsFromJson", () => {
  it("flattens every string value regardless of field path", () => {
    expect(parseIdsFromJson(crawlCandidatesToJson(fields))).toEqual([
      "/authors/OL1A",
      "/authors/OL2A",
      "/publishers/OL3P",
    ]);
  });

  it("flattens a bare top-level array too", () => {
    expect(parseIdsFromJson('["/a/1", "/a/2"]')).toEqual(["/a/1", "/a/2"]);
  });

  it("drops non-string leaves and blank strings", () => {
    expect(parseIdsFromJson('{"a": ["/a/1", 42, null, true, "  "]}')).toEqual([
      "/a/1",
    ]);
  });
});

describe("parseIdsFromYaml", () => {
  it("round-trips values written by crawlCandidatesToYaml, including ambiguous scalars", () => {
    const written = [
      { path: "p", values: ["a: b", "- leading dash", "true", "123"] },
    ];
    expect(parseIdsFromYaml(crawlCandidatesToYaml(written))).toEqual(
      written[0].values,
    );
  });

  it("flattens a bare top-level block sequence too", () => {
    expect(parseIdsFromYaml("- /a/1\n- /a/2\n")).toEqual(["/a/1", "/a/2"]);
  });
});

describe("parseIdsFromCsv", () => {
  it("flattens every data cell, dropping the header row", () => {
    expect(parseIdsFromCsv(crawlCandidatesToCsv(fields))).toEqual([
      "/authors/OL1A",
      "/publishers/OL3P",
      "/authors/OL2A",
    ]);
  });

  it("round-trips quoted values containing commas, quotes, and newlines", () => {
    const written = [
      { path: "p", values: ["has,comma", 'has"quote', "has\nnewline"] },
    ];
    expect(parseIdsFromCsv(crawlCandidatesToCsv(written))).toEqual(
      written[0].values,
    );
  });

  it("drops blank cells left by ragged rows", () => {
    expect(parseIdsFromCsv("a,b\n/a/1,\n,/b/1")).toEqual(["/a/1", "/b/1"]);
  });

  it("handles empty input", () => {
    expect(parseIdsFromCsv("")).toEqual([]);
  });
});

describe("crawlCandidatesFormatFromExtension", () => {
  it.each([
    ["candidates.txt", "txt"],
    ["candidates.json", "json"],
    ["candidates.yaml", "yaml"],
    ["candidates.yml", "yaml"],
    ["candidates.csv", "csv"],
    ["CANDIDATES.CSV", "csv"],
  ])("maps %s to %s", (filename, expected) => {
    expect(crawlCandidatesFormatFromExtension(filename)).toBe(expected);
  });

  it("returns undefined for an unrecognized or missing extension", () => {
    expect(
      crawlCandidatesFormatFromExtension("candidates.xml"),
    ).toBeUndefined();
    expect(crawlCandidatesFormatFromExtension("candidates")).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  applyOptionalKeySuffixRecursive,
  detectLiteralsAndEnumsRecursive,
  resolveStringFieldSchema,
} from "./detectSchema.js";
import { UNION_KEY } from "./unionNode.js";

describe("applyOptionalKeySuffixRecursive", () => {
  it("recurses into each alternative of a top-level union, using the shared path's optional keys", () => {
    const json = { a: { x: 1 }, b: { x: 1, y: 2 } };

    const result = applyOptionalKeySuffixRecursive(
      { [UNION_KEY]: [{ x: "int" }, { x: "int", y: "int" }] },
      ["a", "b"],
      json,
    );

    expect(result).toEqual({
      [UNION_KEY]: [{ x: "int" }, { x: "int", "y?": "int" }],
    });
  });

  it("recurses into a nested plain-object field", () => {
    const json = { a: { info: { title: "T1" } }, b: { info: { title: "T2" } } };

    const result = applyOptionalKeySuffixRecursive(
      { info: { title: "string" } },
      ["a", "b"],
      json,
    );

    expect(result).toEqual({ info: { title: "string" } });
  });

  it("recurses into a non-empty array's item schema", () => {
    const json = {
      a: { tags: [{ label: "x" }] },
      b: { tags: [{ label: "y" }, { label: "z", extra: true }] },
    };

    const result = applyOptionalKeySuffixRecursive(
      { tags: [{ label: "string", extra: "boolean" }] },
      ["a", "b"],
      json,
    );

    // "extra" is missing from at least one tag object, so it's marked optional.
    expect(result).toEqual({
      tags: [{ label: "string", "extra?": "boolean" }],
    });
  });
});

describe("resolveStringFieldSchema", () => {
  const path: string[] = [];

  it("recognizes a month-name date format that classifyRawString's own regex would miss", () => {
    const json = {
      a: { publishedAt: "January 5, 2024" },
      b: { publishedAt: "5 March 2025" },
    };

    expect(
      resolveStringFieldSchema(["a", "b"], json, path, "publishedAt"),
    ).toBe("coerce.date");
  });

  it("treats bare years as dates only when the key name hints at dates", () => {
    const json = { a: { year: "1999" }, b: { year: "2020" } };

    expect(resolveStringFieldSchema(["a", "b"], json, path, "year")).toBe(
      "coerce.date",
    );
  });

  it("doesn't treat an out-of-range bare year as a date even with a date-hinting key", () => {
    const json = { a: { year: "50" }, b: { year: "2020" } };

    expect(resolveStringFieldSchema(["a", "b"], json, path, "year")).not.toBe(
      "coerce.date",
    );
  });

  it("falls back to string when reference-like values share no common prefix", () => {
    const json = { a: { ref: "/authors/1" }, b: { ref: "/publishers/2" } };

    expect(resolveStringFieldSchema(["a", "b"], json, path, "ref")).toBe(
      "string",
    );
  });

  it("marks a coerced integer field optional when some samples have an empty string", () => {
    const json = { a: { pages: "5" }, b: { pages: "7" }, c: { pages: "" } };

    expect(resolveStringFieldSchema(["a", "b", "c"], json, path, "pages")).toBe(
      "coerce.int.or.empty",
    );
  });

  it("stays a string when only some values are integers", () => {
    const json = { a: { code: "5" }, b: { code: "abc" } };

    expect(resolveStringFieldSchema(["a", "b"], json, path, "code")).toBe(
      "string",
    );
  });

  it("stays a string when only some values look like dates", () => {
    const json = { a: { notes: "2024-01-01" }, b: { notes: "not a date" } };

    expect(resolveStringFieldSchema(["a", "b"], json, path, "notes")).toBe(
      "string",
    );
  });

  it("falls back to multi.coerce.date for a date-hinted field mixing dates, multi-value lists, and empty strings", () => {
    const json = {
      a: { releaseDate: "2005, 2014, 2006" },
      b: { releaseDate: "" },
      c: { releaseDate: "2020" },
    };

    expect(
      resolveStringFieldSchema(["a", "b", "c"], json, path, "releaseDate"),
    ).toBe("multi.coerce.date");
  });

  it("doesn't apply the multi.coerce.date fallback when a value is neither a date, a list, nor empty", () => {
    const json = { a: { year: "2020" }, b: { year: "not-a-year-at-all" } };

    expect(resolveStringFieldSchema(["a", "b"], json, path, "year")).not.toBe(
      "multi.coerce.date",
    );
  });
});

describe("detectLiteralsAndEnumsRecursive", () => {
  it("resolves a union alternative tagged 'string' via resolveStringFieldSchema", () => {
    const json = { a: { ref: "hello world" }, b: { ref: { key: "x" } } };

    const result = detectLiteralsAndEnumsRecursive(
      { ref: { [UNION_KEY]: ["string", { key: "string" }] } },
      ["a", "b"],
      json,
    );

    expect(result).toEqual({
      ref: { [UNION_KEY]: ["string", { key: "string" }] },
    });
  });

  it("resolves a union alternative tagged 'int' via resolveIntFieldSchema", () => {
    const json = { a: { count: 5 }, b: { count: { nested: 1 } } };

    const result = detectLiteralsAndEnumsRecursive(
      { count: { [UNION_KEY]: ["int", { nested: "int" }] } },
      ["a", "b"],
      json,
    );

    expect(result).toEqual({
      count: { [UNION_KEY]: ["int", { nested: "int" }] },
    });
  });
});

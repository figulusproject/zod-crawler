import { describe, expect, it } from "vitest";
import { deepMerge, mergeSchemaValues } from "./mergeSchemaValues.js";
import { UNION_KEY } from "./unionNode.js";

describe("mergeSchemaValues", () => {
  it("returns the other side when one side is undefined", () => {
    expect(mergeSchemaValues(undefined, "string")).toBe("string");
    expect(mergeSchemaValues("string", undefined)).toBe("string");
  });

  it("merges plain objects key by key, recursing on shared keys", () => {
    expect(mergeSchemaValues({ a: "string" }, { b: "int" })).toEqual({
      a: "string",
      b: "int",
    });

    expect(
      mergeSchemaValues({ a: { x: "string" } }, { a: { y: "int" } }),
    ).toEqual({ a: { x: "string", y: "int" } });
  });

  it("merges non-empty arrays by merging their item schema", () => {
    expect(mergeSchemaValues(["string"], ["string"])).toEqual(["string"]);
  });

  it("treats an empty array as absent, returning the other side's item schema", () => {
    expect(mergeSchemaValues([], ["string"])).toEqual(["string"]);
    expect(mergeSchemaValues(["string"], [])).toEqual(["string"]);
  });

  it("merges identical strings to themselves", () => {
    expect(mergeSchemaValues("string", "string")).toBe("string");
  });

  it("unions two differently-typed scalars", () => {
    expect(mergeSchemaValues("string", "int")).toEqual({
      [UNION_KEY]: ["string", "int"],
    });
  });

  it("unions two differently-shaped values other than plain scalars", () => {
    expect(mergeSchemaValues({ x: "string" }, ["item"])).toEqual({
      [UNION_KEY]: [{ x: "string" }, ["item"]],
    });
  });

  it("grows an existing union with a new, differently-shaped alternative", () => {
    const existingUnion = { [UNION_KEY]: ["string", "int"] };
    expect(mergeSchemaValues(existingUnion, "boolean")).toEqual({
      [UNION_KEY]: ["string", "int", "boolean"],
    });
  });

  it("folds a value into a same-shape alternative of an existing union instead of appending it", () => {
    const existingUnion = {
      [UNION_KEY]: [{ x: "string" }, "int"],
    };
    expect(mergeSchemaValues(existingUnion, { y: "boolean" })).toEqual({
      [UNION_KEY]: [{ x: "string", y: "boolean" }, "int"],
    });
  });

  it("merges array alternatives within a union by their item schema", () => {
    const existingUnion = { [UNION_KEY]: [["string"], "int"] };
    expect(mergeSchemaValues(existingUnion, ["boolean"])).toEqual({
      [UNION_KEY]: [[{ [UNION_KEY]: ["string", "boolean"] }], "int"],
    });
  });

  it("collapses a union back to a plain value once every incoming alternative folds into one", () => {
    const singleAltUnion = { [UNION_KEY]: ["string"] };
    expect(mergeSchemaValues(singleAltUnion, "string")).toBe("string");
  });

  it("merges two unions together, matching alternatives by shape", () => {
    const a = { [UNION_KEY]: ["string", "int"] };
    const b = { [UNION_KEY]: ["boolean", "int"] };
    expect(mergeSchemaValues(a, b)).toEqual({
      [UNION_KEY]: ["string", "int", "boolean"],
    });
  });

  it("flattens a nested union node found among the alternatives being merged in", () => {
    const nested = {
      [UNION_KEY]: [{ [UNION_KEY]: ["int", "boolean"] }, "null"],
    };
    expect(mergeSchemaValues("string", nested)).toEqual({
      [UNION_KEY]: ["string", "int", "boolean", "null"],
    });
  });
});

describe("deepMerge", () => {
  it("delegates to mergeSchemaValues", () => {
    expect(deepMerge({ a: "string" }, { b: "int" })).toEqual(
      mergeSchemaValues({ a: "string" }, { b: "int" }),
    );
  });
});

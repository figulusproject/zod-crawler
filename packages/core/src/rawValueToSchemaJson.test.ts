import { describe, expect, it } from "vitest";
import {
  classifyRawString,
  rawValueToSchemaJson,
  sortKeys,
} from "./rawValueToSchemaJson.js";

describe("classifyRawString", () => {
  it("classifies a UUID", () => {
    expect(classifyRawString("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(
      "uuid",
    );
  });

  it("classifies an email address", () => {
    expect(classifyRawString("someone@example.com")).toBe("email");
  });

  it("classifies an absolute URL", () => {
    expect(classifyRawString("https://example.com/1")).toBe("url");
  });

  it("classifies an ISO-date-prefixed string", () => {
    expect(classifyRawString("2026-01-01")).toBe("coerce.date");
  });

  it("classifies free text as a plain string", () => {
    expect(classifyRawString("just some text")).toBe("string");
  });
});

describe("rawValueToSchemaJson", () => {
  it("classifies null", () => {
    expect(rawValueToSchemaJson(null)).toBe("null");
  });

  it("classifies an empty array as z.array(z.unknown())'s tag", () => {
    expect(rawValueToSchemaJson([])).toEqual(["unknown"]);
  });

  it("classifies a boolean", () => {
    expect(rawValueToSchemaJson(true)).toBe("boolean");
  });

  it("classifies a value with no other match as unknown", () => {
    expect(rawValueToSchemaJson(undefined)).toBe("unknown");
  });

  it("classifies numbers, objects, and non-empty arrays", () => {
    expect(rawValueToSchemaJson(5)).toBe("int");
    expect(rawValueToSchemaJson(5.5)).toBe("number");
    expect(rawValueToSchemaJson({ a: "x" })).toEqual({ a: "string" });
    expect(rawValueToSchemaJson(["x", "y"])).toEqual(["string"]);
  });
});

describe("sortKeys", () => {
  it("sorts an object's keys alphabetically, recursively", () => {
    expect(sortKeys({ b: 1, a: { d: 2, c: 3 } })).toEqual({
      a: { c: 3, d: 2 },
      b: 1,
    });
    expect(Object.keys(sortKeys({ b: 1, a: 2 }))).toEqual(["a", "b"]);
  });

  it("sorts keys within array items", () => {
    const result = sortKeys([{ b: 1, a: 2 }]);
    expect(Object.keys(result[0])).toEqual(["a", "b"]);
  });

  it("leaves a primitive value unchanged", () => {
    expect(sortKeys("hello")).toBe("hello");
  });
});

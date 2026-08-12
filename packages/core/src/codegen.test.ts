import { describe, expect, it, vi } from "vitest";
import { convertToZod, generateZodSchema } from "./codegen.js";
import { UNION_KEY } from "./unionNode.js";

describe("generateZodSchema", () => {
  it("generates z.null() for a raw null value", () => {
    expect(generateZodSchema(null, 0)).toBe("z.null()");
  });

  it("quotes an object key that isn't a valid identifier", () => {
    expect(generateZodSchema({ "not-an-identifier": "string" }, 0)).toBe(
      'z.object({\n  "not-an-identifier": z.string()\n})',
    );
  });

  it("appends .optional() to a non-string field marked optional", () => {
    expect(generateZodSchema({ "count?": "int" }, 0)).toBe(
      "z.object({\n  count: z.int().optional()\n})",
    );
  });

  it("collapses a union node's duplicate alternatives and unwraps a single survivor", () => {
    expect(generateZodSchema({ [UNION_KEY]: ["string", "string"] }, 0)).toBe(
      "z.string()",
    );
  });

  it("wraps distinct union alternatives in z.union", () => {
    expect(generateZodSchema({ [UNION_KEY]: ["string", "int"] }, 0)).toBe(
      "z.union([z.string(), z.int()])",
    );
  });

  it("generates z.array(z.unknown()) for an empty array", () => {
    expect(generateZodSchema([], 0)).toBe("z.array(z.unknown())");
  });

  it("wraps a mixed-JS-type array's item schema in z.union", () => {
    expect(generateZodSchema(["string", { a: "int" }], 0)).toBe(
      "z.array(z.union([z.string(), z.object({\n  a: z.int()\n})]))",
    );
  });

  it("generates z.object({}) for an empty object", () => {
    expect(generateZodSchema({}, 0)).toBe("z.object({})");
  });

  it("generates z.int() for a raw integer and z.number() for a raw float", () => {
    expect(generateZodSchema(5, 0)).toBe("z.int()");
    expect(generateZodSchema(5.5, 0)).toBe("z.number()");
  });

  it("generates z.boolean() for a raw boolean", () => {
    expect(generateZodSchema(true, 0)).toBe("z.boolean()");
  });

  it("generates z.literal(...) for a literal-tagged string", () => {
    expect(generateZodSchema('literal-"active"', 0)).toBe(
      'z.literal("active")',
    );
  });

  it("generates z.string().startsWith(...) for a startsWith-tagged string", () => {
    expect(generateZodSchema('startsWith-"/authors/"', 0)).toBe(
      'z.string().startsWith("/authors/")',
    );
  });

  it("classifies an untagged raw string the same way rawValueToSchemaJson would", () => {
    expect(generateZodSchema("someone@example.com", 0)).toBe("z.email()");
    expect(generateZodSchema("just some text", 0)).toBe("z.string()");
  });

  it("generates z.unknown() for a value with no other match", () => {
    expect(generateZodSchema(undefined, 0)).toBe("z.unknown()");
  });
});

describe("convertToZod", () => {
  it("emits no helper preamble when no shared helper is used", () => {
    const result = convertToZod({
      input: JSON.stringify({ title: "string" }),
      schemaName: "Book",
    });
    expect(result).toBe(
      "import { z } from 'zod';\n\nexport const Book = z.object({\n  title: z.string()\n});",
    );
  });

  it("prepends the plain (non-package) helper declarations for every helper used", () => {
    const result = convertToZod({
      input: JSON.stringify({
        releasedAt: "multi.coerce.date",
        pages: "coerce.int.or.empty",
        copies: "coerce.bigint.or.empty",
      }),
      schemaName: "Book",
    })!;

    expect(result).toContain("const multiOrSingleCoerceDate = z.union([");
    expect(result).toContain("const intOrUndefined = z.union([");
    expect(result).toContain("const bigintOrUndefined = z.union([");
    expect(result).not.toContain("emptyStringAsUndefined");
    expect(result).toContain("releasedAt: multiOrSingleCoerceDate");
    expect(result).toContain("pages: intOrUndefined");
    expect(result).toContain("copies: bigintOrUndefined");
  });

  it("prepends the zod-transformers-backed helper declarations when useZodTransformers is set", () => {
    const result = convertToZod({
      input: JSON.stringify({
        releasedAt: "multi.coerce.date",
        pages: "coerce.int.or.empty",
        copies: "coerce.bigint.or.empty",
      }),
      schemaName: "Book",
      useZodTransformers: true,
    })!;

    expect(result).toContain(
      "import { emptyStringAsUndefined } from 'zod-transformers';",
    );
    expect(result).toContain(
      "const multiOrSingleCoerceDate = emptyStringAsUndefined(",
    );
    expect(result).toContain("const intOrUndefined = emptyStringAsUndefined(");
    expect(result).toContain(
      "const bigintOrUndefined = emptyStringAsUndefined(",
    );
  });

  it("logs the error and returns undefined when input isn't valid JSON", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = convertToZod({
      input: "{not valid json",
      schemaName: "Book",
    });

    expect(result).toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

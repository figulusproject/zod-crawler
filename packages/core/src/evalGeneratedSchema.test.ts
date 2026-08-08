import { describe, expect, it } from "vitest";
import { evalGeneratedSchema } from "./evalGeneratedSchema.js";

describe("evalGeneratedSchema", () => {
  it("evaluates a plain generated schema (no helper preamble)", () => {
    const source = `import { z } from 'zod';\n\nexport const Simple = z.object({\n  name: z.string()\n});`;

    const schema = evalGeneratedSchema(source, "Simple");

    expect(schema.safeParse({ name: "Ada" }).success).toBe(true);
    expect(schema.safeParse({ name: 42 }).success).toBe(false);
  });

  it("evaluates a schema whose preamble declares a helper the schema body references", () => {
    // Locks in that a multi-line preamble (helper const declaration) between the import and export still evals correctly.
    const source = `import { z } from 'zod';\n\nconst strOrUndefined = z\n  .union([z.string().min(1), z.string().length(0).transform(() => undefined)])\n  .optional();\n\nexport const WithHelper = z.object({\n  name: z.string(),\n  nickname: strOrUndefined\n});`;

    const schema = evalGeneratedSchema(source, "WithHelper");

    expect(
      schema.safeParse({ name: "Ada", nickname: "Lovelace" }).success,
    ).toBe(true);
    expect(schema.safeParse({ name: "Ada" }).success).toBe(true);

    // strOrUndefined's own behavior: an empty string collapses to undefined rather than failing validation.
    const parsed = schema.safeParse({ name: "Ada", nickname: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.nickname).toBeUndefined();
    }
  });

  it("evaluates a schema whose preamble imports emptyStringAsUndefined from zod-transformers", () => {
    // Shaped like convertToZod's output when useZodTransformers is set: an extra import line ahead of the usual preamble/export.
    const source = `import { z } from 'zod';\nimport { emptyStringAsUndefined } from 'zod-transformers';\n\nconst strOrUndefined = emptyStringAsUndefined(z.string().min(1)).optional();\n\nexport const WithHelper = z.object({\n  name: z.string(),\n  nickname: strOrUndefined\n});`;

    const schema = evalGeneratedSchema(source, "WithHelper");

    expect(
      schema.safeParse({ name: "Ada", nickname: "Lovelace" }).success,
    ).toBe(true);

    const parsed = schema.safeParse({ name: "Ada", nickname: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.nickname).toBeUndefined();
    }
  });
});

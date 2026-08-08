import { describe, expect, it } from "vitest";
import { validateSamples } from "./validateSamples.js";
import type { JsonValue } from "./types.js";

describe("validateSamples", () => {
  const source = `import { z } from 'zod';\n\nexport const Book = z.object({\n  title: z.string(),\n  pages: z.int()\n});`;

  it("splits samples into passing (null) and failing (ZodError) entries", () => {
    const samples: Record<string, JsonValue> = {
      good: { title: "Dune", pages: 412 },
      badType: { title: "Dune", pages: "412" },
      missingField: { title: "Dune" },
    };

    const results = validateSamples(source, "Book", samples);

    expect(results.get("good")).toBeNull();
    expect(results.get("badType")).not.toBeNull();
    expect(results.get("missingField")).not.toBeNull();
  });

  it("returns an empty map for an empty samples object", () => {
    const results = validateSamples(source, "Book", {});
    expect(results.size).toBe(0);
  });
});

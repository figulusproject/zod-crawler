import { describe, expect, it } from "vitest";
import { evalGeneratedSchema } from "./evalGeneratedSchema.js";
import { inferSchema } from "./inferSchema.js";
import type { JsonValue } from "./types.js";

describe("inferSchema round-trip", () => {
  const samples: Record<string, JsonValue> = {
    a: {
      title: "The Great Adventure",
      subtitle: "A Novel",
      status: "active",
      publish_date: "2005-06-01",
      page_count: 342,
      external_id: "10000000000000000001",
      rating: 4.5,
      tags: ["fiction", "adventure"],
      authors: [{ name: "Jane Doe", role: "primary" }],
    },
    b: {
      title: "Second Book",
      status: "archived",
      publish_date: "1999-01-15",
      page_count: 128,
      external_id: "10000000000000000002",
      rating: 3.2,
      tags: ["mystery"],
      authors: [
        { name: "John Smith", role: "primary", bio: "Award winning author" },
      ],
    },
    c: {
      title: "Third Book",
      status: "active",
      publish_date: "2010-11-20",
      page_count: 256,
      external_id: "10000000000000000003",
      rating: 4.1,
      tags: ["fiction"],
      authors: [{ name: "Alice Lee", role: "editor" }],
    },
    d: {
      title: "Fourth Book",
      status: "archived",
      publish_date: "2018-03-09",
      page_count: 512,
      external_id: "10000000000000000004",
      rating: 3.8,
      tags: ["fiction", "sequel"],
      authors: [{ name: "Bob Nguyen", role: "primary" }],
    },
  };

  it("generates Zod source that every sample parses against", () => {
    const source = inferSchema(samples, "TestSchema");
    expect(source).toBeDefined();

    const schema = evalGeneratedSchema(source!, "TestSchema");

    for (const [id, sample] of Object.entries(samples)) {
      const result = schema.safeParse(sample);
      expect(result.success, `sample "${id}" failed: ${result.error}`).toBe(
        true,
      );
    }
  });

  it("detected the closed-category fields as enums", () => {
    // Both fields sit right at MAX_ENUM_UNIQUE_RATIO (ratio 0.5), exercising resolveStringFieldSchema's enum-vs-free-text heuristic, not just "it happened to parse".
    const source = inferSchema(samples, "TestSchema")!;
    expect(source).toMatch(/z\.enum\(\["active",\s*"archived"\]\)/);
    expect(source).toMatch(/z\.enum\(\["primary",\s*"editor"\]\)/);
  });

  it("detected publish_date as a coerced date and external_id as a bigint", () => {
    const source = inferSchema(samples, "TestSchema")!;
    expect(source).toMatch(/publish_date:\s*z\.coerce\.date\(\)/);
    expect(source).toMatch(/external_id:\s*z\.coerce\.bigint\(\)/);
  });

  it("marked subtitle and authors[].bio optional (missing in some samples)", () => {
    const source = inferSchema(samples, "TestSchema")!;
    expect(source).toMatch(/subtitle:\s*strOrUndefined/);
    expect(source).toMatch(/bio:\s*strOrUndefined/);
  });

  it("imports emptyStringAsUndefined from zod-transformers when useZodTransformers is set", () => {
    const source = inferSchema(samples, "TestSchema", true)!;
    expect(source).toMatch(
      /import \{ emptyStringAsUndefined \} from 'zod-transformers';/,
    );
    expect(source).toMatch(/emptyStringAsUndefined\(/);

    const schema = evalGeneratedSchema(source, "TestSchema");
    for (const [id, sample] of Object.entries(samples)) {
      const result = schema.safeParse(sample);
      expect(result.success, `sample "${id}" failed: ${result.error}`).toBe(
        true,
      );
    }

    const parsed = schema.safeParse({ ...samples.a, subtitle: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.subtitle).toBeUndefined();
    }
  });
});

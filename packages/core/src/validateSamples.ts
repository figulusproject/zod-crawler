import type { z } from "zod";
import { evalGeneratedSchema } from "./evalGeneratedSchema.js";
import type { JsonValue } from "./types.js";

// Round-trip counterpart to inferSchema: reports per-sample safeParse results against the Zod source it produced (raw, not reformatted; see evalGeneratedSchema).
export function validateSamples(
  source: string,
  schemaName: string,
  samples: Record<string, JsonValue>,
): Map<string, z.ZodError | null> {
  const schema = evalGeneratedSchema(source, schemaName);

  const results = new Map<string, z.ZodError | null>();
  for (const [id, sample] of Object.entries(samples)) {
    const parsed = schema.safeParse(sample);
    results.set(id, parsed.success ? null : parsed.error);
  }
  return results;
}

import type { JsonValue } from "./types.js";
import { deepMerge } from "./mergeSchemaValues.js";
import { rawValueToSchemaJson, sortKeys } from "./rawValueToSchemaJson.js";
import {
  applyOptionalKeySuffixRecursive,
  detectLiteralsAndEnumsRecursive,
} from "./detectSchema.js";
import { convertToZod } from "./codegen.js";

// Orchestrates the full pipeline (merge -> detect -> codegen); `samples` keys only scope per-field detection and never surface in the generated schema.
export function inferSchema(
  samples: Record<string, JsonValue>,
  schemaName: string,
  useZodTransformers = false,
): string | undefined {
  const sampleIds = Object.keys(samples);
  const schemas = sampleIds.map((id) =>
    sortKeys(rawValueToSchemaJson(samples[id])),
  );
  const merged = schemas.reduce(deepMerge, {} as Record<string, any>);

  const result = applyOptionalKeySuffixRecursive(
    detectLiteralsAndEnumsRecursive(merged, sampleIds, samples),
    sampleIds,
    samples,
  );

  return convertToZod({
    input: JSON.stringify(result),
    schemaName,
    useZodTransformers,
  });
}

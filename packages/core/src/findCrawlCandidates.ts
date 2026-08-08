import { isPlainObject } from "./types.js";
import type { JsonValue } from "./types.js";
import { UNION_KEY, isUnionNode } from "./unionNode.js";
import { deepMerge } from "./mergeSchemaValues.js";
import { rawValueToSchemaJson, sortKeys } from "./rawValueToSchemaJson.js";
import {
  collectStringValuesAtPath,
  detectLiteralsAndEnumsRecursive,
} from "./detectSchema.js";

export interface CrawlCandidateField {
  // Dot-joined field path, e.g. "authors.author.key".
  path: string;
  // Distinct raw string values observed at that field across every sample.
  values: string[];
}

// Reuses resolveStringFieldSchema's own "url"/"startsWith-..." reference-detection tags rather than re-deriving a "looks crawlable" rule from scratch.
export function findCrawlCandidates(
  samples: Record<string, JsonValue>,
): CrawlCandidateField[] {
  const sampleIds = Object.keys(samples);
  const schemas = sampleIds.map((id) =>
    sortKeys(rawValueToSchemaJson(samples[id])),
  );
  const merged = schemas.reduce(deepMerge, {} as Record<string, any>);
  const detected = detectLiteralsAndEnumsRecursive(merged, sampleIds, samples);

  const results: CrawlCandidateField[] = [];
  walk(detected, sampleIds, samples, [], results);
  return results;
}

function walk(
  obj: any,
  sampleIds: readonly string[],
  samples: Record<string, any>,
  path: string[],
  results: CrawlCandidateField[],
): void {
  if (isUnionNode(obj)) {
    // No key/parent context available here, so only nested object alternatives can be walked (a bare "url"/"startsWith-..." alt has no key to attribute it to).
    for (const alt of obj[UNION_KEY]) {
      if (isPlainObject(alt)) {
        walk(alt, sampleIds, samples, path, results);
      }
    }
    return;
  }

  if (!isPlainObject(obj)) {
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (isUnionNode(value)) {
      for (const alt of value[UNION_KEY]) {
        recordIfCandidate(alt, sampleIds, samples, path, key, results);
        if (isPlainObject(alt)) {
          walk(alt, sampleIds, samples, [...path, key], results);
        }
      }
      continue;
    }

    if (Array.isArray(value)) {
      // Arrays are a single-element array holding the item schema; no extra path segment, matching collectObjectsAtPath's own flattening.
      if (value.length > 0) {
        const item = value[0];
        recordIfCandidate(item, sampleIds, samples, path, key, results);
        walk(item, sampleIds, samples, [...path, key], results);
      }
      continue;
    }

    recordIfCandidate(value, sampleIds, samples, path, key, results);
    if (isPlainObject(value)) {
      walk(value, sampleIds, samples, [...path, key], results);
    }
  }
}

function recordIfCandidate(
  value: unknown,
  sampleIds: readonly string[],
  samples: Record<string, any>,
  path: string[],
  key: string,
  results: CrawlCandidateField[],
): void {
  if (typeof value !== "string") return;
  if (value !== "url" && !value.startsWith("startsWith-")) return;

  const { unique } = collectStringValuesAtPath(sampleIds, samples, path, key);
  if (unique.length > 0) {
    results.push({ path: [...path, key].join("."), values: unique });
  }
}

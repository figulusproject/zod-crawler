import { isPlainObject } from "./types.js";

// A "union node" represents a field whose sampled type varies: a plain object with a single well-known key holding the alternative schema shapes.
export const UNION_KEY = "__union__";

export function isUnionNode(x: unknown): x is { [UNION_KEY]: unknown[] } {
  return (
    isPlainObject(x) &&
    Object.keys(x).length === 1 &&
    UNION_KEY in x &&
    Array.isArray((x as any)[UNION_KEY])
  );
}

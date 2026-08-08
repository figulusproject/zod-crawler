import { isPlainObject } from "./types.js";
import { UNION_KEY, isUnionNode } from "./unionNode.js";

// Two values merge (rather than becoming separate union alternatives) if they're "the same shape": both objects, both arrays, or identical type tags.
function canMergeSameShape(a: unknown, b: unknown): boolean {
  if (isPlainObject(a) && isPlainObject(b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return true;
  if (typeof a === "string" && typeof b === "string" && a === b) return true;
  return false;
}

// Folds `value` into a same-shape alternative if one exists, else appends it; flattens nested union nodes so alternatives are never union nodes themselves.
function mergeValueIntoAlts(alts: unknown[], value: unknown): unknown[] {
  if (isUnionNode(value)) {
    let acc = alts;
    for (const v of value[UNION_KEY]) {
      acc = mergeValueIntoAlts(acc, v);
    }
    return acc;
  }

  for (let i = 0; i < alts.length; i++) {
    if (canMergeSameShape(alts[i], value)) {
      const next = [...alts];
      next[i] = mergeSchemaValues(alts[i], value);
      return next;
    }
  }

  return [...alts, value];
}

// Same-shape values are merged structurally; differently-shaped values become (or extend) a union node.
export function mergeSchemaValues(a: any, b: any): any {
  if (a === undefined) return b;
  if (b === undefined) return a;

  if (isUnionNode(a) || isUnionNode(b)) {
    const baseAlts: unknown[] = isUnionNode(a) ? [...a[UNION_KEY]] : [a];
    const incoming: unknown[] = isUnionNode(b) ? b[UNION_KEY] : [b];
    let alts = baseAlts;
    for (const v of incoming) {
      alts = mergeValueIntoAlts(alts, v);
    }
    return alts.length === 1 ? alts[0] : { [UNION_KEY]: alts };
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const result: Record<string, any> = { ...a };
    for (const key in b) {
      result[key] =
        key in result ? mergeSchemaValues(result[key], b[key]) : b[key];
    }
    return result;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    // Arrays represent z.array(itemSchema) as a single-element array holding the item schema.
    if (a.length === 0) return b;
    if (b.length === 0) return a;
    return [mergeSchemaValues(a[0], b[0])];
  }

  if (typeof a === "string" && typeof b === "string" && a === b) {
    return a;
  }

  // Different shapes/types entirely -> union.
  return { [UNION_KEY]: mergeValueIntoAlts([a], b) };
}

export function deepMerge<T extends Record<string, any>>(
  target: T,
  source: T,
): T {
  return mergeSchemaValues(target, source);
}

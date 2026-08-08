import { isPlainObject } from "./types.js";
import { mergeSchemaValues } from "./mergeSchemaValues.js";

// Converts a raw JSON value straight into the schema-JSON tag format ("string"/"int"/"coerce.date"/etc.) used throughout this package, with no TS round-trip.
export function classifyRawString(value: string): string {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "email";
  if (/^https?:\/\//.test(value)) return "url";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "coerce.date";
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return "uuid";
  }
  return "string";
}

export function rawValueToSchemaJson(value: unknown): any {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return ["unknown"];
    }
    // Merges every element's schema together rather than using only the first, since later items can have different optional fields present.
    const itemSchema = value
      .map((item) => rawValueToSchemaJson(item))
      .reduce((a, b) => mergeSchemaValues(a, b));
    return [itemSchema];
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, rawValueToSchemaJson(v)]),
    );
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "number";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "string") {
    return classifyRawString(value);
  }

  return "unknown";
}

export function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(sortKeys) as T;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)])) as T;
  }
  return value;
}

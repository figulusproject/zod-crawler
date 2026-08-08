export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export function isPlainObject(x: unknown): x is Record<string, JsonValue> {
  return Object.prototype.toString.call(x) === "[object Object]";
}

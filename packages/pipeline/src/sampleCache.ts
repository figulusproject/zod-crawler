// Generic get/set rather than a filesystem-shaped interface, since "cache directory" has no browser analogue - a Node caller backs this with fs (see @zod-crawler/pipeline-node's nodeSampleCache), a future browser caller would use the Cache API instead.
export interface SampleCache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

// bigint isn't JSON-serializable by default, and a pluggable fetchOne could plausibly produce one.
export function bigintSafeStringify(data: unknown): string {
  return JSON.stringify(
    data,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

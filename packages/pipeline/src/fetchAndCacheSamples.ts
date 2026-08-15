import type { JsonValue } from "@zod-crawler/core";
import { bigintSafeStringify, type SampleCache } from "./sampleCache.js";
import { hashId } from "./hashId.js";
import type { FetchProgressEvent } from "./fetchProgressEvent.js";

export type { FetchProgressEvent } from "./fetchProgressEvent.js";

export interface FetchAndCacheSamplesOptions {
  ids: string[];
  cache: SampleCache;
  delayMs: number;
  fetchOne: (id: string) => Promise<unknown>;
  onProgress?: (event: FetchProgressEvent) => void;
  // When true (the default), a failed fetch is reported via onProgress and skipped rather than aborting the whole run.
  continueOnError?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A miss re-parses what was just written to the cache, so a cache hit and miss always produce byte-identical shapes; a partial failure leaves fetched ids cached for a resumed re-run. For a BullMQ-backed queue instead of this plain sequential loop, see @zod-crawler/pipeline-node's runBullmqFetchQueue - a caller picks between the two, this function has no knowledge of Redis.
export async function fetchAndCacheSamples({
  ids,
  cache,
  delayMs,
  fetchOne,
  onProgress,
  continueOnError = true,
}: FetchAndCacheSamplesOptions): Promise<Record<string, JsonValue>> {
  const samples: Record<string, JsonValue> = {};

  for (let index = 0; index < ids.length; index++) {
    const id = ids[index];
    const key = await hashId(id);
    const total = ids.length;
    const isLast = index === ids.length - 1;

    const cached = await cache.get(key);
    if (cached !== undefined) {
      onProgress?.({ id, index, total, status: "cached" });
      samples[id] = JSON.parse(cached);
      continue;
    }

    onProgress?.({ id, index, total, status: "fetching" });
    let data: unknown;
    try {
      data = await fetchOne(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onProgress?.({ id, index, total, status: "error", error: message });
      if (!continueOnError) {
        throw new Error(`Failed to fetch id "${id}": ${message}`, {
          cause: error,
        });
      }
      if (delayMs > 0 && !isLast) {
        await sleep(delayMs);
      }
      continue;
    }

    const serialized = bigintSafeStringify(data);
    await cache.set(key, serialized);

    samples[id] = JSON.parse(serialized);
    onProgress?.({ id, index, total, status: "done" });

    if (delayMs > 0 && !isLast) {
      await sleep(delayMs);
    }
  }

  return samples;
}

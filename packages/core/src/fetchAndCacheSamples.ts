import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonValue } from "./types.js";
import {
  bigintSafeStringify,
  cacheFilePath,
  ensureCacheDir,
  fileExists,
  recordManifestEntry,
} from "./sampleCache.js";
import { runBullmqFetchQueue } from "./bullmqFetchQueue.js";
import type { FetchProgressEvent } from "./fetchProgressEvent.js";

export { hasCachedSample } from "./sampleCache.js";
export type { FetchProgressEvent } from "./fetchProgressEvent.js";

export interface FetchAndCacheSamplesOptions {
  ids: string[];
  outputDir: string;
  delayMs: number;
  fetchOne: (id: string) => Promise<unknown>;
  onProgress?: (event: FetchProgressEvent) => void;
  // When true (the default), a failed fetch is reported via onProgress and skipped rather than aborting the whole run.
  continueOnError?: boolean;
  // When set, fetches run through a BullMQ-backed queue (retries with backoff, per-domain cooldowns) against this Redis-protocol server instead of the plain sequential loop. Valkey recommended over Redis itself; see apps/cli/README.md's "Advanced queuing" section for why.
  redisUrl?: string;
  // Only meaningful alongside redisUrl; how many fetches the BullMQ worker runs at once.
  concurrency?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A miss re-parses what was just written to disk, so a cache hit and miss always produce byte-identical shapes; a partial failure leaves fetched ids cached for a resumed re-run.
export async function fetchAndCacheSamples({
  ids,
  outputDir,
  delayMs,
  fetchOne,
  onProgress,
  continueOnError = true,
  redisUrl,
  concurrency,
}: FetchAndCacheSamplesOptions): Promise<Record<string, JsonValue>> {
  const cacheDir = await ensureCacheDir(outputDir);

  const samples: Record<string, JsonValue> = {};

  if (redisUrl) {
    await runBullmqFetchQueue({
      ids,
      cacheDir,
      fetchOne,
      redisUrl,
      concurrency: concurrency ?? 1,
      cooldownMs: delayMs,
      continueOnError,
      onProgress,
      samples,
    });
    return samples;
  }

  for (let index = 0; index < ids.length; index++) {
    const id = ids[index];
    const cachePath = cacheFilePath(cacheDir, id);
    const total = ids.length;
    const isLast = index === ids.length - 1;

    if (await fileExists(cachePath)) {
      onProgress?.({ id, index, total, status: "cached" });
      samples[id] = JSON.parse(await readFile(cachePath, "utf8"));
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
    await writeFile(cachePath, serialized);
    await recordManifestEntry(cacheDir, id, path.basename(cachePath));

    samples[id] = JSON.parse(serialized);
    onProgress?.({ id, index, total, status: "done" });

    if (delayMs > 0 && !isLast) {
      await sleep(delayMs);
    }
  }

  return samples;
}

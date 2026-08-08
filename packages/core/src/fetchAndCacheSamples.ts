import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonValue } from "./types.js";

export interface FetchProgressEvent {
  id: string;
  index: number;
  total: number;
  status: "cached" | "fetching" | "done" | "error";
}

export interface FetchAndCacheSamplesOptions {
  ids: string[];
  outputDir: string;
  delayMs: number;
  fetchOne: (id: string) => Promise<unknown>;
  onProgress?: (event: FetchProgressEvent) => void;
}

// bigint isn't JSON-serializable by default, and a pluggable fetchOne could plausibly produce one.
function bigintSafeStringify(data: unknown): string {
  return JSON.stringify(
    data,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

// ids can be arbitrary strings (including full URLs), not safe as filenames as-is; a content hash sidesteps that.
function cacheFilePath(cacheDir: string, id: string): string {
  const hash = createHash("sha256").update(id).digest("hex");
  return path.join(cacheDir, `${hash}.json`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Exposed so callers outside the fetch loop (the crawl-candidates filter) can check cache membership using the same hash scheme.
export async function hasCachedSample(
  cacheDir: string,
  id: string,
): Promise<boolean> {
  return fileExists(cacheFilePath(cacheDir, id));
}

// Best-effort record of which cache file corresponds to which id; never read back for cache-hit detection, so a corrupt manifest is never an actual bug.
async function recordManifestEntry(
  cacheDir: string,
  id: string,
  filename: string,
): Promise<void> {
  const manifestPath = path.join(cacheDir, "manifest.json");
  try {
    let manifest: Record<string, string> = {};
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      // Missing or corrupt, start fresh.
    }
    manifest[id] = filename;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  } catch {
    // Never let a manifest-write failure fail the actual fetch/cache.
  }
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
}: FetchAndCacheSamplesOptions): Promise<Record<string, JsonValue>> {
  const cacheDir = path.join(outputDir, "cache");
  await mkdir(cacheDir, { recursive: true });

  const samples: Record<string, JsonValue> = {};

  for (let index = 0; index < ids.length; index++) {
    const id = ids[index];
    const cachePath = cacheFilePath(cacheDir, id);
    const total = ids.length;

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
      onProgress?.({ id, index, total, status: "error" });
      throw new Error(
        `Failed to fetch id "${id}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

    const serialized = bigintSafeStringify(data);
    await writeFile(cachePath, serialized);
    await recordManifestEntry(cacheDir, id, path.basename(cachePath));

    samples[id] = JSON.parse(serialized);
    onProgress?.({ id, index, total, status: "done" });

    const isLast = index === ids.length - 1;
    if (delayMs > 0 && !isLast) {
      await sleep(delayMs);
    }
  }

  return samples;
}

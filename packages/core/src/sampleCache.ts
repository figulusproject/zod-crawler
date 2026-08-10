import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// bigint isn't JSON-serializable by default, and a pluggable fetchOne could plausibly produce one.
export function bigintSafeStringify(data: unknown): string {
  return JSON.stringify(
    data,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

// ids can be arbitrary strings (including full URLs), not safe as filenames as-is; a content hash sidesteps that.
export function cacheFilePath(cacheDir: string, id: string): string {
  const hash = createHash("sha256").update(id).digest("hex");
  return path.join(cacheDir, `${hash}.json`);
}

export async function fileExists(filePath: string): Promise<boolean> {
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

// Best-effort record of which cache file corresponds to which id. Never read back for cache-hit detection, so a corrupt manifest is never an actual bug.
export async function recordManifestEntry(
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

export async function ensureCacheDir(outputDir: string): Promise<string> {
  const cacheDir = path.join(outputDir, "cache");
  await mkdir(cacheDir, { recursive: true });
  return cacheDir;
}

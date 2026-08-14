import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SampleCache } from "@zod-crawler/pipeline";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Best-effort record of which cache file corresponds to which key. Never read back for cache-hit detection, so a corrupt manifest is never an actual bug.
async function recordManifestEntry(
  cacheDir: string,
  key: string,
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
    manifest[key] = filename;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  } catch {
    // Never let a manifest-write failure fail the actual fetch/cache.
  }
}

// The Node SampleCache: one file per key under <outputDir>/cache, plus a best-effort manifest.json for debugging. Ensures the cache dir exists once, up front, rather than on every get/set.
export function createNodeSampleCache(outputDir: string): SampleCache {
  const cacheDir = path.join(outputDir, "cache");
  const ready = mkdir(cacheDir, { recursive: true });

  return {
    async get(key) {
      await ready;
      const filePath = path.join(cacheDir, `${key}.json`);
      return (await fileExists(filePath))
        ? await readFile(filePath, "utf8")
        : undefined;
    },
    async set(key, value) {
      await ready;
      const filename = `${key}.json`;
      await writeFile(path.join(cacheDir, filename), value);
      await recordManifestEntry(cacheDir, key, filename);
    },
  };
}

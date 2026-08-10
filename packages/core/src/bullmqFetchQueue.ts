import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonValue } from "./types.js";
import type { FetchProgressEvent } from "./fetchProgressEvent.js";
import {
  bigintSafeStringify,
  cacheFilePath,
  fileExists,
  hashId,
  recordManifestEntry,
} from "./sampleCache.js";
import { parseRedisUrl } from "./redisConnection.js";
import { createDomainCooldownGate } from "./domainCooldownGate.js";
import { FetchHttpError } from "./urlFetcher.js";

export interface RunBullmqFetchQueueOptions {
  ids: string[];
  cacheDir: string;
  fetchOne: (id: string) => Promise<unknown>;
  redisUrl: string;
  concurrency: number;
  // Per-domain pacing (reuses the same knob the sequential queue uses as its global pacing).
  cooldownMs: number;
  continueOnError: boolean;
  onProgress?: (event: FetchProgressEvent) => void;
  // Populated in place with every successfully fetched (or cache-hit) sample.
  samples: Record<string, JsonValue>;
  // Derives a deterministic queue name so a restarted process can reconnect to it; omitted callers get a random one.
  crawlId?: string;
}

interface JobData {
  id: string;
  index: number;
}

const RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 2000;

// Ids that are themselves full URLs (no --url-template, or crawl-candidate URLs spanning multiple hosts) get their own cooldown bucket - a bare id used with a template collapses to one shared bucket, equivalent to global pacing.
function domainOf(id: string): string {
  try {
    return new URL(id).hostname;
  } catch {
    return "default";
  }
}

async function importBullmq(): Promise<typeof import("bullmq")> {
  try {
    return await import("bullmq");
  } catch (error) {
    throw new Error(
      'A Redis URL was provided but "bullmq" (and its peer dependency "ioredis") aren\'t installed. ' +
        "Run `npm install bullmq ioredis` to enable Redis-backed queuing, or omit --redis-url/REDIS_URL to use the default queue.",
      { cause: error },
    );
  }
}

export async function runBullmqFetchQueue({
  ids,
  cacheDir,
  fetchOne,
  redisUrl,
  concurrency,
  cooldownMs,
  continueOnError,
  onProgress,
  samples,
  crawlId,
}: RunBullmqFetchQueueOptions): Promise<void> {
  const total = ids.length;

  // Cache pre-pass, same semantics as the sequential loop's cache-hit branch, done up front so the queue only ever sees ids that actually need a fetch.
  const toFetch: JobData[] = [];
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index];
    const cachePath = cacheFilePath(cacheDir, id);
    if (await fileExists(cachePath)) {
      onProgress?.({ id, index, total, status: "cached" });
      samples[id] = JSON.parse(await readFile(cachePath, "utf8"));
    } else {
      toFetch.push({ id, index });
    }
  }

  if (toFetch.length === 0) return;

  const { Queue, Worker, UnrecoverableError } = await importBullmq();
  const connection = parseRedisUrl(redisUrl);
  const cooldownGate = createDomainCooldownGate(connection, cooldownMs);

  const queueName = crawlId
    ? `zod-crawler-fetch-${crawlId}`
    : `zod-crawler-fetch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const queue = new Queue<JobData, unknown, string>(queueName, { connection });

  async function writeSuccess(id: string, data: unknown): Promise<void> {
    const cachePath = cacheFilePath(cacheDir, id);
    const serialized = bigintSafeStringify(data);
    await writeFile(cachePath, serialized);
    await recordManifestEntry(cacheDir, id, path.basename(cachePath));
    samples[id] = JSON.parse(serialized);
  }

  await new Promise<void>((resolve, reject) => {
    let finished = false;
    let settledCount = 0;
    let stopReason: Error | undefined;

    const worker = new Worker<JobData, unknown, string>(
      queueName,
      async (job) => {
        const { id } = job.data;
        onProgress?.({ id, index: job.data.index, total, status: "fetching" });
        try {
          return await cooldownGate.gate(domainOf(id), () => fetchOne(id));
        } catch (error) {
          if (
            error instanceof FetchHttpError &&
            error.status !== 429 &&
            error.status < 500
          ) {
            // Permanent failure (4xx other than 429): skip immediately, no retry budget spent.
            throw new UnrecoverableError(error.message);
          }
          throw error;
        }
      },
      { connection, concurrency },
    );

    async function shutdown(): Promise<void> {
      await worker.close();
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
      await cooldownGate.close();
    }

    function finishOnce(): void {
      if (finished) return;
      finished = true;
      shutdown()
        .then(() => (stopReason ? reject(stopReason) : resolve()))
        .catch(reject);
    }

    worker.on("completed", (job) => {
      const { id, index } = job.data;
      writeSuccess(id, job.returnvalue)
        .then(() => {
          // Only counted as settled once samples[id] is actually populated - otherwise a concurrent job's "failed" event could reach the total and resolve the whole run before this write lands.
          settledCount++;
          onProgress?.({ id, index, total, status: "done" });
          if (!finished && settledCount === toFetch.length) finishOnce();
        })
        .catch(reject);
    });

    worker.on("failed", (job, err) => {
      if (!job) return;
      // The "failed" event fires after every failed attempt, not just the last one - job.finishedOn is only set once BullMQ has given up (attempts exhausted, or an UnrecoverableError), which is the only point this id's outcome is actually final.
      if (job.finishedOn === undefined) return;

      settledCount++;
      const { id, index } = job.data;
      const message = err instanceof Error ? err.message : String(err);
      onProgress?.({ id, index, total, status: "error", error: message });

      if (!continueOnError && !stopReason) {
        stopReason = new Error(`Failed to fetch id "${id}": ${message}`, {
          cause: err,
        });
        // Graceful: worker.close() lets any still-active jobs finish (so their cache writes still land) before resolving. Anything still waiting in the queue is discarded by obliterate() in shutdown().
        finishOnce();
        return;
      }

      if (!finished && settledCount === toFetch.length) finishOnce();
    });

    worker.on("error", (error) => {
      if (!finished) {
        stopReason = error;
        finishOnce();
      }
    });

    Promise.all(
      toFetch.map((data) =>
        queue.add("fetch", data, {
          // Dedup key so a resumed run can re-add every not-yet-cached id without double-enqueuing one still in flight; hashed since BullMQ rejects raw ids containing ":".
          jobId: hashId(data.id),
          attempts: RETRY_ATTEMPTS,
          backoff: { type: "exponential", delay: RETRY_BACKOFF_MS },
          removeOnComplete: true,
          removeOnFail: true,
        }),
      ),
    ).catch((error) => {
      if (!finished) {
        stopReason = error instanceof Error ? error : new Error(String(error));
        finishOnce();
      }
    });
  });
}

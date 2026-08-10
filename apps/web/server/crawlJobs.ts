import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import prettier from "prettier";
import {
  createUrlFetcher,
  DEFAULT_CONCURRENCY,
  fetchAndCacheSamples,
  findCrawlCandidates,
  inferSchema,
  validateSamples,
} from "@zod-crawler/core";
import type {
  CrawlCompleteEvent,
  CrawlErrorEvent,
  CrawlProgressEvent,
  FetchFailure,
  ValidationFailure,
} from "../shared/events.js";
import type { ResolvedCrawlRequest } from "./requestSchema.js";

// Long enough for a client reconnecting after a page refresh to still get the result, short enough not to leak memory for jobs nobody reconnects to.
const JOB_RETENTION_MS = 60_000;

// Deployment-level, not per-request: whoever runs the server opts every crawl into the BullMQ-backed queue by setting this, the same way PORT configures the server itself.
const REDIS_URL = process.env.REDIS_URL;

export interface CrawlJob {
  id: string;
  emitter: EventEmitter;
  status: "running" | "done" | "error";
  result?: CrawlCompleteEvent;
  error?: CrawlErrorEvent;
}

const jobs = new Map<string, CrawlJob>();

export function startCrawlJob(request: ResolvedCrawlRequest): string {
  const job: CrawlJob = {
    id: randomUUID(),
    emitter: new EventEmitter(),
    status: "running",
  };
  jobs.set(job.id, job);
  void runJob(job, request);
  return job.id;
}

export function getJob(jobId: string): CrawlJob | undefined {
  return jobs.get(jobId);
}

async function runJob(
  job: CrawlJob,
  request: ResolvedCrawlRequest,
): Promise<void> {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "zod-crawler-web-"));

  const fetchFailures: FetchFailure[] = [];

  try {
    const samples = await fetchAndCacheSamples({
      ids: request.ids,
      outputDir: tmpDir,
      delayMs: request.delayMs,
      fetchOne: createUrlFetcher(request.urlTemplate),
      continueOnError: !request.stopOnError,
      redisUrl: REDIS_URL,
      concurrency: REDIS_URL ? DEFAULT_CONCURRENCY : undefined,
      onProgress: (event: CrawlProgressEvent) => {
        if (event.status === "error" && event.error !== undefined) {
          fetchFailures.push({ id: event.id, error: event.error });
        }
        job.emitter.emit("progress", event);
      },
    });

    const schemaName = request.schemaName;
    const source = inferSchema(samples, schemaName, request.useZodTransformers);
    if (source === undefined) {
      throw new Error("Failed to generate a schema from the fetched samples.");
    }

    const results = validateSamples(source, schemaName, samples);
    const failures: ValidationFailure[] = [...results.entries()]
      .filter(
        (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
          entry[1] !== null,
      )
      .map(([id, error]) => ({ id, error: error.message }));

    const formatted = await prettier.format(source, { parser: "typescript" });

    const complete: CrawlCompleteEvent = {
      schema: formatted,
      schemaName,
      validation: { total: results.size, failures },
      fetchFailures,
      candidates: request.emitCrawlCandidates
        ? findNewCrawlCandidates(samples, request.ids)
        : undefined,
    };

    job.status = "done";
    job.result = complete;
    job.emitter.emit("complete", complete);
  } catch (error) {
    const crawlError: CrawlErrorEvent = {
      message: error instanceof Error ? error.message : String(error),
    };
    job.status = "error";
    job.error = crawlError;
    job.emitter.emit("failed", crawlError);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    setTimeout(() => jobs.delete(job.id), JOB_RETENTION_MS).unref();
  }
}

// This run's tmp dir is always freshly created, so there's nothing pre-cached to exclude.
function findNewCrawlCandidates(
  samples: Parameters<typeof findCrawlCandidates>[0],
  seedIds: readonly string[],
) {
  const seeds = new Set(seedIds);
  return findCrawlCandidates(samples)
    .map((group) => ({
      path: group.path,
      values: group.values.filter((value) => !seeds.has(value)),
    }))
    .filter((group) => group.values.length > 0);
}

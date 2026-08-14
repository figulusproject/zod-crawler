import {
  findCrawlCandidates,
  inferSchema,
  validateSamples,
  type CrawlCandidateField,
} from "@zod-crawler/core";
import { fetchAndCacheSamples } from "@zod-crawler/pipeline";
import {
  createBrowserUrlFetcher,
  createCacheApiSampleCache,
} from "@zod-crawler/pipeline-browser";
import { format } from "prettier/standalone";
import * as prettierPluginEstree from "prettier/plugins/estree";
import * as prettierPluginTypescript from "prettier/plugins/typescript";
import type {
  CrawlErrorEvent,
  CrawlWorkerRequest,
  CrawlWorkerRequestMessage,
  CrawlWorkerResponseMessage,
} from "./crawlWorkerProtocol.js";

function post(message: CrawlWorkerResponseMessage): void {
  self.postMessage(message);
}

// Mirrors crawlJobs.ts's own findNewCrawlCandidates.
function findNewCrawlCandidates(
  samples: Parameters<typeof findCrawlCandidates>[0],
  seedIds: readonly string[],
): CrawlCandidateField[] {
  const seeds = new Set(seedIds);
  return findCrawlCandidates(samples)
    .map((group) => ({
      path: group.path,
      values: group.values.filter((value) => !seeds.has(value)),
    }))
    .filter((group) => group.values.length > 0);
}

async function runCrawl(request: CrawlWorkerRequest): Promise<void> {
  const cache = createCacheApiSampleCache();
  const fetchOne = createBrowserUrlFetcher({
    urlTemplate: request.urlTemplate,
    corsProxyUrl: request.corsProxyUrl,
  });

  const fetchFailures: { id: string; error: string }[] = [];

  const samples = await fetchAndCacheSamples({
    ids: request.ids,
    cache,
    delayMs: request.delayMs,
    fetchOne,
    continueOnError: !request.stopOnError,
    onProgress: (event) => {
      if (event.status === "error" && event.error !== undefined) {
        fetchFailures.push({ id: event.id, error: event.error });
      }
      post({ type: "progress", event });
    },
  });

  const source = inferSchema(
    samples,
    request.schemaName,
    request.useZodTransformers,
  );
  if (source === undefined) {
    throw new Error("Failed to generate a schema from the fetched samples.");
  }

  const results = validateSamples(source, request.schemaName, samples);
  const failures = [...results.entries()]
    .filter(
      (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
        entry[1] !== null,
    )
    .map(([id, error]) => ({ id, error: error.message }));

  const formatted = await format(source, {
    parser: "typescript",
    plugins: [prettierPluginTypescript, prettierPluginEstree],
  });

  post({
    type: "complete",
    event: {
      schema: formatted,
      schemaName: request.schemaName,
      validation: { total: results.size, failures },
      fetchFailures,
      candidates: request.emitCrawlCandidates
        ? findNewCrawlCandidates(samples, request.ids)
        : undefined,
    },
  });
}

self.addEventListener(
  "message",
  (event: MessageEvent<CrawlWorkerRequestMessage>) => {
    if (event.data.type !== "start") return;
    runCrawl(event.data.request).catch((error: unknown) => {
      const failed: CrawlErrorEvent = {
        message: error instanceof Error ? error.message : String(error),
      };
      post({ type: "failed", event: failed });
    });
  },
);

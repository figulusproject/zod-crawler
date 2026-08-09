import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import prettier from "prettier";
import {
  createUrlFetcher,
  fetchAndCacheSamples,
  findCrawlCandidates,
  hasCachedSample,
  inferSchema,
  validateSamples,
  type FetchProgressEvent,
} from "@zod-crawler/core";
import { parseCliArgs, USAGE } from "./cliArgs.js";

// Prints fetch/cache status lines to stderr; the web app renders the same FetchProgressEvent stream as SSE messages instead.
function logFetchProgress(event: FetchProgressEvent): void {
  if (event.status === "cached" || event.status === "fetching") {
    console.error(
      `${event.status} ${event.index + 1}/${event.total}: ${event.id}`,
    );
  } else if (event.status === "error") {
    console.error(
      `error ${event.index + 1}/${event.total}: ${event.id}: ${event.error}`,
    );
  }
}

// Split out of index.ts so the pipeline is testable without mocking process.exit; returns the exit code instead of calling exit itself.
export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    console.error(parsed.message);
    console.error(USAGE);
    return 1;
  }
  const { settings } = parsed;

  await mkdir(settings.outputDir, { recursive: true });

  let samples;
  try {
    samples = await fetchAndCacheSamples({
      ids: settings.ids,
      outputDir: settings.outputDir,
      delayMs: settings.delayMs,
      fetchOne: createUrlFetcher(settings.urlTemplate),
      onProgress: logFetchProgress,
      continueOnError: !settings.stopOnError,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const failedFetchCount = settings.ids.length - Object.keys(samples).length;
  if (failedFetchCount > 0) {
    console.error(
      `${failedFetchCount}/${settings.ids.length} id(s) failed to fetch and were skipped.`,
    );
  }

  const source = inferSchema(
    samples,
    settings.schemaName,
    settings.useZodTransformers,
  );
  if (source === undefined) {
    console.error("Failed to generate a schema from the fetched samples.");
    return 1;
  }

  // Validate the raw source, not a reformatted copy: evalGeneratedSchema depends on convertToZod's exact output shape.
  const results = validateSamples(source, settings.schemaName, samples);

  const formatted = await prettier.format(source, { parser: "typescript" });
  const schemaPath = path.join(settings.outputDir, "schema.ts");
  // Written unconditionally, whether validation passed or not
  await writeFile(schemaPath, formatted);

  const failures = [...results.entries()].filter(([, error]) => error !== null);

  let exitCode: number;
  if (failures.length === 0) {
    console.log(
      `Wrote ${schemaPath}. All ${results.size} sample(s) validated successfully.`,
    );
    exitCode = 0;
  } else {
    console.log(
      `Wrote ${schemaPath}. ${failures.length}/${results.size} sample(s) failed validation:`,
    );
    for (const [id, error] of failures) {
      console.error("");
      console.error(`=== ${id} ===`);
      console.error(error);
    }
    exitCode = 1;
  }

  if (settings.emitCrawlCandidates) {
    await writeCrawlCandidates(samples, settings.ids, settings.outputDir);
  }

  return exitCode;
}

// Writes only new candidates (not a seed id, not already cached), in the same one-per-line format --ids-file reads.
async function writeCrawlCandidates(
  samples: Awaited<ReturnType<typeof fetchAndCacheSamples>>,
  seedIds: readonly string[],
  outputDir: string,
): Promise<void> {
  const seen = new Set<string>();
  for (const group of findCrawlCandidates(samples)) {
    for (const value of group.values) seen.add(value);
  }
  for (const id of seedIds) seen.delete(id);

  const cacheDir = path.join(outputDir, "cache");
  const newCandidates: string[] = [];
  for (const value of seen) {
    if (!(await hasCachedSample(cacheDir, value))) {
      newCandidates.push(value);
    }
  }
  newCandidates.sort();

  const candidatesPath = path.join(outputDir, "crawl-candidates.txt");
  await writeFile(
    candidatesPath,
    newCandidates.map((id) => `${id}\n`).join(""),
  );
  console.log(
    `Wrote ${candidatesPath}. ${newCandidates.length} new crawl candidate(s) found.`,
  );
}

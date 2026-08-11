import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { openSync, closeSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
import { parseCliArgs, USAGE, type CliSettings } from "./cliArgs.js";

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

  if (settings.detach) {
    return runDetached(settings);
  }

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
      redisUrl: settings.redisUrl,
      concurrency: settings.concurrency,
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

// Re-invokes this same CLI as a detached child with --detach stripped (settings has no way to express it, so it can't round-trip back in), then returns immediately without waiting for the crawl itself. There's no status subcommand yet, so the log file and pid printed here are the only way to check on it later.
async function runDetached(settings: CliSettings): Promise<number> {
  await mkdir(settings.outputDir, { recursive: true });

  // Newline-delimited, not --ids <comma-joined>, so an id containing a comma can't be misparsed on the child side.
  const idsFile = path.join(tmpdir(), `zod-crawler-ids-${randomUUID()}.txt`);
  await writeFile(idsFile, settings.ids.map((id) => `${id}\n`).join(""));

  const childArgs = ["--ids-file", idsFile, "--output", settings.outputDir];
  if (settings.urlTemplate !== undefined) {
    childArgs.push("--url-template", settings.urlTemplate);
  }
  childArgs.push("--delay", String(settings.delayMs));
  childArgs.push("--schema-name", settings.schemaName);
  if (settings.emitCrawlCandidates) childArgs.push("--emit-crawl-candidates");
  if (settings.useZodTransformers) childArgs.push("--zod-transformers");
  if (settings.stopOnError) childArgs.push("--stop-on-error");
  if (settings.redisUrl !== undefined) {
    childArgs.push("--redis-url", settings.redisUrl);
  }
  if (settings.concurrency !== undefined) {
    childArgs.push("--concurrency", String(settings.concurrency));
  }

  const logPath = path.join(settings.outputDir, "zod-crawler.log");
  const logFd = openSync(logPath, "a");

  // Resolved from this module's own location, not process.argv[1]: works the same whether invoked via the installed bin, npx, or a direct node call.
  const scriptPath = fileURLToPath(new URL("index.js", import.meta.url));
  const child = spawn(process.execPath, [scriptPath, ...childArgs], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });

  const spawned = await new Promise<{ ok: true } | { ok: false; error: Error }>(
    (resolve) => {
      child.once("spawn", () => resolve({ ok: true }));
      child.once("error", (error) => resolve({ ok: false, error }));
    },
  );
  closeSync(logFd);

  if (!spawned.ok) {
    console.error(`Failed to start detached crawl: ${spawned.error.message}`);
    return 1;
  }

  child.unref();
  console.log(`Started crawl in the background (pid ${child.pid}).`);
  console.log(`Logs: ${logPath}`);
  console.log(`Output: ${settings.outputDir}`);
  return 0;
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

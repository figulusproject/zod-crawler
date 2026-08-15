import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { openSync, closeSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import {
  createUrlFetcher,
  crawlCandidatesFormatters,
  findCrawlCandidates,
  inferSchema,
  validateSamples,
  type CrawlCandidateField,
  type CrawlCandidatesFormat,
} from "@zod-crawler/core";
import {
  fetchAndCacheSamples,
  hasCachedSample,
  type FetchProgressEvent,
  type SampleCache,
} from "@zod-crawler/pipeline";
import {
  createNodeSampleCache,
  runBullmqFetchQueue,
} from "@zod-crawler/pipeline-node";
import {
  parseCliArgs,
  type CliSettings,
  type StatusSettings,
} from "./cliArgs.js";

const PID_FILENAME = "zod-crawler.pid";
const STATUS_FILENAME = "zod-crawler.status.json";
const LOG_FILENAME = "zod-crawler.log";
const DETACHED_ENV_VAR = "ZOD_CRAWLER_DETACHED";

interface PidFile {
  pid: number;
  startedAt: string;
  ids: number;
}

interface StatusFile {
  exitCode: number;
  finishedAt: string;
}

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
    console.error(parsed.usage);
    return 1;
  }

  if (parsed.command === "status") {
    return runStatus(parsed.settings);
  }

  const { settings } = parsed;

  if (settings.detach) {
    return runDetached(settings);
  }

  if (process.env[DETACHED_ENV_VAR] === "1") {
    let exitCode = 1;
    try {
      exitCode = await runCrawl(settings);
    } finally {
      await writeFile(
        path.join(settings.outputDir, STATUS_FILENAME),
        JSON.stringify({
          exitCode,
          finishedAt: new Date().toISOString(),
        } satisfies StatusFile),
      );
    }
    return exitCode;
  }

  return runCrawl(settings);
}

async function runCrawl(settings: CliSettings): Promise<number> {
  await mkdir(settings.outputDir, { recursive: true });

  const cache = createNodeSampleCache(settings.outputDir);
  const fetchOne = createUrlFetcher(settings.urlTemplate);

  let samples;
  try {
    samples = settings.redisUrl
      ? await runBullmqFetchQueue({
          ids: settings.ids,
          cache,
          fetchOne,
          onProgress: logFetchProgress,
          continueOnError: !settings.stopOnError,
          redisUrl: settings.redisUrl,
          concurrency: settings.concurrency,
          cooldownMs: settings.delayMs,
        })
      : await fetchAndCacheSamples({
          ids: settings.ids,
          cache,
          delayMs: settings.delayMs,
          fetchOne,
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
    await writeCrawlCandidates(
      samples,
      settings.ids,
      settings.outputDir,
      cache,
      settings.crawlCandidatesFormat,
    );
  }

  return exitCode;
}

// Re-invokes this same CLI as a detached child with --detach stripped (settings has no way to express it, so it can't round-trip back in), then returns immediately without waiting for the crawl itself. The "status" subcommand reads the pidfile written here and the status file the child writes on completion.
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
  if (settings.emitCrawlCandidates) {
    childArgs.push("--emit-crawl-candidates");
    childArgs.push("--crawl-candidates-format", settings.crawlCandidatesFormat);
  }
  if (settings.useZodTransformers) childArgs.push("--zod-transformers");
  if (settings.stopOnError) childArgs.push("--stop-on-error");
  if (settings.redisUrl !== undefined) {
    childArgs.push("--redis-url", settings.redisUrl);
  }
  if (settings.concurrency !== undefined) {
    childArgs.push("--concurrency", String(settings.concurrency));
  }

  const logPath = path.join(settings.outputDir, LOG_FILENAME);
  const logFd = openSync(logPath, "a");

  // Resolved from this module's own location, not process.argv[1]: works the same whether invoked via the installed bin, npx, or a direct node call.
  const scriptPath = fileURLToPath(new URL("index.js", import.meta.url));
  const child = spawn(process.execPath, [scriptPath, ...childArgs], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, [DETACHED_ENV_VAR]: "1" },
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

  await writeFile(
    path.join(settings.outputDir, PID_FILENAME),
    JSON.stringify({
      // spawn() sets pid synchronously. It's undefined only when spawning
      // fails outright, already ruled out by spawned.ok above.
      pid: child.pid!,
      startedAt: new Date().toISOString(),
      ids: settings.ids.length,
    } satisfies PidFile),
  );

  console.log(`Started crawl in the background (pid ${child.pid}).`);
  console.log(`Logs: ${logPath}`);
  console.log(`Output: ${settings.outputDir}`);
  return 0;
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function runStatus(settings: StatusSettings): Promise<number> {
  const pidFile = await readJsonFile<PidFile>(
    path.join(settings.outputDir, PID_FILENAME),
  );
  if (pidFile === undefined) {
    console.log(
      `No detached crawl found in ${settings.outputDir} (no ${PID_FILENAME}).`,
    );
    return 1;
  }

  const lines = [
    `Detached crawl in ${settings.outputDir}`,
    `  pid:      ${pidFile.pid}`,
    `  ids:      ${pidFile.ids}`,
    `  started:  ${pidFile.startedAt}`,
  ];

  const statusFile = await readJsonFile<StatusFile>(
    path.join(settings.outputDir, STATUS_FILENAME),
  );

  let exitCode: number;
  if (statusFile !== undefined) {
    lines.push(`  finished: ${statusFile.finishedAt}`);
    lines.push(
      `  status:   ${statusFile.exitCode === 0 ? "succeeded" : "failed"} (exit code ${statusFile.exitCode})`,
    );
    exitCode = statusFile.exitCode;
  } else if (isProcessAlive(pidFile.pid)) {
    lines.push("  status:   running");
    exitCode = 0;
  } else {
    lines.push(
      "  status:   not running (no completion record - it may have crashed)",
    );
    exitCode = 1;
  }

  lines.push(`  log:      ${path.join(settings.outputDir, LOG_FILENAME)}`);
  console.log(lines.join("\n"));
  return exitCode;
}

// Writes only new candidates (not a seed id, not already cached), grouped by field path like the web app's export.
async function writeCrawlCandidates(
  samples: Awaited<ReturnType<typeof fetchAndCacheSamples>>,
  seedIds: readonly string[],
  outputDir: string,
  cache: SampleCache,
  format: CrawlCandidatesFormat,
): Promise<void> {
  const seeds = new Set(seedIds);

  const groups: CrawlCandidateField[] = [];
  for (const group of findCrawlCandidates(samples)) {
    const values: string[] = [];
    for (const value of group.values) {
      if (seeds.has(value)) continue;
      if (await hasCachedSample(cache, value)) continue;
      values.push(value);
    }
    if (values.length > 0) groups.push({ path: group.path, values });
  }

  const uniqueCount = new Set(groups.flatMap((group) => group.values)).size;

  const formatter = crawlCandidatesFormatters[format];
  const candidatesPath = path.join(
    outputDir,
    `crawl-candidates.${formatter.extension}`,
  );
  await writeFile(candidatesPath, formatter.toText(groups));
  console.log(
    `Wrote ${candidatesPath}. ${uniqueCount} new crawl candidate(s) found.`,
  );
}

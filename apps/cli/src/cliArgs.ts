import { readFileSync } from "node:fs";
import { z } from "zod";
import { defineCli } from "zod-cli-flags";
import { numberString } from "zod-transformers";
import {
  SCHEMA_NAME_PATTERN,
  DEFAULT_DELAY_MS,
  DEFAULT_SCHEMA_NAME,
  DEFAULT_CONCURRENCY,
  CRAWL_CANDIDATES_FORMATS,
  crawlCandidatesFormatFromExtension,
  idsParsers,
  type CrawlCandidatesFormat,
} from "@zod-crawler/core";

export interface CliSettings {
  ids: string[];
  urlTemplate: string | undefined;
  outputDir: string;
  delayMs: number;
  schemaName: string;
  emitCrawlCandidates: boolean;
  crawlCandidatesFormat: CrawlCandidatesFormat;
  useZodTransformers: boolean;
  stopOnError: boolean;
  redisUrl: string | undefined;
  concurrency: number | undefined;
  detach: boolean;
}

export type ParseCliArgsResult =
  { ok: true; settings: CliSettings } | { ok: false; message: string };

const cli = defineCli({
  // The auto-generated usage below can't express "exactly one of --ids/--ids-file" as a group the
  // way the old hand-written string did - zod-cli-flags has no flag-grouping syntax yet
  // (https://github.com/figulusproject/zod-cli-flags/issues/7).
  flags: {
    ids: { schema: z.string().optional(), placeholder: "id1,id2,..." },
    idsFile: {
      schema: z.string().optional(),
      long: "ids-file",
      placeholder: "path",
    },
    urlTemplate: {
      schema: z.string().optional(),
      long: "url-template",
      placeholder: "template containing {id}",
    },
    output: { schema: z.string().optional(), placeholder: "dir" },
    delay: {
      schema: numberString({ integer: true, min: 0 }).optional(),
      placeholder: "ms",
    },
    schemaName: {
      schema: z.string().optional(),
      long: "schema-name",
      placeholder: "name",
    },
    emitCrawlCandidates: {
      schema: z.boolean().default(false),
      long: "emit-crawl-candidates",
    },
    crawlCandidatesFormat: {
      schema: z.enum(CRAWL_CANDIDATES_FORMATS).optional(),
      long: "crawl-candidates-format",
    },
    zodTransformers: {
      schema: z.boolean().default(false),
      long: "zod-transformers",
    },
    stopOnError: {
      schema: z.boolean().default(false),
      long: "stop-on-error",
    },
    redisUrl: {
      schema: z.string().optional(),
      long: "redis-url",
      placeholder: "url",
    },
    concurrency: {
      schema: numberString({ integer: true, min: 1 }).optional(),
      placeholder: "n",
    },
    detach: { schema: z.boolean().default(false), short: "d" },
  },
});

export const usage = cli.usage;

const settingsSchema = cli.flagsSchema.transform((raw, ctx): CliSettings => {
  if ((raw.ids === undefined) === (raw.idsFile === undefined)) {
    ctx.addIssue({
      code: "custom",
      message: "Exactly one of --ids or --ids-file is required.",
    });
    return z.NEVER;
  }

  let rawIds: string[];
  if (raw.ids !== undefined) {
    rawIds = raw.ids
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  } else {
    const idsFileFormat = crawlCandidatesFormatFromExtension(raw.idsFile!);
    if (idsFileFormat === undefined) {
      ctx.addIssue({
        code: "custom",
        message: `--ids-file "${raw.idsFile}" has an unrecognized extension - expected one of: ${CRAWL_CANDIDATES_FORMATS.join(", ")} (or .yml).`,
      });
      return z.NEVER;
    }

    let fileContents: string;
    try {
      fileContents = readFileSync(raw.idsFile!, "utf8");
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: `Could not read --ids-file "${raw.idsFile}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return z.NEVER;
    }

    try {
      rawIds = idsParsers[idsFileFormat](fileContents);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: `Could not parse --ids-file "${raw.idsFile}" as ${idsFileFormat}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return z.NEVER;
    }
  }

  const ids = [...new Set(rawIds)];
  if (ids.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "At least one id is required (from --ids or --ids-file).",
    });
    return z.NEVER;
  }

  if (raw.urlTemplate !== undefined && !raw.urlTemplate.includes("{id}")) {
    ctx.addIssue({
      code: "custom",
      message: `--url-template must contain the literal "{id}" placeholder, got "${raw.urlTemplate}".`,
    });
    return z.NEVER;
  }

  if (raw.output === undefined || raw.output.length === 0) {
    ctx.addIssue({ code: "custom", message: "--output is required." });
    return z.NEVER;
  }

  const delayMs = raw.delay ?? DEFAULT_DELAY_MS;

  const schemaName = raw.schemaName ?? DEFAULT_SCHEMA_NAME;
  if (!SCHEMA_NAME_PATTERN.test(schemaName)) {
    ctx.addIssue({
      code: "custom",
      message: `--schema-name must be a valid identifier, got "${schemaName}".`,
    });
    return z.NEVER;
  }

  if (raw.crawlCandidatesFormat !== undefined && !raw.emitCrawlCandidates) {
    ctx.addIssue({
      code: "custom",
      message:
        "--crawl-candidates-format requires --emit-crawl-candidates - it only applies to the crawl candidates file.",
    });
    return z.NEVER;
  }
  const crawlCandidatesFormat: CrawlCandidatesFormat =
    raw.crawlCandidatesFormat ?? "txt";

  const redisUrl = raw.redisUrl ?? process.env.REDIS_URL;
  if (raw.concurrency !== undefined && redisUrl === undefined) {
    ctx.addIssue({
      code: "custom",
      message:
        "--concurrency requires --redis-url (or a REDIS_URL environment variable) - it only applies to the BullMQ-backed queue.",
    });
    return z.NEVER;
  }
  const concurrency =
    redisUrl !== undefined
      ? (raw.concurrency ?? DEFAULT_CONCURRENCY)
      : undefined;

  return {
    ids,
    urlTemplate: raw.urlTemplate,
    outputDir: raw.output,
    delayMs,
    schemaName,
    emitCrawlCandidates: raw.emitCrawlCandidates,
    crawlCandidatesFormat,
    useZodTransformers: raw.zodTransformers,
    stopOnError: raw.stopOnError,
    redisUrl,
    concurrency,
    detach: raw.detach,
  };
});

export function parseCliArgs(argv: string[]): ParseCliArgsResult {
  const result = cli.parse(argv, settingsSchema);
  if (!result.success) {
    return { ok: false, message: result.error.message };
  }
  return { ok: true, settings: result.data };
}

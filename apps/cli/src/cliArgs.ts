import { readFileSync } from "node:fs";
import { z } from "zod";
import { defineCli } from "zod-cli-flags";
import { numberString } from "zod-transformers";
import {
  SCHEMA_NAME_PATTERN,
  DEFAULT_DELAY_MS,
  DEFAULT_SCHEMA_NAME,
  DEFAULT_CONCURRENCY,
} from "@zod-crawler/core";

export interface CliSettings {
  ids: string[];
  urlTemplate: string | undefined;
  outputDir: string;
  delayMs: number;
  schemaName: string;
  emitCrawlCandidates: boolean;
  useZodTransformers: boolean;
  stopOnError: boolean;
  redisUrl: string | undefined;
  concurrency: number | undefined;
}

export type ParseCliArgsResult =
  { ok: true; settings: CliSettings } | { ok: false; message: string };

export const USAGE =
  "Usage: zod-crawler (--ids <id1,id2,...> | --ids-file <path>) --output <dir> " +
  "[--url-template <template containing {id}>] [--delay <ms>] [--schema-name <name>] " +
  "[--emit-crawl-candidates] [--zod-transformers] [--stop-on-error] " +
  "[--redis-url <url>] [--concurrency <n>]";

const cli = defineCli({
  flags: {
    ids: { schema: z.string().optional() },
    idsFile: { schema: z.string().optional(), long: "ids-file" },
    urlTemplate: { schema: z.string().optional(), long: "url-template" },
    output: { schema: z.string().optional() },
    delay: { schema: numberString({ integer: true, min: 0 }).optional() },
    schemaName: { schema: z.string().optional(), long: "schema-name" },
    emitCrawlCandidates: {
      schema: z.boolean().default(false),
      long: "emit-crawl-candidates",
    },
    zodTransformers: {
      schema: z.boolean().default(false),
      long: "zod-transformers",
    },
    stopOnError: {
      schema: z.boolean().default(false),
      long: "stop-on-error",
    },
    redisUrl: { schema: z.string().optional(), long: "redis-url" },
    concurrency: {
      schema: numberString({ integer: true, min: 1 }).optional(),
    },
  },
  usage: USAGE,
});

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
    rawIds = fileContents
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
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
    useZodTransformers: raw.zodTransformers,
    stopOnError: raw.stopOnError,
    redisUrl,
    concurrency,
  };
});

export function parseCliArgs(argv: string[]): ParseCliArgsResult {
  const result = cli.parse(argv, settingsSchema);
  if (!result.success) {
    return { ok: false, message: result.error.message };
  }
  return { ok: true, settings: result.data };
}

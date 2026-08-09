import { z } from "zod";
import {
  DEFAULT_DELAY_MS,
  DEFAULT_SCHEMA_NAME,
  SCHEMA_NAME_PATTERN,
} from "@zod-crawler/core";

export interface ResolvedCrawlRequest {
  ids: string[];
  urlTemplate?: string;
  delayMs: number;
  schemaName: string;
  emitCrawlCandidates: boolean;
  useZodTransformers: boolean;
  stopOnError: boolean;
}

const rawRequestSchema = z.object({
  ids: z.array(z.string()),
  urlTemplate: z.string().optional(),
  delayMs: z.coerce.number().int().min(0).optional(),
  schemaName: z.string().optional(),
  emitCrawlCandidates: z.boolean().default(false),
  useZodTransformers: z.boolean().default(false),
  stopOnError: z.boolean().default(false),
});

// Mirrors the CLI's settingsSchema transform (apps/cli/src/cliArgs.ts), from the same constants so the two can't drift.
export const crawlRequestSchema = rawRequestSchema.transform(
  (raw, ctx): ResolvedCrawlRequest => {
    const ids = [
      ...new Set(raw.ids.map((id) => id.trim()).filter((id) => id.length > 0)),
    ];
    if (ids.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["ids"],
        message: "At least one id is required.",
      });
      return z.NEVER;
    }

    if (raw.urlTemplate !== undefined && !raw.urlTemplate.includes("{id}")) {
      ctx.addIssue({
        code: "custom",
        path: ["urlTemplate"],
        message: `urlTemplate must contain the literal "{id}" placeholder, got "${raw.urlTemplate}".`,
      });
      return z.NEVER;
    }

    const schemaName = raw.schemaName ?? DEFAULT_SCHEMA_NAME;
    if (!SCHEMA_NAME_PATTERN.test(schemaName)) {
      ctx.addIssue({
        code: "custom",
        path: ["schemaName"],
        message: `schemaName must be a valid identifier, got "${schemaName}".`,
      });
      return z.NEVER;
    }

    return {
      ids,
      urlTemplate: raw.urlTemplate,
      delayMs: raw.delayMs ?? DEFAULT_DELAY_MS,
      schemaName,
      emitCrawlCandidates: raw.emitCrawlCandidates,
      useZodTransformers: raw.useZodTransformers,
      stopOnError: raw.stopOnError,
    };
  },
);

import {
  DEFAULT_DELAY_MS,
  DEFAULT_SCHEMA_NAME,
  MIN_DELAY_MS,
  type CrawlCandidateField,
} from "@zod-crawler/core";
import type { FetchProgressEvent } from "@zod-crawler/pipeline";

export { MIN_DELAY_MS };

export interface FormState {
  idsText: string;
  urlTemplate: string;
  delayMs: string;
  schemaName: string;
  emitCrawlCandidates: boolean;
  useZodTransformers: boolean;
  stopOnError: boolean;
}

export const DEFAULT_FORM_STATE: FormState = {
  idsText: "",
  urlTemplate: "",
  delayMs: String(DEFAULT_DELAY_MS),
  schemaName: DEFAULT_SCHEMA_NAME,
  emitCrawlCandidates: false,
  useZodTransformers: false,
  stopOnError: false,
};

export interface ProgressRow {
  id: string;
  status: "pending" | FetchProgressEvent["status"];
  error?: string;
}

export interface ValidationFailure {
  id: string;
  error: string;
}

export interface FetchFailure {
  id: string;
  error: string;
}

export interface CrawlCompleteEvent {
  schema: string;
  schemaName: string;
  validation: {
    total: number;
    failures: ValidationFailure[];
  };
  fetchFailures: FetchFailure[];
  candidates?: CrawlCandidateField[];
}

interface JobRequestSummary {
  ids: string[];
  schemaName?: string;
  delayMs?: number;
  urlTemplate?: string;
}

export interface JobState {
  jobId: string;
  status: "running" | "done" | "error";
  startedAt: string;
  request: JobRequestSummary;
  rows: ProgressRow[];
  result: CrawlCompleteEvent | null;
  errorMessage: string | null;
}

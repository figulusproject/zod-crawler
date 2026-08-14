import type { CrawlCandidateField } from "@zod-crawler/core";
import type { FetchProgressEvent } from "@zod-crawler/pipeline";

export interface CrawlRequest {
  ids: string[];
  urlTemplate?: string;
  delayMs?: number;
  schemaName?: string;
  emitCrawlCandidates: boolean;
  useZodTransformers: boolean;
  stopOnError: boolean;
}

export interface StartCrawlResponse {
  jobId: string;
}

export interface ActiveCrawlSummary {
  jobId: string;
  status: "running" | "done" | "error";
  startedAt: string;
  request: Required<Pick<CrawlRequest, "ids" | "schemaName" | "delayMs">> &
    Pick<CrawlRequest, "urlTemplate">;
}
export type CrawlProgressEvent = FetchProgressEvent;

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

export interface CrawlErrorEvent {
  message: string;
}

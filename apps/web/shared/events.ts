import type {
  CrawlCandidateField,
  FetchProgressEvent,
} from "@zod-crawler/core";

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

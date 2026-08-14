import type { FetchProgressEvent } from "@zod-crawler/pipeline";
import type { CrawlCompleteEvent } from "@zod-crawler/components/crawl";

export interface CrawlWorkerRequest {
  ids: string[];
  urlTemplate?: string;
  delayMs: number;
  schemaName: string;
  emitCrawlCandidates: boolean;
  useZodTransformers: boolean;
  stopOnError: boolean;
  corsProxyUrl: string;
}

export interface CrawlErrorEvent {
  message: string;
}

export interface CrawlWorkerRequestMessage {
  type: "start";
  request: CrawlWorkerRequest;
}

export type CrawlWorkerResponseMessage =
  | { type: "progress"; event: FetchProgressEvent }
  | { type: "complete"; event: CrawlCompleteEvent }
  | { type: "failed"; event: CrawlErrorEvent };

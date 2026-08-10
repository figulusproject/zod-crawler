import type {
  ActiveCrawlSummary,
  CrawlCompleteEvent,
  CrawlErrorEvent,
  CrawlProgressEvent,
  CrawlRequest,
  StartCrawlResponse,
} from "../../shared/events";

export async function startCrawl(request: CrawlRequest): Promise<string> {
  const response = await fetch("/api/crawl", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(
      body?.message ?? `Request failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as StartCrawlResponse;
  return data.jobId;
}

export async function listActiveCrawls(): Promise<ActiveCrawlSummary[]> {
  const response = await fetch("/api/crawls");
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return (await response.json()) as ActiveCrawlSummary[];
}

export interface CrawlSubscriptionHandlers {
  onProgress: (event: CrawlProgressEvent) => void;
  onComplete: (event: CrawlCompleteEvent) => void;
  onFailed: (event: CrawlErrorEvent) => void;
}

// Also unsubscribes internally on a terminal event, since EventSource otherwise auto-reconnects and re-requests an already-finished job.
export function subscribeToCrawl(
  jobId: string,
  handlers: CrawlSubscriptionHandlers,
): () => void {
  const source = new EventSource(`/api/crawl/${jobId}/events`);

  source.addEventListener("progress", (event) => {
    handlers.onProgress(JSON.parse((event as MessageEvent).data));
  });
  source.addEventListener("complete", (event) => {
    handlers.onComplete(JSON.parse((event as MessageEvent).data));
    source.close();
  });
  source.addEventListener("failed", (event) => {
    handlers.onFailed(JSON.parse((event as MessageEvent).data));
    source.close();
  });
  source.addEventListener("error", () => {
    // A native connection failure, not our own named "failed" event; no per-id detail to report, only that the stream died.
    handlers.onFailed({
      message: "Lost connection to the crawl progress stream.",
    });
    source.close();
  });

  return () => source.close();
}

import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import { crawlRequestSchema } from "./requestSchema.js";
import { getJob, listJobs, startCrawlJob } from "./crawlJobs.js";
import type { StartCrawlResponse } from "../shared/events.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, "../../client");

function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.post("/api/crawl", (req: Request, res: Response) => {
    const parsed = crawlRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }

    const jobId = startCrawlJob(parsed.data);
    const body: StartCrawlResponse = { jobId };
    res.status(202).json(body);
  });

  app.get("/api/crawls", (_req: Request, res: Response) => {
    res.json(listJobs());
  });

  app.get<{ jobId: string }>("/api/crawl/:jobId/events", (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ message: "Unknown or expired job id." });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Catches a reconnecting client up on every id's last known status - otherwise ids fetched before this connection opened (e.g. before a page refresh) would sit at "pending" forever.
    for (const event of job.progress.values()) {
      sendEvent(res, "progress", event);
    }

    // A fast run can finish before the SSE request lands, so serve the stored terminal result instead of subscribing to events that already fired.
    if (job.status === "done" && job.result) {
      sendEvent(res, "complete", job.result);
      res.end();
      return;
    }
    if (job.status === "error" && job.error) {
      sendEvent(res, "failed", job.error);
      res.end();
      return;
    }

    const onProgress = (event: unknown) => sendEvent(res, "progress", event);
    const onComplete = (event: unknown) => {
      sendEvent(res, "complete", event);
      res.end();
    };
    const onFailed = (event: unknown) => {
      sendEvent(res, "failed", event);
      res.end();
    };

    job.emitter.on("progress", onProgress);
    job.emitter.on("complete", onComplete);
    job.emitter.on("failed", onFailed);

    req.on("close", () => {
      job.emitter.off("progress", onProgress);
      job.emitter.off("complete", onComplete);
      job.emitter.off("failed", onFailed);
    });
  });

  app.use(express.static(CLIENT_DIST));

  return app;
}

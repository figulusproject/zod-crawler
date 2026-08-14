import { useCallback, useEffect, useReducer, useRef } from "react";
import { DEFAULT_DELAY_MS, DEFAULT_SCHEMA_NAME } from "@zod-crawler/core";
import type { FetchProgressEvent } from "@zod-crawler/pipeline";
import type { JobState } from "@zod-crawler/components/crawl";
import type {
  CrawlErrorEvent,
  CrawlWorkerRequestMessage,
  CrawlWorkerResponseMessage,
} from "../crawlWorkerProtocol.js";

// Deployed via tools/cors-proxy.
const CORS_PROXY_URL = "https://zodcrawler.figulus.dev/proxy";

export interface StartCrawlRequest {
  ids: string[];
  urlTemplate?: string;
  delayMs?: number;
  schemaName?: string;
  emitCrawlCandidates: boolean;
  useZodTransformers: boolean;
  stopOnError: boolean;
}

interface CrawlJobsState {
  jobIds: string[]; // newest-first
  jobs: Record<string, JobState>;
}

const initialState: CrawlJobsState = { jobIds: [], jobs: {} };

type Action =
  | {
      type: "jobAdded";
      jobId: string;
      startedAt: string;
      request: JobState["request"];
    }
  | { type: "progress"; jobId: string; event: FetchProgressEvent }
  | { type: "complete"; jobId: string; event: JobState["result"] }
  | { type: "failed"; jobId: string; event: CrawlErrorEvent }
  | { type: "dismiss"; jobId: string };

function reducer(state: CrawlJobsState, action: Action): CrawlJobsState {
  switch (action.type) {
    case "jobAdded": {
      const job: JobState = {
        jobId: action.jobId,
        status: "running",
        startedAt: action.startedAt,
        request: action.request,
        rows: action.request.ids.map((id) => ({ id, status: "pending" })),
        result: null,
        errorMessage: null,
      };
      return {
        jobIds: [action.jobId, ...state.jobIds],
        jobs: { ...state.jobs, [action.jobId]: job },
      };
    }
    case "progress": {
      const job = state.jobs[action.jobId];
      if (!job) return state;
      const rows = job.rows.slice();
      rows[action.event.index] = {
        id: action.event.id,
        status: action.event.status,
        error: action.event.error,
      };
      return {
        ...state,
        jobs: { ...state.jobs, [action.jobId]: { ...job, rows } },
      };
    }
    case "complete": {
      const job = state.jobs[action.jobId];
      if (!job || !action.event) return state;
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.jobId]: { ...job, status: "done", result: action.event },
        },
      };
    }
    case "failed": {
      const job = state.jobs[action.jobId];
      if (!job) return state;
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.jobId]: {
            ...job,
            status: "error",
            errorMessage: action.event.message,
          },
        },
      };
    }
    case "dismiss": {
      if (!state.jobs[action.jobId]) return state;
      const jobs = { ...state.jobs };
      delete jobs[action.jobId];
      return {
        jobIds: state.jobIds.filter((id) => id !== action.jobId),
        jobs,
      };
    }
  }
}

export function useLocalCrawlJob() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const workersRef = useRef(new Map<string, Worker>());

  const startJob = useCallback((request: StartCrawlRequest): string => {
    const jobId = crypto.randomUUID();
    const schemaName = request.schemaName ?? DEFAULT_SCHEMA_NAME;
    const delayMs = request.delayMs ?? DEFAULT_DELAY_MS;

    dispatch({
      type: "jobAdded",
      jobId,
      startedAt: new Date().toISOString(),
      request: {
        ids: request.ids,
        schemaName,
        delayMs,
        urlTemplate: request.urlTemplate,
      },
    });

    const worker = new Worker(new URL("../crawl-worker.ts", import.meta.url), {
      type: "module",
    });
    workersRef.current.set(jobId, worker);

    worker.addEventListener(
      "message",
      (event: MessageEvent<CrawlWorkerResponseMessage>) => {
        const message = event.data;
        if (message.type === "progress") {
          dispatch({ type: "progress", jobId, event: message.event });
          return;
        }
        if (message.type === "complete") {
          dispatch({ type: "complete", jobId, event: message.event });
          worker.terminate();
          workersRef.current.delete(jobId);
          return;
        }
        dispatch({ type: "failed", jobId, event: message.event });
        worker.terminate();
        workersRef.current.delete(jobId);
      },
    );

    const startMessage: CrawlWorkerRequestMessage = {
      type: "start",
      request: {
        ids: request.ids,
        urlTemplate: request.urlTemplate,
        delayMs,
        schemaName,
        emitCrawlCandidates: request.emitCrawlCandidates,
        useZodTransformers: request.useZodTransformers,
        stopOnError: request.stopOnError,
        corsProxyUrl: CORS_PROXY_URL,
      },
    };
    worker.postMessage(startMessage);

    return jobId;
  }, []);

  const dismissJob = useCallback((jobId: string) => {
    workersRef.current.get(jobId)?.terminate();
    workersRef.current.delete(jobId);
    dispatch({ type: "dismiss", jobId });
  }, []);

  useEffect(() => {
    const workers = workersRef.current;
    return () => {
      for (const worker of workers.values()) worker.terminate();
      workers.clear();
    };
  }, []);

  return { jobIds: state.jobIds, jobs: state.jobs, startJob, dismissJob };
}

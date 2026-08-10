import { useCallback, useEffect, useReducer, useRef } from "react";
import { listActiveCrawls, startCrawl, subscribeToCrawl } from "@/lib/api";
import type {
  CrawlCompleteEvent,
  CrawlErrorEvent,
  CrawlProgressEvent,
  CrawlRequest,
} from "../../shared/events";

export interface ProgressRow {
  id: string;
  status: "pending" | CrawlProgressEvent["status"];
  error?: string;
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
      request: JobRequestSummary;
      status?: JobState["status"];
    }
  | { type: "progress"; jobId: string; event: CrawlProgressEvent }
  | { type: "complete"; jobId: string; event: CrawlCompleteEvent }
  | { type: "failed"; jobId: string; event: CrawlErrorEvent }
  | { type: "dismiss"; jobId: string };

function reducer(state: CrawlJobsState, action: Action): CrawlJobsState {
  switch (action.type) {
    case "jobAdded": {
      // Idempotent: hydration and a manually-started job can race for the same id (see useCrawlJobs's subscribe guard).
      if (state.jobs[action.jobId]) return state;
      const job: JobState = {
        jobId: action.jobId,
        status: action.status ?? "running",
        startedAt: action.startedAt,
        request: action.request,
        rows: action.request.ids.map((id) => ({ id, status: "pending" })),
        result: null,
        errorMessage: null,
      };
      // Sorted-insert by startedAt (not unshift) so a batch of hydrated jobs lands in the right order regardless of dispatch order.
      const jobIds = state.jobIds.slice();
      const insertAt = jobIds.findIndex(
        (id) => state.jobs[id].startedAt < action.startedAt,
      );
      jobIds.splice(
        insertAt === -1 ? jobIds.length : insertAt,
        0,
        action.jobId,
      );
      return { jobIds, jobs: { ...state.jobs, [action.jobId]: job } };
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
      if (!job) return state;
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

export function useCrawlJobs() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const unsubscribeMapRef = useRef(new Map<string, () => void>());

  // Guarded by the ref map, not reducer state: a mount-only hydration effect's closure would otherwise never see a job started later.
  const subscribe = useCallback((jobId: string) => {
    if (unsubscribeMapRef.current.has(jobId)) return;
    const unsubscribe = subscribeToCrawl(jobId, {
      onProgress: (event) => dispatch({ type: "progress", jobId, event }),
      onComplete: (event) => dispatch({ type: "complete", jobId, event }),
      onFailed: (event) => dispatch({ type: "failed", jobId, event }),
    });
    unsubscribeMapRef.current.set(jobId, unsubscribe);
  }, []);

  const startJob = useCallback(
    async (request: CrawlRequest): Promise<string> => {
      const jobId = await startCrawl(request);
      dispatch({
        type: "jobAdded",
        jobId,
        startedAt: new Date().toISOString(),
        request: {
          ids: request.ids,
          schemaName: request.schemaName,
          delayMs: request.delayMs,
          urlTemplate: request.urlTemplate,
        },
      });
      subscribe(jobId);
      return jobId;
    },
    [subscribe],
  );

  const dismissJob = useCallback((jobId: string) => {
    unsubscribeMapRef.current.get(jobId)?.();
    unsubscribeMapRef.current.delete(jobId);
    dispatch({ type: "dismiss", jobId });
  }, []);

  useEffect(() => {
    listActiveCrawls()
      .then((summaries) => {
        for (const summary of summaries) {
          dispatch({
            type: "jobAdded",
            jobId: summary.jobId,
            startedAt: summary.startedAt,
            request: summary.request,
            status: summary.status,
          });
          subscribe(summary.jobId);
        }
      })
      .catch((error: unknown) => {
        console.error(
          "Failed to list active crawls, skipping hydration:",
          error,
        );
      });
  }, [subscribe]);

  useEffect(() => {
    const unsubscribeMap = unsubscribeMapRef.current;
    return () => {
      for (const unsubscribe of unsubscribeMap.values()) unsubscribe();
      unsubscribeMap.clear();
    };
  }, []);

  return { jobIds: state.jobIds, jobs: state.jobs, startJob, dismissJob };
}

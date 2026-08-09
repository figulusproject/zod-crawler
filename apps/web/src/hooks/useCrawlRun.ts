import { useCallback, useEffect, useReducer, useRef } from "react";
import { startCrawl, subscribeToCrawl } from "@/lib/api";
import type {
  CrawlCompleteEvent,
  CrawlErrorEvent,
  CrawlProgressEvent,
  CrawlRequest,
} from "../../shared/events";

export type CrawlPhase = "idle" | "running" | "done" | "error";

export interface ProgressRow {
  id: string;
  status: "pending" | CrawlProgressEvent["status"];
  error?: string;
}

interface CrawlRunState {
  phase: CrawlPhase;
  rows: ProgressRow[];
  result: CrawlCompleteEvent | null;
  errorMessage: string | null;
}

const initialState: CrawlRunState = {
  phase: "idle",
  rows: [],
  result: null,
  errorMessage: null,
};

type Action =
  | { type: "start"; ids: string[] }
  | { type: "progress"; event: CrawlProgressEvent }
  | { type: "complete"; event: CrawlCompleteEvent }
  | { type: "failed"; event: CrawlErrorEvent }
  | { type: "reset" };

function reducer(state: CrawlRunState, action: Action): CrawlRunState {
  switch (action.type) {
    case "start":
      return {
        phase: "running",
        rows: action.ids.map((id) => ({ id, status: "pending" })),
        result: null,
        errorMessage: null,
      };
    case "progress": {
      const rows = state.rows.slice();
      rows[action.event.index] = {
        id: action.event.id,
        status: action.event.status,
        error: action.event.error,
      };
      return { ...state, rows };
    }
    case "complete":
      return { ...state, phase: "done", result: action.event };
    case "failed":
      return { ...state, phase: "error", errorMessage: action.event.message };
    case "reset":
      return initialState;
  }
}

export function useCrawlRun() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const start = useCallback(async (request: CrawlRequest) => {
    unsubscribeRef.current?.();
    dispatch({ type: "start", ids: request.ids });
    try {
      const jobId = await startCrawl(request);
      unsubscribeRef.current = subscribeToCrawl(jobId, {
        onProgress: (event) => dispatch({ type: "progress", event }),
        onComplete: (event) => dispatch({ type: "complete", event }),
        onFailed: (event) => dispatch({ type: "failed", event }),
      });
    } catch (error) {
      dispatch({
        type: "failed",
        event: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }, []);

  const reset = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  return { ...state, start, reset };
}

import { DEFAULT_SCHEMA_NAME } from "@zod-crawler/core";
import { Badge } from "#components/ui/badge";
import { ProgressView } from "./progress-view.js";
import { ResultView } from "./result-view.js";
import { CandidatesList } from "./candidates-list.js";
import type { JobState } from "./crawl-types.js";

const STATUS_LABEL: Record<JobState["status"], string> = {
  running: "running",
  done: "done",
  error: "failed",
};

const STATUS_VARIANT: Record<
  JobState["status"],
  "secondary" | "default" | "destructive"
> = {
  running: "secondary",
  done: "default",
  error: "destructive",
};

interface JobDetailProps {
  job: JobState;
  onReFeed: (values: string[]) => void;
}

export function JobDetail({ job, onReFeed }: JobDetailProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="truncate text-sm font-medium">
          {job.request.schemaName ?? DEFAULT_SCHEMA_NAME}
        </h2>
        <Badge variant={STATUS_VARIANT[job.status]}>
          {STATUS_LABEL[job.status]}
        </Badge>
      </div>

      {job.status === "error" && job.errorMessage && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {job.errorMessage}
        </p>
      )}

      {(job.status === "running" ||
        (job.status === "error" && job.rows.length > 0)) && (
        <ProgressView rows={job.rows} />
      )}

      {job.status === "done" && job.result && (
        <>
          <ResultView result={job.result} />

          {job.result.candidates && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Crawl candidates</h3>
              <CandidatesList
                candidates={job.result.candidates}
                onReFeed={onReFeed}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JobState } from "@/hooks/useCrawlJobs";

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

interface JobListProps {
  jobIds: string[];
  jobs: Record<string, JobState>;
  selectedJobId: string | null;
  onSelect: (jobId: string | null) => void;
  onDismiss: (jobId: string) => void;
}

export function JobList({
  jobIds,
  jobs,
  selectedJobId,
  onSelect,
  onDismiss,
}: JobListProps) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-2 md:w-64">
      <Button
        type="button"
        variant={selectedJobId === null ? "secondary" : "outline"}
        className="justify-start"
        onClick={() => onSelect(null)}
      >
        <Plus className="size-4" />
        New crawl
      </Button>

      {jobIds.length > 0 && (
        <ul className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
          {jobIds.map((jobId) => {
            const job = jobs[jobId];
            return (
              <li key={jobId}>
                {/* A <div role="button">, not a <button>: the row itself is clickable but also hosts a real <button> (dismiss), and <button> can't nest inside <button>. */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(jobId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(jobId);
                    }
                  }}
                  className={cn(
                    "flex w-full cursor-pointer flex-col gap-1 rounded-md border p-2 text-left text-sm",
                    jobId === selectedJobId
                      ? "border-ring bg-muted"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs">
                      {job.request.schemaName ?? "InferredSchema"}
                    </span>
                    <div className="flex items-center gap-1">
                      <Badge variant={STATUS_VARIANT[job.status]}>
                        {STATUS_LABEL[job.status]}
                      </Badge>
                      {job.status !== "running" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDismiss(jobId);
                          }}
                          aria-label="Dismiss"
                        >
                          <X className="size-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {job.request.ids.length} id
                    {job.request.ids.length === 1 ? "" : "s"} · started{" "}
                    {new Date(job.startedAt).toLocaleTimeString()}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

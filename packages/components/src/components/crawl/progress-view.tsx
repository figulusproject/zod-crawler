import { Badge } from "#components/ui/badge";
import { Progress } from "#components/ui/progress";
import type { ProgressRow } from "./crawl-types.js";

const STATUS_LABEL: Record<ProgressRow["status"], string> = {
  pending: "pending",
  fetching: "fetching…",
  cached: "cached",
  done: "done",
  error: "failed",
};

const STATUS_VARIANT: Record<
  ProgressRow["status"],
  "outline" | "secondary" | "default" | "destructive"
> = {
  pending: "outline",
  fetching: "secondary",
  cached: "outline",
  done: "default",
  error: "destructive",
};

interface ProgressViewProps {
  rows: ProgressRow[];
}

export function ProgressView({ rows }: ProgressViewProps) {
  const finished = rows.filter(
    (row) => row.status !== "pending" && row.status !== "fetching",
  );
  const percent = rows.length === 0 ? 0 : (finished.length / rows.length) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Progress value={percent} className="flex-1" />
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {finished.length}/{rows.length}
        </span>
      </div>
      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2">
            <span className="truncate font-mono">{row.id}</span>
            <Badge variant={STATUS_VARIANT[row.status]} title={row.error}>
              {STATUS_LABEL[row.status]}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

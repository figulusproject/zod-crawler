import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { CrawlCandidateField } from "@zod-crawler/core";

interface CandidatesListProps {
  candidates: CrawlCandidateField[];
  onReFeed: (values: string[]) => void;
}

// Mirrors the CLI's review-then-feed-back loop, but re-feeds straight into the ids field instead of round-tripping through a file.
export function CandidatesList({ candidates, onReFeed }: CandidatesListProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.flatMap((group) => group.values)),
  );

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No new crawl candidates found.
      </p>
    );
  }

  const toggle = (value: string, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {candidates.map((group) => (
        <div key={group.path} className="flex flex-col gap-1.5">
          <div className="font-mono text-xs text-muted-foreground">
            {group.path}
          </div>
          <ul className="flex flex-col gap-1">
            {group.values.map((value) => {
              const inputId = `candidate-${group.path}-${value}`;
              return (
                <li key={value} className="flex items-center gap-2">
                  <Checkbox
                    id={inputId}
                    checked={selected.has(value)}
                    onCheckedChange={(checked) =>
                      toggle(value, checked === true)
                    }
                  />
                  <label
                    htmlFor={inputId}
                    className="truncate font-mono text-sm"
                  >
                    {value}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={selected.size === 0}
        onClick={() => onReFeed([...selected])}
        className="self-start"
      >
        Re-feed {selected.size} selected
      </Button>
    </div>
  );
}

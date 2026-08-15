import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "#components/ui/button";
import { Checkbox } from "#components/ui/checkbox";
import type { CrawlCandidateField } from "@zod-crawler/core";
import {
  crawlCandidatesToCsv,
  crawlCandidatesToJson,
  crawlCandidatesToTxt,
  crawlCandidatesToYaml,
} from "@zod-crawler/core/crawlCandidateFormats";

interface CandidatesListProps {
  candidates: CrawlCandidateField[];
  onReFeed: (values: string[]) => void;
}

type SaveFormat = "txt" | "json" | "yaml" | "csv";

const SAVE_FORMATS: Record<
  SaveFormat,
  {
    label: string;
    extension: string;
    mimeType: string;
    toText: (fields: CrawlCandidateField[]) => string;
  }
> = {
  txt: {
    label: "TXT",
    extension: "txt",
    mimeType: "text/plain",
    toText: crawlCandidatesToTxt,
  },
  json: {
    label: "JSON",
    extension: "json",
    mimeType: "application/json",
    toText: crawlCandidatesToJson,
  },
  yaml: {
    label: "YAML",
    extension: "yaml",
    mimeType: "application/yaml",
    toText: crawlCandidatesToYaml,
  },
  csv: {
    label: "CSV",
    extension: "csv",
    mimeType: "text/csv",
    toText: crawlCandidatesToCsv,
  },
};

// Same raw value can appear under multiple field paths (e.g. two fields both referencing the same crawled id), so selection is keyed by (path, value), not by value alone - otherwise checking it under one path would check/uncheck it under every other path that happens to share it.
function selectionKey(path: string, value: string): string {
  return JSON.stringify([path, value]);
}

// Mirrors the CLI's review-then-feed-back loop, but re-feeds straight into the ids field instead of round-tripping through a file.
export function CandidatesList({ candidates, onReFeed }: CandidatesListProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        candidates.flatMap((group) =>
          group.values.map((value) => selectionKey(group.path, value)),
        ),
      ),
  );
  const [saveFormat, setSaveFormat] = useState<SaveFormat>("json");

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No new crawl candidates found.
      </p>
    );
  }

  const toggle = (path: string, value: string, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      const key = selectionKey(path, value);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const setGroupSelected = (group: CrawlCandidateField, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const value of group.values) {
        const key = selectionKey(group.path, value);
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const totalValues = candidates.reduce(
    (count, group) => count + group.values.length,
    0,
  );

  const handleReFeed = () => {
    const values = new Set<string>();
    for (const group of candidates) {
      for (const value of group.values) {
        if (selected.has(selectionKey(group.path, value))) values.add(value);
      }
    }
    onReFeed([...values]);
  };

  const handleSave = () => {
    const selectedFields = candidates
      .map((group) => ({
        path: group.path,
        values: group.values.filter((value) =>
          selected.has(selectionKey(group.path, value)),
        ),
      }))
      .filter((group) => group.values.length > 0);

    const format = SAVE_FORMATS[saveFormat];
    const blob = new Blob([format.toText(selectedFields)], {
      type: format.mimeType,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `crawl-candidates.${format.extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 self-start">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            candidates.forEach((group) => setGroupSelected(group, true))
          }
        >
          Select all
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            candidates.forEach((group) => setGroupSelected(group, false))
          }
        >
          Select none
        </Button>
      </div>

      {candidates.map((group) => {
        const selectedInGroup = group.values.filter((value) =>
          selected.has(selectionKey(group.path, value)),
        ).length;
        return (
          <div key={group.path} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {group.path}
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
                onClick={() =>
                  setGroupSelected(
                    group,
                    selectedInGroup !== group.values.length,
                  )
                }
              >
                {selectedInGroup === group.values.length
                  ? "select none"
                  : "select all"}
              </button>
            </div>
            <ul className="flex flex-col gap-1">
              {group.values.map((value) => {
                const inputId = `candidate-${group.path}-${value}`;
                return (
                  <li key={value} className="flex items-center gap-2">
                    <Checkbox
                      id={inputId}
                      checked={selected.has(selectionKey(group.path, value))}
                      onCheckedChange={(checked) =>
                        toggle(group.path, value, checked === true)
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
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={selected.size === 0}
          onClick={handleReFeed}
        >
          Re-feed {selected.size} selected
        </Button>

        <select
          value={saveFormat}
          onChange={(event) => setSaveFormat(event.target.value as SaveFormat)}
          className="h-8 rounded-md border border-input bg-input/30 px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {Object.entries(SAVE_FORMATS).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={selected.size === 0}
          onClick={handleSave}
        >
          <Download className="size-4" />
          Save {selected.size} of {totalValues}
        </Button>
      </div>
    </div>
  );
}

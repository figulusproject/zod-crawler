import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CrawlForm } from "@/components/CrawlForm";
import { ProgressView } from "@/components/ProgressView";
import { ResultView } from "@/components/ResultView";
import { CandidatesList } from "@/components/CandidatesList";
import { useCrawlRun } from "@/hooks/useCrawlRun";
import { parseIds } from "@/lib/parseIds";
import { DEFAULT_FORM_STATE, type FormState } from "@/lib/formState";

export function App() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM_STATE);
  const crawlRun = useCrawlRun();

  const updateForm = (patch: Partial<FormState>) =>
    setForm((previous) => ({ ...previous, ...patch }));

  const handleSubmit = () => {
    const ids = parseIds(form.idsText);
    if (ids.length === 0) return;

    const delayMs = Number(form.delayMs);
    void crawlRun.start({
      ids,
      urlTemplate: form.urlTemplate.trim() || undefined,
      delayMs: Number.isFinite(delayMs) ? delayMs : undefined,
      schemaName: form.schemaName.trim() || undefined,
      emitCrawlCandidates: form.emitCrawlCandidates,
      useZodTransformers: form.useZodTransformers,
      stopOnError: form.stopOnError,
    });
  };

  const handleReFeed = (values: string[]) => {
    setForm((previous) => ({
      ...previous,
      idsText: parseIds([previous.idsText, ...values].join("\n")).join("\n"),
    }));
    crawlRun.reset();
  };

  const isRunning = crawlRun.phase === "running";
  const isDone = crawlRun.phase === "done";
  // A request that never started a run (e.g. failed validation) has no rows, so the form reappears instead of ProgressView.
  const failedBeforeStart =
    crawlRun.phase === "error" && crawlRun.rows.length === 0;

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">zod-crawler</h1>
        <p className="text-sm text-muted-foreground">
          Fetch a set of JSON API responses and infer a Zod schema that
          validates all of them.
        </p>
      </header>

      {(crawlRun.phase === "idle" || failedBeforeStart) && (
        <CrawlForm
          form={form}
          onChange={updateForm}
          onSubmit={handleSubmit}
          disabled={isRunning}
        />
      )}

      {crawlRun.phase === "error" && crawlRun.errorMessage && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {crawlRun.errorMessage}
        </p>
      )}

      {(isRunning ||
        (crawlRun.phase === "error" && crawlRun.rows.length > 0)) && (
        <ProgressView rows={crawlRun.rows} />
      )}

      {isDone && crawlRun.result && (
        <>
          <ResultView result={crawlRun.result} />

          {crawlRun.result.candidates && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Crawl candidates</h2>
              <CandidatesList
                candidates={crawlRun.result.candidates}
                onReFeed={handleReFeed}
              />
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={crawlRun.reset}
            className="self-start"
          >
            Start another crawl
          </Button>
        </>
      )}
    </div>
  );
}

export default App;

import { useState } from "react";
import {
  CrawlForm,
  JobList,
  JobDetail,
  parseIds,
  DEFAULT_FORM_STATE,
  type FormState,
} from "@zod-crawler/components/crawl";
import { BrowserOnlyBanner } from "@zod-crawler/components/general";
import { useLocalCrawlJob } from "@/hooks/useLocalCrawlJob";

export function App() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM_STATE);
  const { jobIds, jobs, startJob, dismissJob } = useLocalCrawlJob();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const updateForm = (patch: Partial<FormState>) =>
    setForm((previous) => ({ ...previous, ...patch }));

  const handleSubmit = () => {
    const ids = parseIds(form.idsText);
    if (ids.length === 0) return;

    const delayMs = Number(form.delayMs);
    const jobId = startJob({
      ids,
      urlTemplate: form.urlTemplate.trim() || undefined,
      delayMs: Number.isFinite(delayMs) ? delayMs : undefined,
      schemaName: form.schemaName.trim() || undefined,
      emitCrawlCandidates: form.emitCrawlCandidates,
      useZodTransformers: form.useZodTransformers,
      stopOnError: form.stopOnError,
    });
    setSelectedJobId(jobId);
  };

  const handleReFeed = (values: string[]) => {
    setForm((previous) => ({
      ...previous,
      idsText: parseIds([previous.idsText, ...values].join("\n")).join("\n"),
    }));
    setSelectedJobId(null);
  };

  const handleDismiss = (jobId: string) => {
    dismissJob(jobId);
    setSelectedJobId((current) => (current === jobId ? null : current));
  };

  const selectedJob = selectedJobId ? jobs[selectedJobId] : undefined;

  return (
    <div className="flex min-h-svh flex-col">
      <BrowserOnlyBanner />

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">zod-crawler demo</h1>
          <p className="text-sm text-muted-foreground">
            Fetch a set of JSON API responses and infer a Zod schema that
            validates all of them.
          </p>
        </header>

        <div className="flex flex-col gap-6 md:flex-row">
          <JobList
            jobIds={jobIds}
            jobs={jobs}
            selectedJobId={selectedJobId}
            onSelect={setSelectedJobId}
            onDismiss={handleDismiss}
          />

          {selectedJob ? (
            <JobDetail job={selectedJob} onReFeed={handleReFeed} />
          ) : (
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <CrawlForm
                form={form}
                onChange={updateForm}
                onSubmit={handleSubmit}
                disabled={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

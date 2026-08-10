import { useState } from "react";
import { CrawlForm } from "@/components/CrawlForm";
import { JobList } from "@/components/JobList";
import { JobDetail } from "@/components/JobDetail";
import { useCrawlJobs } from "@/hooks/useCrawlJobs";
import { parseIds } from "@/lib/parseIds";
import { DEFAULT_FORM_STATE, type FormState } from "@/lib/formState";

export function App() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM_STATE);
  const { jobIds, jobs, startJob, dismissJob } = useCrawlJobs();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateForm = (patch: Partial<FormState>) =>
    setForm((previous) => ({ ...previous, ...patch }));

  const handleSubmit = async () => {
    const ids = parseIds(form.idsText);
    if (ids.length === 0) return;

    const delayMs = Number(form.delayMs);
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const jobId = await startJob({
        ids,
        urlTemplate: form.urlTemplate.trim() || undefined,
        delayMs: Number.isFinite(delayMs) ? delayMs : undefined,
        schemaName: form.schemaName.trim() || undefined,
        emitCrawlCandidates: form.emitCrawlCandidates,
        useZodTransformers: form.useZodTransformers,
        stopOnError: form.stopOnError,
      });
      setSelectedJobId(jobId);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Leaves the originating job's card untouched - only the compose view is affected - so a re-feed reads as "start a new crawl" rather than "replace this one".
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
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">zod-crawler</h1>
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
              disabled={isSubmitting}
            />
            {submitError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {submitError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

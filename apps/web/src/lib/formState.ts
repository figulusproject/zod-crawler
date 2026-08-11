export interface FormState {
  idsText: string;
  urlTemplate: string;
  delayMs: string;
  schemaName: string;
  emitCrawlCandidates: boolean;
  useZodTransformers: boolean;
  stopOnError: boolean;
}

// Not imported from @zod-crawler/core, whose barrel also drags in Node-only I/O modules Vite can't bundle. Keep in sync with crawlSettingsDefaults.ts by hand.
export const MIN_DELAY_MS = 100;

export const DEFAULT_FORM_STATE: FormState = {
  idsText: "",
  urlTemplate: "",
  delayMs: "7500",
  schemaName: "InferredSchema",
  emitCrawlCandidates: false,
  useZodTransformers: false,
  stopOnError: false,
};

export interface FormState {
  idsText: string;
  urlTemplate: string;
  delayMs: string;
  schemaName: string;
  emitCrawlCandidates: boolean;
  useZodTransformers: boolean;
}

// Not imported from @zod-crawler/core, whose barrel also drags in Node-only I/O modules Vite can't bundle; keep in sync with crawlSettingsDefaults.ts by hand.
export const DEFAULT_FORM_STATE: FormState = {
  idsText: "",
  urlTemplate: "",
  delayMs: "7500",
  schemaName: "InferredSchema",
  emitCrawlCandidates: false,
  useZodTransformers: false,
};

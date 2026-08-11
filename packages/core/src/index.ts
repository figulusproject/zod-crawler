export type { JsonValue } from "./types.js";
export { isPlainObject } from "./types.js";

export { UNION_KEY, isUnionNode } from "./unionNode.js";

export { mergeSchemaValues, deepMerge } from "./mergeSchemaValues.js";

export {
  classifyRawString,
  rawValueToSchemaJson,
  sortKeys,
} from "./rawValueToSchemaJson.js";

export {
  collectStringValuesAtPath,
  getOptionalKeysAtPath,
  resolveIntFieldSchema,
  resolveStringFieldSchema,
  applyOptionalKeySuffixRecursive,
  detectLiteralsAndEnumsRecursive,
} from "./detectSchema.js";

export { convertToZod, generateZodSchema } from "./codegen.js";

export { inferSchema } from "./inferSchema.js";

export { evalGeneratedSchema } from "./evalGeneratedSchema.js";
export { validateSamples } from "./validateSamples.js";

export type { CrawlCandidateField } from "./findCrawlCandidates.js";
export { findCrawlCandidates } from "./findCrawlCandidates.js";

export {
  crawlCandidatesToCsv,
  crawlCandidatesToJson,
  crawlCandidatesToTxt,
  crawlCandidatesToYaml,
} from "./crawlCandidateFormats.js";

export {
  SCHEMA_NAME_PATTERN,
  DEFAULT_DELAY_MS,
  DEFAULT_SCHEMA_NAME,
  DEFAULT_CONCURRENCY,
} from "./crawlSettingsDefaults.js";

export type {
  FetchProgressEvent,
  FetchAndCacheSamplesOptions,
} from "./fetchAndCacheSamples.js";
export {
  fetchAndCacheSamples,
  hasCachedSample,
} from "./fetchAndCacheSamples.js";

export { createUrlFetcher, FetchHttpError } from "./urlFetcher.js";

export type { ActiveCrawlEntry } from "./crawlRegistry.js";
export {
  registerActiveCrawl,
  unregisterActiveCrawl,
  listActiveCrawls,
} from "./crawlRegistry.js";

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
  CRAWL_CANDIDATES_FORMATS,
  crawlCandidatesFormatters,
  parseIdsFromTxt,
  parseIdsFromJson,
  parseIdsFromYaml,
  parseIdsFromCsv,
  idsParsers,
  crawlCandidatesFormatFromExtension,
} from "./crawlCandidateFormats.js";
export type { CrawlCandidatesFormat } from "./crawlCandidateFormats.js";

export {
  SCHEMA_NAME_PATTERN,
  DEFAULT_DELAY_MS,
  MIN_DELAY_MS,
  DEFAULT_SCHEMA_NAME,
  DEFAULT_CONCURRENCY,
} from "./crawlSettingsDefaults.js";

export { createUrlFetcher, FetchHttpError } from "./urlFetcher.js";

import { isPlainObject } from "./types.js";
import { UNION_KEY, isUnionNode } from "./unionNode.js";

// ============ Object Navigation ============

// Walks `path` through a sample's raw JSON, transparently flattening through arrays, and returns every plain-object reached at the end of the path.
function collectObjectsAtPath(
  sampleIds: readonly string[],
  json: Record<string, any>,
  path: string[],
): Record<string, any>[] {
  const results: Record<string, any>[] = [];

  const visit = (value: any, remainingPath: string[]) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, remainingPath);
      return;
    }
    if (remainingPath.length === 0) {
      if (isPlainObject(value)) results.push(value);
      return;
    }
    if (!isPlainObject(value)) return;
    const [next, ...rest] = remainingPath;
    if (next in value) visit(value[next], rest);
  };

  for (const sampleId of sampleIds) {
    visit(json[sampleId], path);
  }

  return results;
}

// ============ Schema Detection ============

export function getOptionalKeysAtPath(
  sampleIds: readonly string[],
  json: Record<string, any>,
  path: string[],
): Set<string> {
  const objects = collectObjectsAtPath(sampleIds, json, path);

  const allKeysAtPath = new Set<string>();
  for (const obj of objects) {
    Object.keys(obj).forEach((k) => allKeysAtPath.add(k));
  }

  // A key is optional if it's missing from at least one sampled instance.
  const optionalKeys = new Set<string>();
  for (const key of allKeysAtPath) {
    const presentInAll =
      objects.length > 0 && objects.every((obj) => key in obj);
    if (!presentInAll) {
      optionalKeys.add(key);
    }
  }

  return optionalKeys;
}

export function collectStringValuesAtPath(
  sampleIds: readonly string[],
  json: Record<string, any>,
  path: string[],
  key: string,
): { unique: string[]; count: number } {
  const unique: string[] = [];
  let count = 0;

  for (const obj of collectObjectsAtPath(sampleIds, json, path)) {
    if (key in obj) {
      const fieldValue = obj[key];
      // Only count values actually strings in this instance; a field that's a union across samples may be a number/object in others.
      if (typeof fieldValue === "string") {
        if (!unique.includes(fieldValue)) {
          unique.push(fieldValue);
        }
        count++;
      }
    }
  }

  return { unique, count };
}

function collectIntValuesAtPath(
  sampleIds: readonly string[],
  json: Record<string, any>,
  path: string[],
  key: string,
): number[] {
  const values: number[] = [];

  for (const obj of collectObjectsAtPath(sampleIds, json, path)) {
    if (key in obj) {
      const fieldValue = obj[key];
      if (typeof fieldValue === "number" && Number.isInteger(fieldValue)) {
        values.push(fieldValue);
      }
    }
  }

  return values;
}

// Decides per-field, from the full cross-sample data, whether a numeric field is a bounded counter (z.int()) or an opaque id that can exceed safe-integer range (coerce.bigint).
export function resolveIntFieldSchema(
  sampleIds: readonly string[],
  json: Record<string, any>,
  path: string[],
  key: string,
): string {
  const values = collectIntValuesAtPath(sampleIds, json, path, key);
  const hasUnsafeValue = values.some((v) => !Number.isSafeInteger(v));
  return hasUnsafeValue ? "coerce.bigint" : "int";
}

// ============ Recursive Transformations ============

export function applyOptionalKeySuffixRecursive(
  obj: any,
  sampleIds: readonly string[],
  json: Record<string, any>,
  path: string[] = [],
): any {
  if (isUnionNode(obj)) {
    return {
      [UNION_KEY]: obj[UNION_KEY].map((alt) =>
        applyOptionalKeySuffixRecursive(alt, sampleIds, json, path),
      ),
    };
  }

  if (!isPlainObject(obj)) {
    return obj;
  }

  const optionalKeys = getOptionalKeysAtPath(sampleIds, json, path);

  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => {
      const newKey = optionalKeys.has(key) ? key + "?" : key;

      let newValue: any;
      if (Array.isArray(value)) {
        // Recurse into the item schema so fields nested in array items get checked for optionality too; no extra path segment needed since collectObjectsAtPath already flattens arrays.
        newValue =
          value.length === 0
            ? value
            : [
                applyOptionalKeySuffixRecursive(value[0], sampleIds, json, [
                  ...path,
                  key,
                ]),
              ];
      } else if (isPlainObject(value)) {
        newValue = applyOptionalKeySuffixRecursive(value, sampleIds, json, [
          ...path,
          key,
        ]);
      } else {
        newValue = value;
      }

      return [newKey, newValue];
    }),
  );
}

// A closed category's distinct-value ratio stays low no matter how much you sample, unlike free text; MAX_ENUM_VALUES is kept as a backstop on top of the ratio, not instead of it.
const MAX_ENUM_VALUES = 20;
const MAX_ENUM_UNIQUE_RATIO = 0.5;

const INTEGER_STRING_PATTERN = /^-?\d+$/;

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

// Parses straight to BigInt rather than Number(v), which would silently round large values before the comparison meant to detect that they're too large.
function isSafeIntegerString(v: string): boolean {
  const big = BigInt(v);
  return big >= MIN_SAFE_INTEGER_BIGINT && big <= MAX_SAFE_INTEGER_BIGINT;
}

// Narrower than "anything Date.parse() accepts": V8's permissive fallback parser would wrongly accept strings like "item 1" as a date (2001-01-01!).
const MONTH_NAME_PATTERN =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE_STRING_PATTERNS = [
  /^\d{4}-\d{2}(-\d{2})?([T ].*)?$/i, // ISO: YYYY-MM-DD or YYYY-MM
  /^\d{4}\s\d{2}\s\d{2}$/, // YYYY MM DD, space separated
  new RegExp(`^(${MONTH_NAME_PATTERN})\\.?\\s+\\d{1,2},?\\s+\\d{4}$`, "i"), // Month D, YYYY
  new RegExp(`^\\d{1,2}\\s+(${MONTH_NAME_PATTERN})\\.?,?\\s+\\d{4}$`, "i"), // D Month YYYY
  new RegExp(`^\\d{4}\\s+(${MONTH_NAME_PATTERN})\\.?\\s+\\d{1,2}$`, "i"), // YYYY Month D
  new RegExp(`^(${MONTH_NAME_PATTERN})\\.?\\s+\\d{4}$`, "i"), // Month YYYY
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // M/D/YYYY
];

function looksLikeDate(v: string): boolean {
  const trimmed = v.trim();
  if (!DATE_STRING_PATTERNS.some((re) => re.test(trimmed))) return false;
  return !Number.isNaN(Date.parse(trimmed));
}

// A bare 4-digit string is ambiguous between integer and year, so this only kicks in when the field name hints at dates; broader terms like "day"/"time" were left out as too noisy.
const DATE_KEY_HINT_PATTERN = /date|year/i;
const BARE_YEAR_PATTERN = /^\d{4}$/;

// 1000-2100: a generous range that covers real historical/future dates without opening the door to obviously-not-a-year 4-digit values.
function isPlausibleYear(v: string): boolean {
  if (!BARE_YEAR_PATTERN.test(v)) return false;
  const year = Number(v);
  return year >= 1000 && year <= 2100;
}

const MIN_REFERENCE_KEY_PREFIX_LENGTH = 3;

// Longest common prefix, trimmed back to the last "/" boundary, since the raw LCP often overshoots into part of the final diverging path segment.
function commonReferenceKeyPrefix(values: string[]): string | null {
  if (values.length === 0) return null;
  let prefix = values[0];
  for (const v of values.slice(1)) {
    let i = 0;
    const max = Math.min(prefix.length, v.length);
    while (i < max && prefix[i] === v[i]) i++;
    prefix = prefix.slice(0, i);
    if (prefix === "") return null;
  }
  const lastSlash = prefix.lastIndexOf("/");
  const trimmed = lastSlash >= 0 ? prefix.slice(0, lastSlash + 1) : prefix;
  return trimmed.length >= MIN_REFERENCE_KEY_PREFIX_LENGTH ? trimmed : null;
}

function isDateValue(v: string, keyHintsDate: boolean): boolean {
  return looksLikeDate(v) || (keyHintsDate && isPlausibleYear(v));
}

// Some fields pack multiple years into one string (e.g. "2005, 2014, 2006"); handled as a fallback into an array of Dates. See multiOrSingleCoerceDate in codegen.ts.
const MULTI_YEAR_LIST_PATTERN = /^\d{4}(?:(?:,\s*|\s+)\d{4})+$/;

function isMultiDateListValue(v: string): boolean {
  return MULTI_YEAR_LIST_PATTERN.test(v.trim());
}

// Set DEBUG_SCHEMA_DETECTION=1 to log why a field with real variation didn't qualify as an enum/coerced-int/coerced-date; silent by default to avoid noise.
const DEBUG_SCHEMA_DETECTION =
  typeof process !== "undefined" && process.env?.DEBUG_SCHEMA_DETECTION === "1";

function logDetectionSkip(path: string[], key: string, reason: string): void {
  if (!DEBUG_SCHEMA_DETECTION) return;
  console.warn(`[schema-detect] ${[...path, key].join(".")}: ${reason}`);
}

// Decides whether a field's string values collapse to a literal, an enum, a coerced integer, a coerced date, or stay a plain string.
export function resolveStringFieldSchema(
  sampleIds: readonly string[],
  json: Record<string, any>,
  path: string[],
  key: string,
): string {
  const { unique, count } = collectStringValuesAtPath(
    sampleIds,
    json,
    path,
    key,
  );

  const keyHintsDate = DATE_KEY_HINT_PATTERN.test(key);

  // Runs before the integer check so a date-hinted field of bare years (which also satisfies the integer check) is classified as a date, not a plain int.
  const nonDateValues = unique.filter((v) => !isDateValue(v, keyHintsDate));
  if (unique.length > 0 && nonDateValues.length === 0) {
    return "coerce.date";
  }

  // Must run before literal/enum detection, or a small set of numbers like "1"/"2" gets misclassified as an enum instead of a coerced number; "" is treated as a tolerable outlier (-> undefined).
  const nonEmptyValues = unique.filter((v) => v !== "");
  const nonIntegerValues = nonEmptyValues.filter(
    (v) => !INTEGER_STRING_PATTERN.test(v),
  );
  if (nonEmptyValues.length > 0 && nonIntegerValues.length === 0) {
    const isOptional = nonEmptyValues.length < unique.length;
    // Checked via BigInt parsing of the string, not Number(), so this is exact regardless of size. See resolveIntFieldSchema for the JSON-number equivalent.
    const hasUnsafeValue = nonEmptyValues.some((v) => !isSafeIntegerString(v));
    if (hasUnsafeValue) {
      return isOptional ? "coerce.bigint.or.empty" : "coerce.bigint";
    }
    return isOptional ? "coerce.int.or.empty" : "coerce.int";
  }
  if (
    nonEmptyValues.length > 0 &&
    nonIntegerValues.length < nonEmptyValues.length
  ) {
    logDetectionSkip(
      path,
      key,
      `${nonIntegerValues.length}/${nonEmptyValues.length} non-empty distinct values aren't plain integers ` +
        `(e.g. ${JSON.stringify(nonIntegerValues.slice(0, 3))}), staying as string/enum instead of coerce.int`,
    );
  }
  if (unique.length > 0 && nonDateValues.length < unique.length) {
    logDetectionSkip(
      path,
      key,
      `${nonDateValues.length}/${unique.length} distinct values aren't recognizable dates` +
        (keyHintsDate
          ? ""
          : " (key name doesn't hint at dates, so bare years aren't treated as ones)") +
        ` (e.g. ${JSON.stringify(nonDateValues.slice(0, 3))}), staying as string/enum instead of coerce.date`,
    );
  }

  // Fallback for date-hinted fields mixing clean single dates/years with the occasional multi-value list or empty string.
  if (keyHintsDate) {
    const nonDateOrMultiOrEmptyValues = unique.filter(
      (v) =>
        v !== "" && !isDateValue(v, keyHintsDate) && !isMultiDateListValue(v),
    );
    const isAllDateOrMultiOrEmpty =
      unique.length > 0 && nonDateOrMultiOrEmptyValues.length === 0;
    const hasMultiOrEmptyValue = unique.some(
      (v) => v === "" || isMultiDateListValue(v),
    );
    if (isAllDateOrMultiOrEmpty && hasMultiOrEmptyValue) {
      return "multi.coerce.date";
    }
  }

  const isIdenticalInAll = unique.length === 1 && count > 1;
  if (isIdenticalInAll) {
    return `literal-${JSON.stringify(unique[0])}`;
  }

  // A "/"-prefixed path reference is an open-ended foreign key, not a bounded category, so this takes priority over enum detection: capture the shared prefix instead of risking rejection of a valid-but-unseen ID.
  if (unique.length > 1 && unique.every((v) => v.startsWith("/"))) {
    const prefix = commonReferenceKeyPrefix(unique);
    if (prefix) {
      return `startsWith-${JSON.stringify(prefix)}`;
    }
  }

  // Case-insensitively dedupe before checking enum candidacy; the lowercase values are stored since the generated schema lowercases incoming values too (see generateZodSchema).
  const normalizedUnique = Array.from(
    new Set(unique.map((v) => v.toLowerCase())),
  );
  const uniqueRatio = normalizedUnique.length / count;
  const isSmallClosedSet =
    normalizedUnique.length > 1 &&
    normalizedUnique.length <= MAX_ENUM_VALUES &&
    uniqueRatio <= MAX_ENUM_UNIQUE_RATIO;

  if (normalizedUnique.length > 1 && !isSmallClosedSet) {
    const failedCap = normalizedUnique.length > MAX_ENUM_VALUES;
    const failedRatio = uniqueRatio > MAX_ENUM_UNIQUE_RATIO;
    const reasons = [
      failedCap &&
        `${normalizedUnique.length} distinct values exceeds MAX_ENUM_VALUES (${MAX_ENUM_VALUES})`,
      failedRatio &&
        `${(uniqueRatio * 100).toFixed(0)}% of samples are distinct, exceeds MAX_ENUM_UNIQUE_RATIO (${MAX_ENUM_UNIQUE_RATIO * 100}%)`,
    ].filter(Boolean);
    if (reasons.length > 0) {
      logDetectionSkip(
        path,
        key,
        `${reasons.join(" and ")}, staying as string instead of enum`,
      );
    }
  }

  if (isSmallClosedSet) {
    return `enum-${JSON.stringify(normalizedUnique)}`;
  }
  return "string";
}

export function detectLiteralsAndEnumsRecursive(
  obj: any,
  sampleIds: readonly string[],
  json: Record<string, any>,
  path: string[] = [],
): any {
  if (isUnionNode(obj)) {
    // No key/parent context available here, so only nested object alternatives can be recursed into; a bare "string" alt can't be refined without a key.
    return {
      [UNION_KEY]: obj[UNION_KEY].map((alt) =>
        isPlainObject(alt)
          ? detectLiteralsAndEnumsRecursive(alt, sampleIds, json, path)
          : alt,
      ),
    };
  }

  if (!isPlainObject(obj)) {
    return obj;
  }

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isUnionNode(value)) {
      // Refine each alternative: "string" gets literal/enum detection, "int" gets checked for bigint range, a nested object recurses, anything else passes through.
      result[key] = {
        [UNION_KEY]: value[UNION_KEY].map((alt) => {
          if (alt === "string") {
            return resolveStringFieldSchema(sampleIds, json, path, key);
          }
          if (alt === "int") {
            return resolveIntFieldSchema(sampleIds, json, path, key);
          }
          if (isPlainObject(alt)) {
            return detectLiteralsAndEnumsRecursive(alt, sampleIds, json, [
              ...path,
              key,
            ]);
          }
          return alt;
        }),
      };
      continue;
    }

    if (Array.isArray(value)) {
      // Recurse so keyed fields inside array items get literal/enum detection too; bare-primitive array items (e.g. tags[]) pass through unchanged, with no per-item key to scope to.
      result[key] =
        value.length === 0
          ? value
          : [
              detectLiteralsAndEnumsRecursive(value[0], sampleIds, json, [
                ...path,
                key,
              ]),
            ];
      continue;
    }

    const processedValue = isPlainObject(value)
      ? detectLiteralsAndEnumsRecursive(value, sampleIds, json, [...path, key])
      : value;

    if (processedValue === "int") {
      result[key] = resolveIntFieldSchema(sampleIds, json, path, key);
      continue;
    }

    if (processedValue !== "string") {
      result[key] = processedValue;
      continue;
    }

    result[key] = resolveStringFieldSchema(sampleIds, json, path, key);
  }

  return result;
}

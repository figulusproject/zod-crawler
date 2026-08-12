import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { CrawlCandidateField } from "./findCrawlCandidates.js";

export function crawlCandidatesToTxt(fields: CrawlCandidateField[]): string {
  const seen = new Set<string>();
  for (const { values } of fields) {
    for (const value of values) seen.add(value);
  }
  return [...seen]
    .sort()
    .map((value) => `${value}\n`)
    .join("");
}

export function crawlCandidatesToJson(fields: CrawlCandidateField[]): string {
  return JSON.stringify(
    Object.fromEntries(fields.map(({ path, values }) => [path, values])),
    null,
    2,
  );
}

export function crawlCandidatesToYaml(fields: CrawlCandidateField[]): string {
  return stringifyYaml(
    Object.fromEntries(fields.map(({ path, values }) => [path, values])),
    { lineWidth: 0 },
  );
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function crawlCandidatesToCsv(fields: CrawlCandidateField[]): string {
  const header = fields.map(({ path }) => csvField(path)).join(",");
  const rowCount = Math.max(0, ...fields.map(({ values }) => values.length));
  const rows = Array.from({ length: rowCount }, (_, rowIndex) =>
    fields
      .map(({ values }) =>
        values[rowIndex] === undefined ? "" : csvField(values[rowIndex]),
      )
      .join(","),
  );
  return [header, ...rows].join("\n");
}

export const CRAWL_CANDIDATES_FORMATS = ["txt", "json", "yaml", "csv"] as const;

export type CrawlCandidatesFormat = (typeof CRAWL_CANDIDATES_FORMATS)[number];

export const crawlCandidatesFormatters: Record<
  CrawlCandidatesFormat,
  { extension: string; toText: (fields: CrawlCandidateField[]) => string }
> = {
  txt: { extension: "txt", toText: crawlCandidatesToTxt },
  json: { extension: "json", toText: crawlCandidatesToJson },
  yaml: { extension: "yaml", toText: crawlCandidatesToYaml },
  csv: { extension: "csv", toText: crawlCandidatesToCsv },
};

export function parseIdsFromTxt(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// No path/field discrimination in the id list an input file feeds back in, so any string found anywhere in the parsed JSON/YAML value counts, regardless of nesting shape.
function flattenIdStrings(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenIdStrings);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(flattenIdStrings);
  }
  return [];
}

export function parseIdsFromJson(text: string): string[] {
  return flattenIdStrings(JSON.parse(text));
}

export function parseIdsFromYaml(text: string): string[] {
  return flattenIdStrings(parseYaml(text));
}

// Mirrors csvField's escaping: a field starting with `"` runs until the next unescaped `"`, with `""` as an escaped quote. Scanning char-by-char (rather than splitting on "\n" up front) lets a quoted field's embedded newline stay part of the field instead of being mistaken for a row break.
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field.length === 0) {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseIdsFromCsv(text: string): string[] {
  const [, ...dataRows] = parseCsvRows(text);
  return dataRows
    .flatMap((row) => row.map((cell) => cell.trim()))
    .filter((cell) => cell.length > 0);
}

export const idsParsers: Record<
  CrawlCandidatesFormat,
  (text: string) => string[]
> = {
  txt: parseIdsFromTxt,
  json: parseIdsFromJson,
  yaml: parseIdsFromYaml,
  csv: parseIdsFromCsv,
};

export function crawlCandidatesFormatFromExtension(
  filename: string,
): CrawlCandidatesFormat | undefined {
  const extension = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "yml") return "yaml";
  return (CRAWL_CANDIDATES_FORMATS as readonly string[]).includes(extension)
    ? (extension as CrawlCandidatesFormat)
    : undefined;
}

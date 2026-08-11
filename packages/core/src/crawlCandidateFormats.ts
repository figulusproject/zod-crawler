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

// Plain scalars that would otherwise be ambiguous (leading/trailing whitespace, YAML indicator characters, empty string) fall back to JSON-quoted form, which is also valid YAML flow scalar syntax.
const YAML_NEEDS_QUOTING = /^\s|\s$|^[-?:,[\]{}#&*!|>'"%@`]|: |:$|^$/;

function yamlScalar(value: string): string {
  return YAML_NEEDS_QUOTING.test(value) ? JSON.stringify(value) : value;
}

export function crawlCandidatesToYaml(fields: CrawlCandidateField[]): string {
  return fields
    .map(({ path, values }) =>
      [
        `${yamlScalar(path)}:`,
        ...values.map((value) => `  - ${yamlScalar(value)}`),
      ].join("\n"),
    )
    .join("\n");
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

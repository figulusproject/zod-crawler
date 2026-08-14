// Accepts either separator since the textarea replaces the CLI's two mutually-exclusive --ids/--ids-file flags with one field.
export function parseIds(raw: string): string[] {
  const ids = new Set<string>();
  for (const piece of raw.split(/[\n,]+/)) {
    const trimmed = piece.trim();
    if (trimmed.length > 0) ids.add(trimmed);
  }
  return [...ids];
}

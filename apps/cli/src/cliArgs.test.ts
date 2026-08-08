import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCliArgs } from "./cliArgs.js";

describe("parseCliArgs", () => {
  it("parses --ids as a comma-separated, deduped list", () => {
    const result = parseCliArgs(["--ids", "a, b ,a,c", "--output", "/tmp/out"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.ids).toEqual(["a", "b", "c"]);
      expect(result.settings.delayMs).toBe(7500);
      expect(result.settings.schemaName).toBe("InferredSchema");
      expect(result.settings.urlTemplate).toBeUndefined();
      expect(result.settings.emitCrawlCandidates).toBe(false);
      expect(result.settings.useZodTransformers).toBe(false);
    }
  });

  it("sets emitCrawlCandidates when --emit-crawl-candidates is passed", () => {
    const result = parseCliArgs([
      "--ids",
      "a",
      "--output",
      "/tmp/out",
      "--emit-crawl-candidates",
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.emitCrawlCandidates).toBe(true);
    }
  });

  it("sets useZodTransformers when --zod-transformers is passed", () => {
    const result = parseCliArgs([
      "--ids",
      "a",
      "--output",
      "/tmp/out",
      "--zod-transformers",
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.useZodTransformers).toBe(true);
    }
  });

  it("applies --url-template, --delay, and --schema-name overrides", () => {
    const result = parseCliArgs([
      "--ids",
      "a,b",
      "--output",
      "/tmp/out",
      "--url-template",
      "https://example.com/{id}.json",
      "--delay",
      "0",
      "--schema-name",
      "MySchema",
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.urlTemplate).toBe("https://example.com/{id}.json");
      expect(result.settings.delayMs).toBe(0);
      expect(result.settings.schemaName).toBe("MySchema");
    }
  });

  it("rejects when neither --ids nor --ids-file is given", () => {
    const result = parseCliArgs(["--output", "/tmp/out"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/exactly one/i);
  });

  it("rejects when both --ids and --ids-file are given", () => {
    const result = parseCliArgs([
      "--ids",
      "a",
      "--ids-file",
      "/dev/null",
      "--output",
      "/tmp/out",
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/exactly one/i);
  });

  it("rejects a missing --output", () => {
    const result = parseCliArgs(["--ids", "a,b"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/--output/);
  });

  it("rejects an empty resolved id list", () => {
    const result = parseCliArgs(["--ids", " , ,", "--output", "/tmp/out"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/at least one id/i);
  });

  it("rejects a --schema-name that isn't a valid identifier", () => {
    const result = parseCliArgs([
      "--ids",
      "a",
      "--output",
      "/tmp/out",
      "--schema-name",
      "2Bad",
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/--schema-name/);
  });

  it("rejects a --url-template without an {id} placeholder", () => {
    const result = parseCliArgs([
      "--ids",
      "a",
      "--output",
      "/tmp/out",
      "--url-template",
      "https://example.com/fixed.json",
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/\{id\}/);
  });

  it("rejects a non-integer or negative --delay", () => {
    for (const bad of ["abc", "-5", "7.5"]) {
      const result = parseCliArgs([
        "--ids",
        "a",
        "--output",
        "/tmp/out",
        "--delay",
        bad,
      ]);
      expect(result.ok, `--delay ${bad} should be rejected`).toBe(false);
    }
  });

  it("rejects an unrecognized flag", () => {
    const result = parseCliArgs([
      "--ids",
      "a",
      "--output",
      "/tmp/out",
      "--bogus",
    ]);
    expect(result.ok).toBe(false);
  });

  describe("--ids-file", () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), "cli-args-test-"));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("reads newline-separated ids, skipping blank lines and deduping", async () => {
      const file = path.join(dir, "ids.txt");
      await writeFile(file, "a\n\nb \n a\nc\n\n");

      const result = parseCliArgs(["--ids-file", file, "--output", "/tmp/out"]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.settings.ids).toEqual(["a", "b", "c"]);
      }
    });

    it("reports a clear error when the file doesn't exist", () => {
      const result = parseCliArgs([
        "--ids-file",
        path.join(dir, "missing.txt"),
        "--output",
        "/tmp/out",
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/--ids-file/);
    });
  });
});

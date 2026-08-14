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
      expect(result.settings.crawlCandidatesFormat).toBe("txt");
      expect(result.settings.useZodTransformers).toBe(false);
      expect(result.settings.stopOnError).toBe(false);
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
      expect(result.settings.crawlCandidatesFormat).toBe("txt");
    }
  });

  describe("--crawl-candidates-format", () => {
    it("sets crawlCandidatesFormat when combined with --emit-crawl-candidates", () => {
      const result = parseCliArgs([
        "--ids",
        "a",
        "--output",
        "/tmp/out",
        "--emit-crawl-candidates",
        "--crawl-candidates-format",
        "yaml",
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.settings.crawlCandidatesFormat).toBe("yaml");
      }
    });

    it("rejects --crawl-candidates-format without --emit-crawl-candidates", () => {
      const result = parseCliArgs([
        "--ids",
        "a",
        "--output",
        "/tmp/out",
        "--crawl-candidates-format",
        "yaml",
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toMatch(/--crawl-candidates-format/);
      }
    });

    it("rejects an unsupported format", () => {
      const result = parseCliArgs([
        "--ids",
        "a",
        "--output",
        "/tmp/out",
        "--emit-crawl-candidates",
        "--crawl-candidates-format",
        "xml",
      ]);

      expect(result.ok).toBe(false);
    });
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

  it("sets stopOnError when --stop-on-error is passed", () => {
    const result = parseCliArgs([
      "--ids",
      "a",
      "--output",
      "/tmp/out",
      "--stop-on-error",
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.stopOnError).toBe(true);
    }
  });

  it("leaves detach false by default", () => {
    const result = parseCliArgs(["--ids", "a", "--output", "/tmp/out"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.detach).toBe(false);
    }
  });

  it("sets detach when --detach or its -d alias is passed", () => {
    for (const flag of ["--detach", "-d"]) {
      const result = parseCliArgs(["--ids", "a", "--output", "/tmp/out", flag]);

      expect(result.ok, `${flag} should parse`).toBe(true);
      if (result.ok) expect(result.settings.detach).toBe(true);
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
      "100",
      "--schema-name",
      "MySchema",
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.urlTemplate).toBe("https://example.com/{id}.json");
      expect(result.settings.delayMs).toBe(100);
      expect(result.settings.schemaName).toBe("MySchema");
    }
  });

  it("rejects a --delay below the minimum", () => {
    const result = parseCliArgs([
      "--ids",
      "a",
      "--output",
      "/tmp/out",
      "--delay",
      "50",
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects when neither --ids nor --ids-file is given", () => {
    const result = parseCliArgs(["--output", "/tmp/out"]);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.message).toMatch(/one of --ids or --ids-file is required/i);
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
    if (!result.ok) expect(result.message).toMatch(/mutually exclusive/i);
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

  describe("--redis-url / --concurrency", () => {
    const originalRedisUrl = process.env.REDIS_URL;

    afterEach(() => {
      if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = originalRedisUrl;
    });

    it("leaves redisUrl/concurrency undefined by default", () => {
      delete process.env.REDIS_URL;
      const result = parseCliArgs(["--ids", "a", "--output", "/tmp/out"]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.settings.redisUrl).toBeUndefined();
        expect(result.settings.concurrency).toBeUndefined();
      }
    });

    it("sets redisUrl from --redis-url, defaulting concurrency to 1", () => {
      delete process.env.REDIS_URL;
      const result = parseCliArgs([
        "--ids",
        "a",
        "--output",
        "/tmp/out",
        "--redis-url",
        "redis://localhost:6379",
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.settings.redisUrl).toBe("redis://localhost:6379");
        expect(result.settings.concurrency).toBe(1);
      }
    });

    it("falls back to the REDIS_URL environment variable", () => {
      process.env.REDIS_URL = "redis://env-host:6379";
      const result = parseCliArgs(["--ids", "a", "--output", "/tmp/out"]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.settings.redisUrl).toBe("redis://env-host:6379");
      }
    });

    it("prefers --redis-url over the REDIS_URL environment variable", () => {
      process.env.REDIS_URL = "redis://env-host:6379";
      const result = parseCliArgs([
        "--ids",
        "a",
        "--output",
        "/tmp/out",
        "--redis-url",
        "redis://flag-host:6379",
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.settings.redisUrl).toBe("redis://flag-host:6379");
      }
    });

    it("applies --concurrency when a Redis URL is configured", () => {
      const result = parseCliArgs([
        "--ids",
        "a",
        "--output",
        "/tmp/out",
        "--redis-url",
        "redis://localhost:6379",
        "--concurrency",
        "4",
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings.concurrency).toBe(4);
    });

    it("rejects --concurrency without a Redis URL (flag or env)", () => {
      delete process.env.REDIS_URL;
      const result = parseCliArgs([
        "--ids",
        "a",
        "--output",
        "/tmp/out",
        "--concurrency",
        "4",
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/--concurrency/);
    });

    it("rejects a non-integer or non-positive --concurrency", () => {
      for (const bad of ["abc", "0", "-1", "1.5"]) {
        const result = parseCliArgs([
          "--ids",
          "a",
          "--output",
          "/tmp/out",
          "--redis-url",
          "redis://localhost:6379",
          "--concurrency",
          bad,
        ]);
        expect(result.ok, `--concurrency ${bad} should be rejected`).toBe(
          false,
        );
      }
    });
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

    it("reads ids from a .json file, flattening every field", async () => {
      const file = path.join(dir, "ids.json");
      await writeFile(
        file,
        JSON.stringify({ "authors.key": ["a", "b"], "publisher.key": ["c"] }),
      );

      const result = parseCliArgs(["--ids-file", file, "--output", "/tmp/out"]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.settings.ids).toEqual(["a", "b", "c"]);
      }
    });

    it("reads ids from a .yaml file, flattening every field", async () => {
      const file = path.join(dir, "ids.yaml");
      await writeFile(
        file,
        "authors.key:\n  - a\n  - b\npublisher.key:\n  - c\n",
      );

      const result = parseCliArgs(["--ids-file", file, "--output", "/tmp/out"]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.settings.ids).toEqual(["a", "b", "c"]);
      }
    });

    it("reads ids from a .csv file, dropping the header row", async () => {
      const file = path.join(dir, "ids.csv");
      await writeFile(file, "authors.key,publisher.key\na,c\nb,\n");

      const result = parseCliArgs(["--ids-file", file, "--output", "/tmp/out"]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.settings.ids).toEqual(["a", "c", "b"]);
      }
    });

    it("rejects an --ids-file with an unrecognized extension", async () => {
      const file = path.join(dir, "ids.xml");
      await writeFile(file, "<ids/>");

      const result = parseCliArgs(["--ids-file", file, "--output", "/tmp/out"]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toMatch(/--ids-file/);
        expect(result.message).toMatch(/unrecognized extension/);
      }
    });

    it("reports a clear error when a .json --ids-file isn't valid JSON", async () => {
      const file = path.join(dir, "ids.json");
      await writeFile(file, "not json");

      const result = parseCliArgs(["--ids-file", file, "--output", "/tmp/out"]);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/--ids-file/);
    });
  });
});

import { readdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "./runCli.js";

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  } as Response;
}

describe("runCli", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "run-cli-test-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("fetches, infers, validates, and writes a formatted schema end-to-end", async () => {
    const books: Record<string, unknown> = {
      a: { title: "Book A", pages: 100 },
      b: { title: "Book B", pages: 200 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const id = url.replace("https://example.com/", "").replace(".json", "");
        return jsonResponse(books[id]);
      }),
    );

    const code = await runCli([
      "--ids",
      "a,b",
      "--output",
      outputDir,
      "--delay",
      "100",
      "--url-template",
      "https://example.com/{id}.json",
      "--schema-name",
      "BookSchema",
    ]);

    expect(code).toBe(0);

    const schemaPath = path.join(outputDir, "schema.ts");
    const schemaSource = await readFile(schemaPath, "utf8");
    expect(schemaSource).toContain("export const BookSchema");
    expect(schemaSource).toContain("z.object(");

    const cacheFiles = await readdir(path.join(outputDir, "cache"));
    // Two id cache files plus the manifest.
    expect(cacheFiles.filter((f) => f !== "manifest.json")).toHaveLength(2);
  });

  it("writes new, deduped crawl candidates when --emit-crawl-candidates is set", async () => {
    const books: Record<string, unknown> = {
      a: { title: "Book A", ref: { key: "/other/c" } },
      b: { title: "Book B", ref: { key: "/other/d" } },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const id = url.replace("https://example.com/", "").replace(".json", "");
        return jsonResponse(books[id]);
      }),
    );

    const code = await runCli([
      "--ids",
      "a,b",
      "--output",
      outputDir,
      "--delay",
      "100",
      "--url-template",
      "https://example.com/{id}.json",
      "--emit-crawl-candidates",
    ]);

    expect(code).toBe(0);

    const candidatesPath = path.join(outputDir, "crawl-candidates.txt");
    const candidates = (await readFile(candidatesPath, "utf8"))
      .split("\n")
      .filter((line) => line.length > 0);

    // "a" and "b" are this run's own seeds, so they must not show up as candidates for the next run.
    expect(candidates).toEqual(["/other/c", "/other/d"]);
  });

  it("does not write crawl-candidates.txt when the flag is omitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ title: "Book A" })),
    );

    await runCli([
      "--ids",
      "a",
      "--output",
      outputDir,
      "--delay",
      "100",
      "--url-template",
      "https://example.com/{id}.json",
    ]);

    await expect(
      readFile(path.join(outputDir, "crawl-candidates.txt"), "utf8"),
    ).rejects.toThrow();
  });

  it("logs a failed fetch and continues with the rest by default", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/b.json")) {
          return {
            ok: false,
            status: 404,
            statusText: "Not Found",
          } as Response;
        }
        return jsonResponse({ title: "Book" });
      }),
    );

    const code = await runCli([
      "--ids",
      "a,b",
      "--output",
      outputDir,
      "--delay",
      "100",
      "--url-template",
      "https://example.com/{id}.json",
    ]);

    expect(code).toBe(0);
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes("error 2/2: b"),
      ),
    ).toBe(true);

    const cacheFiles = await readdir(path.join(outputDir, "cache"));
    expect(cacheFiles.filter((f) => f !== "manifest.json")).toHaveLength(1);
    consoleError.mockRestore();
  });

  it("aborts the whole run on a failed fetch when --stop-on-error is set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/b.json")) {
          return {
            ok: false,
            status: 404,
            statusText: "Not Found",
          } as Response;
        }
        return jsonResponse({ title: "Book" });
      }),
    );

    const code = await runCli([
      "--ids",
      "a,b",
      "--output",
      outputDir,
      "--delay",
      "100",
      "--url-template",
      "https://example.com/{id}.json",
      "--stop-on-error",
    ]);

    expect(code).toBe(1);
  });

  it("returns a non-zero exit code and prints usage on invalid args", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const code = await runCli(["--output", outputDir]);

    expect(code).toBe(1);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

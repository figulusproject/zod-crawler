import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { readdir, readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "./runCli.js";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));

class FakeChild extends EventEmitter {
  pid = 4321;
  unref = vi.fn();
}

// spawn's "spawn"/"error" events fire on a later tick, same as the real child_process API - emitting synchronously would fire before runDetached's listeners are attached.
function queueSpawnEvent(
  child: FakeChild,
  event: "spawn" | "error",
  arg?: Error,
) {
  setImmediate(() => child.emit(event, arg));
}

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

    const outputFiles = await readdir(outputDir);
    expect(outputFiles).not.toContain("zod-crawler.pid");
    expect(outputFiles).not.toContain("zod-crawler.status.json");
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

  it("writes crawl candidates grouped by field path when --crawl-candidates-format is json", async () => {
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
      "--crawl-candidates-format",
      "json",
    ]);

    expect(code).toBe(0);

    const candidatesPath = path.join(outputDir, "crawl-candidates.json");
    const candidates = JSON.parse(await readFile(candidatesPath, "utf8"));
    expect(candidates).toEqual({ "ref.key": ["/other/c", "/other/d"] });
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

  it("writes the schema and reports failures when validation fails for some samples", async () => {
    // classifyRawString's date-prefix regex has no trailing anchor, so this tags as "coerce.date" even though the month/day are out of range and z.coerce.date() rejects it at validation time.
    const books: Record<string, unknown> = {
      a: { title: "Book A", releasedAt: "2026-01-01" },
      b: { title: "Book B", releasedAt: "2026-13-45garbage" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const id = url.replace("https://example.com/", "").replace(".json", "");
        return jsonResponse(books[id]);
      }),
    );
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

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

    expect(code).toBe(1);
    expect(
      consoleLog.mock.calls.some((call) =>
        String(call[0]).includes("1/2 sample(s) failed validation:"),
      ),
    ).toBe(true);
    expect(
      consoleError.mock.calls.some((call) => call[0] === "=== b ==="),
    ).toBe(true);

    const schemaSource = await readFile(
      path.join(outputDir, "schema.ts"),
      "utf8",
    );
    expect(schemaSource).toContain("export const InferredSchema");

    consoleLog.mockRestore();
    consoleError.mockRestore();
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

  describe("--detach", () => {
    afterEach(() => {
      vi.mocked(spawn).mockReset();
    });

    it("re-spawns itself with the equivalent flags and reports the child's pid and paths", async () => {
      const child = new FakeChild();
      vi.mocked(spawn).mockImplementation((..._args) => {
        queueSpawnEvent(child, "spawn");
        return child as never;
      });
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

      const code = await runCli([
        "--ids",
        "a,b",
        "--output",
        outputDir,
        "--delay",
        "500",
        "--url-template",
        "https://example.com/{id}.json",
        "--schema-name",
        "BookSchema",
        "--emit-crawl-candidates",
        "--crawl-candidates-format",
        "json",
        "--zod-transformers",
        "--stop-on-error",
        "--redis-url",
        "redis://localhost:6379",
        "--concurrency",
        "3",
        "--detach",
      ]);

      expect(code).toBe(0);
      expect(spawn).toHaveBeenCalledTimes(1);
      const [command, args, options] = vi.mocked(spawn).mock.calls[0];
      expect(command).toBe(process.execPath);
      expect(
        (options as { env?: Record<string, string | undefined> }).env,
      ).toMatchObject({ ZOD_CRAWLER_DETACHED: "1" });
      expect(args).toEqual(
        expect.arrayContaining([
          "--output",
          outputDir,
          "--url-template",
          "https://example.com/{id}.json",
          "--delay",
          "500",
          "--schema-name",
          "BookSchema",
          "--emit-crawl-candidates",
          "--crawl-candidates-format",
          "json",
          "--zod-transformers",
          "--stop-on-error",
          "--redis-url",
          "redis://localhost:6379",
          "--concurrency",
          "3",
        ]),
      );

      const idsFilePath = args[args.indexOf("--ids-file") + 1];
      expect(await readFile(idsFilePath, "utf8")).toBe("a\nb\n");
      await rm(idsFilePath, { force: true });

      const logPath = path.join(outputDir, "zod-crawler.log");
      expect(await readFile(logPath, "utf8")).toBe("");
      expect(child.unref).toHaveBeenCalled();
      expect(
        consoleLog.mock.calls.some((call) =>
          String(call[0]).includes(
            `Started crawl in the background (pid ${child.pid})`,
          ),
        ),
      ).toBe(true);

      const pidFile = JSON.parse(
        await readFile(path.join(outputDir, "zod-crawler.pid"), "utf8"),
      );
      expect(pidFile).toMatchObject({ pid: child.pid, ids: 2 });
      expect(typeof pidFile.startedAt).toBe("string");

      consoleLog.mockRestore();
    });

    it("omits optional flags that were not set", async () => {
      const child = new FakeChild();
      vi.mocked(spawn).mockImplementation((..._args) => {
        queueSpawnEvent(child, "spawn");
        return child as never;
      });
      vi.spyOn(console, "log").mockImplementation(() => {});

      const code = await runCli([
        "--ids",
        "a",
        "--output",
        outputDir,
        "--delay",
        "100",
        "--detach",
      ]);

      expect(code).toBe(0);
      const args = vi.mocked(spawn).mock.calls[0][1];
      for (const flag of [
        "--url-template",
        "--emit-crawl-candidates",
        "--crawl-candidates-format",
        "--zod-transformers",
        "--stop-on-error",
        "--redis-url",
        "--concurrency",
      ]) {
        expect(args).not.toContain(flag);
      }

      const idsFilePath = args[args.indexOf("--ids-file") + 1];
      await rm(idsFilePath, { force: true });

      vi.mocked(console.log).mockRestore();
    });

    it("returns 1 and logs an error when the child fails to spawn", async () => {
      const child = new FakeChild();
      vi.mocked(spawn).mockImplementation((..._args) => {
        queueSpawnEvent(child, "error", new Error("boom"));
        return child as never;
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const code = await runCli([
        "--ids",
        "a",
        "--output",
        outputDir,
        "--delay",
        "100",
        "--detach",
      ]);

      expect(code).toBe(1);
      expect(
        consoleError.mock.calls.some((call) =>
          String(call[0]).includes("Failed to start detached crawl: boom"),
        ),
      ).toBe(true);

      const args = vi.mocked(spawn).mock.calls[0][1];
      const idsFilePath = args[args.indexOf("--ids-file") + 1];
      await rm(idsFilePath, { force: true });

      consoleError.mockRestore();
    });
  });

  describe("ZOD_CRAWLER_DETACHED (child-side status tracking)", () => {
    const originalEnv = process.env.ZOD_CRAWLER_DETACHED;

    beforeEach(() => {
      process.env.ZOD_CRAWLER_DETACHED = "1";
    });

    afterEach(() => {
      if (originalEnv === undefined) delete process.env.ZOD_CRAWLER_DETACHED;
      else process.env.ZOD_CRAWLER_DETACHED = originalEnv;
    });

    it("writes zod-crawler.status.json with exit code 0 on success", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ title: "Book" })),
      );

      const code = await runCli([
        "--ids",
        "a",
        "--output",
        outputDir,
        "--delay",
        "100",
        "--url-template",
        "https://example.com/{id}.json",
      ]);

      expect(code).toBe(0);
      const statusFile = JSON.parse(
        await readFile(path.join(outputDir, "zod-crawler.status.json"), "utf8"),
      );
      expect(statusFile.exitCode).toBe(0);
      expect(typeof statusFile.finishedAt).toBe("string");
    });

    it("writes zod-crawler.status.json with a non-zero exit code on failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            ({ ok: false, status: 404, statusText: "Not Found" }) as Response,
        ),
      );

      const code = await runCli([
        "--ids",
        "a",
        "--output",
        outputDir,
        "--delay",
        "100",
        "--url-template",
        "https://example.com/{id}.json",
        "--stop-on-error",
      ]);

      expect(code).toBe(1);
      const statusFile = JSON.parse(
        await readFile(path.join(outputDir, "zod-crawler.status.json"), "utf8"),
      );
      expect(statusFile.exitCode).toBe(1);
    });
  });

  describe("status", () => {
    it("reports no crawl found when there's no pidfile", async () => {
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

      const code = await runCli(["status", "--output", outputDir]);

      expect(code).toBe(1);
      expect(
        consoleLog.mock.calls.some((call) =>
          String(call[0]).includes("No detached crawl found"),
        ),
      ).toBe(true);
      consoleLog.mockRestore();
    });

    it("reports running when the pid is alive and no status file exists", async () => {
      await writeFile(
        path.join(outputDir, "zod-crawler.pid"),
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
          ids: 2,
        }),
      );
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

      const code = await runCli(["status", "--output", outputDir]);

      expect(code).toBe(0);
      expect(
        consoleLog.mock.calls.some((call) =>
          String(call[0]).includes("status:   running"),
        ),
      ).toBe(true);
      consoleLog.mockRestore();
    });

    it("reports the recorded exit code when a status file is present", async () => {
      await writeFile(
        path.join(outputDir, "zod-crawler.pid"),
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
          ids: 1,
        }),
      );
      await writeFile(
        path.join(outputDir, "zod-crawler.status.json"),
        JSON.stringify({ exitCode: 0, finishedAt: new Date().toISOString() }),
      );
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

      const code = await runCli(["status", "--output", outputDir]);

      expect(code).toBe(0);
      expect(
        consoleLog.mock.calls.some((call) =>
          String(call[0]).includes("succeeded"),
        ),
      ).toBe(true);
      consoleLog.mockRestore();
    });

    it("reports failure when the recorded exit code is non-zero", async () => {
      await writeFile(
        path.join(outputDir, "zod-crawler.pid"),
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
          ids: 1,
        }),
      );
      await writeFile(
        path.join(outputDir, "zod-crawler.status.json"),
        JSON.stringify({ exitCode: 1, finishedAt: new Date().toISOString() }),
      );
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

      const code = await runCli(["status", "--output", outputDir]);

      expect(code).toBe(1);
      expect(
        consoleLog.mock.calls.some((call) =>
          String(call[0]).includes("failed"),
        ),
      ).toBe(true);
      consoleLog.mockRestore();
    });

    it("reports not running when the pid is dead and there's no status file", async () => {
      await writeFile(
        path.join(outputDir, "zod-crawler.pid"),
        JSON.stringify({
          pid: 999999,
          startedAt: new Date().toISOString(),
          ids: 1,
        }),
      );
      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation((): never => {
          const error = new Error("no such process") as NodeJS.ErrnoException;
          error.code = "ESRCH";
          throw error;
        });
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

      const code = await runCli(["status", "--output", outputDir]);

      expect(code).toBe(1);
      expect(
        consoleLog.mock.calls.some((call) =>
          String(call[0]).includes("not running"),
        ),
      ).toBe(true);

      killSpy.mockRestore();
      consoleLog.mockRestore();
    });
  });
});

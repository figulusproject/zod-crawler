import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Nothing listens here, so ioredis's connect() rejects with ECONNREFUSED almost immediately rather than hanging on the connectTimeout.
const BROKEN_REDIS_URL = "redis://127.0.0.1:1";

let resumeActiveCrawls: typeof import("./crawlJobs.js").resumeActiveCrawls;

describe("resumeActiveCrawls (registry unreachable)", () => {
  beforeAll(async () => {
    process.env.REDIS_URL = BROKEN_REDIS_URL;
    ({ resumeActiveCrawls } = await import("./crawlJobs.js"));
  });

  afterAll(() => {
    delete process.env.REDIS_URL;
  });

  it("logs and returns instead of throwing when the registry can't be reached", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(resumeActiveCrawls()).resolves.toBeUndefined();

    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes(
          "Failed to list active crawls, skipping resume:",
        ),
      ),
    ).toBe(true);
    consoleError.mockRestore();
  });
});

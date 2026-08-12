import { describe, expect, it } from "vitest";
import {
  listActiveCrawls,
  registerActiveCrawl,
  unregisterActiveCrawl,
} from "./crawlRegistry.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

describe("crawlRegistry", () => {
  it("register then list round-trips the job id and payload", async () => {
    const jobId = `test-register-${Date.now()}`;
    const payload = { ids: ["a", "b"], schemaName: "Thing" };

    try {
      await registerActiveCrawl(REDIS_URL, jobId, payload);
      const entries = await listActiveCrawls(REDIS_URL);

      const entry = entries.find((candidate) => candidate.jobId === jobId);
      expect(entry?.payload).toEqual(payload);
      expect(entry?.registeredAt).toBeTypeOf("string");
    } finally {
      await unregisterActiveCrawl(REDIS_URL, jobId);
    }
  });

  it("unregister removes the entry", async () => {
    const jobId = `test-unregister-${Date.now()}`;
    await registerActiveCrawl(REDIS_URL, jobId, { ids: ["a"] });

    await unregisterActiveCrawl(REDIS_URL, jobId);

    const entries = await listActiveCrawls(REDIS_URL);
    expect(entries.some((entry) => entry.jobId === jobId)).toBe(false);
  });

  it("registering the same job id twice overwrites the payload", async () => {
    const jobId = `test-overwrite-${Date.now()}`;

    try {
      await registerActiveCrawl(REDIS_URL, jobId, { ids: ["first"] });
      await registerActiveCrawl(REDIS_URL, jobId, { ids: ["second"] });

      const entries = await listActiveCrawls(REDIS_URL);
      const matching = entries.filter((entry) => entry.jobId === jobId);
      expect(matching).toHaveLength(1);
      expect(matching[0]?.payload).toEqual({ ids: ["second"] });
    } finally {
      await unregisterActiveCrawl(REDIS_URL, jobId);
    }
  });

  it("unregistering an id that was never registered is a no-op", async () => {
    await expect(
      unregisterActiveCrawl(REDIS_URL, "never-registered"),
    ).resolves.toBeUndefined();
  });
});

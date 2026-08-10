import { afterEach, describe, expect, it } from "vitest";
import {
  createDomainCooldownGate,
  type DomainCooldownGate,
} from "./domainCooldownGate.js";
import { parseRedisUrl } from "./redisConnection.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = parseRedisUrl(REDIS_URL);

describe("createDomainCooldownGate", () => {
  let gate: DomainCooldownGate | undefined;

  afterEach(async () => {
    await gate?.close();
    gate = undefined;
  });

  it("runs the task and returns its result", async () => {
    gate = createDomainCooldownGate(connection, 0);
    await expect(gate.gate("example.com", async () => 42)).resolves.toBe(42);
  });

  it("paces calls to the same domain at least cooldownMs apart", async () => {
    gate = createDomainCooldownGate(connection, 300);
    const start = Date.now();
    await gate.gate("example.com", async () => {});
    await gate.gate("example.com", async () => {});
    expect(Date.now() - start).toBeGreaterThanOrEqual(300 - 20);
  });

  it("does not pace calls to different domains against each other", async () => {
    gate = createDomainCooldownGate(connection, 2000);
    const start = Date.now();
    await Promise.all([
      gate.gate("a.example.com", async () => {}),
      gate.gate("b.example.com", async () => {}),
    ]);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("passes tasks through immediately when cooldownMs is 0 (no Redis round-trip)", async () => {
    gate = createDomainCooldownGate(connection, 0);
    const start = Date.now();
    for (let i = 0; i < 5; i++) {
      await gate.gate("example.com", async () => {});
    }
    expect(Date.now() - start).toBeLessThan(200);
  });
});

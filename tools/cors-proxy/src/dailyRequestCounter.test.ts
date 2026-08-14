import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("DailyRequestCounter", () => {
  it("increments and reports the running count", async () => {
    const stub = env.DAILY_REQUEST_COUNTER.get(
      env.DAILY_REQUEST_COUNTER.idFromName("increments"),
    );

    expect(await stub.incrementAndCheck(10)).toEqual({
      allowed: true,
      count: 1,
    });
    expect(await stub.incrementAndCheck(10)).toEqual({
      allowed: true,
      count: 2,
    });
  });

  it("reports allowed: false once the count exceeds the cap", async () => {
    const stub = env.DAILY_REQUEST_COUNTER.get(
      env.DAILY_REQUEST_COUNTER.idFromName("cap"),
    );

    await stub.incrementAndCheck(2);
    await stub.incrementAndCheck(2);
    expect(await stub.incrementAndCheck(2)).toEqual({
      allowed: false,
      count: 3,
    });
  });

  it("keeps separate counts for separate instances", async () => {
    const a = env.DAILY_REQUEST_COUNTER.get(
      env.DAILY_REQUEST_COUNTER.idFromName("a"),
    );
    const b = env.DAILY_REQUEST_COUNTER.get(
      env.DAILY_REQUEST_COUNTER.idFromName("b"),
    );

    await a.incrementAndCheck(10);
    await a.incrementAndCheck(10);
    expect(await b.incrementAndCheck(10)).toEqual({
      allowed: true,
      count: 1,
    });
  });
});

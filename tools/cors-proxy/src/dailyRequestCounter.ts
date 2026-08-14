import { DurableObject } from "cloudflare:workers";

export class DailyRequestCounter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS daily_counts (
          date TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0
        )
      `);
    });
  }

  async incrementAndCheck(
    cap: number,
  ): Promise<{ allowed: boolean; count: number }> {
    const today = new Date().toISOString().slice(0, 10);
    this.ctx.storage.sql.exec(
      `INSERT INTO daily_counts (date, count) VALUES (?, 1)
       ON CONFLICT(date) DO UPDATE SET count = count + 1`,
      today,
    );
    const { count } = this.ctx.storage.sql
      .exec<{ count: number }>(
        "SELECT count FROM daily_counts WHERE date = ?",
        today,
      )
      .one();
    return { allowed: count <= cap, count };
  }
}

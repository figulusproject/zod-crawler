import { parseRedisUrl } from "./redisConnection.js";

export interface ActiveCrawlEntry {
  jobId: string;
  payload: unknown;
  registeredAt: string;
}

const ACTIVE_CRAWLS_KEY = "zod-crawler:active-crawls";

async function importIoredis() {
  try {
    return await import("ioredis");
  } catch (error) {
    throw new Error(
      'A Redis URL was provided but "ioredis" (and its peer dependency "bullmq") aren\'t installed. ' +
        "Run `npm install bullmq ioredis` to enable Redis-backed queuing.",
      { cause: error },
    );
  }
}

async function withRedis<T>(
  redisUrl: string,
  run: (redis: import("ioredis").Redis) => Promise<T>,
): Promise<T> {
  const { Redis } = await importIoredis();
  // parseRedisUrl's declared type is a union that includes a live client instance, but it only ever returns the plain options object.
  const options = parseRedisUrl(redisUrl) as import("ioredis").RedisOptions;
  const redis = new Redis({
    ...options,
    // Unlike parseRedisUrl's null (for a long-lived BullMQ worker), fail fast here.
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: true,
  });
  // An unlistened "error" event throws synchronously in Node and would crash the caller.
  redis.on("error", () => {});
  try {
    await redis.connect();
    return await run(redis);
  } finally {
    redis.disconnect();
  }
}

export async function registerActiveCrawl(
  redisUrl: string,
  jobId: string,
  payload: unknown,
): Promise<void> {
  const entry: Omit<ActiveCrawlEntry, "jobId"> = {
    payload,
    registeredAt: new Date().toISOString(),
  };
  await withRedis(redisUrl, (redis) =>
    redis.hset(ACTIVE_CRAWLS_KEY, jobId, JSON.stringify(entry)),
  );
}

export async function unregisterActiveCrawl(
  redisUrl: string,
  jobId: string,
): Promise<void> {
  await withRedis(redisUrl, (redis) => redis.hdel(ACTIVE_CRAWLS_KEY, jobId));
}

export async function listActiveCrawls(
  redisUrl: string,
): Promise<ActiveCrawlEntry[]> {
  return withRedis(redisUrl, async (redis) => {
    const fields = await redis.hgetall(ACTIVE_CRAWLS_KEY);
    return Object.entries(fields).map(([jobId, value]) => {
      const { payload, registeredAt } = JSON.parse(value) as Omit<
        ActiveCrawlEntry,
        "jobId"
      >;
      return { jobId, payload, registeredAt };
    });
  });
}

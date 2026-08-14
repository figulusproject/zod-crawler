import type { ConnectionOptions } from "bullmq";

// maxRetriesPerRequest must be null for BullMQ workers - otherwise exceptions raised by blocking Redis commands can break worker functionality.
export function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  };
}

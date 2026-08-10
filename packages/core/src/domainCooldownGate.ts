import type { ConnectionOptions, Queue, QueueEvents, Worker } from "bullmq";

export interface DomainCooldownGate {
  // Runs task() no more than once every cooldownMs for a given domain key; different domains don't wait on each other.
  gate: <T>(domain: string, task: () => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}

interface DomainQueueEntry {
  queue: Queue;
  worker: Worker;
  events: QueueEvents;
}

// Lazily creates one { queue, worker, events } triple per domain, each worker rate-limited to one job per cooldownMs - the queue is used purely as a cooldown ticket dispenser (its job processor does nothing), never for the actual fetch.
export function createDomainCooldownGate(
  connection: ConnectionOptions,
  cooldownMs: number,
): DomainCooldownGate {
  if (cooldownMs <= 0) {
    return { gate: (_domain, task) => task(), close: async () => {} };
  }

  // Cached as a promise (not the resolved module) so two calls racing before the import settles share one in-flight import instead of starting two.
  const bullmqPromise = import("bullmq");

  // Keyed by a promise, not the resolved entry - two gate() calls for the same domain landing in the same microtask must see the map already populated on the second call, or they'd each create their own queue/worker and pace against nothing but themselves.
  const domainQueues = new Map<string, Promise<DomainQueueEntry>>();

  function getDomainQueue(domain: string): Promise<DomainQueueEntry> {
    const existing = domainQueues.get(domain);
    if (existing) return existing;

    const creation = (async (): Promise<DomainQueueEntry> => {
      const { Queue, QueueEvents, Worker } = await bullmqPromise;
      const queueName = `zod-crawler-cooldown-${domain}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const queue = new Queue(queueName, { connection });
      const worker = new Worker(queueName, async () => null, {
        connection,
        concurrency: 1,
        limiter: { max: 1, duration: cooldownMs },
      });
      const events = new QueueEvents(queueName, { connection });

      // waitUntilFinished races the QueueEvents stream listener against job completion; if the listener isn't subscribed yet the job can complete (and, with removeOnComplete, be deleted) before it's seen, causing the wait to hang. Resolve readiness once per domain before adding the first ticket.
      await Promise.all([
        queue.waitUntilReady(),
        worker.waitUntilReady(),
        events.waitUntilReady(),
      ]);

      return { queue, worker, events };
    })();

    domainQueues.set(domain, creation);
    return creation;
  }

  async function gate<T>(domain: string, task: () => Promise<T>): Promise<T> {
    const { queue, events } = await getDomainQueue(domain);
    const job = await queue.add(
      "tick",
      {},
      // Bounded history (not `true`/immediate removal) so completed tickets stick around long enough for anything inspecting job counts to see them.
      { removeOnComplete: 1000, removeOnFail: 1000 },
    );
    await job.waitUntilFinished(events);
    return task();
  }

  async function close(): Promise<void> {
    await Promise.all(
      [...domainQueues.values()].map(async (entryPromise) => {
        const entry = await entryPromise;
        await entry.worker.close();
        await entry.queue.obliterate({ force: true }).catch(() => {});
        await entry.queue.close();
        await entry.events.close();
      }),
    );
    domainQueues.clear();
  }

  return { gate, close };
}

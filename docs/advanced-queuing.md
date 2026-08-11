# Advanced queuing

By default, both the [CLI](cli.md) and the [web app](web.md) fetch one id at a time, paced apart, with no retries - a failed fetch is logged and skipped. Pointing either at a Redis-compatible server switches to a [BullMQ](https://bullmq.io)-backed queue instead, which adds:

- **Retries with backoff** for transient failures (429, 5xx, network errors) - up to 3 attempts, exponential backoff. A permanent failure (any other 4xx, e.g. 404 or 403) is still skipped immediately, no retries.
- **Concurrency**: multiple fetches in flight at once, instead of one at a time.
- **Per-domain cooldowns**: the fetch pace becomes per-domain instead of global when ids are full URLs spanning multiple hosts - each host gets its own independent cooldown instead of all requests sharing one clock. Ids that all resolve to the same host (e.g. via a URL template) still share one cooldown bucket, identical pacing to the default queue.

`--redis-url`/`REDIS_URL` name the wire protocol [BullMQ](https://bullmq.io)/[ioredis](https://github.com/redis/ioredis) speak, not a recommendation to run Redis itself. Run [Valkey](https://valkey.io) instead: since March 2024 Redis has shipped under the RSALv2/SSPLv1 dual license, neither of which is OSI-approved open source, while Valkey is the Linux Foundation-governed, community-maintained fork that stayed on the original BSD-3-Clause license Redis used through to version 7.2 - a drop-in, wire-compatible replacement, so nothing here needs to know the difference.

## CLI

`--redis-url` (or `REDIS_URL`) switches to the BullMQ-backed queue, and `--concurrency` raises it above the default of `1`. See [CLI Docker](cli.md#docker) for the bundled-Valkey default image vs. the `:slim` image paired with your own Redis/Valkey, including a full `docker run` example of each.

## Web

`REDIS_URL` (alongside `PORT`) switches every crawl on the server to the BullMQ-backed queue, server-wide instead of per-run. See [Web Docker](web.md#docker) for the bundled-Valkey default image vs. the `:slim` image and a Docker Compose example.

### Surviving a server restart

With `REDIS_URL` set, the server also registers each crawl still in progress in Redis and, on startup, resumes anything left running from before it last stopped - reconnecting to the same BullMQ queue a crashed process was using instead of losing that work. This needs a Redis/Valkey instance that itself survives the restart, which the default, bundled Valkey does not - point `REDIS_URL` at your own persistent instance for this to do anything.

Resuming the queue alone only avoids re-doing fetches still in flight at the moment of the crash. Anything already fetched is cached to a per-job directory that, by default, lives under the OS temp directory and is lost on restart just like the queue would be without `REDIS_URL`. Set `CACHE_DIR` to a persistent, ideally volume-mounted directory to carry that cache across restarts too, so a resumed crawl only re-fetches what was still outstanding, not everything - see the [Web Docker Compose example](web.md#docker) for `REDIS_URL` and `CACHE_DIR` wired up together.

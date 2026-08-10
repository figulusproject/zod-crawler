#!/bin/sh
set -e

# Non-persistent (--save "" disables RDB snapshots, no AOF): this queue only
# ever holds in-flight crawl jobs, nothing meant to outlive the container.
# Point REDIS_URL at an external instance instead if you need that (see
# apps/web/README.md's "Advanced queuing" section).
valkey-server --port 6379 --save "" --appendonly no --daemonize no &

exec node apps/web/dist/server/server/index.js

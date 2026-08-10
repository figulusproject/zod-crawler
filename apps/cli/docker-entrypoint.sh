#!/bin/sh
set -e

# Non-persistent (--save "" disables RDB snapshots, no AOF): this queue only
# ever holds this run's fetch jobs, nothing meant to outlive the container.
# Point REDIS_URL at an external instance instead if you need that (see
# apps/cli/README.md's "Advanced queuing" section). Logs are silenced -
# stdout here is the CLI's own output (schema/validation summary), which a
# caller may parse or redirect to a file.
valkey-server --port 6379 --save "" --appendonly no --daemonize no --logfile /tmp/valkey.log &

exec node apps/cli/dist/index.js "$@"

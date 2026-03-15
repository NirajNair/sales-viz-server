#!/bin/sh
set -e

echo "Running database migrations..."
bun run db:migrate

exec "$@"

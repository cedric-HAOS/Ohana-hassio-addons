#!/bin/sh
set -eu

if [ "${1:-}" = "node" ] && [ "${2:-}" = "index" ] && [ "${LOG_FORMAT:-text}" != "json" ]; then
  exec "$@" | ./node_modules/.bin/bunyan -L -o short
fi

exec "$@"

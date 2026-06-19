#!/usr/bin/env bash
# ONT clean-build container entrypoint. Dispatches to one of the runnable clean apps by service name.
# Each app self-configures from the environment (the indexer's chain gate lives in @ont/node-live's
# selectIndexerBlockSource — ONT_SOURCE=node + ONT_CHAIN + ONT_RPC_URL fail closed there, before any poll),
# so this entrypoint carries NO launch-height/source-mode/RPC machinery. See docker-compose.yml.

set -euo pipefail

APP_ROOT=/app
SERVICE="${1:-web}"

case "$SERVICE" in
  resolver)
    # PORT (default 4174), ONT_STORE=file + ONT_STORE_DIR -> durable confirmed-anchor read; serves /health, /tx/:txid.
    exec node "${APP_ROOT}/apps/resolver/dist/apps/resolver/src/index.js"
    ;;
  web)
    # PORT (default 4175), ONT_RESOLVER_URL -> live tx source; serves /health + explorer.
    exec node "${APP_ROOT}/apps/web/dist/apps/web/src/index.js"
    ;;
  indexer)
    # Daemon main (NOT index.js — that is exports-only). ONT_SOURCE=node + ONT_CHAIN + ONT_RPC_URL[/_USER/_PASSWORD]
    # + ONT_STORE=file + ONT_STORE_DIR + INDEXER_POLL_MS. Chain-gated before the first poll.
    exec node "${APP_ROOT}/apps/indexer/dist/apps/indexer/src/main.js"
    ;;
  publisher)
    # Claim/anchor-serving side (out of the G3 slice-1 read-smoke scope; included for completeness).
    exec node "${APP_ROOT}/apps/publisher/dist/apps/publisher/src/index.js"
    ;;
  bash|sh)
    exec "$SERVICE"
    ;;
  *)
    exec "$@"
    ;;
esac

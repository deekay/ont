#!/usr/bin/env bash

set -euo pipefail

DEFAULT_PREFIX="$(basename "$0" | sed -n 's/^\(.*\)-private-signet-auto-mine$/\1/p')"
if [[ -z "$DEFAULT_PREFIX" ]]; then
  DEFAULT_PREFIX=ont
fi

CONF_PATH="${ONT_PRIVATE_SIGNET_CONF:-/etc/bitcoin-private-signet.conf}"
DATA_DIR="${ONT_PRIVATE_SIGNET_DATADIR:-/var/lib/bitcoind-private-signet}"
BITCOIN_CLI="${ONT_PRIVATE_SIGNET_BITCOIN_CLI:-/usr/local/bin/bitcoin-cli}"
MINE_COMMAND="${ONT_PRIVATE_SIGNET_MINE_COMMAND:-}"
INTERVAL_SECONDS="${ONT_PRIVATE_SIGNET_AUTO_MINE_INTERVAL_SECONDS:-30}"
HEARTBEAT_SECONDS="${ONT_PRIVATE_SIGNET_AUTO_MINE_HEARTBEAT_SECONDS:-60}"

if ! [[ "$INTERVAL_SECONDS" =~ ^[0-9]+$ ]] || [[ "$INTERVAL_SECONDS" -lt 1 ]]; then
  echo "ONT_PRIVATE_SIGNET_AUTO_MINE_INTERVAL_SECONDS must be a positive integer." >&2
  exit 1
fi

if ! [[ "$HEARTBEAT_SECONDS" =~ ^[0-9]+$ ]] || [[ "$HEARTBEAT_SECONDS" -lt 1 ]]; then
  echo "ONT_PRIVATE_SIGNET_AUTO_MINE_HEARTBEAT_SECONDS must be a positive integer." >&2
  exit 1
fi

bitcoin_cli() {
  "$BITCOIN_CLI" -conf="$CONF_PATH" -datadir="$DATA_DIR" "$@"
}

resolve_mine_command() {
  if [[ -n "$MINE_COMMAND" ]]; then
    if [[ -x "$MINE_COMMAND" ]]; then
      printf '%s\n' "$MINE_COMMAND"
      return 0
    fi

    echo "Configured mine command is not executable: $MINE_COMMAND" >&2
    exit 1
  fi

  local candidate
  for candidate in \
    "/usr/local/bin/${DEFAULT_PREFIX}-private-signet-mine" \
    /usr/local/bin/ont-private-signet-mine \
    /usr/local/bin/gns-private-signet-mine; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "No private signet mine command found. Expected ${DEFAULT_PREFIX}-private-signet-mine or ont-private-signet-mine." >&2
  exit 1
}

RESOLVED_MINE_COMMAND="$(resolve_mine_command)"
last_mined_at="$(date +%s)"

while true; do
  if bitcoin_cli getblockchaininfo >/dev/null 2>&1; then
    MEMPOOL_SIZE="$(bitcoin_cli getmempoolinfo | jq -r '.size // 0' 2>/dev/null || echo 0)"
    NOW="$(date +%s)"
    if [[ "$MEMPOOL_SIZE" =~ ^[0-9]+$ ]] && [[ "$MEMPOOL_SIZE" -gt 0 ]]; then
      echo "Auto-mining 1 block for ${MEMPOOL_SIZE} pending transaction(s)." >&2
      "$RESOLVED_MINE_COMMAND" 1 >/dev/null
      last_mined_at="$NOW"
    elif [[ "$((NOW - last_mined_at))" -ge "$HEARTBEAT_SECONDS" ]]; then
      echo "Auto-mining 1 heartbeat block after ${HEARTBEAT_SECONDS}s without a block." >&2
      "$RESOLVED_MINE_COMMAND" 1 >/dev/null
      last_mined_at="$NOW"
    fi
  fi

  sleep "$INTERVAL_SECONDS"
done

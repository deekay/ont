#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${ONT_RPC_URL:-http://bitcoind:38332}"
RPC_USER="${ONT_RPC_USER:-ontrpc}"
RPC_PASSWORD="${ONT_RPC_PASSWORD:?set ONT_RPC_PASSWORD}"
SIGNET_CHALLENGE="${ONT_SIGNET_CHALLENGE:-51}"
MINER_ADDRESS="${ONT_SIGNET_MINER_ADDRESS:?set ONT_SIGNET_MINER_ADDRESS to the off-box funding wallet address}"
BOOTSTRAP_BLOCKS="${ONT_SIGNET_BOOTSTRAP_BLOCKS:-110}"
MINE_INTERVAL_SECONDS="${ONT_SIGNET_MINE_INTERVAL_SECONDS:-45}"
MINE_NBITS="${ONT_SIGNET_MINE_NBITS:-1e0377ae}"
BITCOIN_SOURCE="${ONT_SIGNET_MINER_SOURCE_DIR:-/opt/bitcoin-source}"
GRIND_CMD="${ONT_SIGNET_GRIND_CMD:-/usr/local/bin/ont-grind-header-fast}"
CONF_FILE="${ONT_SIGNET_MINER_CONF:-/tmp/ont-private-signet-miner.conf}"

case "$BOOTSTRAP_BLOCKS" in
  ''|*[!0-9]*) echo "ONT_SIGNET_BOOTSTRAP_BLOCKS must be a non-negative integer" >&2; exit 1 ;;
esac
case "$MINE_INTERVAL_SECONDS" in
  ''|*[!0-9]*) echo "ONT_SIGNET_MINE_INTERVAL_SECONDS must be a positive integer" >&2; exit 1 ;;
esac
if [[ "$MINE_INTERVAL_SECONDS" -lt 1 ]]; then
  echo "ONT_SIGNET_MINE_INTERVAL_SECONDS must be >= 1" >&2
  exit 1
fi
if [[ "$MINER_ADDRESS" == "replace-with-off-box-legacy-signet-address" ]]; then
  echo "ONT_SIGNET_MINER_ADDRESS is still the .env.example placeholder" >&2
  exit 1
fi
if [[ ! -f "${BITCOIN_SOURCE}/contrib/signet/miner" ]]; then
  echo "missing contrib/signet/miner under ${BITCOIN_SOURCE}" >&2
  exit 1
fi
if [[ ! -x "$GRIND_CMD" ]]; then
  echo "missing executable grind command: ${GRIND_CMD}" >&2
  exit 1
fi

rpc_no_scheme="${RPC_URL#http://}"
rpc_no_scheme="${rpc_no_scheme#https://}"
rpc_hostport="${rpc_no_scheme%%/*}"
RPC_HOST="${rpc_hostport%%:*}"
RPC_PORT="${rpc_hostport##*:}"
if [[ "$RPC_PORT" == "$RPC_HOST" ]]; then
  RPC_PORT=38332
fi

cat >"$CONF_FILE" <<CONF
signet=1
signetchallenge=${SIGNET_CHALLENGE}
[signet]
rpcconnect=${RPC_HOST}
rpcport=${RPC_PORT}
rpcuser=${RPC_USER}
rpcpassword=${RPC_PASSWORD}
CONF
chmod 600 "$CONF_FILE"

CLI=(bitcoin-cli -conf="$CONF_FILE")
MINER_CLI="bitcoin-cli -conf=${CONF_FILE}"

echo "private-signet miner: waiting for bitcoind RPC at ${RPC_HOST}:${RPC_PORT}"
until "${CLI[@]}" getblockchaininfo >/dev/null 2>&1; do
  sleep 2
done

CHAIN=$("${CLI[@]}" getblockchaininfo | python3 -c 'import json,sys; print(json.load(sys.stdin).get("chain", ""))')
if [[ "$CHAIN" != "signet" ]]; then
  echo "bitcoind chain gate failed: expected signet, got ${CHAIN}" >&2
  exit 1
fi

mine_blocks() {
  local blocks="$1"
  if [[ "$blocks" -le 0 ]]; then
    return 0
  fi
  for _ in $(seq 1 "$blocks"); do
    python3 "${BITCOIN_SOURCE}/contrib/signet/miner" \
      --cli "$MINER_CLI" \
      generate \
      --address "$MINER_ADDRESS" \
      --nbits "$MINE_NBITS" \
      --grind-cmd "$GRIND_CMD" \
      --set-block-time -1
  done
}

current_height=$("${CLI[@]}" getblockcount)
if [[ "$current_height" -lt "$BOOTSTRAP_BLOCKS" ]]; then
  needed=$((BOOTSTRAP_BLOCKS - current_height))
  echo "private-signet miner: bootstrapping ${needed} block(s) to ${MINER_ADDRESS} (target height ${BOOTSTRAP_BLOCKS})"
  mine_blocks "$needed"
else
  echo "private-signet miner: bootstrap already satisfied at height ${current_height}"
fi

echo "private-signet miner: ongoing cadence ${MINE_INTERVAL_SECONDS}s to ${MINER_ADDRESS}"
while true; do
  sleep "$MINE_INTERVAL_SECONDS"
  mine_blocks 1
done

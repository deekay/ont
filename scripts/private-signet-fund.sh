#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: ont-private-signet-fund <address> <amount-btc>" >&2
  exit 1
fi

ADDRESS="$1"
AMOUNT="$2"
DEFAULT_PREFIX="$(basename "$0" | sed -n 's/^\(.*\)-private-signet-fund$/\1/p')"
if [[ -z "$DEFAULT_PREFIX" ]]; then
  DEFAULT_PREFIX=ont
fi
CONF="${ONT_PRIVATE_SIGNET_CONF:-/etc/bitcoin-private-signet.conf}"
DATADIR="${ONT_PRIVATE_SIGNET_DATADIR:-/var/lib/bitcoind-private-signet}"
WALLET="${ONT_PRIVATE_SIGNET_MINER_WALLET:-miner}"
ADDRESS_FILE="${ONT_PRIVATE_SIGNET_MINER_ADDRESS_FILE:-${DATADIR}/miner-address.txt}"
NBITS="${ONT_PRIVATE_SIGNET_NBITS:-1e0377ae}"
GRIND_CMD="${ONT_PRIVATE_SIGNET_GRIND_CMD:-}"
CLI=(/usr/local/bin/bitcoin-cli -conf="${CONF}" -datadir="${DATADIR}")

ensure_wallet() {
  if ! "${CLI[@]}" -rpcwallet="${WALLET}" getwalletinfo >/dev/null 2>&1; then
    if ! "${CLI[@]}" loadwallet "${WALLET}" >/dev/null 2>&1; then
      "${CLI[@]}" createwallet "${WALLET}" >/dev/null
    fi
  fi

  if [[ -s "${ADDRESS_FILE}" ]]; then
    cat "${ADDRESS_FILE}"
    return
  fi

  local next_address
  next_address="$("${CLI[@]}" -rpcwallet="${WALLET}" getnewaddress)"
  if install -d -m 750 "$(dirname "${ADDRESS_FILE}")" 2>/dev/null; then
    printf '%s\n' "${next_address}" >"${ADDRESS_FILE}" 2>/dev/null || true
  fi
  printf '%s\n' "${next_address}"
}

find_bitcoin_source() {
  if [[ -n "${ONT_PRIVATE_SIGNET_BITCOIN_SOURCE:-}" && -f "${ONT_PRIVATE_SIGNET_BITCOIN_SOURCE}/contrib/signet/miner" ]]; then
    printf '%s\n' "${ONT_PRIVATE_SIGNET_BITCOIN_SOURCE}"
    return 0
  fi

  if [[ -f /opt/bitcoin-source-30.2/contrib/signet/miner ]]; then
    printf '%s\n' /opt/bitcoin-source-30.2
    return 0
  fi

  local miner
  for miner in /opt/bitcoin-source-*/contrib/signet/miner; do
    if [[ -f "${miner}" ]]; then
      dirname "$(dirname "$(dirname "${miner}")")"
      return 0
    fi
  done

  return 1
}

resolve_grind_cmd() {
  if [[ -n "$GRIND_CMD" ]]; then
    if [[ -x "$GRIND_CMD" ]]; then
      printf '%s\n' "$GRIND_CMD"
      return 0
    fi

    echo "Configured grind command is not executable: $GRIND_CMD" >&2
    exit 1
  fi

  local candidate
  for candidate in \
    "/usr/local/bin/${DEFAULT_PREFIX}-grind-header-fast" \
    /usr/local/bin/ont-grind-header-fast \
    /usr/local/bin/gns-grind-header-fast; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "No private signet grind command found. Expected ${DEFAULT_PREFIX}-grind-header-fast or ont-grind-header-fast." >&2
  exit 1
}

mine_blocks() {
  local blocks="$1"
  local miner_address="$2"

  if [[ -n "${ONT_PRIVATE_SIGNET_MINE_COMMAND:-}" && -x "${ONT_PRIVATE_SIGNET_MINE_COMMAND}" ]]; then
    "${ONT_PRIVATE_SIGNET_MINE_COMMAND}" "${blocks}"
    return
  fi

  if [[ -x /usr/local/bin/ont-private-signet-mine ]]; then
    /usr/local/bin/ont-private-signet-mine "${blocks}"
    return
  fi

  if [[ -x /usr/local/bin/gns-private-signet-mine ]]; then
    /usr/local/bin/gns-private-signet-mine "${blocks}"
    return
  fi

  local bitcoin_source
  if ! bitcoin_source="$(find_bitcoin_source)"; then
    echo "No private signet miner found. Run bootstrap-private-signet-vps.sh or set ONT_PRIVATE_SIGNET_BITCOIN_SOURCE." >&2
    exit 1
  fi

  local miner_cli="/usr/local/bin/bitcoin-cli -conf=${CONF} -datadir=${DATADIR} -rpcwallet=${WALLET}"
  local _
  for _ in $(seq 1 "${blocks}"); do
    python3 "${bitcoin_source}/contrib/signet/miner" \
      --cli "${miner_cli}" \
      generate \
      --address "${miner_address}" \
      --nbits "${NBITS}" \
      --grind-cmd "$(resolve_grind_cmd)" \
      --set-block-time -1
  done
}

MINER_ADDRESS="$(ensure_wallet)"
TXID=$("${CLI[@]}" -rpcwallet="${WALLET}" sendtoaddress "${ADDRESS}" "${AMOUNT}")
mine_blocks 1 "${MINER_ADDRESS}" >/dev/null
TX_JSON=$("${CLI[@]}" -rpcwallet="${WALLET}" gettransaction "${TXID}" true true 2>/dev/null || true)
VOUT=$(printf '%s' "${TX_JSON}" | python3 -c '
import json
import sys

address = sys.argv[1]
try:
    tx = json.load(sys.stdin)
except Exception:
    sys.exit(0)

for output in tx.get("decoded", {}).get("vout", []):
    script_pubkey = output.get("scriptPubKey", {})
    output_address = script_pubkey.get("address")
    output_addresses = script_pubkey.get("addresses", [])
    if output_address == address or address in output_addresses:
        print(output.get("n"))
        break
' "${ADDRESS}")
AMOUNT_SATS=$(python3 -c 'from decimal import Decimal; import sys; print(int(Decimal(sys.argv[1]) * Decimal(100000000)))' "${AMOUNT}")

if [[ -n "${VOUT}" ]]; then
  echo "${TXID}:${VOUT}:${AMOUNT_SATS}:${ADDRESS}"
else
  echo "${TXID}"
fi

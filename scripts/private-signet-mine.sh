#!/usr/bin/env bash

set -euo pipefail

BLOCKS="${1:-1}"
DEFAULT_PREFIX="$(basename "$0" | sed -n 's/^\(.*\)-private-signet-mine$/\1/p')"
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

if ! [[ "${BLOCKS}" =~ ^[0-9]+$ ]] || [[ "${BLOCKS}" -lt 1 ]]; then
  echo "Usage: ont-private-signet-mine [positive-block-count]" >&2
  exit 1
fi

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

BITCOIN_SOURCE="$(find_bitcoin_source)" || {
  echo "No private signet miner found. Run bootstrap-private-signet-vps.sh or set ONT_PRIVATE_SIGNET_BITCOIN_SOURCE." >&2
  exit 1
}
RESOLVED_GRIND_CMD="$(resolve_grind_cmd)"
ADDRESS="$(ensure_wallet)"
MINER_CLI="/usr/local/bin/bitcoin-cli -conf=${CONF} -datadir=${DATADIR} -rpcwallet=${WALLET}"

for _ in $(seq 1 "${BLOCKS}"); do
  python3 "${BITCOIN_SOURCE}/contrib/signet/miner" \
    --cli "${MINER_CLI}" \
    generate \
    --address "${ADDRESS}" \
    --nbits "${NBITS}" \
    --grind-cmd "${RESOLVED_GRIND_CMD}" \
    --set-block-time -1
done

#!/usr/bin/env bash
# Live integration smoke: spin up the resolver in fixture mode (no Bitcoin RPC
# required) and run the wallet's resolver-backed commands against it. Catches
# field-name / shape mismatches between the wallet's typed client and the real
# resolver — the kind of bug stubbed tests can't see.
#
# The fixture's auctions are all in `pending_unlock`, so the happy-path claim
# can't run; instead this verifies discovery (auctions list, filter), the
# claim-rejection-path hard-fail, and the lookup-not-found path.
#
# Run with: npm run smoke:live -w @ont/wallet  (or directly: bash scripts/...)

set -euo pipefail

PORT="${ONT_SMOKE_PORT:-8989}"
WORKDIR="$(mktemp -d -t ont-live-smoke-XXXXXX)"
LOG="${WORKDIR}/resolver.log"
RESOLVER_PID=""
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CLI="${REPO_ROOT}/apps/wallet/src/index.ts"

cleanup() {
  if [[ -n "${RESOLVER_PID}" ]]; then
    kill "${RESOLVER_PID}" 2>/dev/null || true
    wait "${RESOLVER_PID}" 2>/dev/null || true
  fi
  rm -rf "${WORKDIR}"
}
trap cleanup EXIT

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
expect_substring() {
  local label="$1" needle="$2" haystack="$3"
  if [[ "${haystack}" != *"${needle}"* ]]; then
    echo "FAIL ${label}: did not find '${needle}' in output:"
    echo "${haystack}"
    exit 1
  fi
  echo "PASS ${label}"
}

# ---- start resolver in fixture mode ----
bold "starting resolver in fixture mode on :${PORT}"
(
  cd "${REPO_ROOT}/apps/resolver"
  ONT_SOURCE_MODE=fixture \
  ONT_RESOLVER_PORT="${PORT}" \
  ONT_VALUE_STORE_PATH="${WORKDIR}/values.json" \
  ONT_RECOVERY_DESCRIPTOR_STORE_PATH="${WORKDIR}/recovery.json" \
  ONT_RECOVERY_WALLET_PROOF_STORE_PATH="${WORKDIR}/proofs.json" \
  npx tsx src/index.ts >"${LOG}" 2>&1
) &
RESOLVER_PID=$!

# wait for the resolver to come up
for i in {1..30}; do
  if curl -sf "http://127.0.0.1:${PORT}/stats" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
if ! curl -sf "http://127.0.0.1:${PORT}/stats" >/dev/null; then
  echo "FAIL: resolver did not start within 15s — log tail:"
  tail -n 40 "${LOG}"
  exit 1
fi
bold "resolver up"

# ---- wallet setup ----
export ONT_WALLET_KEYSTORE="${WORKDIR}/ks.json"
export ONT_WALLET_STATE="${WORKDIR}/state.json"
export ONT_WALLET_PASSWORD="smoke-pw"
export ONT_WALLET_NETWORK="regtest"
export ONT_RESOLVER_URL="http://127.0.0.1:${PORT}"

bold "init wallet"
npx tsx "${CLI}" init >/dev/null

# ---- test 1: auctions discovery ----
bold "1) auctions discovery"
OUT="$(npx tsx "${CLI}" auctions 2>&1)"
expect_substring "auctions: lists fixtures" "auctions:" "${OUT}"
expect_substring "auctions: includes marble" "marble" "${OUT}"
expect_substring "auctions: includes luna" "luna" "${OUT}"

# ---- test 2: auctions filter by name ----
bold "2) auctions filter by name"
OUT="$(npx tsx "${CLI}" auctions --name marble 2>&1)"
expect_substring "auctions --name: keeps marble" "marble" "${OUT}"
if [[ "${OUT}" == *"luna"* ]]; then
  echo "FAIL: --name=marble leaked 'luna' into output"
  exit 1
fi
echo "PASS auctions --name: filter excludes others"

# ---- test 3: claim hard-fails too_early ----
bold "3) claim refuses a pending_unlock auction (too_early)"
set +e
OUT="$(npx tsx "${CLI}" claim marble --amount 5000000 --fee-sats 500 2>&1)"
RC=$?
set -e
if [[ ${RC} -eq 0 ]]; then
  echo "FAIL: claim should have errored but exited 0"
  exit 1
fi
expect_substring "claim: rejects too_early" "too_early" "${OUT}"

# ---- test 4: lookup an unclaimed name returns the not-found path ----
bold "4) lookup for an unclaimed name reports not found"
OUT="$(npx tsx "${CLI}" lookup nonexistent 2>&1)"
expect_substring "lookup: not found message" "not found" "${OUT}"

# ---- test 5: names + bids start empty ----
bold "5) state starts empty"
OUT="$(npx tsx "${CLI}" names 2>&1)"
expect_substring "names: empty" "no names tracked" "${OUT}"
OUT="$(npx tsx "${CLI}" bids 2>&1)"
expect_substring "bids: empty" "no auction bids" "${OUT}"

bold "all live-resolver smoke checks passed"

#!/usr/bin/env bash
# Live integration smoke: spin up the publisher with stub payment + anchor,
# then run the wallet's `claim --rail cheap` against it end-to-end. Catches
# wire-shape bugs between the wallet's PublisherClient and the actual publisher
# server. Verifies the full happy path: quote → pay → submit → receive
# inclusion proof → verify it locally → record state.
#
# Run with: npm run smoke:cheap-claim -w @ont/wallet

set -euo pipefail

PORT="${ONT_PUBLISHER_PORT:-7979}"
WORKDIR="$(mktemp -d -t ont-cheap-claim-XXXXXX)"
LOG="${WORKDIR}/publisher.log"
PUBLISHER_PID=""
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WALLET_CLI="${REPO_ROOT}/apps/wallet/src/index.ts"

cleanup() {
  if [[ -n "${PUBLISHER_PID}" ]]; then
    kill "${PUBLISHER_PID}" 2>/dev/null || true
    wait "${PUBLISHER_PID}" 2>/dev/null || true
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

# ---- start publisher ----
bold "starting publisher on :${PORT} (stub payment + anchor)"
(
  cd "${REPO_ROOT}/apps/publisher"
  ONT_PUBLISHER_PORT="${PORT}" \
  ONT_PUBLISHER_NETWORK=regtest \
  npx tsx src/index.ts >"${LOG}" 2>&1
) &
PUBLISHER_PID=$!

for i in {1..30}; do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
if ! curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
  echo "FAIL: publisher did not start within 15s — log tail:"
  tail -n 40 "${LOG}"
  exit 1
fi
bold "publisher up"

# ---- wallet setup ----
export ONT_WALLET_KEYSTORE="${WORKDIR}/ks.json"
export ONT_WALLET_STATE="${WORKDIR}/state.json"
export ONT_WALLET_PASSWORD="cheap-claim-pw"
export ONT_WALLET_NETWORK="regtest"
export ONT_PUBLISHER_URL="http://127.0.0.1:${PORT}"

bold "init wallet"
npx tsx "${WALLET_CLI}" init >/dev/null

# ---- test 1: claim --rail cheap (default stub payer) ----
bold "1) claim alice via the cheap rail (stub payment)"
OUT="$(npx tsx "${WALLET_CLI}" claim alice --rail cheap 2>&1)"
expect_substring "claim cheap: requested a quote" "requesting quote" "${OUT}"
expect_substring "claim cheap: got an available quote" "quote " "${OUT}"
expect_substring "claim cheap: paid via stub" "stub" "${OUT}"
expect_substring "claim cheap: receipt confirmed" "inclusion proof verifies locally" "${OUT}"
expect_substring "claim cheap: recorded ownership" "recorded as owned" "${OUT}"

# ---- test 2: state reflects ownership ----
bold "2) names reflects the new ownership"
OUT="$(npx tsx "${WALLET_CLI}" names 2>&1)"
expect_substring "names: lists alice" "alice" "${OUT}"

# ---- test 3: a second claim for the same name is rejected ----
bold "3) re-claiming the same name fails"
set +e
OUT="$(npx tsx "${WALLET_CLI}" claim alice --rail cheap 2>&1)"
RC=$?
set -e
if [[ ${RC} -eq 0 ]]; then
  echo "FAIL: re-claim should have errored but exited 0"
  exit 1
fi
expect_substring "re-claim: rejected as taken or reserved" "unavailable" "${OUT}"

# ---- test 4: a different name still works ----
bold "4) claim a fresh name works"
OUT="$(npx tsx "${WALLET_CLI}" claim bob --rail cheap 2>&1)"
expect_substring "second claim: inclusion proof verifies" "inclusion proof verifies locally" "${OUT}"

bold "all cheap-claim smoke checks passed"

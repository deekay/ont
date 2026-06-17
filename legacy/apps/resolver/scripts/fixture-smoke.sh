#!/usr/bin/env bash
# Resolver fixture-mode smoke: start the resolver, hit every read endpoint,
# verify the response shapes. Catches HTTP-layer regressions that the
# store-level unit tests miss.
#
# Run with: npm run smoke:fixture -w @ont/resolver

set -euo pipefail

PORT="${ONT_RESOLVER_SMOKE_PORT:-8788}"
WORKDIR="$(mktemp -d -t ont-resolver-smoke-XXXXXX)"
LOG="${WORKDIR}/resolver.log"
RESOLVER_PID=""
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

cleanup() {
  if [[ -n "${RESOLVER_PID}" ]]; then
    kill "${RESOLVER_PID}" 2>/dev/null || true
    wait "${RESOLVER_PID}" 2>/dev/null || true
  fi
  rm -rf "${WORKDIR}"
}
trap cleanup EXIT

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
expect_status() {
  local label="$1" expected="$2" path="$3"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}${path}")"
  if [[ "${code}" != "${expected}" ]]; then
    echo "FAIL ${label}: expected ${expected}, got ${code} for ${path}"
    exit 1
  fi
  echo "PASS ${label}"
}
expect_field() {
  local label="$1" field="$2" path="$3"
  local body
  body="$(curl -s "http://127.0.0.1:${PORT}${path}")"
  if [[ "${body}" != *"${field}"* ]]; then
    echo "FAIL ${label}: expected to find '${field}' in ${path} response"
    echo "${body}"
    exit 1
  fi
  echo "PASS ${label}"
}

# ---- start ----
bold "starting resolver on :${PORT} (fixture mode)"
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

# ---- read endpoints ----
bold "read endpoints respond"
expect_status "GET /stats" 200 /stats
expect_field "stats: has currentHeight" "currentHeight" /stats
expect_status "GET /names" 200 /names
expect_status "GET /activity" 200 /activity
expect_status "GET /experimental-auctions" 200 /experimental-auctions
expect_field "auctions: has currentBlockHeight" "currentBlockHeight" /experimental-auctions
expect_field "auctions: has auctions array" "auctions" /experimental-auctions

# ---- 404s where expected ----
bold "missing resources return 404"
expect_status "GET /name/nonexistent" 404 /name/nonexistent
expect_status "GET /name/nonexistent/value" 404 /name/nonexistent/value
expect_status "GET /name/nonexistent/recovery" 404 /name/nonexistent/recovery
expect_status "GET /tx/$(printf '00%.0s' {1..32})" 404 "/tx/$(printf '00%.0s' {1..32})"
expect_status "GET /nope" 404 /nope

# ---- POST validation rejects bad bodies ----
bold "POST validation rejects bad bodies"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d 'garbage' "http://127.0.0.1:${PORT}/values")"
if [[ "${code}" != "400" ]]; then
  echo "FAIL: POST /values with garbage body returned ${code} (expected 400)"
  exit 1
fi
echo "PASS POST /values: 400 on garbage body"

code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d 'garbage' "http://127.0.0.1:${PORT}/recovery-descriptors")"
if [[ "${code}" != "400" ]]; then
  echo "FAIL: POST /recovery-descriptors with garbage body returned ${code} (expected 400)"
  exit 1
fi
echo "PASS POST /recovery-descriptors: 400 on garbage body"

bold "all resolver fixture-mode smoke checks passed"

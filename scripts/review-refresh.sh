#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

run_step() {
  local label="$1"
  shift
  echo
  echo "[$label]"
  "$@"
}

has_regtest_target() {
  [[ -n "${ONT_REGTEST_SSH_TARGET:-${ONT_SSH_TARGET:-}}" ]]
}

run_step "1/3 local package tests" npm test -w @ont/wire
run_step "1/3 local package tests" npm test -w @ont/protocol
run_step "1/3 local package tests" npm test -w @ont/consensus
run_step "1/3 local package tests" npm test -w @ont/claim
run_step "1/3 local package tests" npm test -w @ont/cli
run_step "1/3 local package tests" npm test -w @ont/wallet
run_step "1/3 local package tests" npm test -w @ont/web
run_step "1/3 local package tests" npm test -w @ont/resolver
run_step "1/3 local package tests" npm test -w @ont/indexer
run_step "1/3 local package tests" npm test -w @ont/publisher

run_step "2/3 fixture browser e2e" npm run test:e2e:fixture-web

if [[ "${ONT_REVIEW_REFRESH_SKIP_REGTEST:-0}" == "1" ]]; then
  echo
  echo "[3/3 regtest] no longer runs the retired lifecycle suite"
elif has_regtest_target; then
  echo
  echo "[3/3 regtest] no auction-first regtest lifecycle suite is wired yet"
else
  echo
  echo "[3/3 regtest] skipped because neither ONT_REGTEST_SSH_TARGET nor ONT_SSH_TARGET is configured"
fi

echo
echo "Review refresh complete."

#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/deploy-private-signet-vps.sh <user@host> [ssh-key-path]

Examples:
  ./scripts/deploy-private-signet-vps.sh root@example.com ~/.ssh/your_key

Environment:
  ONT_SSH_TARGET         Default SSH target when the first argument is omitted.
  ONT_SSH_KEY            Optional SSH key path when the second argument is omitted.
  ONT_DEPLOY_ALLOW_DIRTY Set to 1 to deploy an uncommitted working tree. Default: 0
EOF
}

require_clean_git_tree() {
  if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Skipping Git cleanliness check because $ROOT_DIR is not a Git worktree." >&2
    return
  fi

  local sha
  sha="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"

  if [[ "${ONT_DEPLOY_ALLOW_DIRTY:-0}" == "1" ]]; then
    echo "Deploying Git SHA $sha with ONT_DEPLOY_ALLOW_DIRTY=1."
    return
  fi

  if ! git -C "$ROOT_DIR" diff --quiet \
    || ! git -C "$ROOT_DIR" diff --cached --quiet \
    || [[ -n "$(git -C "$ROOT_DIR" ls-files --others --exclude-standard)" ]]; then
    echo "Refusing to deploy dirty working tree at Git SHA $sha." >&2
    echo "Commit or stash changes first, or set ONT_DEPLOY_ALLOW_DIRTY=1 for an intentional prototype deploy." >&2
    exit 1
  fi

  echo "Deploying clean Git SHA $sha."
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 2 ]]; then
  usage
  exit 1
fi

REMOTE="${1:-${ONT_SSH_TARGET:-}}"
SSH_KEY_PATH="${2:-${ONT_SSH_KEY:-}}"
ELECTRUM_PORT="${ONT_PRIVATE_SIGNET_ELECTRUM_PORT:-50001}"
PUBLIC_HOST="${REMOTE#*@}"

if [[ -z "$REMOTE" ]]; then
  echo "Missing SSH target. Pass <user@host> or set ONT_SSH_TARGET." >&2
  usage
  exit 1
fi

if [[ -n "$SSH_KEY_PATH" && ! -f "$SSH_KEY_PATH" ]]; then
  echo "SSH key not found: $SSH_KEY_PATH" >&2
  exit 1
fi

require_clean_git_tree

SSH_ARGS=(
  -o StrictHostKeyChecking=accept-new
)

if [[ -n "$SSH_KEY_PATH" ]]; then
  SSH_ARGS=(
    -i "$SSH_KEY_PATH"
    -o IdentitiesOnly=yes
    "${SSH_ARGS[@]}"
  )
fi

echo "Deploying private signet services to $REMOTE"

RELEASE_DIR=$(ssh "${SSH_ARGS[@]}" "$REMOTE" '
  if id ont >/dev/null 2>&1 || [[ -d /etc/ont ]]; then
    release_base=/opt/ont/releases
  else
    release_base=/opt/gns/releases
  fi
  install -d "$release_base"
  mktemp -d "$release_base/private-XXXXXX"
')

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.data' \
  --exclude '.DS_Store' \
  -e "ssh ${SSH_ARGS[*]}" \
  "$ROOT_DIR/" \
  "$REMOTE:${RELEASE_DIR}/"

ssh "${SSH_ARGS[@]}" "$REMOTE" "RELEASE_DIR='$RELEASE_DIR' ELECTRUM_PORT='$ELECTRUM_PORT' PUBLIC_HOST='$PUBLIC_HOST' bash -s" <<'EOF'
set -euo pipefail

env_value() {
  local primary="$1"
  local legacy="${3:+$2}"
  local file="${3:-$2}"
  local value

  value=$(awk -F= -v key="$primary" '$1 == key {sub(/^[^=]*=/, ""); print; found=1} END {if (!found) exit 1}' "$file" 2>/dev/null | tail -n 1) || true
  if [[ -n "${value:-}" ]]; then
    printf '%s\n' "$value"
    return
  fi

  if [[ -n "${legacy:-}" ]]; then
    value=$(awk -F= -v key="$legacy" '$1 == key {sub(/^[^=]*=/, ""); print; found=1} END {if (!found) exit 1}' "$file" 2>/dev/null | tail -n 1) || true
  fi
  printf '%s\n' "${value:-}"
}

upsert_env() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

cleanup() {
  rm -rf "${RELEASE_DIR:?}"
}

trap cleanup EXIT

LOCK_PATH=/var/lock/ont-app-deploy.lock
echo "Waiting for deploy lock: $LOCK_PATH"
exec 9>"$LOCK_PATH"
flock 9

if id ont >/dev/null 2>&1 && [[ -d /etc/ont ]]; then
  APP_PREFIX=ont
  APP_USER=ont
  APP_ROOT=/opt/ont/app
  DATA_DIR=/var/lib/ont
  PRIVATE_ENV=/etc/ont/ont-private.env
elif id gns >/dev/null 2>&1 && [[ -d /etc/gns ]]; then
  APP_PREFIX=gns
  APP_USER=gns
  APP_ROOT=/opt/gns/app
  DATA_DIR=/var/lib/gns
  PRIVATE_ENV=/etc/gns/gns-private.env
else
  echo "Unable to find an ont or gns private-signet service layout on the VPS." >&2
  exit 1
fi

PRIVATE_RESOLVER_SERVICE="${APP_PREFIX}-private-resolver.service"
PRIVATE_WEB_SERVICE="${APP_PREFIX}-private-web.service"
AUTO_MINE_BIN="/usr/local/bin/${APP_PREFIX}-private-signet-auto-mine"
AUTO_MINE_ENV="/etc/default/${APP_PREFIX}-private-signet-auto-mine"
AUTO_MINE_SERVICE="${APP_PREFIX}-private-signet-auto-mine.service"

echo "Using ${APP_PREFIX} private-signet service layout at ${APP_ROOT}."

install -d "$APP_ROOT"
rsync -a --delete "${RELEASE_DIR}/" "$APP_ROOT/"
chown -R "${APP_USER}:${APP_USER}" "$APP_ROOT"
su -s /bin/bash "$APP_USER" -c "cd '$APP_ROOT' && npm ci --no-audit --no-fund"

if [[ -f /etc/bitcoin-private-signet.conf ]]; then
  install -m 755 "${APP_ROOT}/scripts/private-signet-auto-mine.sh" "$AUTO_MINE_BIN"
  install -m 755 "${APP_ROOT}/scripts/private-signet-mine.sh" "/usr/local/bin/${APP_PREFIX}-private-signet-mine"
  install -m 755 "${APP_ROOT}/scripts/private-signet-fund.sh" "/usr/local/bin/${APP_PREFIX}-private-signet-fund"
  if [[ "${APP_PREFIX}" != "ont" ]]; then
    install -m 755 "${APP_ROOT}/scripts/private-signet-mine.sh" /usr/local/bin/ont-private-signet-mine
    install -m 755 "${APP_ROOT}/scripts/private-signet-fund.sh" /usr/local/bin/ont-private-signet-fund
  fi
  install -m 755 "${APP_ROOT}/scripts/install-private-signet-electrum.sh" /usr/local/bin/install-private-signet-electrum
cat >"$AUTO_MINE_ENV" <<'ENVFILE'
ONT_PRIVATE_SIGNET_AUTO_MINE_INTERVAL_SECONDS=30
ONT_PRIVATE_SIGNET_AUTO_MINE_HEARTBEAT_SECONDS=60
ENVFILE
  chown root:root "$AUTO_MINE_ENV"
  chmod 644 "$AUTO_MINE_ENV"

  cat >"/etc/systemd/system/${AUTO_MINE_SERVICE}" <<SERVICE
[Unit]
Description=Open Name Tags private signet auto-miner
After=bitcoind-private-signet.service
Requires=bitcoind-private-signet.service

[Service]
User=bitcoin
Group=bitcoin
EnvironmentFile=-${AUTO_MINE_ENV}
ExecStart=${AUTO_MINE_BIN}
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload
  systemctl enable --now "$AUTO_MINE_SERVICE"
  systemctl restart "$AUTO_MINE_SERVICE"
  ONT_PRIVATE_SIGNET_ELECTRUM_PORT="${ELECTRUM_PORT}" ONT_PRIVATE_SIGNET_ELECTRS_USER="${APP_USER}" /usr/local/bin/install-private-signet-electrum

  if [[ -f "$PRIVATE_ENV" ]]; then
    upsert_env "$PRIVATE_ENV" ONT_EXPERIMENTAL_AUCTION_FIXTURE_DIR "${APP_ROOT}/fixtures/auction/private-signet-lab"
    upsert_env "$PRIVATE_ENV" ONT_EXPERIMENTAL_AUCTION_BASE_WINDOW_BLOCKS 30
    upsert_env "$PRIVATE_ENV" ONT_EXPERIMENTAL_AUCTION_SOFT_CLOSE_EXTENSION_BLOCKS 28
    upsert_env "$PRIVATE_ENV" ONT_WEB_PRIVATE_SIGNET_ELECTRUM_ENDPOINT "${PUBLIC_HOST}:${ELECTRUM_PORT}:t"
    upsert_env "$PRIVATE_ENV" ONT_WEB_PRIVATE_AUCTION_SMOKE_STATUS_PATH "${DATA_DIR}/private-auction-smoke-summary.json"
  fi
fi

systemctl restart "$PRIVATE_RESOLVER_SERVICE" "$PRIVATE_WEB_SERVICE"

WEB_PORT=$(env_value ONT_WEB_PORT GNS_WEB_PORT "$PRIVATE_ENV")
RESOLVER_PORT=$(env_value ONT_RESOLVER_PORT GNS_RESOLVER_PORT "$PRIVATE_ENV")
WEB_BASE_PATH=$(env_value ONT_WEB_BASE_PATH GNS_WEB_BASE_PATH "$PRIVATE_ENV")

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-30}"

  echo
  echo "[$label]"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url"; then
      echo
      return 0
    fi
    sleep 2
  done

  echo "$label did not become healthy in time" >&2
  exit 1
}

wait_for_http "http://127.0.0.1:${RESOLVER_PORT}/health" "private resolver health" 45
wait_for_http "http://127.0.0.1:${WEB_PORT}${WEB_BASE_PATH}/api/health" "private web health" 30
EOF

echo
echo "Private signet deployment complete."

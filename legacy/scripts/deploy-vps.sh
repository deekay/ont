#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/deploy-vps.sh <user@host> [ssh-key-path]

Examples:
  ./scripts/deploy-vps.sh root@example.com ~/.ssh/your_key

This script:
  - rsyncs the current repo to the active app root
  - installs npm dependencies on the server
  - by default, preserves the current launch height and snapshot
  - restarts the active resolver and web services
  - prints local health checks from the VPS

Environment:
  ONT_SSH_TARGET                   Default SSH target when the first argument is omitted.
  ONT_SSH_KEY                      Optional SSH key path when the second argument is omitted.
  ONT_DEPLOY_REFRESH_LAUNCH_HEIGHT  Set to 1 to refresh ONT_LAUNCH_HEIGHT from the configured RPC tip and clear the configured snapshot. Default: 0
  ONT_DEPLOY_ALLOW_DIRTY            Set to 1 to deploy an uncommitted working tree. Default: 0
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
REFRESH_LAUNCH_HEIGHT="${ONT_DEPLOY_REFRESH_LAUNCH_HEIGHT:-0}"

echo "Deploying to $REMOTE"

RELEASE_DIR=$(ssh "${SSH_ARGS[@]}" "$REMOTE" '
  if id ont >/dev/null 2>&1 || [[ -d /etc/ont ]]; then
    release_base=/opt/ont/releases
  else
    release_base=/opt/gns/releases
  fi
  install -d "$release_base"
  mktemp -d "$release_base/public-XXXXXX"
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

ssh "${SSH_ARGS[@]}" "$REMOTE" "RELEASE_DIR='$RELEASE_DIR' REFRESH_LAUNCH_HEIGHT='$REFRESH_LAUNCH_HEIGHT' bash -s" <<'EOF'
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
  MAIN_ENV=/etc/ont/ont.env
  DOMAIN_ENV=/etc/ont/ont-domain.env
  PRIVATE_DEMO_BASE_PATH=/ont-private
elif id gns >/dev/null 2>&1 && [[ -d /etc/gns ]]; then
  APP_PREFIX=gns
  APP_USER=gns
  APP_ROOT=/opt/gns/app
  DATA_DIR=/var/lib/gns
  MAIN_ENV=/etc/gns/gns.env
  DOMAIN_ENV=/etc/gns/gns-domain.env
  PRIVATE_DEMO_BASE_PATH=$(env_value GNS_WEB_PRIVATE_DEMO_BASE_PATH ONT_WEB_PRIVATE_DEMO_BASE_PATH "$DOMAIN_ENV")
  if [[ -z "$PRIVATE_DEMO_BASE_PATH" ]]; then
    PRIVATE_DEMO_BASE_PATH=/gns-private
  fi
else
  echo "Unable to find an ont or gns service layout on the VPS." >&2
  exit 1
fi

RESOLVER_SERVICE="${APP_PREFIX}-resolver.service"
WEB_SERVICE="${APP_PREFIX}-web.service"
DOMAIN_WEB_SERVICE="${APP_PREFIX}-domain-web.service"
AUTO_MINE_BIN="/usr/local/bin/${APP_PREFIX}-private-signet-auto-mine"
AUTO_MINE_ENV="/etc/default/${APP_PREFIX}-private-signet-auto-mine"
AUTO_MINE_SERVICE="${APP_PREFIX}-private-signet-auto-mine.service"

echo "Using ${APP_PREFIX} service layout at ${APP_ROOT}."

if [[ -f "$MAIN_ENV" ]]; then
  upsert_env "$MAIN_ENV" ONT_WEB_PRIVATE_AUCTION_SMOKE_STATUS_PATH "${DATA_DIR}/private-auction-smoke-summary.json"
fi
if [[ -f "$DOMAIN_ENV" ]]; then
  upsert_env "$DOMAIN_ENV" ONT_WEB_PRIVATE_DEMO_BASE_PATH "$PRIVATE_DEMO_BASE_PATH"
  upsert_env "$DOMAIN_ENV" ONT_WEB_PRIVATE_AUCTION_SMOKE_STATUS_PATH "${DATA_DIR}/private-auction-smoke-summary.json"
fi

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
fi

if [[ "${REFRESH_LAUNCH_HEIGHT:-0}" != "0" ]]; then
  # The resolver that needs its launch height refreshed isn't always configured in
  # MAIN_ENV — on the private-signet droplet the rpc-mode resolver lives in
  # ont-private.env. Pick the first env file actually configured for rpc mode.
  REFRESH_ENV=""
  for candidate in "$MAIN_ENV" "$DOMAIN_ENV" "/etc/${APP_PREFIX}/${APP_PREFIX}-private.env"; do
    [[ -f "$candidate" ]] || continue
    if [[ "$(env_value ONT_SOURCE_MODE GNS_SOURCE_MODE "$candidate")" == "rpc" \
       && -n "$(env_value ONT_BITCOIN_RPC_URL GNS_BITCOIN_RPC_URL "$candidate")" ]]; then
      REFRESH_ENV="$candidate"
      break
    fi
  done

  if [[ -z "$REFRESH_ENV" ]]; then
    echo "Refusing to refresh launch height: no env file with rpc mode + ONT_BITCOIN_RPC_URL (checked $MAIN_ENV, $DOMAIN_ENV, /etc/${APP_PREFIX}/${APP_PREFIX}-private.env)" >&2
    exit 1
  fi
  echo "Refreshing launch height in $REFRESH_ENV"

  RPC_URL=$(env_value ONT_BITCOIN_RPC_URL GNS_BITCOIN_RPC_URL "$REFRESH_ENV")
  RPC_USERNAME=$(env_value ONT_BITCOIN_RPC_USERNAME GNS_BITCOIN_RPC_USERNAME "$REFRESH_ENV")
  RPC_PASSWORD=$(env_value ONT_BITCOIN_RPC_PASSWORD GNS_BITCOIN_RPC_PASSWORD "$REFRESH_ENV")
  SNAPSHOT_PATH=$(env_value ONT_SNAPSHOT_PATH GNS_SNAPSHOT_PATH "$REFRESH_ENV")

  CURRENT_BLOCKS=$(python3 - "$RPC_URL" "$RPC_USERNAME" "$RPC_PASSWORD" <<'PY'
import base64
import json
import sys
import urllib.request

url = sys.argv[1]
username = sys.argv[2]
password = sys.argv[3]
request = urllib.request.Request(
    url,
    data=json.dumps({
        "jsonrpc": "1.0",
        "id": "ont-deploy",
        "method": "getblockcount",
        "params": []
    }).encode("utf-8"),
    headers={"content-type": "application/json"}
)

if username:
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    request.add_header("authorization", f"Basic {token}")

with urllib.request.urlopen(request, timeout=30) as response:
    payload = json.load(response)

if payload.get("error") is not None:
    raise SystemExit(f"RPC error while refreshing launch height: {payload['error']}")

print(payload["result"])
PY
)
  awk -v h="$CURRENT_BLOCKS" '
  BEGIN {FS=OFS="="}
  /^ONT_LAUNCH_HEIGHT=/ {$2=h; found=1}
  {print}
  END {
    if (!found) {
      print "ONT_LAUNCH_HEIGHT=" h
    }
  }
  ' "$REFRESH_ENV" >"${REFRESH_ENV}.new"
  mv "${REFRESH_ENV}.new" "$REFRESH_ENV"
  chown "root:${APP_USER}" "$REFRESH_ENV"
  chmod 640 "$REFRESH_ENV"
  if [[ -z "$SNAPSHOT_PATH" ]]; then
    SNAPSHOT_PATH="${DATA_DIR}/resolver-snapshot.json"
  fi
  rm -f "$SNAPSHOT_PATH"
  # If the refreshed env belongs to the private-signet resolver, restart it too —
  # the blanket restarts below only cover the main resolver/web services.
  PRIVATE_RESOLVER_SERVICE="${APP_PREFIX}-private-resolver.service"
  if [[ "$REFRESH_ENV" == *"-private.env" ]] && systemctl list-unit-files "$PRIVATE_RESOLVER_SERVICE" >/dev/null 2>&1; then
    systemctl restart "$PRIVATE_RESOLVER_SERVICE"
  fi
fi
systemctl restart "$RESOLVER_SERVICE" "$WEB_SERVICE"
if systemctl list-unit-files "$DOMAIN_WEB_SERVICE" >/dev/null 2>&1; then
  systemctl restart "$DOMAIN_WEB_SERVICE"
fi

RESOLVER_PORT=$(env_value ONT_RESOLVER_PORT GNS_RESOLVER_PORT "$MAIN_ENV")
WEB_PORT=$(env_value ONT_WEB_PORT GNS_WEB_PORT "$MAIN_ENV")
WEB_BASE_PATH=$(env_value ONT_WEB_BASE_PATH GNS_WEB_BASE_PATH "$MAIN_ENV")
if [[ -z "$WEB_BASE_PATH" || "$WEB_BASE_PATH" == "/" ]]; then
  WEB_BASE_PATH=""
fi
if [[ -z "$RESOLVER_PORT" ]]; then
  RESOLVER_PORT=8787
fi
if [[ -z "$WEB_PORT" ]]; then
  WEB_PORT=3000
fi

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
  return 1
}

wait_for_http "http://127.0.0.1:${RESOLVER_PORT}/health" "resolver health" 45
wait_for_http "http://127.0.0.1:${WEB_PORT}${WEB_BASE_PATH}/api/health" "web health" 20

echo
echo "[resolver service]"
systemctl --no-pager --full status "$RESOLVER_SERVICE" | sed -n '1,40p'
echo
echo "[web service]"
systemctl --no-pager --full status "$WEB_SERVICE" | sed -n '1,40p'
if systemctl list-unit-files "$DOMAIN_WEB_SERVICE" >/dev/null 2>&1; then
  echo
  echo "[domain web service]"
  systemctl --no-pager --full status "$DOMAIN_WEB_SERVICE" | sed -n '1,40p'
fi
EOF

echo
echo "Deployment complete."

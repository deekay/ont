#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/bootstrap-ont-domain.sh <user@host> [ssh-key-path] [domain]

Examples:
  ./scripts/bootstrap-ont-domain.sh root@example.com ~/.ssh/your_key opennametags.org

Environment:
  ONT_SSH_TARGET  Default SSH target when the first argument is omitted.
  ONT_SSH_KEY     Optional SSH key path when the second argument is omitted.

This script:
  - installs Caddy on the VPS
  - creates a dedicated root-host Open Name Tags web service on port 3002
  - configures Caddy for opennametags.org and www.opennametags.org
  - opens ports 80 and 443 in UFW
  - keeps the existing /ont path-based deployment intact

Notes:
  - DNS must point the domain at the VPS before HTTPS will succeed.
  - The underlying resolver and protocol identifiers remain ONT for compatibility.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 3 ]]; then
  usage
  exit 1
fi

REMOTE="${1:-${ONT_SSH_TARGET:-}}"
SSH_KEY_PATH="${2:-${ONT_SSH_KEY:-}}"
DOMAIN="${3:-opennametags.org}"

if [[ -z "$REMOTE" ]]; then
  echo "Missing SSH target. Pass <user@host> or set ONT_SSH_TARGET." >&2
  usage
  exit 1
fi

if [[ -n "$SSH_KEY_PATH" && ! -f "$SSH_KEY_PATH" ]]; then
  echo "SSH key not found: $SSH_KEY_PATH" >&2
  exit 1
fi

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

echo "Configuring ${DOMAIN} on ${REMOTE}"

ssh "${SSH_ARGS[@]}" "$REMOTE" "DOMAIN='$DOMAIN' bash -s" <<'EOF'
set -euo pipefail

DOMAIN="${DOMAIN}"
WWW_DOMAIN="www.${DOMAIN}"

env_value() {
  local primary="$1"
  local legacy="${2:-}"
  local value

  value=$(sed -n "s/^${primary}=//p" /etc/ont/ont.env | tail -n 1)
  if [[ -n "${value:-}" ]]; then
    printf '%s\n' "$value"
    return
  fi

  if [[ -n "$legacy" ]]; then
    sed -n "s/^${legacy}=//p" /etc/ont/ont.env | tail -n 1
  fi
}

RESOLVER_PORT="$(env_value ONT_RESOLVER_PORT)"
NETWORK_LABEL="$(env_value ONT_WEB_NETWORK_LABEL)"
FUND_COMMAND="$(env_value ONT_WEB_PRIVATE_SIGNET_FUNDING_COMMAND)"
FUND_ENABLED="$(env_value ONT_WEB_PRIVATE_SIGNET_FUNDING_ENABLED)"
FUND_AMOUNT_SATS="$(env_value ONT_WEB_PRIVATE_SIGNET_FUNDING_AMOUNT_SATS)"
FUND_COOLDOWN_MS="$(env_value ONT_WEB_PRIVATE_SIGNET_FUNDING_COOLDOWN_MS)"
ELECTRUM_ENDPOINT="$(sed -n 's/^ONT_WEB_PRIVATE_SIGNET_ELECTRUM_ENDPOINT=//p' /etc/ont/ont-private.env | tail -n 1)"

RESOLVER_PORT="${RESOLVER_PORT:-8787}"
NETWORK_LABEL="${NETWORK_LABEL:-Private Signet Demo}"
FUND_COMMAND="${FUND_COMMAND:-/usr/local/bin/ont-private-signet-fund}"
FUND_ENABLED="${FUND_ENABLED:-true}"
FUND_AMOUNT_SATS="${FUND_AMOUNT_SATS:-1000000}"
FUND_COOLDOWN_MS="${FUND_COOLDOWN_MS:-30000}"
ELECTRUM_ENDPOINT="${ELECTRUM_ENDPOINT:-${DOMAIN}:50001:t}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y caddy

cat >/etc/ont/ont-domain.env <<ENVFILE
ONT_WEB_PORT=3002
ONT_WEB_BASE_PATH=
ONT_WEB_RESOLVER_URL=http://127.0.0.1:${RESOLVER_PORT}
ONT_WEB_NETWORK_LABEL=${NETWORK_LABEL}
ONT_WEB_PRIVATE_DEMO_BASE_PATH=/ont-private
ONT_WEB_PRIVATE_AUCTION_SMOKE_STATUS_PATH=/var/lib/ont/private-auction-smoke-summary.json
ONT_WEB_PRIVATE_SIGNET_FUNDING_COMMAND=${FUND_COMMAND}
ONT_WEB_PRIVATE_SIGNET_FUNDING_ENABLED=${FUND_ENABLED}
ONT_WEB_PRIVATE_SIGNET_FUNDING_AMOUNT_SATS=${FUND_AMOUNT_SATS}
ONT_WEB_PRIVATE_SIGNET_FUNDING_COOLDOWN_MS=${FUND_COOLDOWN_MS}
ONT_WEB_PRIVATE_SIGNET_ELECTRUM_ENDPOINT=${ELECTRUM_ENDPOINT}
ENVFILE

chown root:ont /etc/ont/ont-domain.env
chmod 640 /etc/ont/ont-domain.env

cat >/etc/systemd/system/ont-domain-web.service <<'SERVICE'
[Unit]
Description=Open Name Tags web service (root domain)
After=network-online.target ont-resolver.service
Wants=network-online.target
Requires=ont-resolver.service

[Service]
User=ont
Group=ont
WorkingDirectory=/opt/ont/app
EnvironmentFile=/etc/ont/ont-domain.env
ExecStart=/usr/bin/npm run dev:web
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE

cat >/etc/caddy/Caddyfile <<CADDYFILE
${DOMAIN} {
  encode zstd gzip
  @private_demo path /ont-private /ont-private/*
  handle @private_demo {
    reverse_proxy 127.0.0.1:3001
  }

  handle {
    reverse_proxy 127.0.0.1:3002
  }
}

${WWW_DOMAIN} {
  redir https://${DOMAIN}{uri} permanent
}
CADDYFILE

ufw allow 80/tcp
ufw allow 443/tcp

systemctl daemon-reload
systemctl enable --now ont-domain-web.service
systemctl enable --now caddy.service
systemctl restart ont-domain-web.service
systemctl restart caddy.service

wait_for_http() {
  local url="$1"
  local attempts="${2:-30}"

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null; then
      return 0
    fi
    sleep 2
  done

  return 1
}

echo
echo "[ont domain web health]"
wait_for_http http://127.0.0.1:3002/api/health 30
curl -fsS http://127.0.0.1:3002/api/health
echo
echo
echo "[local caddy route check]"
curl -fsS -H "Host: ${DOMAIN}" http://127.0.0.1/api/health || true
echo
echo
echo "If DNS has not been switched yet, HTTPS certificate issuance will complete after the domain points here."
EOF

echo
echo "Open Name Tags domain bootstrap complete."

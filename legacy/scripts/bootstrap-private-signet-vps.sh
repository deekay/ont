#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/bootstrap-private-signet-vps.sh <user@host> [ssh-key-path]

Examples:
  ./scripts/bootstrap-private-signet-vps.sh root@example.com ~/.ssh/your_key

Environment:
  ONT_SSH_TARGET                     Default SSH target when the first argument is omitted.
  ONT_SSH_KEY                        Optional SSH key path when the second argument is omitted.
  ONT_BITCOIN_VERSION                 Bitcoin Core source tag to clone for contrib/signet/miner. Default: 30.2
  ONT_PRIVATE_SIGNET_WEB_PORT         Public web port for the private signet demo. Default: 3001
  ONT_PRIVATE_SIGNET_RESOLVER_PORT    Private resolver port. Default: 8788
  ONT_PRIVATE_SIGNET_RPC_PORT         Local Bitcoin RPC port. Default: 39332
  ONT_PRIVATE_SIGNET_P2P_PORT         P2P port for the private signet node. Default: 39333
  ONT_PRIVATE_SIGNET_ELECTRUM_PORT    Public Electrum port for the private signet demo. Default: 50001
  ONT_PRIVATE_SIGNET_CHALLENGE        Signet challenge hex. Default: 51
  ONT_PRIVATE_SIGNET_BASE_PATH        Web base path. Default: /ont-private
  ONT_PRIVATE_SIGNET_BOOTSTRAP_BLOCKS Initial blocks to mine for mature demo funds. Default: 110
  ONT_PRIVATE_SIGNET_SHIM_PORT        Esplora-shaped shim port (wallet funding scan + broadcast). Default: 3010
  ONT_PRIVATE_SIGNET_PUBLISHER_PORT   Publisher (cheap-rail batch anchor) port. Default: 7878
  ONT_PRIVATE_SIGNET_DOMAIN_WEB_PORT  Root-domain web port (reuses the private resolver). Default: 3002
EOF
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

BITCOIN_VERSION="${ONT_BITCOIN_VERSION:-30.2}"
WEB_PORT="${ONT_PRIVATE_SIGNET_WEB_PORT:-3001}"
RESOLVER_PORT="${ONT_PRIVATE_SIGNET_RESOLVER_PORT:-8788}"
RPC_PORT="${ONT_PRIVATE_SIGNET_RPC_PORT:-39332}"
P2P_PORT="${ONT_PRIVATE_SIGNET_P2P_PORT:-39333}"
ELECTRUM_PORT="${ONT_PRIVATE_SIGNET_ELECTRUM_PORT:-50001}"
CHALLENGE="${ONT_PRIVATE_SIGNET_CHALLENGE:-51}"
BASE_PATH="${ONT_PRIVATE_SIGNET_BASE_PATH:-/ont-private}"
BOOTSTRAP_BLOCKS="${ONT_PRIVATE_SIGNET_BOOTSTRAP_BLOCKS:-110}"
SHIM_PORT="${ONT_PRIVATE_SIGNET_SHIM_PORT:-3010}"
PUBLISHER_PORT="${ONT_PRIVATE_SIGNET_PUBLISHER_PORT:-7878}"
DOMAIN_WEB_PORT="${ONT_PRIVATE_SIGNET_DOMAIN_WEB_PORT:-3002}"
PUBLIC_HOST="${REMOTE#*@}"

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

echo "Bootstrapping private signet on $REMOTE"

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.data' \
  --exclude '.DS_Store' \
  -e "ssh ${SSH_ARGS[*]}" \
  "$ROOT_DIR/" \
  "$REMOTE:/opt/ont/app/"

ssh "${SSH_ARGS[@]}" "$REMOTE" "BITCOIN_VERSION='$BITCOIN_VERSION' WEB_PORT='$WEB_PORT' RESOLVER_PORT='$RESOLVER_PORT' RPC_PORT='$RPC_PORT' P2P_PORT='$P2P_PORT' ELECTRUM_PORT='$ELECTRUM_PORT' CHALLENGE='$CHALLENGE' BASE_PATH='$BASE_PATH' BOOTSTRAP_BLOCKS='$BOOTSTRAP_BLOCKS' SHIM_PORT='$SHIM_PORT' PUBLISHER_PORT='$PUBLISHER_PORT' DOMAIN_WEB_PORT='$DOMAIN_WEB_PORT' PUBLIC_HOST='$PUBLIC_HOST' bash -s" <<'EOF'
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg jq build-essential git rsync python3 libssl-dev

id -u bitcoin >/dev/null 2>&1 || useradd --system --home /var/lib/bitcoind --shell /usr/sbin/nologin --create-home bitcoin
id -u ont >/dev/null 2>&1 || useradd --system --create-home --home /var/lib/ont --shell /usr/sbin/nologin ont

install -d -o bitcoin -g bitcoin -m 750 /var/lib/bitcoind-private-signet
install -d -o ont -g ont -m 755 /var/lib/ont
install -d -o root -g root -m 755 /etc/ont
install -d -o root -g root -m 755 /opt/bitcoin-source-${BITCOIN_VERSION}

if [[ ! -d /opt/bitcoin-source-${BITCOIN_VERSION}/.git ]]; then
  rm -rf /opt/bitcoin-source-${BITCOIN_VERSION}
  git clone --depth 1 --branch "v${BITCOIN_VERSION}" https://github.com/bitcoin/bitcoin /opt/bitcoin-source-${BITCOIN_VERSION}
fi

chown -R ont:ont /opt/ont/app /var/lib/ont

cc -O3 -pthread -o /usr/local/bin/ont-grind-header-fast /opt/ont/app/scripts/grind-header-fast.c -lcrypto
chmod 755 /usr/local/bin/ont-grind-header-fast

RPC_PASSWORD=$(openssl rand -hex 24)

cat >/etc/bitcoin-private-signet.conf <<CONF
signet=1
signetchallenge=${CHALLENGE}
server=1
txindex=1
daemon=0
printtoconsole=0
fallbackfee=0.0002
dnsseed=0
listen=1

[signet]
port=${P2P_PORT}
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=${RPC_PORT}
rpcuser=ontrpcprivate
rpcpassword=${RPC_PASSWORD}
CONF

chown root:bitcoin /etc/bitcoin-private-signet.conf
chmod 640 /etc/bitcoin-private-signet.conf

if id -u ont >/dev/null 2>&1; then
  usermod -a -G bitcoin ont
fi

cat >/usr/local/bin/ont-private-signet-ensure-wallet <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

CONF=/etc/bitcoin-private-signet.conf
DATADIR=/var/lib/bitcoind-private-signet
CLI="/usr/local/bin/bitcoin-cli -conf=${CONF} -datadir=${DATADIR}"
WALLET=miner
ADDRESS_FILE=${DATADIR}/miner-address.txt

if ! ${CLI} -rpcwallet="${WALLET}" getwalletinfo >/dev/null 2>&1; then
  if ! ${CLI} loadwallet "${WALLET}" >/dev/null 2>&1; then
    ${CLI} createwallet "${WALLET}" >/dev/null
  fi
fi

if [[ ! -s "${ADDRESS_FILE}" ]]; then
  ${CLI} -rpcwallet="${WALLET}" getnewaddress >"${ADDRESS_FILE}"
fi

cat "${ADDRESS_FILE}"
SCRIPT
chmod 755 /usr/local/bin/ont-private-signet-ensure-wallet

cat >/usr/local/bin/ont-private-signet-mine <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

BLOCKS="${1:-1}"
CONF=/etc/bitcoin-private-signet.conf
DATADIR=/var/lib/bitcoind-private-signet
CLI="/usr/local/bin/bitcoin-cli -conf=${CONF} -datadir=${DATADIR}"
BITCOIN_SOURCE=/opt/bitcoin-source-30.2
GRIND_CMD="/usr/local/bin/ont-grind-header-fast"
ADDRESS=$(/usr/local/bin/ont-private-signet-ensure-wallet)
MINER_CLI="${CLI} -rpcwallet=miner"

for _ in $(seq 1 "${BLOCKS}"); do
  python3 "${BITCOIN_SOURCE}/contrib/signet/miner" \
    --cli "${MINER_CLI}" \
    generate \
    --address "${ADDRESS}" \
    --nbits 1e0377ae \
    --grind-cmd "${GRIND_CMD}" \
    --set-block-time -1
done
SCRIPT
chmod 755 /usr/local/bin/ont-private-signet-mine
sed -i "s|/opt/bitcoin-source-30.2|/opt/bitcoin-source-${BITCOIN_VERSION}|g" /usr/local/bin/ont-private-signet-mine

cat >/usr/local/bin/ont-private-signet-fund <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: ont-private-signet-fund <address> <amount-btc>" >&2
  exit 1
fi

ADDRESS="$1"
AMOUNT="$2"
CONF=/etc/bitcoin-private-signet.conf
DATADIR=/var/lib/bitcoind-private-signet
CLI="/usr/local/bin/bitcoin-cli -conf=${CONF} -datadir=${DATADIR}"

/usr/local/bin/ont-private-signet-ensure-wallet >/dev/null
TXID=$(${CLI} -rpcwallet=miner sendtoaddress "${ADDRESS}" "${AMOUNT}")
/usr/local/bin/ont-private-signet-mine 1 >/dev/null
TX_JSON=$(${CLI} -rpcwallet=miner gettransaction "${TXID}" true true 2>/dev/null || true)
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
SCRIPT
chmod 755 /usr/local/bin/ont-private-signet-fund

install -m 755 /opt/ont/app/scripts/private-signet-auto-mine.sh /usr/local/bin/ont-private-signet-auto-mine

cat >/etc/default/ont-private-signet-auto-mine <<'ENVFILE'
ONT_PRIVATE_SIGNET_AUTO_MINE_INTERVAL_SECONDS=30
ONT_PRIVATE_SIGNET_AUTO_MINE_HEARTBEAT_SECONDS=60
ENVFILE
chown root:root /etc/default/ont-private-signet-auto-mine
chmod 644 /etc/default/ont-private-signet-auto-mine

cat >/etc/systemd/system/bitcoind-private-signet.service <<'SERVICE'
[Unit]
Description=Bitcoin Core daemon (private signet)
After=network-online.target
Wants=network-online.target

[Service]
User=bitcoin
Group=bitcoin
Type=simple
ExecStart=/usr/local/bin/bitcoind -conf=/etc/bitcoin-private-signet.conf -datadir=/var/lib/bitcoind-private-signet
ExecStop=/usr/local/bin/bitcoin-cli -conf=/etc/bitcoin-private-signet.conf -datadir=/var/lib/bitcoind-private-signet stop
TimeoutStopSec=120
Restart=on-failure
RestartSec=10
RuntimeDirectory=bitcoind-private-signet
RuntimeDirectoryMode=0750
PrivateTmp=true
NoNewPrivileges=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE

cat >/etc/systemd/system/ont-private-signet-auto-mine.service <<'SERVICE'
[Unit]
Description=Open Name Tags private signet auto-miner
After=bitcoind-private-signet.service
Requires=bitcoind-private-signet.service

[Service]
User=bitcoin
Group=bitcoin
EnvironmentFile=-/etc/default/ont-private-signet-auto-mine
ExecStart=/usr/local/bin/ont-private-signet-auto-mine
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE

cat >/etc/ont/ont-private.env <<ENVFILE
ONT_SOURCE_MODE=rpc
ONT_EXPECT_CHAIN=signet
ONT_BITCOIN_RPC_URL=http://127.0.0.1:${RPC_PORT}
ONT_BITCOIN_RPC_USERNAME=ontrpcprivate
ONT_BITCOIN_RPC_PASSWORD=${RPC_PASSWORD}
ONT_LAUNCH_HEIGHT=1
ONT_RESOLVER_PORT=${RESOLVER_PORT}
ONT_WEB_PORT=${WEB_PORT}
ONT_WEB_BASE_PATH=${BASE_PATH}
ONT_EXPERIMENTAL_AUCTION_FIXTURE_DIR=/opt/ont/app/fixtures/auction/private-signet-lab
# Fast-demo auction windows. Keep soft-close a small tail of the base window
# (production default is ~144/1008 ≈ 14%); base=8/ext=4 mirrors the original
# private-signet demo and keeps the full auction lifecycle smoke deterministic
# (the higher bid lands inside live_bidding, not on the soft-close boundary).
# LAUNCH_NAME_LOCK_BLOCKS must exceed (initial-maturity + base) so an auction-won
# name is mature by the time its winner bond unlocks — see private-signet-auction-smoke.
ONT_EXPERIMENTAL_AUCTION_BASE_WINDOW_BLOCKS=8
ONT_EXPERIMENTAL_AUCTION_SOFT_CLOSE_EXTENSION_BLOCKS=4
ONT_EXPERIMENTAL_AUCTION_LAUNCH_NAME_LOCK_BLOCKS=24
ONT_WEB_NETWORK_LABEL=Private Signet (Fast Maturity Demo)
ONT_WEB_PRIVATE_AUCTION_SMOKE_STATUS_PATH=/var/lib/ont/private-auction-smoke-summary.json
ONT_TEST_OVERRIDE_INITIAL_MATURITY_BLOCKS=12
ONT_TEST_OVERRIDE_EPOCH_LENGTH_BLOCKS=12
ONT_TEST_OVERRIDE_MIN_MATURITY_BLOCKS=4
ONT_WEB_PRIVATE_SIGNET_ELECTRUM_ENDPOINT=${PUBLIC_HOST}:${ELECTRUM_PORT}:t
ONT_SNAPSHOT_PATH=/var/lib/ont/private-signet-resolver-snapshot.json
ONT_VALUE_STORE_PATH=/var/lib/ont/private-signet-value-records.json
ENVFILE

chown root:ont /etc/ont/ont-private.env
chmod 640 /etc/ont/ont-private.env

cat >/etc/systemd/system/ont-private-resolver.service <<'SERVICE'
[Unit]
Description=Open Name Tags resolver service (private signet)
After=network-online.target bitcoind-private-signet.service
Wants=network-online.target
Requires=bitcoind-private-signet.service

[Service]
User=ont
Group=ont
WorkingDirectory=/opt/ont/app
EnvironmentFile=/etc/ont/ont-private.env
ExecStart=/usr/bin/npm run dev:resolver
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE

cat >/etc/systemd/system/ont-private-web.service <<'SERVICE'
[Unit]
Description=Open Name Tags web service (private signet)
After=network-online.target ont-private-resolver.service
Wants=network-online.target
Requires=ont-private-resolver.service

[Service]
User=ont
Group=ont
WorkingDirectory=/opt/ont/app
EnvironmentFile=/etc/ont/ont-private.env
ExecStart=/usr/bin/npm run dev:web
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE

# --- esplora-shaped shim (wallet funding scan + broadcast over electrs) -------
cat >/etc/ont/esplora-shim.env <<ENVFILE
SHIM_BIND=127.0.0.1
SHIM_PORT=${SHIM_PORT}
SHIM_BACKEND=electrum
SHIM_ALLOW_ORIGIN=*
ELECTRUM_HOST=127.0.0.1
ELECTRUM_PORT=${ELECTRUM_PORT}
ELECTRUM_TLS=0
ELECTRUM_NETWORK=testnet
ENVFILE
chown root:ont /etc/ont/esplora-shim.env
chmod 640 /etc/ont/esplora-shim.env

cat >/etc/systemd/system/ont-esplora-shim.service <<'SERVICE'
[Unit]
Description=ONT Esplora-shaped HTTP shim over electrs (wallet funding scan + broadcast)
After=network-online.target electrs-private-signet.service
Wants=network-online.target
Requires=electrs-private-signet.service

[Service]
User=ont
Group=ont
WorkingDirectory=/opt/ont/app
EnvironmentFile=/etc/ont/esplora-shim.env
ExecStart=/usr/bin/node scripts/esplora-rpc-shim.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE

# --- publisher (cheap-rail batch anchor; stub anchor until a funding WIF) -----
# Real broadcast needs BOTH ONT_PUBLISHER_ESPLORA_URL + ONT_PUBLISHER_FUNDING_WIF.
# We wire the esplora URL (documents intent, one-line flip) but omit the hot key,
# so the publisher stays stub by default.
cat >/etc/ont/ont-publisher.env <<ENVFILE
ONT_PUBLISHER_PORT=${PUBLISHER_PORT}
ONT_PUBLISHER_NETWORK=signet
ONT_PUBLISHER_STORE_PATH=/var/lib/ont/publisher-store.json
ONT_PUBLISHER_ESPLORA_URL=http://127.0.0.1:${SHIM_PORT}
ONT_PUBLISHER_OPERATOR_NAME=ONT Private Signet Demo
ONT_PUBLISHER_CONTACT=ops@${PUBLIC_HOST}
ENVFILE
chown root:ont /etc/ont/ont-publisher.env
chmod 640 /etc/ont/ont-publisher.env

cat >/etc/systemd/system/ont-publisher.service <<'SERVICE'
[Unit]
Description=ONT publisher (cheap-rail batch anchor service)
After=network-online.target ont-esplora-shim.service
Wants=network-online.target
Requires=ont-esplora-shim.service

[Service]
User=ont
Group=ont
WorkingDirectory=/opt/ont/app
EnvironmentFile=/etc/ont/ont-publisher.env
ExecStart=/usr/bin/npm run dev -w @ont/publisher
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE

# --- root-domain web (reuses the private resolver; no second resolver) --------
cat >/etc/ont/ont-domain.env <<ENVFILE
ONT_WEB_PORT=${DOMAIN_WEB_PORT}
ONT_WEB_BASE_PATH=
ONT_WEB_RESOLVER_URL=http://127.0.0.1:${RESOLVER_PORT}
ONT_WEB_NETWORK_LABEL=Open Name Tags
ONT_WEB_SHOW_LIVE_SMOKE=false
ONT_WEB_PRIVATE_DEMO_BASE_PATH=${BASE_PATH}
ONT_WEB_PRIVATE_SIGNET_ELECTRUM_ENDPOINT=${PUBLIC_HOST}:${ELECTRUM_PORT}:t
ENVFILE
chown root:ont /etc/ont/ont-domain.env
chmod 640 /etc/ont/ont-domain.env

cat >/etc/systemd/system/ont-domain-web.service <<'SERVICE'
[Unit]
Description=ONT web service (root domain)
After=network-online.target ont-private-resolver.service
Wants=network-online.target
Requires=ont-private-resolver.service

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

systemctl daemon-reload
systemctl enable bitcoind-private-signet.service
systemctl restart bitcoind-private-signet.service

wait_for_rpc() {
  for _ in $(seq 1 45); do
    if /usr/local/bin/bitcoin-cli -conf=/etc/bitcoin-private-signet.conf -datadir=/var/lib/bitcoind-private-signet getblockchaininfo >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "private signet RPC did not become ready in time" >&2
  exit 1
}

wait_for_rpc
/usr/local/bin/ont-private-signet-ensure-wallet >/dev/null

CURRENT_BLOCKS=$(/usr/local/bin/bitcoin-cli -conf=/etc/bitcoin-private-signet.conf -datadir=/var/lib/bitcoind-private-signet getblockcount)
if [[ "$CURRENT_BLOCKS" -lt "${BOOTSTRAP_BLOCKS}" ]]; then
  /usr/local/bin/ont-private-signet-mine "$((BOOTSTRAP_BLOCKS - CURRENT_BLOCKS))"
fi

su -s /bin/bash ont -c 'cd /opt/ont/app && npm ci --no-audit --no-fund'
ONT_PRIVATE_SIGNET_RPC_PORT="${RPC_PORT}" \
ONT_PRIVATE_SIGNET_P2P_PORT="${P2P_PORT}" \
ONT_PRIVATE_SIGNET_ELECTRUM_PORT="${ELECTRUM_PORT}" \
ONT_PRIVATE_SIGNET_RPC_USERNAME="ontrpcprivate" \
ONT_PRIVATE_SIGNET_RPC_PASSWORD="${RPC_PASSWORD}" \
  /opt/ont/app/scripts/install-private-signet-electrum.sh
systemctl enable --now ont-private-signet-auto-mine.service
systemctl enable --now ont-private-resolver.service
systemctl enable --now ont-private-web.service
systemctl enable --now ont-esplora-shim.service
systemctl enable --now ont-publisher.service
systemctl enable --now ont-domain-web.service

# Only the demo web (private) and the Electrum endpoint are exposed directly;
# the shim, publisher, and root-domain web stay localhost-only behind Caddy.
ufw allow ${WEB_PORT}/tcp >/dev/null

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-45}"

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
wait_for_http "http://127.0.0.1:${WEB_PORT}${BASE_PATH}/api/health" "private web health" 30
wait_for_http "http://127.0.0.1:${SHIM_PORT}/blocks/tip/height" "esplora shim" 30
wait_for_http "http://127.0.0.1:${PUBLISHER_PORT}/health" "publisher health" 30
wait_for_http "http://127.0.0.1:${DOMAIN_WEB_PORT}/api/health" "root-domain web health" 30

echo
echo "[private signet]"
/usr/local/bin/bitcoin-cli -conf=/etc/bitcoin-private-signet.conf -datadir=/var/lib/bitcoind-private-signet getblockchaininfo
echo
echo "[private resolver service]"
systemctl --no-pager --full status ont-private-resolver.service | sed -n '1,30p'
echo
echo "[private web service]"
systemctl --no-pager --full status ont-private-web.service | sed -n '1,30p'
echo
echo "[private auto-miner service]"
systemctl --no-pager --full status ont-private-signet-auto-mine.service | sed -n '1,30p'
echo
echo "[private electrum service]"
systemctl --no-pager --full status electrs-private-signet.service | sed -n '1,30p'
EOF

echo
echo "Private signet web URL: http://${REMOTE#*@}:${WEB_PORT}${BASE_PATH}"
echo "Private signet Electrum endpoint: ${PUBLIC_HOST}:${ELECTRUM_PORT}:t"

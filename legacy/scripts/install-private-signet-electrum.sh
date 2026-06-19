#!/usr/bin/env bash

set -euo pipefail

CONFIG_FILE="${ONT_PRIVATE_SIGNET_BITCOIN_CONF:-/etc/bitcoin-private-signet.conf}"
ELECTRS_VERSION="${ONT_PRIVATE_SIGNET_ELECTRS_VERSION:-0.11.1}"
ELECTRUM_PORT="${ONT_PRIVATE_SIGNET_ELECTRUM_PORT:-50001}"
ELECTRS_USER="${ONT_PRIVATE_SIGNET_ELECTRS_USER:-ont}"
INSTALL_DIR="/opt/electrs-v${ELECTRS_VERSION}"
DB_DIR="${ONT_PRIVATE_SIGNET_ELECTRS_DB_DIR:-/var/lib/electrs-private-signet}"
CONFIG_PATH="${ONT_PRIVATE_SIGNET_ELECTRS_CONFIG_PATH:-/etc/electrs-private-signet.toml}"
SERVICE_PATH="/etc/systemd/system/electrs-private-signet.service"

require_config_value() {
  local key="$1"
  local value

  value=$(awk -F= -v key="$key" '$1 == key {print substr($0, index($0, "=") + 1); found=1} END {if (!found) exit 1}' "$CONFIG_FILE" 2>/dev/null | tail -n 1) || true
  if [[ -z "${value:-}" ]]; then
    echo "Missing ${key} in ${CONFIG_FILE}" >&2
    exit 1
  fi
  printf '%s\n' "$value"
}

derive_signet_magic() {
  local challenge_hex="$1"

  python3 - "$challenge_hex" <<'PY'
import hashlib
import sys

challenge_hex = sys.argv[1].strip()
challenge = bytes.fromhex(challenge_hex)
length = len(challenge)

if length < 0xfd:
    varint = bytes([length])
elif length <= 0xffff:
    varint = b'\xfd' + length.to_bytes(2, 'little')
elif length <= 0xffffffff:
    varint = b'\xfe' + length.to_bytes(4, 'little')
else:
    varint = b'\xff' + length.to_bytes(8, 'little')

magic = hashlib.sha256(hashlib.sha256(varint + challenge).digest()).digest()[:4]
print(magic.hex())
PY
}

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing Bitcoin config at ${CONFIG_FILE}. Bootstrap private signet first." >&2
  exit 1
fi

RPC_PORT="${ONT_PRIVATE_SIGNET_RPC_PORT:-$(require_config_value rpcport)}"
P2P_PORT="${ONT_PRIVATE_SIGNET_P2P_PORT:-$(require_config_value port)}"
RPC_USERNAME="${ONT_PRIVATE_SIGNET_RPC_USERNAME:-$(require_config_value rpcuser)}"
RPC_PASSWORD="${ONT_PRIVATE_SIGNET_RPC_PASSWORD:-$(require_config_value rpcpassword)}"
SIGNET_CHALLENGE="${ONT_PRIVATE_SIGNET_CHALLENGE:-$(require_config_value signetchallenge)}"
SIGNET_MAGIC="${ONT_PRIVATE_SIGNET_MAGIC:-$(derive_signet_magic "$SIGNET_CHALLENGE")}"

if ! id -u "$ELECTRS_USER" >/dev/null 2>&1; then
  if [[ "$ELECTRS_USER" == "ont" ]] && id -u gns >/dev/null 2>&1; then
    ELECTRS_USER=gns
  else
    echo "Missing ${ELECTRS_USER} user. Bootstrap private signet first." >&2
    exit 1
  fi
fi

if [[ ! -x "${INSTALL_DIR}/target/release/electrs" ]]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y build-essential clang cmake curl git libclang-dev pkg-config

  if ! su -s /bin/bash "$ELECTRS_USER" -c 'test -x "$HOME/.cargo/bin/cargo"'; then
    su -s /bin/bash "$ELECTRS_USER" -c 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable'
  fi

  su -s /bin/bash "$ELECTRS_USER" -c 'source "$HOME/.cargo/env" && rustup toolchain install stable --profile minimal'

  rm -rf "${INSTALL_DIR}"
  git clone --depth 1 --branch "v${ELECTRS_VERSION}" https://github.com/romanz/electrs "${INSTALL_DIR}"
  chown -R "${ELECTRS_USER}:${ELECTRS_USER}" "${INSTALL_DIR}"
  su -s /bin/bash "$ELECTRS_USER" -c "source \"\$HOME/.cargo/env\" && cd '${INSTALL_DIR}' && cargo build --locked --release"
fi

install -d -o "$ELECTRS_USER" -g "$ELECTRS_USER" -m 755 "${DB_DIR}"

cat >"${CONFIG_PATH}" <<EOF
daemon_rpc_addr = "127.0.0.1:${RPC_PORT}"
daemon_p2p_addr = "127.0.0.1:${P2P_PORT}"
db_dir = "${DB_DIR}"
network = "signet"
magic = "${SIGNET_MAGIC}"
electrum_rpc_addr = "0.0.0.0:${ELECTRUM_PORT}"
auth = "${RPC_USERNAME}:${RPC_PASSWORD}"
log_filters = "INFO"
skip_block_download_wait = true
EOF

chown "root:${ELECTRS_USER}" "${CONFIG_PATH}"
chmod 640 "${CONFIG_PATH}"

cat >"${SERVICE_PATH}" <<EOF
[Unit]
Description=Electrum server for the private signet demo
After=bitcoind-private-signet.service
Requires=bitcoind-private-signet.service

[Service]
User=${ELECTRS_USER}
Group=${ELECTRS_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/target/release/electrs --conf ${CONFIG_PATH} --skip-default-conf-files
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65536
TimeoutSec=120

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now electrs-private-signet.service
systemctl restart electrs-private-signet.service
ufw allow "${ELECTRUM_PORT}/tcp" >/dev/null

probe_electrum() {
  python3 - "$ELECTRUM_PORT" <<'PY'
import socket
import sys

port = int(sys.argv[1])
payload = b'{"jsonrpc":"2.0","id":0,"method":"server.version","params":["ont-health","1.4"]}\n'

for _ in range(30):
    try:
        with socket.create_connection(("127.0.0.1", port), 5) as sock:
            sock.sendall(payload)
            data = sock.recv(4096)
            if data:
                print(data.decode("utf-8", "replace").strip())
                sys.exit(0)
    except OSError:
        pass
    import time
    time.sleep(2)

raise SystemExit(1)
PY
}

if ! probe_electrum; then
  echo "electrs-private-signet did not become ready on 127.0.0.1:${ELECTRUM_PORT}" >&2
  systemctl --no-pager --full status electrs-private-signet.service | sed -n '1,80p' >&2 || true
  exit 1
fi

echo "Private signet Electrum endpoint is listening on 0.0.0.0:${ELECTRUM_PORT} (magic ${SIGNET_MAGIC})"

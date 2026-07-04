# G3 — clean-slate VPS / private-signet runbook

Go-live **G3**: tear down the old VPS install and stand up the clean-build stack on a **private signet**.
This is the first real deployment of the rewritten software. See
[GO_LIVE_PLAN.md](../core/GO_LIVE_PLAN.md) (G3 note) and the go-live boundary in
[STATUS.md](../core/STATUS.md).

> **Acceptance for this slice:** a clean-slate private-signet **boot + read smoke** — the stack comes up healthy
> against a private signet and the read path serves. This is **not** mainnet and **not** a B3 claim /
> data-availability path. No keys or signing in compose, and no external or operator-provided funds.

## The clean stack

```
private-signet-miner --RPC--> bitcoind(private signet) --RPC--> indexer (node ingest, chain-gated)
                              ^                               --file store--> resolver (read) --> web (display)
                              |
publisher (/broadcast) -------+ signed raw from off-box wallet
       ^
       +-- /assemble (unsigned)
```

The indexer polls bitcoind for confirmed ONT anchors and writes them to a durable file store
(`ONT_STORE=file` under `ONT_STORE_DIR`). The resolver reads the **same** directory (shared volume) and
serves `GET /tx/:txid`; the web surface reads the resolver over HTTP and renders. A restart resumes from
the durable cursor without re-ingesting (go-live G2). The **publisher** is the write entry: `/assemble/*`
returns an **unsigned** tx for off-box (B5 wallet) signing, and `/broadcast` relays an **already-signed**
legacy raw to bitcoind — the publisher never signs and never reads the store. A `private-signet-miner`
sidecar runs Bitcoin Core's `contrib/signet/miner` with the checked-in fast grinder, mines 110 bootstrap
blocks to the operator's off-box funding wallet so mature coinbase exists, then keeps mining at a low
cadence for confirmations. The miner loads a helper wallet only because Bitcoin Core's signet miner resolves
the reward scriptPubKey through wallet RPC; that helper wallet has private keys disabled and does not custody
the off-box reward address. Client verification uses the same private signet by overriding the bundled
public-signet launch checkpoint to this chain's genesis; signet headers remain `provider-trusted`.
Everything is wired in [`docker-compose.yml`](../../docker-compose.yml);
`npm run check:deploy` gates that file, the entrypoint, the miner assets, and `.env.example` against
old-stack leakage.

### Per-service contract

| Service | Entry | Key env | Storage | Health | Smoke |
|---|---|---|---|---|---|
| **bitcoind** | `${BITCOIND_IMAGE}` (operator-pinned, Core ≥ 25) | `-signet`, `-signetchallenge=${ONT_SIGNET_CHALLENGE:-51}`, `-dnsseed=0`, RPC `:38332`, `ONT_RPC_USER`/`ONT_RPC_PASSWORD` | `bitcoind_data` volume | `getblockchaininfo` | private chain starts at height 0; RPC answers |
| **private-signet-miner** | `docker/private-signet-miner.Dockerfile` | `ONT_SIGNET_MINER_ADDRESS`, `ONT_SIGNET_MINER_WALLET=ont_miner`, `ONT_SIGNET_BOOTSTRAP_BLOCKS=110`, `ONT_SIGNET_MINE_INTERVAL_SECONDS` | helper wallet only; reward keys stay off-box | container stays running after bootstrap | mines 110 blocks so mature coinbase exists, then low-rate confirmations |
| **indexer** | `apps/indexer/.../main.js` | `ONT_SOURCE=node`, `ONT_CHAIN=signet`, `ONT_RPC_URL`, `ONT_RPC_USER/PASSWORD`, `ONT_STORE=file`, `ONT_STORE_DIR=/app/.data`, `INDEXER_POLL_MS`, `ONT_LAUNCH_CHECKPOINT_*` | `ont_data` volume (writer) | chain gate passes; loop logs `starting` | poll advances; `confirmed-anchors.json`, `headers.json` + cursor persist |
| **resolver** | `apps/resolver/.../index.js` | `PORT=4174`, `ONT_STORE=file`, `ONT_STORE_DIR=/app/.data` | `ont_data` volume (reader, same dir) | `GET /health` | `GET /tx/:txid` → 404 when absent, the confirmed view when present |
| **web** | `apps/web/.../index.js` | `PORT=4175`, `ONT_RESOLVER_URL=http://resolver:4174`, `ONT_HEADER_PROVIDER=resolver`, `ONT_LAUNCH_CHECKPOINT_*` | none | `GET /health` | landing + name/tx views render through the resolver; served names verify against resolver-served private-signet headers |
| **publisher** | `apps/publisher/.../index.js` | `PORT=4176`, `ONT_SOURCE=node`, `ONT_CHAIN=signet`, `ONT_RPC_URL`, `ONT_RPC_USER/PASSWORD` | none (never reads the store) | `GET /health` | `/assemble/*` → unsigned tx; `/broadcast` of a signed raw → bitcoind accepts (needs off-box wallet funds — §4c) |

The indexer's chain gate (`@ont/node-live`) fails **closed** before the first poll: a missing or mispointed
`ONT_RPC_URL`, or a chain mismatch (e.g. the node is not signet), stops the daemon at startup rather than
ingesting from the wrong chain. The **publisher** shares the same gate (`ONT_SOURCE=node`): a missing RPC or
a chain mismatch stops it **before it listens**, so it can never broadcast to the wrong chain.

## Prerequisites

- A host with Docker Engine + the Compose plugin.
- This repo checked out on the host.
- A strong RPC secret for `ONT_RPC_PASSWORD`.
- A legacy signet funding address controlled by the off-box wallet that will sign anchor transactions.

## 1. Repo-prep (non-destructive)

Safe to run by an operator/agent; touches no VPS state.

```bash
cp .env.example .env
# Edit .env: set ONT_RPC_PASSWORD (required), ONT_SIGNET_MINER_ADDRESS (required),
# leave ONT_HEADER_PROVIDER=resolver and the ONT_LAUNCH_CHECKPOINT_* private-genesis values unless
# deliberately re-pointing to a different private signet; pin BITCOIND_IMAGE if needed, and adjust binds.
npm run check:deploy          # static clean-stack gate — must be green before deploying
docker compose build          # build the app image plus the private-signet miner sidecar
```

## 2. ⚠️ Destructive VPS teardown — DK-owned

> **These steps wipe the previous install (including the old signet) and are DK's to run.** The old signet
> was already decommissioned in software (STATUS.md, 2026-06-11); this removes the running state and data so
> the clean stack starts from zero. Do not run these against a host you have not confirmed is the retired one.

```bash
# Stop and remove the OLD stack and its data (run in the old install's directory):
docker compose down --volumes --remove-orphans     # old containers + named volumes
# Remove any stale old-signet datadir / legacy service units the old install left behind:
#   - old bitcoind signet datadir
#   - any systemd units / reverse-proxy vhosts from the pre-clean-build deploy
# (Inventory these per the host; this repo does not carry VPS access.)
```

## 3. Clean rebuild + boot

```bash
docker compose up -d                         # bitcoind/miner → indexer/publisher → resolver → web (ordered by healthchecks)
docker compose ps                            # all services Up; resolver/web/publisher healthy
docker compose logs -f private-signet-miner  # watch the 110-block bootstrap and ongoing cadence
docker compose logs -f indexer               # chain gate passes, then `{"service":"@ont/indexer","status":"starting"}`
```

The custom challenge (`ONT_SIGNET_CHALLENGE`, default `51` / OP_TRUE) makes this a private signet, so there is
no public-signet IBD. The indexer waits on `bitcoind` healthy before it starts, and its own chain gate blocks
polling until the node reports `signet`.

The client launch checkpoint override must stay pointed at this private genesis:

```bash
ONT_LAUNCH_CHECKPOINT_HEIGHT=0
ONT_LAUNCH_CHECKPOINT_HASH=00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6
ONT_LAUNCH_CHECKPOINT_BITS=0x1e0377ae
ONT_LAUNCH_CHECKPOINT_TIME=1598918400
ONT_LAUNCH_CHECKPOINT_EPOCH_START=1598918400
ONT_LAUNCH_CHECKPOINT_WORK=49d414
ONT_HEADER_PROVIDER=resolver
```

These are signet-scoped client launch values, not consensus law and not a trust upgrade. The CLI/web/mobile
still label private-signet headers as `provider-trusted` until independent signet-solution validation ships.

## 4. Acceptance — what this slice proves

The **boot/read** acceptance (4a–4b) is auto-provable on a fresh private signet after the miner bootstraps
its 110-block maturity window, and is what this runbook gates. The publisher is now wired into the stack, so
the **write-smoke** (4c) is also exercisable — but it needs an **off-box funding wallet** controlling the
configured miner address to sign a real anchor, so it is the **operator's run**, not something the clean boot
proves on its own. None of this is mainnet or a B3 data-availability path.

### 4a. Boot smoke (deployed stack, live private signet)

```bash
# Health
curl -fsS http://127.0.0.1:4174/health        # resolver: ok
curl -fsS http://127.0.0.1:4175/health        # web: ok

# Absence is clean (not a crash): an unknown txid 404s
curl -isS http://127.0.0.1:4174/tx/0000000000000000000000000000000000000000000000000000000000000000 | head -1   # 404

# The indexer is past the signet chain gate and running (not the wrong chain, not silently idle):
docker compose logs indexer | grep '"status":"starting"'
```

On a fresh private signet there are no ONT anchors yet, so the live read path proves health + clean absence + a
chain-gated indexer. It cannot show a real *present* anchor until one is claimed (4c).

### 4b. Durable read-presence (deterministic, no claim path)

The G2 durable file read — store → resolver `/tx` → web render — is proven without the claim path:

- **In-repo (authoritative):** the hermetic restart-survival e2e persists a confirmed RootAnchor to the real
  file store and renders it through the real resolver + web after a restart. It runs in the default suite
  (`npm test`, `@ont/regtest-e2e`) — no bitcoind, no signet, no claim path.
- **On the deployed stack (optional, seeded):** seed one clearly-labeled **fixture** record into the shared
  store and read it back. This proves the deployed resolver/web serve a present record; the record is a seed,
  **not** a real signet anchor or an ownership claim.

  The seed runs **inside the resolver container** and writes `ONT_STORE_DIR=/app/.data` — the `ont_data` named
  volume shared with the indexer and resolver — so there is **no host path to resolve**; the resolver serves it on
  the published port. The script prints the bare txid on stdout and a `SEEDED fixture — NOT a real acceptance
  artifact` notice on stderr.

  ```bash
  # Writes a SEEDED fixture (non-signet, non-consensus) confirmed-anchor record into the shared ont_data volume:
  TXID=$(docker compose exec -T -e ONT_STORE_DIR=/app/.data resolver node /app/scripts/g3-seed-anchor.mjs)
  curl -fsS "http://127.0.0.1:4174/tx/$TXID"        # resolver returns the confirmed view (seeded fixture)
  curl -fsS "http://127.0.0.1:4175/?q=$TXID"        # web renders it (seeded fixture)
  ```

  The seed coexists on a quiet stack; a later real anchor supersedes it (see the script header). Use it as a
  one-shot read-presence check, then let real ingest take over.

### 4c. Write-smoke (operator, needs the off-box funding wallet)

This is the real end-to-end write path: **assemble → off-box sign → broadcast → ingest → render**. The
publisher is in the stack and chain-gated, but signing a real anchor needs the **off-box funding wallet** whose
legacy signet address was set as `ONT_SIGNET_MINER_ADDRESS`, so this is the operator's run (the boot smoke in
4a does not perform it). The steps below mirror the hermetic regtest e2e
([`packages/regtest-e2e/src/root-anchor-e2e.ts`](../../packages/regtest-e2e/src/root-anchor-e2e.ts)):
funding comes from private-signet coinbase mined by the sidecar, with no external funding service.

> **⚠ THE one constraint — everything must be legacy-serializable.** The indexer reads a matched anchor with
> `parseLegacyTransaction` **and** re-fetches+parses each funding input's **parent** tx
> ([`apps/indexer/src/live/node-block-source.ts`](../../apps/indexer/src/live/node-block-source.ts) — a
> witness/segwit body is **dropped**). So the anchor tx **and** the tx that created the funding UTXO must both
> be legacy (P2PKH, no witness). Use **legacy addresses throughout** and a **legacy funding hop**. The
> publisher's `/broadcast` independently fails closed (`422 tx-not-legacy`) on a segwit raw — belt and braces.

This recipe assumes the off-box wallet can create a legacy funding hop and sign the final raw transaction.
The compose-side commands still run **from the repo directory** (where `.env` lives) and require `jq` on the
host. They load `.env` into your shell first so the recipe can fail closed if `ONT_SIGNET_MINER_ADDRESS`
is missing or still set to the placeholder; `docker compose` interpolates `.env` for the compose file, but
your interactive shell does **not**.

```bash
[ -f .env ] || { echo "ERROR: no .env in $(pwd) — run from the repo directory (see §1)." >&2; exit 1; }
set -a; . ./.env; set +a     # load ONT_SIGNET_MINER_ADDRESS (the compose .env) into THIS shell
set -euo pipefail            # FAIL CLOSED: stop at the first missing prerequisite, never broadcast on a gap
: "${ONT_SIGNET_MINER_ADDRESS:?set ONT_SIGNET_MINER_ADDRESS in .env to the off-box legacy signet address}"
if [ "$ONT_SIGNET_MINER_ADDRESS" = "replace-with-off-box-legacy-signet-address" ]; then
  echo "ERROR: ONT_SIGNET_MINER_ADDRESS is still the placeholder." >&2
  exit 1
fi

# 0. Publisher is up and past its chain gate (same gate as the indexer):
curl -fsS http://127.0.0.1:4176/health >/dev/null || { echo "ERROR: publisher not healthy on :4176." >&2; exit 1; }

# 1. Funding is self-mined. Before boot, ONT_SIGNET_MINER_ADDRESS in .env must be a LEGACY signet
#    address controlled by the off-box wallet. Wait until the miner has bootstrapped 110 blocks and that
#    wallet reports mature/spendable coinbase funds. No external funding service is used.
docker compose logs private-signet-miner | grep 'ongoing cadence\|bootstrap already satisfied'

# 2. Legacy funding HOP — using the off-box wallet, spend mature coinbase into a fresh LEGACY address
#    controlled by that same wallet, then mine/wait for one confirmation. Export the hop txid/address first.
: "${HOP_TXID:?set HOP_TXID from the off-box wallet hop txid}"
: "${HOP_ADDR:?set HOP_ADDR from the off-box wallet hop legacy address}"

# 3. Capture the EXACT spendable prevout VOUT of the hop output — never assume an output index (sendtoaddress
#    orders payment vs change however it likes). Export the vout reported by the off-box wallet first.
: "${UTXO_VOUT:?set UTXO_VOUT from the off-box wallet hop output index}"

# 4. Generate the assemble input from those exact values. prevRoot/newRoot are well-formed 32-byte LOWERCASE
#    hex (64 chars); for a PLUMBING smoke they are placeholders (proves write→ingest→render, NOT a batch).
cat > root-anchor-input.json <<JSON
{ "prevRoot": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "newRoot":  "7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a",
  "batchSize": 5,
  "fundingInputs": [{ "prevoutTxid": "$HOP_TXID", "prevoutVout": $UTXO_VOUT }] }
JSON

# 5. Assemble the UNSIGNED tx (publisher never signs; no changeOutput — fundrawtransaction adds legacy change).
#    jq -er fails closed if .unsignedTxHex is absent/null (e.g. the input was rejected 422).
UNSIGNED_HEX=$(curl -fsS -X POST http://127.0.0.1:4176/assemble/root-anchor \
  -H 'content-type: application/json' -d @root-anchor-input.json | jq -er '.unsignedTxHex') \
  || { echo "ERROR: assemble failed — check the publisher /assemble/root-anchor response." >&2; exit 1; }

# 6. Off-box: add legacy change + SIGN with the funding wallet (the publisher holds no keys).
#    Keep add_inputs:false / equivalent so a segwit UTXO cannot sneak in; legacy change keeps the raw legacy.
: "${SIGNED_HEX:?set SIGNED_HEX to the off-box wallet signed legacy raw hex}"

# 7. Broadcast the SIGNED raw — the only route that touches the chain; 422 if not legacy, relays verbatim else.
ANCHOR_TXID=$(curl -fsS -X POST http://127.0.0.1:4176/broadcast \
  -H 'content-type: application/json' -d "{\"signedTxHex\":\"$SIGNED_HEX\"}" | jq -er '.txid') \
  || { echo "ERROR: broadcast failed — non-legacy raw (422) or node rejected; check the /broadcast response." >&2; exit 1; }
echo "broadcast txid: $ANCHOR_TXID"          # the real chain txid (NOT the assemble template id)

# 8. Once mined + confirmed on private signet, the indexer ingests it and the read path renders it (404 until then):
curl -fsS "http://127.0.0.1:4174/tx/$ANCHOR_TXID" || echo "not ingested yet — wait for a confirmation, then retry"
curl -fsS "http://127.0.0.1:4175/?q=$ANCHOR_TXID" || true
```

**Placeholder roots = a plumbing smoke.** The `prevRoot`/`newRoot` above are arbitrary well-formed values; the
assemble adapter does not validate root semantics, so this proves the **transport** (write → ingest → render),
not a consensus-valid batch. A real anchor (`prevRoot` = the actual base root, `newRoot` from a real delta over
a committed batch) is the batched-claim path (**B3**), out of this slice.

**Not yet run against live private signet.** The sidecar mines mature coinbase to the configured off-box wallet;
the exact off-box wallet signing commands should be filled from the wallet used on the first funded run. Until
then the write path is proven only **hermetically** in-repo (the `@ont/publisher` + regtest e2e suites,
`npm test`) — the seam runs end-to-end against a test wallet, just not on the deployed private-signet box.

Restart-survival (G2) carries over: `docker compose restart indexer resolver` and the durable cursor +
confirmed anchors persist — the resolver still serves what was ingested before the restart.

## Notes

- **Old-stack deploy scripts are quarantined.** The old VPS deploy/bootstrap scripts (`deploy-vps.sh`,
  `deploy-private-signet-vps.sh`, `bootstrap-vps.sh`, `bootstrap-private-signet-vps.sh`, `bootstrap-ont-domain.sh`,
  `install-private-signet-electrum.sh`) and [VPS_SETUP.md](./VPS_SETUP.md) predate the clean build and wire the
  dead `GNS_*`/`ONT_LAUNCH_HEIGHT` model. The scripts are now under [`legacy/scripts/`](../../legacy/scripts/README.md)
  (npm entries dropped); see [OLD_DEPLOY_QUARANTINE_SCOPE.md](./OLD_DEPLOY_QUARANTINE_SCOPE.md). The compose +
  this runbook are the canonical clean-stack path. (The private-signet *local-dev* helpers were retired —
  deleted per DK on 2026-06-19; see [OLD_DEPLOY_QUARANTINE_SCOPE.md](./OLD_DEPLOY_QUARANTINE_SCOPE.md).)
- **Publisher write path is wired; the funded write-smoke is the operator's.** The non-signing publisher
  (`/assemble/*` unsigned + `/broadcast` of a signed raw) is in the stack and chain-gated. The boot/read
  acceptance (4a–4b) needs no funds; the real anchor write-smoke (4c) needs the off-box funding wallet and is the
  operator's run. The publisher holds no keys and never reads the store.
- **bitcoind image is operator-pinned.** `BITCOIND_IMAGE` defaults to `btcpayserver/bitcoin:28.1`
  (signet-capable, validated live); pin and validate a build you trust, and check the `bitcoin-cli` health
  probe path for that image on first boot. The miner image is built from the same base and clones the matching
  Bitcoin Core source tag only for `contrib/signet/miner`.

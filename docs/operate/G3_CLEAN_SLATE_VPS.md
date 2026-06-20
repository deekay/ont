# G3 — clean-slate VPS / signet runbook

Go-live **G3**: tear down the old VPS install and stand up the clean-build stack on a **fresh signet**.
This is the first real deployment of the rewritten software. See
[GO_LIVE_PLAN.md](../core/GO_LIVE_PLAN.md) (G3 note) and the go-live boundary in
[STATUS.md](../core/STATUS.md).

> **Acceptance for this slice:** a clean-slate signet **boot + read smoke** — the stack comes up healthy
> against a fresh signet and the read path serves. This is **not** mainnet and **not** a B3 claim /
> data-availability path. No keys, no signing, no funds.

## The clean stack

```
                                                                      signed raw
publisher (write entry: /broadcast) --------RPC--------> bitcoind(signet)
       ^ off-box wallet signs                                  |
       |                                                       RPC
       +-- /assemble (unsigned)                                v
                                          indexer (node ingest, chain-gated) --file store--> resolver (read) --> web (display)
```

The indexer polls bitcoind for confirmed ONT anchors and writes them to a durable file store
(`ONT_STORE=file` under `ONT_STORE_DIR`). The resolver reads the **same** directory (shared volume) and
serves `GET /tx/:txid`; the web surface reads the resolver over HTTP and renders. A restart resumes from
the durable cursor without re-ingesting (go-live G2). The **publisher** is the write entry: `/assemble/*`
returns an **unsigned** tx for off-box (B5 wallet) signing, and `/broadcast` relays an **already-signed**
legacy raw to bitcoind — the publisher never signs and never reads the store. Everything is wired in
[`docker-compose.yml`](../../docker-compose.yml); `npm run check:deploy` gates that file, the entrypoint,
and `.env.example` against old-stack leakage.

### Per-service contract

| Service | Entry | Key env | Storage | Health | Smoke |
|---|---|---|---|---|---|
| **bitcoind** | `${BITCOIND_IMAGE}` (operator-pinned, Core ≥ 25) | `-signet`, RPC `:38332`, `ONT_RPC_USER`/`ONT_RPC_PASSWORD` | `bitcoind_data` volume | `getblockchaininfo` | signet IBD completes; RPC answers |
| **indexer** | `apps/indexer/.../main.js` | `ONT_SOURCE=node`, `ONT_CHAIN=signet`, `ONT_RPC_URL`, `ONT_RPC_USER/PASSWORD`, `ONT_STORE=file`, `ONT_STORE_DIR=/app/.data`, `INDEXER_POLL_MS` | `ont_data` volume (writer) | chain gate passes; loop logs `starting` | poll advances; `confirmed-anchors.json` + cursor persist |
| **resolver** | `apps/resolver/.../index.js` | `PORT=4174`, `ONT_STORE=file`, `ONT_STORE_DIR=/app/.data` | `ont_data` volume (reader, same dir) | `GET /health` | `GET /tx/:txid` → 404 when absent, the confirmed view when present |
| **web** | `apps/web/.../index.js` | `PORT=4175`, `ONT_RESOLVER_URL=http://resolver:4174` | none | `GET /health` | landing + `/?q=<txid>` render through the resolver |
| **publisher** | `apps/publisher/.../index.js` | `PORT=4176`, `ONT_SOURCE=node`, `ONT_CHAIN=signet`, `ONT_RPC_URL`, `ONT_RPC_USER/PASSWORD` | none (never reads the store) | `GET /health` | `/assemble/*` → unsigned tx; `/broadcast` of a signed raw → bitcoind accepts (needs funded signet — §4c) |

The indexer's chain gate (`@ont/node-live`) fails **closed** before the first poll: a missing or mispointed
`ONT_RPC_URL`, or a chain mismatch (e.g. the node is not signet), stops the daemon at startup rather than
ingesting from the wrong chain. The **publisher** shares the same gate (`ONT_SOURCE=node`): a missing RPC or
a chain mismatch stops it **before it listens**, so it can never broadcast to the wrong chain.

## Prerequisites

- A host with Docker Engine + the Compose plugin.
- This repo checked out on the host.
- A strong RPC secret for `ONT_RPC_PASSWORD`.

## 1. Repo-prep (non-destructive)

Safe to run by an operator/agent; touches no VPS state.

```bash
cp .env.example .env
# Edit .env: set ONT_RPC_PASSWORD (required), pin BITCOIND_IMAGE, adjust binds if fronting with a proxy.
npm run check:deploy          # static clean-stack gate — must be green before deploying
docker compose build          # build the indexer/resolver/web/publisher image from docker/Dockerfile
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
docker compose up -d                         # bitcoind → indexer/publisher → resolver → web (ordered by healthchecks)
docker compose ps                            # all services Up; resolver/web/publisher healthy
docker compose logs -f bitcoind              # watch the signet IBD finish
docker compose logs -f indexer               # chain gate passes, then `{"service":"@ont/indexer","status":"starting"}`
```

bitcoind does a (small) signet IBD on first boot; the indexer waits on `bitcoind` healthy before it starts,
and its own chain gate blocks polling until the node reports signet.

## 4. Acceptance — what this slice proves

The **boot/read** acceptance (4a–4b) is auto-provable on a fresh signet with no funds and is what this
runbook gates. The publisher is now wired into the stack, so the **write-smoke** (4c) is also exercisable —
but it needs a **funded signet wallet** to sign a real anchor, so it is the **operator's run**, not something
the clean boot proves on its own. None of this is mainnet or a B3 data-availability path.

### 4a. Boot smoke (deployed stack, live signet)

```bash
# Health
curl -fsS http://127.0.0.1:4174/health        # resolver: ok
curl -fsS http://127.0.0.1:4175/health        # web: ok

# Absence is clean (not a crash): an unknown txid 404s
curl -isS http://127.0.0.1:4174/tx/0000000000000000000000000000000000000000000000000000000000000000 | head -1   # 404

# The indexer is past the signet chain gate and running (not the wrong chain, not silently idle):
docker compose logs indexer | grep '"status":"starting"'
```

On a fresh signet there are no ONT anchors yet, so the live read path proves health + clean absence + a
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

### 4c. Write-smoke (operator, needs a funded signet)

This is the real end-to-end write path: **assemble → off-box sign → broadcast → ingest → render**. The
publisher is in the stack and chain-gated, but signing a real anchor needs a **funded signet wallet**, so
this is the operator's run (the boot smoke in 4a does not perform it).

```bash
# 0. Publisher is up and past its chain gate (same gate as the indexer):
curl -fsS http://127.0.0.1:4176/health                       # publisher: ok

# 1. Assemble the UNSIGNED RootAnchor tx (publisher never signs; the body is the B4 assemble input):
curl -fsS -X POST http://127.0.0.1:4176/assemble/root-anchor \
  -H 'content-type: application/json' -d @root-anchor-input.json
#    -> { "ok": true, "unsignedTxid": "...", "unsignedTxHex": "..." }   (unsignedTxid is a TEMPLATE id)

# 2. Sign OFF-BOX with a funded signet wallet (B5 wallet handoff — the publisher holds no keys), producing a
#    fully-signed legacy raw. Fund the input(s) from a signet faucet first.

# 3. Broadcast the SIGNED raw — the only route that touches the chain; relays verbatim to bitcoind:
curl -fsS -X POST http://127.0.0.1:4176/broadcast \
  -H 'content-type: application/json' -d '{"signedTxHex":"<signed-raw-hex>"}'
#    -> 202 { "ok": true, "txid": "<chain-txid>" }   (the real chain txid, not the template id)

# 4. Once mined + confirmed, the indexer ingests it and the read path renders it:
curl -fsS "http://127.0.0.1:4174/tx/<chain-txid>"            # resolver: the confirmed view
curl -fsS "http://127.0.0.1:4175/?q=<chain-txid>"            # web: rendered
```

Until a funded signet run is done, the write path is proven only **hermetically** in-repo (the `@ont/publisher`
+ regtest e2e suites, `npm test`) — the seam is exercised end-to-end against a test wallet, just not on the
deployed signet box.

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
  acceptance (4a–4b) needs no funds; the real anchor write-smoke (4c) needs a funded signet wallet and is the
  operator's run. The publisher holds no keys and never reads the store.
- **bitcoind image is operator-pinned.** `BITCOIND_IMAGE` defaults to `btcpayserver/bitcoin:28.1`
  (signet-capable, validated live); pin and validate a build you trust, and check the `bitcoin-cli` health
  probe path for that image on first boot.

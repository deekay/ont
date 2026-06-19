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
bitcoind(signet) --RPC--> indexer (node ingest, chain-gated) --file store--> resolver (read) --> web (display)
```

The indexer polls bitcoind for confirmed ONT anchors and writes them to a durable file store
(`ONT_STORE=file` under `ONT_STORE_DIR`). The resolver reads the **same** directory (shared volume) and
serves `GET /tx/:txid`; the web surface reads the resolver over HTTP and renders. A restart resumes from
the durable cursor without re-ingesting (go-live G2). Everything is wired in
[`docker-compose.yml`](../../docker-compose.yml); `npm run check:deploy` gates that file, the entrypoint,
and `.env.example` against old-stack leakage.

### Per-service contract

| Service | Entry | Key env | Storage | Health | Smoke |
|---|---|---|---|---|---|
| **bitcoind** | `${BITCOIND_IMAGE}` (operator-pinned, Core ≥ 25) | `-signet`, RPC `:38332`, `ONT_RPC_USER`/`ONT_RPC_PASSWORD` | `bitcoind_data` volume | `getblockchaininfo` | signet IBD completes; RPC answers |
| **indexer** | `apps/indexer/.../main.js` | `ONT_SOURCE=node`, `ONT_CHAIN=signet`, `ONT_RPC_URL`, `ONT_RPC_USER/PASSWORD`, `ONT_STORE=file`, `ONT_STORE_DIR=/app/.data`, `INDEXER_POLL_MS` | `ont_data` volume (writer) | chain gate passes; loop logs `starting` | poll advances; `confirmed-anchors.json` + cursor persist |
| **resolver** | `apps/resolver/.../index.js` | `PORT=4174`, `ONT_STORE=file`, `ONT_STORE_DIR=/app/.data` | `ont_data` volume (reader, same dir) | `GET /health` | `GET /tx/:txid` → 404 when absent, the confirmed view when present |
| **web** | `apps/web/.../index.js` | `PORT=4175`, `ONT_RESOLVER_URL=http://resolver:4174` | none | `GET /health` | landing + `/?q=<txid>` render through the resolver |

The indexer's chain gate (`@ont/node-live`) fails **closed** before the first poll: a missing or mispointed
`ONT_RPC_URL`, or a chain mismatch (e.g. the node is not signet), stops the daemon at startup rather than
ingesting from the wrong chain.

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
docker compose build          # build the resolver/web/indexer image from docker/Dockerfile
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
docker compose up -d                         # bitcoind → indexer → resolver → web (ordered by healthchecks)
docker compose ps                            # all services Up; resolver/web healthy
docker compose logs -f bitcoind              # watch the signet IBD finish
docker compose logs -f indexer               # chain gate passes, then `{"service":"@ont/indexer","status":"starting"}`
```

bitcoind does a (small) signet IBD on first boot; the indexer waits on `bitcoind` healthy before it starts,
and its own chain gate blocks polling until the node reports signet.

## 4. Read-smoke acceptance

On a **fresh** signet there are no ONT anchors yet, so the read path proves it serves **absence cleanly**
and **presence correctly once an anchor is mined**:

```bash
# Health
curl -fsS http://127.0.0.1:4174/health        # resolver: ok
curl -fsS http://127.0.0.1:4175/health        # web: ok

# Absence is clean (not a crash): an unknown txid 404s
curl -isS http://127.0.0.1:4174/tx/0000000000000000000000000000000000000000000000000000000000000000 | head -1   # 404

# Presence (once a RootAnchor is confirmed on this signet): the resolver returns the confirmed view and
# the web landing renders it. Mine/confirm a RootAnchor via the claim path, then:
#   curl -fsS http://127.0.0.1:4174/tx/<txid>
#   curl -fsS "http://127.0.0.1:4175/?q=<txid>"
```

Restart-survival (G2) carries over: `docker compose restart indexer resolver` and the durable cursor +
confirmed anchors persist — the resolver still serves what was ingested before the restart.

## Notes

- **Old-stack deploy scripts are not the clean path.** `scripts/deploy-vps.sh`,
  `scripts/deploy-private-signet-vps.sh`, the `bootstrap-*`/`sparrow-*` scripts, and
  [VPS_SETUP.md](./VPS_SETUP.md) predate the clean build and are not gated by `check:deploy`. The compose +
  this runbook are the canonical clean-stack path; the old scripts are a separate cleanup (next G3 slice).
- **Publisher / claim path is out of scope here.** G3 slice-1 is the read path. The publisher
  (claim/anchor-serving) and a real claim→anchor→render smoke come in a later slice.
- **bitcoind image is operator-pinned.** `BITCOIND_IMAGE` defaults to a placeholder; pin a signet-capable
  Bitcoin Core build you trust and validate the `bitcoin-cli` health probe path for that image on first boot.

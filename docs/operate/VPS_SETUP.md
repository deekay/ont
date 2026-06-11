# VPS Setup

This is the repeatable path for running the current prototype on a VPS you control.

Today the VPS layout is:

- `bitcoind` on signet
- `ont-resolver` service role
- `ont-web` service role

Optionally, the same VPS can also run a parallel private signet demo stack:

- `bitcoind-private-signet`
- `ont-private-resolver` service role
- `ont-private-web` service role

The web app is public.
The resolver and Bitcoin RPC stay private on loopback.

## Recommended Droplet Shape

- Ubuntu `24.04 LTS`
- `4 GB RAM`
- `2 vCPU`
- `80 GB SSD`

That is enough for:

- a signet node with `txindex=1`
- the resolver/indexer
- the web app

## Before You Start

You need:

- a reachable Ubuntu VPS
- SSH access as `root`
- the local repo on the machine you are deploying from

The bootstrap and deploy scripts now expect you to pass the SSH target directly or set:

```bash
export ONT_SSH_TARGET=root@<server-ip>
export ONT_SSH_KEY=~/.ssh/<your-key>
```

The SSH key is optional if your SSH config or agent already knows how to reach the box.

## One-Time Bootstrap

Run this from the repo root on your local machine:

```bash
./scripts/bootstrap-vps.sh root@<server-ip> ~/.ssh/<your-key>
```

What it does:

- installs base packages
- installs Node `22`
- creates a small swap file
- installs Bitcoin Core `30.2`
- configures signet `bitcoind` as a systemd service
- creates the `ont` service user
- syncs the repo to `/opt/ont/app`
- installs npm dependencies
- creates the Open Name Tags resolver and web systemd services
- enables the firewall and opens only:
  - `22/tcp`
  - `3000/tcp`

Important current behavior:

- the bootstrap sets `ONT_LAUNCH_HEIGHT` to the node's current signet block height
- that means the live resolver starts tracking from "now" rather than replaying all historic signet blocks
- this is intentional for the current prototype so the live service comes up quickly

## Routine Deploys

After local code changes, redeploy with:

```bash
./scripts/deploy-vps.sh root@<server-ip> ~/.ssh/<your-key>
```

What it does:

- rsyncs the repo to `/opt/ont/app`
- runs `npm ci` as the `ont` user
- by default, preserves the current launch height and snapshot
- restarts `ont-resolver` and `ont-web`
- prints resolver and web health from the VPS

If you want to force a refresh of `ONT_LAUNCH_HEIGHT` from the configured RPC tip and clear the configured snapshot during a deploy:

```bash
ONT_DEPLOY_REFRESH_LAUNCH_HEIGHT=1 ./scripts/deploy-vps.sh root@<server-ip> ~/.ssh/<your-key>
```

## Parallel Private Signet

If you want a faucet-free demo network on the same VPS, bootstrap the private signet sidecar with:

```bash
./scripts/bootstrap-private-signet-vps.sh root@<server-ip> ~/.ssh/<your-key>
```

What it does:

- creates a second signet node with its own challenge, ports, and datadir
- clones the Bitcoin Core source tree so `contrib/signet/miner` is available
- creates helper commands to mine blocks and fund addresses locally on the VPS
- mines an initial private chain so the built-in demo wallet has mature funds
- creates the private Open Name Tags resolver and web services
- serves the private demo at `/ont-private` on port `3001`

Useful private-signet commands on the VPS:

```bash
systemctl status bitcoind-private-signet
systemctl status ont-private-resolver
systemctl status ont-private-web
bitcoin-cli -conf=/etc/bitcoin-private-signet.conf -datadir=/var/lib/bitcoind-private-signet getblockchaininfo
ont-private-signet-mine 1
ont-private-signet-fund <address> <amount-btc>
```

Routine code deploys for the private demo use:

```bash
./scripts/deploy-private-signet-vps.sh root@<server-ip> ~/.ssh/<your-key>
```

To seed the private demo with visible names and lifecycle states, run from the local repo:

```bash
npm run test:private-signet-auction-smoke
```

For smaller, easier-to-debug checks, run:

```bash
npm run test:private-signet-auction-smoke
npm run test:private-signet-auction-phase-gallery
```

## Public URL

After bootstrap, the live web app should be available at:

```text
http://<server-ip>:3000
```

The private demo sidecar is available at:

```text
http://<server-ip>:3001/ont-private
```

The web app proxies to the private resolver.

## Service Layout

Current paths on the VPS:

- app code: `/opt/ont/app`
- Open Name Tags env file: `/etc/ont/ont.env`
- Bitcoin config: `/etc/bitcoin-signet.conf`
- Bitcoin data dir: `/var/lib/bitcoind`
- Open Name Tags snapshot/value state: `/var/lib/ont`

## Supabase / Postgres Backend

The resolver and one-shot indexer can now persist to Postgres instead of local snapshot files.
Supabase works for this because it is just Postgres from the app's point of view.

Recommended setup:

- create a separate Supabase project for Open Name Tags
- keep the existing file-backed path for local dev
- set the Postgres connection string only on the environments where you want durable persistence

Environment variables:

```bash
ONT_DATABASE_URL=postgresql://...
ONT_DATABASE_SCHEMA=public
ONT_SNAPSHOT_KEY=resolver
ONT_VALUE_STORE_KEY=resolver
```

Notes:

- if `ONT_DATABASE_URL` is set, the resolver/indexer will store snapshots and destination-record state in Postgres
- if `ONT_DATABASE_URL` is unset, they continue using `ONT_SNAPSHOT_PATH` and `ONT_VALUE_STORE_PATH`
- the first startup will automatically create the `ont_documents` table in the configured schema
- for Supabase, the session pooler connection string is the safest default choice unless you know you want direct connections

Private signet paths:

- Bitcoin config: `/etc/bitcoin-private-signet.conf`
- Bitcoin data dir: `/var/lib/bitcoind-private-signet`
- Private Open Name Tags env file: `/etc/ont/ont-private.env`

Current systemd units:

- `bitcoind-signet.service`
- `ont-resolver.service`
- `ont-web.service`

Private signet systemd units:

- `bitcoind-private-signet.service`
- `ont-private-resolver.service`
- `ont-private-web.service`

## Serving Under A Path Prefix

The web app can also run behind a path prefix such as `/ont`.

Set this in `/etc/ont/ont.env`:

```bash
ONT_WEB_BASE_PATH=/ont
```

Then restart the web service:

```bash
systemctl restart ont-web
```

This is useful if another app reverse-proxies a path like `https://example.com/ont` to the VPS.

## Useful Commands

SSH in:

```bash
ssh -i ~/.ssh/<your-key> root@<server-ip>
```

Check services:

```bash
systemctl status bitcoind-signet
systemctl status ont-resolver
systemctl status ont-web
```

Tail logs:

```bash
journalctl -u bitcoind-signet -f
journalctl -u ont-resolver -f
journalctl -u ont-web -f
```

Check Bitcoin sync:

```bash
bitcoin-cli -conf=/etc/bitcoin-signet.conf -datadir=/var/lib/bitcoind getblockchaininfo
```

Check resolver locally on the server:

```bash
curl -s http://127.0.0.1:8787/health | jq
```

Check web locally on the server:

```bash
curl -s http://127.0.0.1:3000/api/health | jq
```

## Current Limitations

This is a prototype deployment, not a production-hardened stack.

Current tradeoffs:

- the app services run the TypeScript `dev` entrypoints under `tsx`
- there is no reverse proxy yet
- there is no TLS yet
- the resolver uses local snapshot files, not a durable database backend
- the live resolver currently tracks from the configured launch height forward

That is good enough for live signet validation and protocol prototyping.

## Recommended Next Steps

The next improvements I would make are:

1. add a reverse proxy in front of the web app
2. add TLS with a real domain
3. move the resolver/indexer to a more durable backend
4. run a real signet auction bid flow against this node

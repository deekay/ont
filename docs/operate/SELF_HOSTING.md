# Self-Hosting

This is the easiest path for running your own Open Name Tags stack without depending on the hosted website or resolver.

The Compose stack in this repo gives you:

- your own `ont-web`
- your own `ont-resolver`
- optional one-shot `ont-indexer`

It does **not** force you to run a Bitcoin node on day one. The quickest path uses the bundled fixture chain so you can verify the product locally first, then switch to your own Bitcoin RPC or an Esplora backend later.

## What “Run Your Own Stack” Means Here

There are three progressively more sovereign ways to use ONT:

1. run the hosted website
2. run your own ONT website + resolver
3. run your own ONT website + resolver + Bitcoin backend

This guide covers `2` directly and makes `3` straightforward by letting you point the stack at your own node.

## Quick Start

Prerequisites:

- Docker Desktop or Docker Engine with Docker Compose
- a local checkout of this repo

From the repo root:

```bash
npm run selfhost:init
npm run selfhost:doctor
npm run selfhost:up
```

Then open:

```text
http://127.0.0.1:3000
```

That default mode uses the bundled fixture chain, so you get:

- your own website
- your own resolver state
- your own local detail/explorer experience
- no dependency on the hosted product

If the doctor step fails, fix the reported item and rerun it. The most common first-time issue is simply not having Docker installed yet.

For a brand-new machine, the normal first pass is:

1. `npm run selfhost:init`
2. `npm run selfhost:doctor`
3. install Docker if the doctor says it is missing
4. rerun the doctor
5. `npm run selfhost:up`

## Services

### `resolver`

This is the long-running read API and embedded indexer.

It serves:

- name lookup
- auction state
- recent activity
- provenance detail
- signed destination records

### `web`

This is the browser-facing product surface.

It serves:

- lookup
- explore
- auction bid prep
- transfer prep
- setup and key tools

### `indexer`

This is optional and disabled by default.

Use it when you want a one-shot indexed dump:

```bash
npm run selfhost:indexer
```

## Switching To A Live Chain

The easiest next step after the fixture demo is to point the stack at your own Bitcoin Core node.

Edit `.env` and replace the fixture settings with:

```bash
ONT_SOURCE_MODE=rpc
ONT_EXPECT_CHAIN=signet
ONT_BITCOIN_RPC_URL=http://host.docker.internal:38332
ONT_BITCOIN_RPC_USERNAME=ontrpc
ONT_BITCOIN_RPC_PASSWORD=replace-me
ONT_WEB_NETWORK_LABEL=Self-Hosted Signet
```

Then restart:

```bash
npm run selfhost:up
```

Notes:

- On macOS and Windows Docker Desktop, `host.docker.internal` is usually the easiest way to reach a node running on your host machine.
- If your Bitcoin node is another container, use its service name instead.
- If you switch chain backends or want to rebuild state from scratch, reset the local volume:

```bash
npm run selfhost:reset
```

## Using Esplora Instead

If you do not want to expose Bitcoin RPC, you can point the resolver at an Esplora-compatible endpoint:

```bash
ONT_SOURCE_MODE=esplora
ONT_EXPECT_CHAIN=signet
ONT_ESPLORA_BASE_URL=https://blockstream.info/signet/api
ONT_WEB_NETWORK_LABEL=Self-Hosted Signet (Esplora)
```

This is useful for convenience, but it is less sovereign than using your own Bitcoin node.

## Launch Height Handling

In live-chain modes, the container entrypoint will automatically set `ONT_LAUNCH_HEIGHT` from your RPC or Esplora backend if:

- `ONT_LAUNCH_HEIGHT` is unset, and
- no local snapshot exists yet

That makes first startup much easier. The resolver starts from the current tip by default instead of replaying the entire history unless you explicitly choose otherwise.

## Persisted Data

Compose stores resolver/indexer state in the named Docker volume `ont_data`.

That includes:

- resolver snapshot
- destination-record store
- optional one-shot indexer snapshot

## Trust Model

Running your own stack changes the trust story:

- you no longer depend on the hosted website for browsing or prep
- you no longer depend on the hosted resolver for ownership state
- if you also use your own Bitcoin backend, the entire read path becomes yours

For high-value auction or transfer preparation, the strongest path is your own
resolver, local tooling, and your own signer.

## What This Does Not Package Yet

This Compose stack does **not** yet include:

- a bundled Bitcoin Core container
- a bundled private signet demo network
- multi-resolver publish
- production reverse-proxy / TLS setup

If you want the full VPS layout, including running the node yourself on a server you control, use:

- [VPS_SETUP.md](./VPS_SETUP.md)

## Useful Commands

Start:

```bash
npm run selfhost:up
```

Stop:

```bash
npm run selfhost:down
```

Preflight:

```bash
npm run selfhost:doctor
```

Reset state:

```bash
npm run selfhost:reset
```

One-shot indexer dump:

```bash
npm run selfhost:indexer
```

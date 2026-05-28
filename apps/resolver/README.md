# @ont/resolver — ONT resolver reference

The reference resolver: indexes a Bitcoin chain (or replays a fixture) and
serves the read API the wallet uses — name records, value records, recovery
descriptors, transaction provenance, and (during launch) live auction state.

A resolver **serves data**. It has no authority over names. The wallet's
correctness comes from verifying everything against Bitcoin (via
`@ont/consensus`); the resolver is just a convenient data plane. Anyone can
run one.

## Run it

Three source modes. Pick one with `ONT_SOURCE_MODE`.

### Fixture mode (default — no Bitcoin needed)

```sh
npm run dev:resolver
# or with options:
ONT_SOURCE_MODE=fixture \
ONT_FIXTURE_PATH=fixtures/demo-chain.json \
ONT_RESOLVER_PORT=8787 \
npm run dev -w @ont/resolver
```

Loads a pre-baked chain fixture from disk. Useful for development, local
demos, and integration tests (see `apps/wallet/scripts/live-resolver-smoke.sh`
for an example). The default fixture is `fixtures/demo-chain.json`; auction
fixtures live in `fixtures/auction/lab/`.

### RPC mode (live Bitcoin node)

```sh
ONT_SOURCE_MODE=rpc \
ONT_BITCOIN_RPC_URL=http://user:pass@127.0.0.1:38332 \
ONT_LAUNCH_HEIGHT=200000 \
npm run dev -w @ont/resolver
```

Polls a Bitcoin Core node over JSON-RPC for blocks starting at
`ONT_LAUNCH_HEIGHT`. Requires `txindex=1` on the Bitcoin node so the
resolver can fetch arbitrary transactions for provenance lookups.

### Esplora mode (third-party data plane)

```sh
ONT_SOURCE_MODE=esplora \
ONT_ESPLORA_BASE_URL=https://mempool.space/signet/api \
ONT_LAUNCH_HEIGHT=160000 \
npm run dev -w @ont/resolver
```

For lighter-weight deployments that don't want to run a Bitcoin Core node.
Same data, different transport. Note: trusts the esplora endpoint not to lie
about block contents — wallets re-verify the relevant facts on their own
against Bitcoin proofs, so resolver dishonesty narrows liveness but not
safety.

## Environment variables

| Var | Default | What |
|---|---|---|
| `ONT_RESOLVER_PORT` | `8787` | TCP port |
| `ONT_SOURCE_MODE` | `fixture` | One of `fixture`, `rpc`, `esplora` |
| `ONT_FIXTURE_PATH` | `fixtures/demo-chain.json` | Fixture file (fixture mode only) |
| `ONT_EXPERIMENTAL_AUCTION_FIXTURE_DIR` | `fixtures/auction/lab` | Per-name auction fixtures |
| `ONT_BITCOIN_RPC_URL` | — | Bitcoin Core RPC URL (rpc mode) |
| `ONT_ESPLORA_BASE_URL` | — | Esplora API base (esplora mode) |
| `ONT_RPC_POLL_INTERVAL_MS` | `10000` | How often to poll the chain |
| `ONT_LAUNCH_HEIGHT` | — | Block height to start indexing from |
| `ONT_RPC_END_HEIGHT` | — | Stop indexing at this height (one-shot mode) |
| `ONT_EXPECT_CHAIN` | `signet` | Sanity check (one of main/signet/testnet/regtest) |
| `ONT_VALUE_STORE_PATH` | `.data/value-records.json` | Where to persist value records |
| `ONT_RECOVERY_DESCRIPTOR_STORE_PATH` | `.data/recovery-descriptors.json` | Recovery descriptor storage |
| `ONT_RECOVERY_WALLET_PROOF_STORE_PATH` | `.data/recovery-wallet-proofs.json` | Recovery wallet-proof storage |
| `ONT_SNAPSHOT_PATH` | (none) | Where to persist indexer snapshots |
| `ONT_DATABASE_URL` | — | Optional postgres URL — when set, persistence uses postgres instead of JSON files |

## Endpoints

Read:
- `GET /info` — minimal metadata
- `GET /health` — liveness
- `GET /stats` — current height, processed blocks, tracked names
- `GET /names` — all names known to the resolver
- `GET /experimental-auctions` — live auction state
- `GET /activity` — recent on-chain events
- `GET /tx/{txid}` — provenance for a transaction
- `GET /utxo/{txid}/{vout}` — UTXO status (RPC mode only)
- `GET /name/{name}` — name record
- `GET /name/{name}/activity` — recent events for a name
- `GET /name/{name}/value` — current value record
- `GET /name/{name}/value/history` — full value record chain
- `GET /name/{name}/recovery` — current recovery descriptor
- `GET /name/{name}/recovery/history` — full recovery descriptor chain
- `GET /recovery-proofs/{proof_hash}` — fetch a published wallet-proof

Write:
- `POST /values` — publish a signed value record (verified before accept)
- `POST /recovery-descriptors` — publish an owner-armed recovery descriptor
- `POST /recovery-proofs` — publish a BIP322 recovery wallet proof

## Smoke test

```sh
npm run smoke:fixture -w @ont/resolver
```

Starts the resolver in fixture mode on an ephemeral port, checks every read
endpoint responds with the expected shape, then tears it down. Use this
after any change to validate the HTTP surface didn't regress.

## Test

```sh
npm test -w @ont/resolver    # store-level tests
```

The HTTP surface is covered by the smoke test above (and by
`apps/wallet/scripts/live-resolver-smoke.sh`, which runs wallet commands
against a real resolver).

## Persistence

In `fixture` mode with no `ONT_DATABASE_URL`, the resolver writes value
records, recovery descriptors, and recovery proofs to JSON files at the
paths above. They're append-only (with cryptographic chain checks); safe
to read but don't hand-edit. Setting `ONT_DATABASE_URL` switches everything
to postgres-backed storage.

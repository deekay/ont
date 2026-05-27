# @ont/wallet — ONT reference client (work in progress)

A small, open reference client for ONT. The goal is a runnable wallet that does the
full name lifecycle (claim → own → verify → update → transfer), reusing the existing
`@ont/*` packages for the on-chain machinery and using a Lexe node only for the
cheap-claim Lightning payment.

## What's here so far

- **`keys.ts` / `keystore.ts`** — on-device, password-encrypted store for the **owner
  key** (the key that controls a name) and a funding key. AES-256-GCM, key derived from
  the password via scrypt, so a copy of the file is *storage*, not *recovery authority* —
  without the password it's opaque. The owner key lives here, deliberately *not* inside a
  Lightning node's credential or a cloud backup we don't control.
- **`resolver.ts`** — thin client for an ONT resolver's read/publish API: a name's current
  ownership state, its destination (value) record, and its owner-armed recovery descriptor;
  plus publishing owner-signed value records and recovery descriptors. A resolver serves
  data — it holds no authority over names (ownership is a fact on Bitcoin).
- **`wallet-state.ts`** — a local, plaintext cache of the names this wallet tracks (name,
  owner pubkey, on-chain ownership ref, last destination, armed recovery). Convenience, not
  authority: if it's lost, re-derive it from a resolver.
- **`signer.ts`** — signs the funding (P2WPKH) inputs of an auction-bid or transfer PSBT
  with the keystore's funding key, finalizes, and extracts the broadcastable transaction.
  The owner key never signs an *input* here — it's committed in the OP_RETURN payload (for a
  transfer, that's the owner-signed authorization built by `@ont/architect`).
- **`broadcast.ts`** — opt-in push of a signed transaction to an Esplora-style API
  (mempool.space by default; your own node via `ONT_BROADCAST_URL`). The only place the
  wallet sends bytes to the network, and never without `--broadcast`.
- **`utxos.ts`** — looks up the funding address's spendable outputs over the same Esplora
  API so `claim` can auto-fund and `balance` can report what's spendable.
- **`lightning.ts`** — the Lightning payment adapter. `LexeSidecarLightningPayer` talks
  to a [Lexe](https://lexe.app) node through its local sidecar REST server
  (`http://localhost:5393`); `StubLightningPayer` is the offline stand-in for dev/tests.
  The sidecar is language-agnostic, so this is plain HTTP — no Lexe SDK, no enclave. This
  is the payment leg of the *cheap batched-claim rail* (designed, not yet live), not of the
  on-chain auction path below.

## Try it

```sh
npm run demo -w @ont/wallet
```

walks the self-contained lifecycle on regtest (create keystore → build a bid package →
build + sign an on-chain opening-bid claim → show tracked state) with no external services.

## Run it

Run from source with `tsx` via the workspace `dev` script:

```sh
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- init             # create a keystore
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- info             # network, pubkey, funding address
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- address          # print the funding address
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- balance          # spendable funding UTXOs (Esplora)
                       npm run dev -w @ont/wallet -- lookup <name>   # a name's state + destination
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- set-destination <name> <type> <value>
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- names            # names this wallet tracks
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- track <name>     # track a name you own
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- forget <name>    # stop tracking locally
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- arm-recovery <name> <address>
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- claim --bid-package <path> \
    --input <txid:vout:valueSats:address> --fee-sats <n> [--bond-address <a>] \
    [--change-address <a>] [--bond-vout 0|1]    # build + sign an opening-bid claim
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- transfer <name> --to <pubkey> \
    --prev-state-txid <txid> --bond-input <utxo> --successor-bond-sats <n> \
    --successor-bond-vout <0|1> --fee-sats <n> [--input <utxo>]    # build + sign a transfer
                       npm run dev -w @ont/wallet -- verify <proof.json>
                       npm run dev -w @ont/wallet -- ln-info [baseUrl]   # query a Lexe sidecar
```

`claim` consumes a canonical auction-bid-package JSON (the format `@ont/cli`'s
`create-auction-bid-package` emits), verifies its committed owner pubkey is this wallet's
owner key, builds the opening-bid PSBT (bond/change default to the funding address), signs
the funding inputs, and prints a broadcastable transaction. This is the **on-chain auction
path**, the acquisition route that works on signet today.

When `--input` is omitted, `claim` auto-funds from the wallet's funding address by querying
its UTXOs over the same Esplora API (`balance` shows them). `claim` and `transfer` build and
sign locally and only send when you pass `--broadcast`. The Esplora base is mempool.space by
default for signet/testnet/mainnet; set `ONT_BROADCAST_URL` or `--broadcast-url`/`--esplora-url`
for your own node (required on regtest).

Environment: `ONT_WALLET_KEYSTORE` (default `ont-wallet.json`), `ONT_WALLET_STATE`
(default `ont-wallet-state.json`), `ONT_WALLET_PASSWORD`, `ONT_WALLET_NETWORK`
(default `signet`), `ONT_RESOLVER_URL` (default `http://127.0.0.1:8787`).

## Next

- source auction state straight from a resolver's `/experimental-auctions` so `claim` can
  build its own bid package (instead of taking a pre-built one), and look up funding UTXOs
  via `/utxo/{txid}/{vout}`.
- broadcast the signed claim (and transfers) directly — `@ont/bitcoin` / an esplora POST —
  then verify the resulting ownership via `@ont/consensus`.
- the **cheap batched-claim rail**: the small ₿1,000 gate paid over Lightning through the
  adapter above (a natural use-case for a Lexe node). Designed, not yet live.
- exact Lexe sidecar `pay` request/response schema (confirm against docs.lexe.tech), and
  wiring against a real node.

Status: design + prototype — not a mainnet wallet. See
[`../../docs/research/ONT_WALLET_AND_ONBOARDING_DIRECTION.md`](../../docs/research/ONT_WALLET_AND_ONBOARDING_DIRECTION.md).

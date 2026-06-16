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
                       npm run dev -w @ont/wallet -- auctions [--name <n>] [--phase <p>]  # discover live auctions
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- set-destination <name> <type> <value>
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- names            # names this wallet tracks
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- bids             # tracked auction bids + bond status
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- track <name>     # track a name you own
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- forget <name>    # stop tracking locally
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- sync [name]      # reconcile names + bid bonds w/ resolver
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- arm-recovery <name> <address>
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- claim <name> --amount <n> --fee-sats <n> \
    [--resolver <url>] [--bidder-id <id>]       # claim from a resolver's live auction
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- claim --bid-package <path> --fee-sats <n> \
    [--input <txid:vout:valueSats:address>]     # claim from a pre-built bid package
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- transfer <name> --to <pubkey> --fee-sats <n> \
    [--resolver <url>]                          # transfer; auto-sources prev-state + bond
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- transfer <name> --to <pubkey> --fee-sats <n> \
    --prev-state-txid <txid> --bond-input <utxo> --successor-bond-sats <n>  # fully offline
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- export-proof <name> [--out <path>]
                       npm run dev -w @ont/wallet -- verify <proof.json>
                       npm run dev -w @ont/wallet -- ln-info [baseUrl]   # query a Lexe sidecar
```

The wallet talks to a Lightning node only for the cheap-claim rail's payment leg (not yet wired
end-to-end). The `LightningPayer` adapter (`lightning.ts` — Lexe sidecar + offline stub) is the
integration point that future `claim --rail cheap` will use; we don't expose a standalone `pay`
command because the wallet isn't a general-purpose Lightning wallet — any LN wallet can pay an
invoice, the value of the integration is making a name claim atomic with its payment.

`claim <name> --amount <n>` fetches the live auction from a resolver's `/experimental-auctions`
and builds the bid package for you, committing this wallet's owner key. (You can still pass a
pre-built `--bid-package` JSON — the format `@ont/cli`'s `create-auction-bid-package` emits —
for offline use; the committed owner pubkey is checked against the keystore.) Either way it
builds the opening-bid PSBT (bond/change default to the funding address), signs the funding
inputs, and prints a broadcastable transaction. This is the **on-chain auction path**, the
acquisition route that works on signet today. `claim` works in any live auction phase —
opening, live bidding, soft close — and hard-fails (rather than burning a tx) when the bid
preview says the consensus would reject it (below current minimum, too early, closed).

`auctions [--name <n>] [--phase <p>]` lists live auctions a resolver knows about — what's
biddable, the current required minimum, blocks to close. The starting point for discovering a
name you want.

**Bid bonds are tracked.** Every bid the wallet builds records its bond outpoint in local
state, marked locked until `sync` reads the resolver's auction state and reports
`losing_bid_releasable` / `winner_releasable` / `rejected_not_tracked`. Auto-fund (for both
`claim` and `transfer`) excludes locked or unknown bid bonds — spending one before its release
is a consensus-level slashing condition. `bids` shows everything you have in flight.

`transfer <name> --to <pubkey>` mirrors `claim`: it reads the name's current state txid and bond
outpoint from the resolver (the bond address defaults to the funding address — where the
wallet's own claims/transfers send it), reuses the current bond amount for the successor, and
auto-funds the fee from the remaining UTXOs. Pass `--prev-state-txid`, `--bond-input` and
`--successor-bond-sats` to run fully offline.

When `--input` is omitted, `claim` auto-funds from the wallet's funding address by querying
its UTXOs over the same Esplora API (`balance` shows them). `claim` and `transfer` build and
sign locally and only send when you pass `--broadcast`. The Esplora base is mempool.space by
default for signet/testnet/mainnet; set `ONT_BROADCAST_URL` or `--broadcast-url`/`--esplora-url`
for your own node (required on regtest).

`sync [name]` reconciles tracked names against a resolver: when it reports this wallet as the
owner, the wallet adopts the confirmed ownership ref + status and clears a provisional
pending-claim marker (so a `claim` that lands shows up as owned). It never grants the resolver
authority — ownership is still a Bitcoin fact.

`export-proof <name>` assembles a portable ownership proof bundle from resolver data (the
winning L1 auction bid, its bond, the current owner) and verifies it locally with
`@ont/consensus` before emitting — so it never hands out a bundle it knows is invalid. The
result is self-verifying: anyone can `verify` it offline without trusting the resolver that
served it. (A name transferred since its auction can't be proven by an L1-auction bundle yet —
that needs the transfer chain.)

Environment: `ONT_WALLET_KEYSTORE` (default `ont-wallet.json`), `ONT_WALLET_STATE`
(default `ont-wallet-state.json`), `ONT_WALLET_PASSWORD`, `ONT_WALLET_NETWORK`
(default `signet`), `ONT_RESOLVER_URL` (default `http://127.0.0.1:8787`).

## Next

- extend `export-proof` to cover transferred names (include the transfer chain) and the value
  record chain, so a proof reflects post-auction history.
- the **cheap batched-claim rail**: the small ₿1,000 gate paid over Lightning through the
  adapter above (a natural use-case for a Lexe node). Designed, not yet live.
- exact Lexe sidecar `pay` request/response schema (confirm against docs.lexe.tech), and
  wiring against a real node.

Status: design + prototype — not a mainnet wallet.

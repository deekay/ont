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
- **`lightning.ts`** — the Lightning payment adapter. `LexeSidecarLightningPayer` talks
  to a [Lexe](https://lexe.app) node through its local sidecar REST server
  (`http://localhost:5393`); `StubLightningPayer` is the offline stand-in for dev/tests.
  The sidecar is language-agnostic, so this is plain HTTP — no Lexe SDK, no enclave.

## Run it

Run from source with `tsx` via the workspace `dev` script:

```sh
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- init             # create a keystore
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- info             # network, pubkey, funding address
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- address          # print the funding address
                       npm run dev -w @ont/wallet -- lookup <name>   # a name's state + destination
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- set-destination <name> <type> <value>
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- names            # names this wallet tracks
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- track <name>     # track a name you own
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- forget <name>    # stop tracking locally
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- arm-recovery <name> <address>
                       npm run dev -w @ont/wallet -- verify <proof.json>
                       npm run dev -w @ont/wallet -- ln-info [baseUrl]   # query a Lexe sidecar
```

Environment: `ONT_WALLET_KEYSTORE` (default `ont-wallet.json`), `ONT_WALLET_STATE`
(default `ont-wallet-state.json`), `ONT_WALLET_PASSWORD`, `ONT_WALLET_NETWORK`
(default `signet`), `ONT_RESOLVER_URL` (default `http://127.0.0.1:8787`).

## Next

- the unified **claim flow** wiring the existing packages (`@ont/architect` PSBT build →
  `@ont/cli` signer → `@ont/bitcoin` broadcast → `@ont/consensus` verify), with the
  Lightning leg going through the adapter above. The on-chain auction-opening-bid is the
  acquisition path that works on signet today; the cheap batched-claim rail is designed but
  not yet live.
- exact Lexe sidecar `pay` request/response schema (confirm against docs.lexe.tech), and
  wiring against a real node.

Status: design + prototype — not a mainnet wallet. See
[`../../docs/research/ONT_WALLET_AND_ONBOARDING_DIRECTION.md`](../../docs/research/ONT_WALLET_AND_ONBOARDING_DIRECTION.md).

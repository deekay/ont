# @ont/wallet — ONT reference client (work in progress)

A small, open reference client for ONT. The goal is a runnable wallet that does the
full name lifecycle (claim → own → verify → update → transfer), reusing the existing
`@ont/*` packages for the on-chain machinery and using a Lexe node only for the
cheap-claim Lightning payment.

## What's here so far

- **`keystore.ts`** — on-device, password-encrypted store for the **owner key** (the
  key that controls a name). AES-256-GCM, key derived from the password via scrypt, so
  a copy of the file is *storage*, not *recovery authority* — without the password it's
  opaque. The owner key lives here, deliberately *not* inside a Lightning node's
  credential or a cloud backup we don't control.
- **`lightning.ts`** — the Lightning payment adapter. `LexeSidecarLightningPayer` talks
  to a [Lexe](https://lexe.app) node through its local sidecar REST server
  (`http://localhost:5393`); `StubLightningPayer` is the offline stand-in for dev/tests.
  The sidecar is language-agnostic, so this is plain HTTP — no Lexe SDK, no enclave.

## Run it

```sh
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- init [path]    # create a keystore
ONT_WALLET_PASSWORD=… npm run dev -w @ont/wallet -- status [path]  # show the owner pubkey
npm run dev -w @ont/wallet -- ln-info [baseUrl]                    # query a Lexe sidecar
```

## Next

- the unified **claim flow** wiring the existing packages (`@ont/architect` PSBT build →
  `@ont/cli` signer → `@ont/bitcoin` broadcast → `@ont/consensus` verify), with the
  Lightning leg going through the adapter above.
- exact Lexe sidecar `pay` request/response schema (confirm against docs.lexe.tech), and
  wiring against a real node.

Status: design + prototype — not a mainnet wallet. See
[`../../docs/research/ONT_WALLET_AND_ONBOARDING_DIRECTION.md`](../../docs/research/ONT_WALLET_AND_ONBOARDING_DIRECTION.md).

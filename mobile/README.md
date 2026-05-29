# Open Name Tags — iOS app

A React Native / Expo client for ONT (Open Name Tags), the Bitcoin-anchored
sovereign name-ownership system. It reuses the TypeScript engine's logic by
porting the verification + signing cores directly into the app, so the roots,
leaves, and signatures it computes match the publisher and resolver exactly.

> New here? Read **HANDOFF.md** for the current status, what's verified, and the
> open decisions.

## Run it

```sh
npm install
npx expo run:ios     # build + install on a simulator (first run / native deps)
npx expo start       # JS dev server for subsequent runs
```

Targets the live hosted stack at `opennametags.org` (`/api` resolver + `/esplora`
shim) out of the box — no local backend required for the read-only screens or the
wallet.

## What's inside

| Area | Files | Status |
| --- | --- | --- |
| Read-only explorer (Explore / Auctions / Activity) | `src/screens/*`, `src/api/*` | live |
| Wallet: on-device key gen/import + Keychain storage | `src/wallet/keys.ts`, `store.ts`, `WalletContext.tsx` | live |
| Name accumulator (verify) | `src/wallet/accumulator.ts` | verified vs engine |
| Cheap-rail claim (quote → verify → submit → verify proof) | `src/wallet/claim.ts`, `src/api/publisher.ts`, `src/screens/ClaimScreen.tsx` | walkable in **demo mode** (mock publisher); uses a live publisher when `PUBLISHER_BASE` is set + demo off |
| Demo mode (signet stub for Lexe-shaped pieces) | `src/DemoMode.tsx`, `src/api/mock-publisher.ts` | on by default; toggle on Wallet. Fakes the service/payment, not the crypto |
| Value-record signing (BIP340 Schnorr) | `src/wallet/value-record.ts` | verified vs engine (bidirectional) |
| Value-record **write** (sign → publish → read back) | `src/wallet/value-write.ts`, `src/api/resolver.ts`, `src/screens/SetValueScreen.tsx` | live · proven against the private signet |

## Crypto stack (Hermes-proven)

`bitcoinjs-lib@7` · `ecpair@3` · `@bitcoinerlab/secp256k1` · `@noble/curves` ·
`@noble/hashes` · `buffer`. Polyfills load first in `index.ts`
(`globalThis.Buffer` + `crypto.getRandomValues` via `expo-crypto`).
`metro.config.js` aliases `tiny-secp256k1` → `@bitcoinerlab/secp256k1`.

## Configuration

`src/config.ts`:
- `ONT_HOST` — hosted stack (`https://opennametags.org`)
- `NETWORK` — `signet`
- `PUBLISHER_BASE` — cheap-rail publisher; `null` by default (claim flow stays
  inert until a reachable publisher is configured)
- `BASE_UNITS_PER_USD` / display: Bitcoin-first `₿<integer>` with a `~$` helper.

## Trust model

The app grants no service authority over a name. Publisher quotes are checked to
commit to exactly `H(name)` and this wallet's owner key before payment; inclusion
proofs are verified against their anchored accumulator root before any claim is
recorded; value records are Schnorr-signed locally and are wire-compatible with
the resolver. Secrets never leave the device except on explicit reveal-for-backup.

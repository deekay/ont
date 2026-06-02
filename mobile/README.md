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
| Encrypted backup + restore | `src/wallet/backup.ts`, `backup-provider.ts`, `src/screens/BackupScreen.tsx` | real AEAD (scrypt + XChaCha20-Poly1305); local-stub storage, swappable for Drive/iCloud |
| Value-record signing (BIP340 Schnorr) | `src/wallet/value-record.ts` | verified vs engine (bidirectional) |
| Value-record **write** (sign → publish → read back) | `src/wallet/value-write.ts`, `src/api/resolver.ts`, `src/screens/SetValueScreen.tsx` | live · proven against the private signet (demo mode signs without publishing) |
| Recovery-descriptor **write** (designate a recovery wallet) | `src/wallet/recovery-descriptor.ts`, `recovery-write.ts`, `src/screens/RecoveryScreen.tsx` | byte-exact vs engine; live write blocked only by the public proxy (see Known gaps) |
| Auction bid | `src/api/mock-auction.ts`, `src/screens/AuctionDetailScreen.tsx` | walkable demo bid (real minimum + bidder commitment; bond/broadcast simulated) |
| My ONT (owned names + leading auctions) | `src/screens/MyNamesScreen.tsx` | live from the resolver, filtered by owner key |
| Deposit / funding | `src/screens/DepositScreen.tsx` | funding address + live balance |

## Verify

```sh
npm run typecheck      # tsc, strict
npm run check:crypto   # offline: mobile crypto == engine, byte-for-byte
```

## Crypto stack (Hermes-proven)

`bitcoinjs-lib@7` · `ecpair@3` · `@bitcoinerlab/secp256k1` · `@noble/curves` ·
`@noble/hashes` · `buffer`. Polyfills load first in `index.ts`
(`globalThis.Buffer` + `crypto.getRandomValues` via `expo-crypto`).
`metro.config.js` aliases `tiny-secp256k1` → `@bitcoinerlab/secp256k1`.

## Configuration

`src/config.ts` is keyed by network:
- `ACTIVE_NETWORK` — the single switch; `"signet"` today. Flip to `"main"` (and
  set the mainnet host) to point the whole app at mainnet.
- `NETWORK` / `NETWORK_LABEL` / `ONT_HOST` / `API_BASE` / `ESPLORA_BASE` — derived
  from the active network.
- `DEMO_MODE_DEFAULT` — `true`; demo mode stubs the Lexe-shaped externals.
- `PUBLISHER_BASE` — live cheap-rail publisher; `null` by default.
- `BASE_UNITS_PER_USD` / display: Bitcoin-first `₿<integer>` with a `~$` helper.

## Trust model

The app grants no service authority over a name. Publisher quotes are checked to
commit to exactly `H(name)` and this wallet's owner key before payment; inclusion
proofs are verified against their anchored accumulator root before any claim is
recorded; value records and recovery descriptors are Schnorr-signed locally and
are wire-compatible with the resolver. Demo mode fakes external services (the
Lightning payment, cloud storage, the auction bond) but never the cryptography.
Secrets never leave the device except on explicit reveal-for-backup, or as a
client-side-encrypted blob you choose to back up.

## Known gaps

- **Recovery-descriptor live write** is byte-exact vs the engine and works against
  the resolver, but the public `opennametags.org/api` returns 405 for
  `POST /recovery-descriptors` (it routes `POST /values` to the resolver but not
  this path). Needs the public proxy's write allowlist updated — a shared-infra
  change. In demo mode the recovery flow signs locally without publishing.
- **Real cloud backup** (Google Drive / iCloud) needs a Google OAuth client + an
  Apple Developer/CloudKit setup; the local-stub provider stands in until then.
- **Mainnet + real Lightning** is the deliberate later flip (`ACTIVE_NETWORK`).

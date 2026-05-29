# ONT iOS app — morning handoff

Built overnight, autonomously, against the "make the iOS app, trust your judgment"
mandate. This is the state of things and the few decisions left to you. Nothing
here has been committed — `git status` is untouched until you say so.

## TL;DR

- **It runs.** A real Expo / React Native iOS app, on the booted iPhone 17 Pro
  simulator, talking to live `opennametags.org` for all read data.
- **The hard risk is retired.** The full ONT crypto stack — secp256k1 key
  derivation, the sparse-Merkle name accumulator, and BIP340 Schnorr signing —
  bundles *and executes under Hermes*, proven on-device. This was the make-or-break
  question for "React Native reusing the TypeScript engine," and the answer is yes.
- **Two engine bindings are ported and proven bit-exact against the engine:** the
  cheap-rail claim verification, and value-record signing.
- **One deliberate decision is yours:** the cheap-rail claim is fully implemented
  but *inert*, because activating it means exposing the localhost-only publisher
  or pointing at a reachable one. I did not change infrastructure and did not
  submit any live claim. Details below.

## What's built and verified

### Read-only app (Tiers 1) — live
Four tabs, all rendering live data from the validated `/api` + `/esplora` surface:
- **Explore** — name search + records
- **Auctions** — live auction phases from `/experimental-auctions`
- **Activity** — recent indexed events
- **Wallet** — keys, funding balance, infra health

Screenshots: `/tmp/ont-shots/01-explore.png` … `08-final-explore.png`.

### Wallet (Tier 2) — live, on-device
- On-device key generation: owner key (x-only Schnorr, controls the name) +
  funding key (P2WPKH, pays fees/bonds). Mirrors `apps/wallet/src/keys.ts`.
- Import existing keys (owner private key hex + funding WIF).
- Secrets stored in the iOS Keychain via `expo-secure-store`
  (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); revealed only on explicit tap for backup.
- Funding address balance via live esplora UTXO query.

### Cheap-rail claim (Tier 3) — implemented, verified, **inert** (see decision)
The flat-gate (~₿1,000) path of the ONT one-path model: cheap claim → notice/
contest window → only a contested name goes to a bonded auction.

- `src/wallet/accumulator.ts` — self-contained port of the engine's name
  accumulator (sparse Merkle tree, depth 256, domain-separated SHA-256) and
  `verifyAccumulatorProof`.
- `src/api/publisher.ts` — port of the publisher HTTP client (`fetch`-based).
- `src/wallet/claim.ts` — the trust checks: a quote must commit to exactly
  `H(name)` and to this wallet's owner key before any payment; a "confirmed"
  receipt's inclusion proof must verify against its own anchored root, commit the
  right leaf, and commit *this* wallet's owner key — otherwise nothing is recorded.
  A cheap claim is surfaced as **provisional**: it finalizes only if uncontested
  once its notice window (6 blocks) closes.
- `src/screens/ClaimScreen.tsx` — the UI (reachable from Wallet → "Claim a name").

Screenshots: `09-claim-gated.png` (the inert state + live `H(name)` leaf preview),
`10-schnorr-selftest.png` (the on-device Schnorr proof, since reverted).

### Value-record signing (part of Tier 3) — implemented, verified
- `src/wallet/value-record.ts` — faithful port of
  `packages/protocol/src/value-record.ts`: the canonical length-prefixed digest
  and BIP340 Schnorr signing/verification. This is the owner-key *signing* pillar
  (recovery descriptors share the identical shape).

### Demo mode — the cheap-rail claim is now walkable on signet
Lexe-shaped pieces that don't exist on the private signet (the Lightning payment;
cloud backup) are stubbed so the whole app is walkable. **Demo mode is on by
default** (toggle on the Wallet screen).
- `src/api/mock-publisher.ts` — `MockPublisherClient`: synthetic quote, a
  simulated payment, and a receipt whose inclusion proof is **real** — built
  against a self-consistent single-leaf accumulator root, so the app's real
  `verifyConfirmedReceipt` / `verifyAccumulatorProof` runs and passes for the
  right reasons. Only the service/payment/anchor are faked, never the crypto.
- `src/DemoMode.tsx` — runtime flag; the Claim screen picks the mock vs a real
  publisher off it. Proven by `/tmp/ont-demo-claim-check.mts` (accepts the real
  proof, rejects tampering). Turn demo off + set `PUBLISHER_BASE` for a live
  publisher with no other code changes.

### Value-record WRITE (Tier 3) — live, proven against the private signet
The first authorized live write from the app. The owner key signs a value record
and publishes it to the resolver; the resolver re-verifies signature, owner,
ownershipRef, and exact-next sequence before recording it.
- `src/api/resolver.ts` — `publishValue()` (POST `/values`).
- `src/wallet/value-write.ts` — `publishNameValue()` orchestration: reads the
  resolver's current view of the name, *refuses to sign unless this wallet is the
  current owner*, chains onto the live head (next sequence + prev hash), signs,
  self-verifies, then publishes. `readValueState()` exposes the current
  ownership/value-chain state for the UI.
- `src/screens/SetValueScreen.tsx` — the UI (Wallet → "Set a name's value", and
  an owner-gated "Set value" button on a name's detail page).
- **Proven live (2026-05-29):** signed seq 5 for the test-owned name `canyon`
  through the real app modules against `opennametags.org/api`; the resolver
  accepted it and serves it back (`recordHash fcf806…78d0`), and a wrong-key write
  is refused locally before any POST. The full app re-bundles clean under Hermes
  with the new modules (`expo export` → `.hbc`).

## The crypto milestone (why this de-risks everything)

React Native runs on Hermes, not a browser or Node, and the ONT engine leans on
secp256k1 + SHA-256. Whether the pure-JS crypto stack would *execute* under Hermes
was the project's biggest open risk. It does:

- **secp256k1** — owner x-only pubkey + P2WPKH funding address derived on-device
  (`@bitcoinerlab/secp256k1`, drop-in for `tiny-secp256k1`).
- **SHA-256 accumulator** — the Claim screen renders the live `H(name)` leaf,
  which is `@noble/hashes/sha2` running in Hermes.
- **BIP340 Schnorr** — sign + verify roundtrip ran green on-device
  (`@noble/curves/secp256k1`, randomness via the `expo-crypto` polyfill).

The RN crypto stack: `bitcoinjs-lib@7` + `ecpair@3` + `@bitcoinerlab/secp256k1` +
`@noble/curves` + `@noble/hashes` + `buffer`, with crypto polyfills loaded first in
`index.ts`. Metro's default config already resolves bitcoinjs v7's dual CJS/ESM
exports to CJS for Hermes; `metro.config.js` adds a defensive `tiny-secp256k1`→
`@bitcoinerlab/secp256k1` alias.

## Verification — what I actually checked (not just "it compiles")

Each binding was cross-checked against the **real engine** offline before I trusted it:

- **Accumulator** (`/tmp/ont-acc-check.mts`): key derivation matches the engine for
  every test name; membership + non-membership proofs built by the engine verify
  under the mobile port; wrong-root, flipped-value, and forged-membership proofs
  are all rejected. Bit-exact.
- **Claim trust checks** (`/tmp/ont-claim-check.mts`): good quote/receipt accepted;
  foreign owner, wrong-name leaf, flipped root, and missing proof/anchor all
  rejected; notice window computed as `anchorHeight + 6`.
- **Value-record signing** (`/tmp/ont-vr-check.mts`): identical owner-pubkey
  derivation and byte-identical canonical digest; **mobile-signed records verify
  under the engine and engine-signed records verify under the mobile port**
  (full wire interop); tampering with any field breaks verification.
- **Whole-app typecheck**: `npx tsc --noEmit` → clean.
- **Hermes bundle**: Metro bundled the entire graph (HTTP 200, ~7.8 MB, no errors)
  with the new binding modules present.

These three `.mts` scripts live in `/tmp` (throwaway). Say the word and I'll fold
them into the repo as proper `*.test.ts` so they run in CI against the engine.

## How to run it

The simulator is already booted with the app installed and Metro running.
From scratch:

```sh
cd /Users/davidking/dev/ont/mobile
npx expo run:ios        # build + install (first time / native changes)
# or, if already installed and you just want the JS:
npx expo start          # then press i, or relaunch the installed app
```

Booted sim: iPhone 17 Pro, iOS 26.2, UDID `14F1C438-E463-47F0-B796-91E764919C72`,
bundle id `org.opennametags.mobile`. Screenshot with:
`xcrun simctl io <UDID> screenshot out.png`.

## The one decision that's yours: activating the cheap rail

The cheap-rail claim is code-complete and its verification is proven. It stays
inert for one reason: **`config.PUBLISHER_BASE` is `null`.** The hosted publisher
runs bound to localhost on the infra host and isn't publicly reachable, so there
is no URL to point the app at.

I treated "expose the publisher" and "submit a live claim" as **outside** the
"build the app" mandate — they're changes to / writes against shared production
infra, and that's your call, not mine. So I built the flow to be correct and
*ready*, and the Claim screen shows an honest "publisher not configured · inert"
state until you decide.

To activate, you have two paths (your choice):
1. Point `PUBLISHER_BASE` at a reachable publisher (e.g. an SSH tunnel to the
   box's `:7878` for testing — the simulator shares the Mac's loopback), or
2. Expose the publisher behind the existing Caddy surface with appropriate
   auth/rate limits, the way `/api` and `/esplora` are exposed.

Either way the client-side guarantee is unchanged: it verifies every publisher
response against the anchored accumulator root before recording anything.

## What's left (tracked as task #60)

- **Value-record / recovery WRITE** — ✅ *done.* The value-record write path is now
  wired and proven live against the private signet (see "Value-record WRITE" above).
  Recovery descriptors share the identical shape, so the same `publishValue`-style
  client extends to `/recovery-descriptors` when wanted.
- **Auction bid**: the bonded second-price L1 bid is the heaviest remaining piece
  (PSBT + on-chain bond + live auction state). The RN bitcoinjs/Schnorr stack it
  needs is proven, but a bid is a real on-chain write against a live auction; I did
  not ship an unverified signer. This is the natural next build once there's a
  funded test account and an active auction lot to act on.

## Conventions honored

- Bitcoin-first display: `₿<integer>` with an approximate `~$` helper anchored at
  ₿1,000 ≈ $1. The legacy unit name never appears in UI prose. (JSON field names
  like `gateBaseSats` are literal wire identifiers, used only in code.)
- Only `opennametags.org` is referenced.
- Notice window stays at 6 blocks.
- One-path model framing: cheap claim is provisional, finalizes if uncontested.

## What I did not touch

No commits. No production infra changes. No live claims or bids. The one live
write performed — explicitly authorized — was a single value record (seq 5) for
the throwaway test name `canyon` on the **private signet**, to prove the app's
write path end-to-end. No real user's name was touched, and no secret/credential
material was read. Other than that one record, the only writes were to the
`mobile/` app source and these notes.

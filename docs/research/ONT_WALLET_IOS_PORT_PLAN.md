# Going to iOS — options and a recommended path

Written so we can make this decision deliberately rather than by default. The
CLI (`@ont/wallet`) is the engine and works; the question is what shape an
iOS client takes and how much of the engine to share.

## Why iOS at all

§4 of the wallet direction doc names native mobile as the primary platform.
The concrete reasons that still hold:

- **The phone's secure element** (Apple Secure Enclave / Android StrongBox) is
  the natural place to hold the owner key. Not required (armed recovery +
  client-side-encrypted backup gets us the not-takeable property even with
  software storage), but it's the right hardening default.
- **Where users are.** A mobile wallet is the only realistic on-ramp for
  non-technical adoption.
- **Sparrow + manual PSBT dance is the alternative.** A mobile wallet
  replaces that crutch.

What we do *not* need iOS for: protocol correctness, signet testing,
demonstrating the architecture to Lexe. The CLI covers those.

## Three architectures, ordered by effort

### Option A: Full native Swift port

Reimplement the wallet end-to-end in Swift: keystore (CryptoKit AES-GCM + scrypt),
secp256k1 (use `swift-secp256k1` or libsecp256k1 via SPM), Schnorr (libsecp256k1's
`schnorrsig_sign`), bitcoinjs-lib equivalent (BitcoinKit or hand-roll P2WPKH
PSBT plumbing), resolver/esplora HTTP clients, the whole wallet flow.

- **Pro:** native UX, no JS runtime, secure element integration straightforward,
  smallest IPA.
- **Con:** maximum duplication. Every protocol change (e.g., a new event type)
  needs to land in two places. The TS code is the reference implementation;
  Swift is a re-derivation. Hard to keep them in lock-step.
- **Effort:** ~3-6 weeks for a single developer to reach feature parity with
  the current CLI. The bitcoinjs-lib equivalent is the biggest unknown — no
  single Swift library covers PSBT-level construction with the OP_RETURN
  customization ONT needs.

### Option B: React Native + the TS engine

Use the existing TS code as-is via React Native (with `node` polyfills where
needed: `Buffer`, `crypto.randomBytes` — many crypto libs already ship RN
shims). The wallet logic lives in the same `@ont/wallet` package; the iOS app
is a thin React Native shell that calls into it.

- **Pro:** one codebase. Every protocol change lands once. Faster iteration.
  Same TS engine that's in the CLI, same tests.
- **Con:** the secure element integration is awkward — you bridge through a
  native module (`react-native-keychain` or a custom JSI bridge) to store
  the owner key, but everything else stays in JS. App size is bigger
  (~10-20 MB JS bundle baseline). Less native feel.
- **Effort:** ~1-2 weeks to a working app. The hard parts (PSBT, Schnorr,
  protocol) are already done in TS.

### Option C: Native Swift shell calling a small TS engine

Compile a slim TS bundle (just the ONT primitives — protocol/architect/consensus,
no node deps) to a JavaScriptCore-friendly form. The Swift app handles UI,
storage (Keychain / secure element), networking, and broadcasts. The TS bundle
is loaded via `JSContext` (built into iOS) and called for PSBT construction,
proof verification, etc.

- **Pro:** native UI + native secure element + single source of truth for
  protocol logic. The "hard math" stays in TS where it's already correct.
- **Con:** more architecturally novel. The bridge layer needs care
  (serialization across JSC, error propagation). PSBT builds run in JSC
  which is slower than native — though once-per-claim, that's fine.
- **Effort:** ~2-3 weeks. Half native iOS UI, half bridge plumbing.

## Recommendation

**Start with Option B (React Native + TS engine).** Reasons:

1. **Lowest divergence risk.** ONT is still evolving (auction policy, the
   cheap-claim rail, recovery invoke). One codebase means every protocol
   change is one PR. Re-deriving the protocol in Swift before it's frozen
   would mean constant catch-up work.
2. **Fastest path to "users can actually test."** The user testing goal
   from the chat update is the immediate motivation. RN gets a working app
   in the user's hand soonest.
3. **The secure element gap is real but tractable.** RN's `react-native-keychain`
   wraps Keychain (which can use the Secure Enclave for the storage key).
   For our threat model — owner key encrypted at rest, decrypted only on
   user-presence biometric — that's enough. We don't yet need the key
   *itself* to be enclave-resident.
4. **Re-evaluate at v1.** Once the protocol settles and we ship a v1, the
   case for a native Swift port (Option A or C) gets stronger. Doing it
   then is a deliberate "we know what we're building" port, not a parallel
   re-derivation while things are still moving.

## What to actually build first (RN path)

A focused MVP, not a full app:

1. **Onboarding screen:** create or restore keystore. Owner key generated
   locally (via existing `generateOwnerKey`), encrypted with a passphrase
   (or biometric-gated key in Keychain). Funding key likewise.
2. **Home screen:** balance (Esplora UTXO sum), my names (the wallet's
   tracked names + their status), pending bids.
3. **Discover screen:** auctions list, name search. Same data as the CLI's
   `auctions` command.
4. **Claim screen:** pick a name, set amount, review, sign, broadcast.
   Same logic as `claim --amount`. The user signs by entering passphrase
   or via Face ID.
5. **Name detail screen:** show ownership status, current destination,
   `set-destination` form, `arm-recovery` form, `transfer` form.
6. **Settings:** export proof, view recovery descriptor history, backup
   options.

What we'd *skip* in v0: `pay` (no LN UI yet), `watch` (the app polls on
foreground), `bids` (folded into pending bids on home).

## Open questions to raise with the user / Lexe before kicking off

1. **App branding / identity.** Is this "ONT" as a standalone wallet, or
   shipped inside lexe's app as a tab, or both?
2. **Biometrics policy.** Face ID gate for every signature, or only for
   transfers above a threshold?
3. **Recovery UX.** How does the user "arm recovery" on mobile — pick a
   second device, a friend, a custodial backup service? This is a UX
   design question, not a protocol one.
4. **Distribution.** App Store, TestFlight, or sideload-first via
   altstore / signed IPA? Direction doc §4 says "sideloadable" matters
   for neutrality.

These should land before any iOS code begins, since they shape the entire
app structure.

## Bottom line for the morning

The CLI is enough to demonstrate the architecture, run signet tests, and
have the Lexe conversation. **iOS is the right next step after that
conversation, not before** — both because we need lexe's read on the
collaboration shape (independent ONT app vs. an ONT tab inside lexe), and
because the protocol-side decisions still in flight (recovery invoke,
cheap-claim rail, transferred-name proofs) will affect screens.

If the answer after the lexe conversation is "build an independent ONT
app," start with Option B (React Native), the MVP screens above, and
expect ~2 weeks to a TestFlight build.

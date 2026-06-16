# B5-WALLET classification — the `ont-wallet` clean-build triage

> **Status: TRIAGE (B5-WALLET classify-first). Writer: ClaudeleLunatique. Reviewer: ChatLunatique.** Old
> `apps/wallet` (@ont/wallet, bin `ont-wallet`, ~4.7k) is quarantined at `legacy/apps/wallet`. CL-concurred
> kickoff (event 3a78f55a): scoped quarantine, classify-first, a boundary-lint crypto/signing exemption
> narrowly keyed to the clean `apps/wallet` surface, signing-core first then W17 package flows on that API.
> On `clean-build-b5`.
>
> **The wallet is the ONE surface allowed to own keys + signing** (and the only one exempt from the
> boundary-lint crypto/signing deny — `@noble/*`, `@scure/*`, `bitcoinjs-lib`, `ecpair`, `tiny-secp256k1`). It
> still **consumes the B4/B5 adapters** for all rules (claim/transfer/auction/proof) — it re-encodes no
> consensus/transfer/auction logic. Tests-first per slice; hermetic (no live network); CLI/claim handoff
> crosses a **mockable wallet API**, not a signing-library import in those surfaces.
>
> **Calls:** KEEP = clean-build wallet command/core (owns keys/signing; consume-don't-reimplement for rules).
> EDGE = network I/O (broadcast/UTXO fetch) — purpose/scope/tests note, live-smoke deferred. DROP = old HTTP
> clients the CLI now owns / not-authority local state / signet-demo residue.

## First slice — the signing / key-material core (KEEP)

The wallet API the CLI/claim DELEGATE to. Deterministic input validation + explicit signed-artifact output;
no broadcast edge; tests prove the handoff crosses a mockable API.

| old module | call | clean replacement | first slice |
|---|---|---|---|
| `keys` | KEEP | owner-key derivation from the 12-word secret (`m/696969'/0'/i'`, x-only) — consume `@ont/protocol deriveOwnerPubkey` + the BIP-39/32 path; the wallet owns the secret | ✅ |
| `keystore` | KEEP | on-device password-encrypted key store (the wallet owns key material) | ✅ |
| `signer` | KEEP | the signing API: owner-key signatures over value-records / recovery-descriptors / recovery-wallet-proofs (consume `@ont/protocol signValueRecord` / `signRecoveryDescriptor` / `createRecoveryWalletProof`) + PSBT input signing (the one place `bitcoinjs-lib`/`tiny-secp256k1` are allowed) | ✅ |

## KEEP — later slices (W17 package flows + export, layered on the signing API)

| old module | call | clean replacement |
|---|---|---|
| `bid-package` | KEEP | W17 auction-bid package assembly + signing (consume `@ont/protocol createAuctionBidPackage`; map a resolver-read auction state, do NOT re-derive auction rules) |
| `transfer-plan` | KEEP | W17 transfer package assembly + signing (consume `@ont/protocol transfer-package` + the **adapter** name-record read for bond inputs — must CONSUME, not re-derive the bond/transfer rule) |
| `proof-export` | KEEP | assemble a portable ownership proof bundle (consume resolver data + `@ont/consensus` proof-bundle; the self-verifying value-record chain — clears the legacy 2/72 proof-export carry-forward) |

## EDGE (note; no unit core — purpose/scope/tests, live-smoke deferred)

| old module | call | reason |
|---|---|---|
| `broadcast` | EDGE | submit a signed tx to an Esplora/node port — network I/O, like B4-PUB-BROADCAST; live smoke deferred |
| `utxos` | EDGE | spendable-output lookup via Esplora — the PSBT-signing core consumes PROVIDED UTXOs through an injected port; fetching is edge |

## DROP

| old module | call | reason |
|---|---|---|
| `publisher-client` | DROP | HTTP client to the publisher — the CLI/operator owns publish; RISKS.md flags it independently re-derives the leaf (a re-encode the clean wallet must not carry) |
| `resolver` | DROP | HTTP client to the resolver — resolver reads are the CLI's job (B5-CLI `CliReadPort`); the wallet receives reads via handoff, it does not run its own resolver client |
| `wallet-state` | DROP | local plaintext "names this wallet considers its own" — NOT authority (ownership is on-chain); convenience/old-model, re-derivable |
| `lightning` | DROP/PARK | Lightning funding adapter — signet-demo / funding path, not core to the wallet's signing role; PARK for a later funding decision if a clean-build funding surface is wanted |

## Totals + next step

12 modules → **3 KEEP first-slice (keys/keystore/signer = the signing+key core)**, **3 KEEP later (W17
bid/transfer packages + proof-export)**, **2 EDGE (broadcast/utxos)**, **4 DROP (publisher-client/resolver/
wallet-state/lightning)**. First slice = the signing/key-material core: a mockable wallet signing API that the
CLI DELEGATE commands (`sign-*`, `submit-*` signing legs) and the claim site attach to. KEEP requires
consume-don't-reimplement for rules; the crypto/signing libs are allowed ONLY here. The boundary-lint gains a
narrowly-keyed `apps/wallet` crypto exemption when the clean code lands.

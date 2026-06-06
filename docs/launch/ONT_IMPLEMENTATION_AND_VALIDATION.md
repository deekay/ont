# ONT Implementation And Validation

A concrete, honest status of what is actually built, what is prototype, and what
is stubbed — so a reviewer can calibrate the claims. Canonical design + the
solved/prototype/open framing live in [`../ONT_DESIGN_BRIEF.md`](../ONT_DESIGN_BRIEF.md)
and [`../ONT.md`](../ONT.md); this is the implementation snapshot.

The consensus core, wire formats, and signatures are real and cross-checked
byte-for-byte against a second (mobile) implementation. The honest distinction a
reviewer should hold is **real-and-on-chain** vs **library/CLI-only** vs
**stubbed**.

## Status table

| Area | Status | Notes |
| --- | --- | --- |
| Owner-key transfer (gift) | **Built + on-chain (signet)** | Engine-validated; CLI/desktop broadcast to a real chain; mobile signs for real and broadcasts a mature-name transfer end-to-end. |
| Sale / immature-sale transfer | **Library + CLI demo only** | `@ont/architect` builders + `apps/cli` `submit-sale-transfer` / `submit-immature-sale-transfer` commands + tests. **Not** wired into any wallet/web/mobile UI; today it requires manual two-party CLI coordination. |
| Owner-signed value records | **Built + on-chain (signet)** | Sequence-numbered, predecessor-linked, ownership-interval-scoped; resolver ingests/serves; clients verify without trusting the resolver; CLI multi-resolver fan-out/compare. |
| Recovery descriptors | **Built + on-chain (signet)** | Owner-armed, owner-vetoable (recovery, not revocation). The on-chain invoke path is partially specified. |
| Contested auction — on-chain bonded bid | **Built + on-chain (signet)** | Returnable bond output + OP_RETURN bid payload, engine-validated (bond value = bid at `bondVout`); resolver derives auction state from observed `AUCTION_BID` txs; settled winner materializes into an owned name. |
| Cheap ₿1,000 claim — Lightning rail | **Structure wired, payment stubbed** | `apps/publisher` quote → invoice → pay → verify exists, but invoice creation + payment verification are stub / Lexe-sidecar interfaces. v1 is a **pay-first flow with reputable publishers** (pay, then included; a non-payer is left out); atomic payment-on-inclusion binding is a longer-term research item, not a v1 dependency. The wallet does not pay a real Lightning invoice for a claim today. |
| Accumulator cheap-rail → canonical state | **Prototype, not wired** | `batch-rail` is built and unit-tested (insert commutativity, fail-closed DA convergence vs. a withholding adversary), but the live indexer does **not** ingest it — so cheap claims are not yet canonical resolver state. |
| Publisher | **Single-writer prototype** | The leaderless multi-publisher convergence design is simulated and tested, not deployed. |
| Mobile wallet | **HD (BIP32), seed-backed** | One seed → a per-name owner key (`m/696969'/0'/i'`) + a funding key (`m/84'/1'/0'/0/0`); seed backup/restore proven on signet; keys in the device keystore. |
| Desktop / CLI wallet | **Single-key** | One owner key + one funding WIF; not HD, no seed recovery (WIF import only). |
| Proof bundle | **Structure + Bitcoin verify** | `verifyProofBundleStructure` (internal consistency) + `verifyProofBundleAgainstBitcoin` (Merkle inclusion + header proof-of-work). Producers do not yet *emit* bundles carrying inclusion proofs, so the light-client path is not closed end-to-end. |

## Validated

- Passing unit/package tests across `@ont/protocol`, `@ont/core`, `@ont/cli`,
  `@ont/wallet`, `@ont/web`, `@ont/resolver`; mobile typecheck + offline
  crypto cross-checks that assert byte-identical agreement with the engine.
- Private-signet smoke proving real on-chain `AUCTION_BID`, transfer, value-record,
  and recovery-descriptor activity (not just fixtures).
- See [TESTING.md](../core/TESTING.md).

## Still open / not done (do not imply otherwise)

- The accumulator-rail launch engine wired into the canonical indexer.
- A real Lightning payment for the cheap claim (v1 = pay-first with reputable publishers; atomic payment-on-inclusion binding is later research, not a v1 dependency).
- Leaderless multi-publisher deployment + a discovery mechanism.
- Light-client proof bundles emitted end-to-end.
- Final notice/DA windows, bond floors, and maturity (placeholders today).
- Batched transfers / batched value-record updates; a polished browser signing flow.

## Where to go next

[`ONT_ACQUISITION_STATE_MACHINE.md`](../design/ONT_ACQUISITION_STATE_MACHINE.md) ·
[`CONTESTED_AUCTION_REFERENCE.md`](./CONTESTED_AUCTION_REFERENCE.md) ·
[`AUCTION_SETTLEMENT_AND_OWNERSHIP.md`](./AUCTION_SETTLEMENT_AND_OWNERSHIP.md) ·
[`../ONT_DESIGN_BRIEF.md`](../ONT_DESIGN_BRIEF.md) (risks, alternatives, open questions).

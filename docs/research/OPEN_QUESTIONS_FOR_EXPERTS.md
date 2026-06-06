# Open Questions for Domain Experts

Sharp, prepped questions to put to specific domain experts when the chance arises.
Kept here so the framing isn't re-derived each time. Working notes, not design.

---

## Lightning / PTLC availability — RESOLVED (do not pursue near-term)

**Feedback (Max, Lightning · 2026-06-05):** for this case, **don't add technical complexity for
trust-minimization** — the amount at risk per claim is tiny (~₿1,000 / ~$1), so an adaptor-bound
construction (PTLCs and similar) isn't worth the complexity for the small risk it removes.

**Decision:** ONT does **not** treat PTLCs — or any adaptor-conditional Lightning payment — as a
near-term design tradeoff. v1 uses a **pay-first flow with reputable publishers** (pay, then
included; a non-payer is simply left out — see
[`../design/ONT_ISSUANCE_FEE_MECHANICS.md`](../design/ONT_ISSUANCE_FEE_MECHANICS.md)). Atomically
binding the off-chain payment to on-chain inclusion is a **longer-term research item**, deferred,
with no v1 dependency on a specific primitive.

The earlier framing — designing *for* PTLCs, or bridging via ECDSA-adaptor + hash-locked HTLCs — is
retired as a near-term question. If atomic binding is revisited later, it reopens here.

---

## Wallet / LN-node substrate requirements

**Why it matters:** the ONT client layer is best built on top of an existing non-custodial,
always-online, programmable Lightning node rather than a wallet from scratch. The open questions are
what capabilities such a substrate must expose:

1. **Arbitrary PSBT construction / sign / broadcast** on the on-chain side (custom outputs, an
   `OP_RETURN`) vs. only high-level "send to address"? (decides whether the contested-name bonded
   auction, transfers, recovery, and the self-claim L1 fallback can live in the app rather than
   bouncing to an external signer) — **Max (2026-06-05) advised [BDK](https://bitcoindevkit.org),
   the *Rust* Bitcoin Dev Kit, as the right substrate here**: the on-chain Bitcoin wallet for the
   publisher's tx signing and for the mobile app. BDK is Rust-native, exposed to other languages via
   `bdk-ffi` / UniFFI (Swift/Kotlin for mobile, `bdk-rn` for React Native) and a Rust binding or
   service on the publisher side — so adopting it **introduces a Rust component alongside today's
   TypeScript**. Current code is `bitcoinjs-lib` + Esplora; BDK (Rust) is the recommended direction,
   not yet adopted. Open: how the Rust wallet layer interoperates with the TS engine/clients (FFI
   boundary, where signing lives, build/release implications for the RN app).
2. **A separate, on-device-only owner key** outside any cloud-backup flow — i.e. *not* derived from the
   node's root seed? (the ONT owner key controls a name permanently; it must not ride an LN
   credential's convenience backup)
3. **Backup threat model** — at first login, what lands in cloud storage (just the
   client-side-encrypted root seed)? What's the threat model for the cloud provider + a weak user
   password? (confirms "storage, not recovery authority")

*Not required:* adaptor-conditional / payment-on-inclusion Lightning capability — explicitly out of
scope for v1 (see the resolved Lightning/PTLC section above). v1 pays publishers pay-first.

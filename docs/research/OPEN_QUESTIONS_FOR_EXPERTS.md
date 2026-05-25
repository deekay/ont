# Open Questions for Domain Experts

Sharp, prepped questions to put to specific domain experts when the chance arises.
Kept here so the framing isn't re-derived each time. Working notes, not design.

---

## Lightning / PTLC availability (for a Lightning protocol expert)

**Why it matters:** ONT's trust-minimized claim flow ("option 3") binds a ₿1,000 (~$1) Lightning
payment to a specific on-chain event — the publisher reveals an adaptor secret when it
broadcasts a particular anchor tx, and that secret unlocks the payment. PTLCs / adaptor
signatures are the clean primitive. We need to decide whether to design *for* PTLCs as an
assumed capability or design *around* their absence. See
[`../design/ONT_ISSUANCE_FEE_MECHANICS.md`](../design/ONT_ISSUANCE_FEE_MECHANICS.md).

**The question:**

1. The milestone that matters to us isn't "spec'd" or "in one implementation" — it's **two
   endpoints doing a PTLC/adaptor-bound payment in production**. Our swap is bilateral
   (user ↔ a specific publisher, plausibly a direct channel or the publisher acting as a swap
   provider), so I think we need *endpoint* support, not network-wide multi-hop routability.
   Right? And does that pull the realistic date in a lot?
2. If we *did* need multi-hop PTLC routing, how far is "reliably routable across the graph" vs.
   the bilateral case? How much is gated on simple-taproot-channel adoption vs. the PTLC
   payment-point work itself?
3. Will end-user wallets realistically expose adaptor-conditional payments, or does this stay
   infra/LSP-level for the foreseeable future?
4. Today, without PTLCs, can we get the same trust-minimized binding with **ECDSA adaptor sigs +
   hash-locked HTLCs** (submarine-swap style — HTLC preimage = the adaptor secret)? What do we
   give up (privacy, interop, UX), and is that an acceptable bridge until PTLCs land?

Over/under date for "we can ship the bilateral version in production"?

**Load-bearing nuance:** Q1 — if a direct user↔publisher channel suffices, we only need *both
endpoints* to support PTLCs, not the whole network, which could be the difference between
"years out" and "doable now with custom software."

---

## Lexe founders (substrate for an ONT wallet)

**Why it matters:** the plan is to build the ONT client layer on top of a non-custodial,
always-online, programmable LN node (Lexe is the reference shape) rather than a wallet from scratch —
build-on-top + upstream PRs, not a fork. See
[`ONT_WALLET_AND_ONBOARDING_DIRECTION.md`](./ONT_WALLET_AND_ONBOARDING_DIRECTION.md).

1. Does the SDK/sidecar expose **conditional payments / adaptor signatures bound to an external
   on-chain event** today? If not, would you take it as an upstream contribution? (decides
   build-on-top vs. upstream-PR for the trust-minimized swap)
2. Can an ONT integration hold a **separate, on-device-only owner key entirely outside the Google-Drive
   backup flow** — i.e., *not* derived from the node's root seed? (the ONT owner key controls a name
   permanently; it must not ride the LN credential's convenience backup)
3. At first login, exactly what lands in Google Drive — just the **password/client-side-encrypted**
   root seed? What's your threat model for Google + a weak user password? (confirms "storage, not
   recovery authority")
4. Your read on **PTLC vs. ECDSA-adaptor-today** for a bilateral user↔publisher swap. (You may be the
   Lightning expert above, or adjacent.)
5. Appetite to be the **flagship ONT-compatible wallet**, or do you prefer ONT builds entirely on top?

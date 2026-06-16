# B4 parked decisions — decision-ready packets for DK

> **Status: ANALYSIS / ADVISORY (proposed). Writer: ClaudeleLunatique. Reviewer: ChatLunatique.** Three items
> surfaced during B4 that need a DK ruling before they harden. **None blocks B4** — B4 is complete and each
> adapter proceeds on the recommended assumption with a flagged reopen. Each packet below is gap → options →
> recommendation → ripple, marker-fold style. Stable names are PROPOSED; DK assigns the DECISIONS.md number on
> ratification. No code changes from this doc.

---

## 1. `event-carrier` — the on-chain carrier for >80-byte events

**Gap.** `WIRE_FORMAT` defines the event *frame + payload* but does not pin **how a >80-byte event is carried
in a Bitcoin output**. The largest events exceed the 80-byte OP_RETURN *standardness* relay limit: Transfer
135 B, RecoverOwner 171 B, AuctionBid up to 184 B (WIRE §4.6). The B4 adapters (publisher assemble + indexer
read) currently use **OP_RETURN + PUSHDATA1** (`6a 4c <len> <payload>`, ≤255 B) — but that carrier is not
normative anywhere.

**Key distinction:** the 80-byte limit is **relay/standardness policy, NOT consensus.** A confirmed block can
contain a larger OP_RETURN, and the indexer reads *confirmed* bytes regardless of relay policy. So the carrier
question is "how do we reliably get the tx mined," not "is it valid."

**Options.**
- **(A) OP_RETURN + PUSHDATA1 (current).** One output, `6a 4c <len> <payload>`. *Pro:* what the indexer already
  reads (`opReturnData` exact single-push); consensus-valid; simplest; one carrier for all event types. *Con:*
  >80 B depends on modern relay policy (e.g. Bitcoin Core ≥ the OP_RETURN-relaxation, or miner direct-submit /
  a relaxed-relay peer); a default-policy node won't relay it.
- **(B) Witness embedding (taproot annex / witness script).** *Pro:* larger capacity, cheaper (witness
  discount), segwit-native. *Con:* much more complex assembly + parsing; reorganizes the whole read-side
  (`opReturnData` → witness reader); ties ONT to taproot spend paths; over-engineered for ≤184 B.
- **(C) Multi-output (split across ≤80 B OP_RETURNs).** *Pro:* each output is standard-relayable. *Con:* needs
  a reassembly + ordering rule (a new normative spec), and multiple OP_RETURNs are themselves non-standard by
  default — solves little.
- **(D) Bare/unspendable script embedding.** *Pro:* historical precedent. *Con:* creates unprovably-unspendable
  UTXOs (UTXO-set bloat), worse than OP_RETURN; discouraged.

**Recommendation: (A) OP_RETURN-PUSHDATA1.** It is consensus-valid, already implemented on both sides, and the
relay concern is operational (use a relaxed-relay submission path / direct-to-miner), not a protocol defect.
Pin it normatively so the carrier is part of canon, not an implicit assumption.

**Ripple if ratified (A):** WIRE_FORMAT §4.x gains a normative **"on-chain carrier"** clause — an ONT event is
carried in a single OP_RETURN output using minimal push (direct push ≤75 B, PUSHDATA1 for 76–255 B); exactly
one ONT OP_RETURN per event; the read-side `opReturnData` exact-single-push rule already enforces it; the
conformance suite adds a carrier vector. Operational note: broadcasting >80 B events requires a relay path
that accepts them (documented in B4-PUB-BROADCAST / the operator runbook). Carriers (B)/(C)/(D) remain
available as a future fork if standardness ever hardens against large OP_RETURNs.

---

## 2. `da-served-transport` — the `/da/{root}` served-bytes serialization

**Gap.** The DA served-bytes transport (`/da/{root}` → the leaf set a resolver serves so a verifier can
reconstruct the anchored root) is **not specified anywhere**. `WIRE_FORMAT` frames on-chain events only;
`@ont/evidence` consumes a `ServedLeaf[]` but never serializes one. B4-DA needed a serialization that does not
exist in canon, and proceeds on the proposal below (B4_ADAPTERS_PLAN §10.1) with a flagged reopen.

**This is off-chain delivery, NOT consensus.** Validity is a pure function of Bitcoin + the presented
commitment-matching bytes; the transport is how those bytes travel. It is still NEW wire/transport spec, so DK
ratifies the format.

**Options.**
- **(A) Minimal binary (proposed):** `version(0x01) ‖ count(u32 BE) ‖ count × (keyHex-bytes(32) ‖
  valueHex-bytes(32))`; total length MUST equal `5 + 64×count` exactly (exact-length firewall); unknown
  version → reject; structural decode only (DATASOURCE owns dedup/disjointness/root reconstruction). *Pro:*
  tiny, exact-length (matches the B4-HEADER discipline), WIRE u32-BE convention, zero ambiguity. *Con:* fixed
  32-byte leaf shape — a future variable-length value needs a v2.
- **(B) Length-prefixed hex / text.** *Pro:* human-debuggable. *Con:* looser, parsing-error surface, larger.
- **(C) JSON.** *Pro:* ubiquitous. *Con:* non-canonical (key order/whitespace), no exact-length firewall,
  heavier — a poor fit for a fail-closed availability check.
- **(D) CBOR.** *Pro:* canonical-capable, compact. *Con:* a dependency + canonicalization rules for little gain
  at this leaf shape.
- **(E) Erasure-coded chunks (DA-sampling future).** The known scaling ceiling; out of scope for the first cut.

**Recommendation: (A) minimal binary.** Smallest, exact-length, canonical-by-construction, and it matches the
recompute-don't-trust posture (the transport carries bytes; the kernel/DATASOURCE decides). Version byte leaves
room for (E) later.

**Ripple if ratified (A):** a new **served-transport** spec section (its own doc or a WIRE_FORMAT appendix —
note it is *off-chain transport*, distinct from the on-chain event wire); B4-DA's `parseServedTransport` is
already the reference parser; erasure-coding (E) named as the future scaling fork behind the version byte.

---

## 3. `refund-accounting` — batched-claim per-leaf loss/refund

**Gap.** In the pay-first batched claim path, a payer funds a claim that the operator batches and anchors. A
leaf can fail downstream — it loses the bond contest (#37), or the batch is incomplete and fails availability
(#83), or a copied-anchor griefs the clock (#83 matrix). **How is the per-payer loss/refund accounted, and
does it need any canonical encoding?** B4-PUB-REFUND ("pay-first + per-leaf loss/refund") was deferred here.

**This is operator economics, NOT consensus.** The kernel decides ownership; it decides nothing about who is
owed a refund. The question is whether refunds need a *canonical* (consensus or wire) encoding at all, or stay
operator-internal bookkeeping.

**Options.**
- **(A) Off-chain operator accounting (no canonical encoding).** The operator's books track payment → leaf →
  outcome and refund out-of-band (Lightning/on-chain payout). *Pro:* zero consensus/wire surface; unblocks
  B4/B5 entirely; matches "the operator runs a market, the chain judges names." *Con:* refunds are a trust-the-
  operator promise, not a cryptographic guarantee (acceptable for a liveness/market function; consistent with
  the da-trust-model firewall doctrine where the operator has liveness power, never theft power).
- **(B) On-chain refund outputs.** The claim/anchor tx (or a follow-up) carries a refund output per failed
  leaf. *Pro:* on-chain auditable. *Con:* needs a normative output convention; bloats the tx; couples refunds
  to the anchor; the failure outcome is often known only *after* the windows close, so a single tx can't
  pre-encode it.
- **(C) Signed refund descriptor (off-chain, value-record-shaped).** A canonical off-chain record the operator
  signs committing to a refund. *Pro:* canonical + verifiable without on-chain cost. *Con:* a new signed
  artifact + its store/serve path; still an operator promise (the operator can decline to sign).

**Recommendation: (A) off-chain operator accounting** for the clean-build's first cut — refund/loss is operator
economics with no consensus surface; keep it out of the kernel and wire entirely. Revisit (C) if/when the
operator model wants a verifiable refund commitment as a product feature. **DK rules whether refunds need ANY
canonical encoding now, or stay operator-internal** (the answer also sets whether B4-PUB-REFUND is ever a
clean-build slice or purely operator tooling).

**Ripple if ratified (A):** B4-PUB-REFUND is struck as a consensus/wire slice — it becomes operator tooling
(out of the B1–B5 gated surface); no WIRE/kernel change; the refund promise is documented as operator
liveness, not protocol guarantee. (B)/(C) remain future economics forks.

---

## Summary slate for DK

| # | name | recommendation | classification | blocks? |
|---|------|----------------|----------------|---------|
| 1 | `event-carrier` | OP_RETURN-PUSHDATA1, pinned normative | wire (carrier) | no — in use |
| 2 | `da-served-transport` | minimal binary v1 | off-chain transport spec | no — in use |
| 3 | `refund-accounting` | off-chain operator accounting (no canonical encoding) | operator economics | no — deferred |

All three are recommend-and-proceed: the adapters already run on the recommended option with a flagged reopen.
DK ratifies (or redirects); on ratification each gets a DECISIONS.md entry + the ripple lands.

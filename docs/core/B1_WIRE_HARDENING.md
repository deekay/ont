# B1 wire-layer hardening — rule extraction and source check

> **Status: PROPOSED — steps 1–2 of the five-step normative hardening**
> (clean-build (#46), Item 1 amendment). This document extracts the wire
> layer's binding rules into crisp invariants (step 1) and records each
> rule's source authority (step 2). It is the attack surface for
> ChatLunatique's adversarial content pass (step 3); accepted attacks become
> the negative tests of the B1 conformance suite (step 4); DK's sign-off
> (step 5) promotes the corresponding spec sections to `normative` in the
> [SOFTWARE_INVENTORY.md](./SOFTWARE_INVENTORY.md) ledger.
> Nothing here is implementable until step 5 completes.

## Scope

**B1 / `@ont/wire` is:** name grammar and normalization; the OP_RETURN
event frame and every event codec; byte-level shapes of claim/bid/transfer/
recovery/value-record material; owner-key derivation and signature
*primitives* (key formats, signature formats, digest definitions);
wire-structural constants (body lengths, frame bytes).

**B1 is NOT:** whether an event changes name state (kernel, B2); economic
parameter values — gate amount, bond floors, windows (kernel/launch
parameters; the wire carries amounts as integers and stays value-free);
gate-fee validation (B2); data-availability deadline verdicts (B2/B3);
proof-bundle construction (B3).

## Extracted invariants

Source-check legend: **cited** = rule has doc authority and can promote;
**candidate-stays** = currently grounded only in code behavior or
unratified docs; needs the named spec PR listed in Gaps before promotion.

### W-GRAMMAR — names

- **W1.** A valid name matches `[a-z0-9]{1,32}`. Nothing else is a name: no
  Unicode, punctuation, whitespace, reserved list, or length-0/33+.
  *Source:* spec/ONT_ACQUISITION_STATE_MACHINE.md §grammar; STATUS key
  numbers; DESIGN.md. **Cited.**
  *Tests:* accept/reject vector table over the boundary (length 1, 32, 33,
  0; each excluded character class); property test `validName ⇒ matches
  regex`.
- **W2.** Normalization is a total function: any input maps to its canonical
  lowercase form or is rejected; normalization is idempotent;
  `normalize(A) = normalize(a)`.
  *Source:* DESIGN.md (normalizeName). **Cited.**
  *Tests:* idempotence property; case-folding vectors; mixed-garbage
  rejection vectors.
- **W3.** On the wire, a name appears only in canonical bytes. A decoder
  MUST reject a payload whose name bytes are non-canonical (e.g. contains
  `A-Z`), rather than normalize silently — two on-chain encodings of the
  same name is malleability.
  *Source:* implied by W1+W2; stated nowhere explicitly.
  **Candidate-stays — needs G1 (wire-format spec PR).** Flag for attack:
  is reject-don't-normalize the right rule?

### W-FRAME — event envelope

- **W4.** Every ONT OP_RETURN payload begins with the 5-byte frame: magic
  `"ONT"` (3 bytes UTF-8) + protocol version (1 byte) + event type (1 byte).
  *Source:* code-pinned (wire.ts, wire-rail.test.ts); enumerated in no spec
  file. **Candidate-stays — needs G1.**
- **W5.** Protocol version is `0x01`. A decoder MUST reject any other
  version (fail closed; no forward-compat guessing). Version-upgrade policy
  is explicitly out of v1 scope — v1's only rule is "not 1 ⇒ reject."
  *Source:* code behavior. **Candidate-stays — needs G1** (the reject rule
  becomes spec text; upgrade policy recorded as explicitly deferred).
- **W6.** Event types are single bytes, enumerated exhaustively in the spec
  (RootAnchor, AvailabilityMarker, Transfer, AuctionBid, RecoverOwner, plus
  any others the spec PR surfaces from `constants.ts`). Unknown event type ⇒
  reject the payload.
  *Source:* code; only AvailabilityMarker=0x0d appears in any doc
  (spec/ONT_DATA_AVAILABILITY_AGREEMENT.md §8). **Candidate-stays — needs
  G1.**

### W-CODEC — per-event shapes and sizes

- **W7.** Pinned framed sizes: RootAnchor **73** bytes (frame + prevRoot 32
  + newRoot 32 + batchSize u32 BE); AvailabilityMarker **41** (frame +
  dataDigest 32 + batchSize u32); Transfer **135** (frame + body 130 =
  prevStateTxid 32 + newOwnerPubkey 32 + flags 1 + successorBondVout 1 +
  signature 64); RecoverOwner **171** (frame + body 166 = transfer-style
  fields + challengeWindowBlocks u32 + recoveryDescriptorHash 32 +
  signature 64); AuctionBid **152** at the 32-char name maximum (fixed 115
  + unlockBlock u32 + nameLength 1 + name ≤32).
  *Source:* STATUS key numbers (171 max, test-pinned); sizes pinned in
  `packages/protocol/src/wire-size.test.ts` + `wire-rail.test.ts` (mining
  source). **Cited for the 171 envelope; candidate-stays for the full
  per-event table — needs G1.**
  *Tests:* byte-identical golden vectors mined from the old suite; the
  "every event ≤ 171" envelope property.
- **W8.** 171 bytes (RecoverOwner) is the wire's maximum event size,
  enforced as a test invariant over *all* event types.
  *Source:* STATUS key numbers, test-pinned. **Cited.**
- **W9.** Multi-byte integers are big-endian unsigned (u32 block counts /
  batch sizes; u64 satoshi amounts). Amounts are integers of satoshis; the
  wire never carries fractional or signed amounts.
  *Source:* code behavior. **Candidate-stays — needs G1.**
- **W10.** `encode` then `decode` is the identity for every well-formed
  event (round-trip property); `decode` rejects: bad magic, bad version,
  unknown type, truncated at any byte offset, trailing bytes, and
  (AuctionBid) the `INCLUDES_NAME` flag unset.
  *Source:* round-trip implied by codec tests; the INCLUDES_NAME
  requirement is enforced at `wire.ts:68-70` and documented nowhere.
  **Candidate-stays — needs G1** (the flag rule especially: it bans
  bare-hash bids, which is a design choice the spec must own).
  *Tests:* property-based round-trip; truncation battery (every prefix
  length of every golden vector must reject); flag-unset negative vector.

### W-KEYS — keys, signatures, derivation

- **W11.** An owner key is a 32-byte x-only public key. Signatures are
  64-byte Schnorr (BIP340-style, no recovery/parity byte) over the digest
  the event defines.
  *Source:* DESIGN.md (owner key / transfer signature); shapes throughout
  spec/ONT_RECOVERY_INVOKE_SPEC.md. **Cited.**
- **W12.** Owner keys derive from the 12-word secret: masterSeed = first 32
  bytes of the BIP-39 seed; owner key i at path `m/696969'/0'/i'`. The same
  12 words MUST derive byte-identical keys in every implementation,
  locked by the shared cross-surface conformance vectors.
  *Source:* STATUS (unified wallet secret row, conformance-locked);
  vectors in engine/web/mobile/`apps/claim/src/keys.conformance.test.ts`
  (mining source). **Cited.**
  *Tests:* the mined 12-word vectors verbatim; gap-scan restore vector.
- **W13.** The transfer digest covers exactly (prevStateTxid,
  newOwnerPubkey, flags, successorBondVout) — byte-precise definition to be
  fixed in the wire spec so independent implementations sign identically.
  *Source:* DESIGN.md states the field list; byte-precise digest layout is
  code-only. **Candidate-stays — needs G1.**
  *Note:* whether a given transfer is *authorized* (current-owner check) is
  kernel (B2). B1 owns only "the digest is these bytes; the signature
  verifies against a given key."

### W-OFFCHAIN — owner-signed off-chain shapes

- **W14.** A value record carries: payload (bounded; current working bound
  65,535 bytes — a kernel/launch parameter, not a wire constant), sequence
  number, predecessor-record hash, owner signature (64). Chain rule
  (sequence exactly +1, hash links to head) is stated for B2/B4 — B1 owns
  only the byte shape.
  *Source:* spec/ONT_ACQUISITION_STATE_MACHINE.md (sequence/predecessor),
  STATUS (payload bound, placeholder). **Candidate-stays — needs G2:** no
  doc specifies the actual encoding (JSON? CBOR? raw struct?); the old
  stack's choice is evidence, not authority.
- **W15.** A recovery descriptor is owner-signed: descriptor payload,
  sha256 descriptor hash (32), owner Schnorr signature (64), optional
  BIP322 recovery-wallet proof.
  *Source:* spec/ONT_RECOVERY_INVOKE_SPEC.md. **Cited** for shape.
  *Note:* the RecoverOwner *authorization semantics* (which key signs the
  on-chain invoke — the spec's own open question a/b/c) is NOT a B1
  question; it blocks B2's recovery-authority hardening and is listed there.
  B1 pins only the 64-byte slot and codec (W7).

## Gaps — named spec PRs required before affected promotion

Per Item 1: gap ⇒ stop ⇒ named spec PR ⇒ then code.

- **G1 — wire-format spec.** There is no normative wire-format document:
  frame bytes, version-reject rule, exhaustive event-type enumeration,
  per-event byte layouts, endianness, canonical-name-bytes rule (W3), and
  the INCLUDES_NAME flag rule live only in `packages/protocol` source and
  tests. Proposed: new `docs/spec/WIRE_FORMAT.md` written from this
  extraction + the mined vectors, entering the ledger as `candidate` and
  hardening within B1. **This is the main B1 spec deliverable; most
  candidate-stays items above promote through it.**
- **G2 — value-record encoding.** Off-chain record encoding is unspecified
  (W14). Either a section of G1's spec PR or its own; blocks the
  value-record part of `@ont/wire`, not the rest of B1.

## Explicitly routed out of B1

| Item | Routed to |
| --- | --- |
| Gate-fee validation (fee ≥ Σ gates) | B2 kernel hardening (spec/ONT_ISSUANCE_FEE_MECHANICS.md) |
| Data-availability deadline windows, marker-vs-folded-anchor | pre-B2 named spec decision + B2/B3 |
| RecoverOwner authorization semantics (open question a/b/c) | B2 recovery-authority hardening |
| Economic parameter values (gate, bonds, windows) | launch-parameter freeze, kernel-side |
| Proof-bundle max sizes | B3 evidence-layer hardening |

## Mining manifest (Item 2 artifacts B1 consumes)

- `packages/protocol/src/wire-size.test.ts` — size pins (W7, W8).
- `packages/protocol/src/wire-rail.test.ts` — anchor/marker codec vectors.
- Root-anchor codec vectors pinned byte-identical against the BDK spike.
- 12-word cross-surface conformance vectors, all four implementations
  (W12).
- `packages/protocol/src/names.ts` test corpus — grammar/normalization
  vectors (W1, W2).

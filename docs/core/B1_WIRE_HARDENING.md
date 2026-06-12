# B1 wire-layer hardening — rule extraction and source check

> **Status: STEPS 1–4 COMPLETE — step 5 (promotion) pending** (clean-build
> (#46), normative-hardening amendment). Steps 1–2: invariant extraction +
> source check (the body of this document). Step 3: ChatLunatique's
> adversarial passes — three hardening rounds, two spec-review rounds, two
> suite-review rounds, two implementation-review rounds, all findings
> fixed. Step 4: the flagged attack surfaces are covered by the B1
> conformance suite (evidence map at the end of this document).
> `@ont/wire` is merged to main as the **candidate-backed implementation**
> (DK's merge order, event f6bf18d4) — the spec it implements is ratified
> but its sections remain `candidate` in the
> [SOFTWARE_INVENTORY.md](./SOFTWARE_INVENTORY.md) ledger until DK's
> per-section promotion ratifications (step 5) complete.

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
- **W2.** *Accepted input* (what a surface lets a user type) is
  case-insensitive: normalization is a total function mapping any input to
  its canonical lowercase form or rejecting it; normalization is
  idempotent; `normalize("Alice") = normalize("alice") = "alice"`.
  *Source:* DESIGN.md (normalizeName). **Cited.**
  *Tests:* idempotence property; case-folding vectors; mixed-garbage
  rejection vectors.
- **W3.** *Canonical name bytes* (what appears on the wire) are stricter
  than accepted input: a name in any encoded payload appears only in its
  canonical form, and a decoder MUST reject a payload whose name bytes are
  non-canonical (e.g. contains `A-Z`), rather than normalize silently —
  two on-chain encodings of the same name is malleability. Normalization
  is a surface/input concern (W2); the wire never normalizes.
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
  (RootAnchor, Transfer, AuctionBid, RecoverOwner; AvailabilityMarker=0x0d
  is **retired — never reuse** per marker-fold (#47), plus
  any others the spec PR surfaces from `constants.ts`). Unknown or retired
  event type ⇒ reject the payload.
  *Source:* code; only AvailabilityMarker=0x0d appears in any doc
  (spec/ONT_DATA_AVAILABILITY_AGREEMENT.md §8). **Candidate-stays — needs
  G1.**

### W-CODEC — per-event shapes and sizes

- **W7.** Pinned framed sizes: RootAnchor **73** bytes (frame + prevRoot 32
  + newRoot 32 + batchSize u32 BE); AvailabilityMarker **41** (frame +
  dataDigest 32 + batchSize u32; retired per marker-fold (#47) — the 41-byte
  layout survives as legacy-codec evidence only); Transfer **135** (frame + body 130 =
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
  envelope property over all event types.
  *W16-ruling ripple:* these are the **legacy** layouts. The AuctionBid
  layout changes under the ruled full-width commitments (see W16); the
  G1 spec states the new table, and the old bid vector remains evidence
  of the legacy codec only.
- **W8.** The wire has a pinned maximum event size, enforced as a test
  invariant over *all* event types. Legacy value: 171 bytes
  (RecoverOwner). Under the W16 ruling the full-width bid (~184 bytes at
  the 32-char name max) becomes the largest event; the G1 spec restates
  the envelope value.
  *Source:* STATUS key numbers, test-pinned (legacy value). **Cited for
  the invariant; the new value lands with G1.**
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
- **W13.** Every **ONT owner-key Schnorr digest** is **domain-separated**:
  SHA-256 over a length-prefixed UTF-8 label followed by the fields, so a
  signature can never be replayed in another context. (Deliberate
  exception: the BIP322 recovery wallet proof signs a normalized *text
  message*, not an ONT hash construction — see W15a; it is an
  address-key signature verified by a BIP322 verifier, outside this rule.)
  The two on-chain authorization digests, byte-precise:
  - transfer: `sha256( lenPrefix("ont-transfer-owner") ‖ prevStateTxid(32)
    ‖ newOwnerPubkey(32) ‖ flags(1) ‖ successorBondVout(1) )`
  - recover-owner: `sha256( lenPrefix("ont-recover-owner") ‖
    prevStateTxid(32) ‖ newOwnerPubkey(32) ‖ flags(1) ‖
    successorBondVout(1) ‖ challengeWindowBlocks(u32 BE) ‖
    recoveryDescriptorHash(32) )`
  where `lenPrefix(s)` = u16 BE byte-length + UTF-8 bytes
  (`packages/protocol/src/events.ts:327-358`).
  *Source:* DESIGN.md states the transfer field list; the domain label and
  byte layout are code-only. **Candidate-stays — needs G1** (the spec must
  state label and layout, or independent implementations sign different
  bytes).
  *Tests:* digest golden vectors per event; cross-context negative test (a
  valid transfer signature MUST NOT verify as a recover-owner authorization
  over the same fields and vice versa).
  *Note:* whether a given transfer is *authorized* (current-owner check) is
  kernel (B2). B1 owns only "the digest is these bytes; the signature
  verifies against a given key."
- **W13a — label inventory.** The protocol's full domain-label set, which
  the wire spec must enumerate so no two contexts share a label:
  `ont-transfer-owner`, `ont-recover-owner` (on-chain auth, length-prefixed
  convention); `ont-value-record` v2 (legacy code value — a GNS→ONT
  rebrand artifact, bumped from `gns-value-record` v1; the spec resets to
  recordVersion 1, legacy digests evidence-only — WIRE_FORMAT §8.1),
  `ont-recovery-descriptor` v1,
  `ont-recovery-wallet-proof` v1, `ont-transfer-package` v1,
  `ont-auction-bid-package` v3 (off-chain envelopes, format+version
  fields); `ont-auction-bidder-v1`, `ont-auction-lot-v1`,
  `ont-auction-state-v1` (auction commitments, NUL-separated UTF-8
  convention, `auction-bid-package.ts:363-412`).
  **Flag for attack:** two separation conventions coexist (length-prefixed
  binary vs NUL-separated text). The spec should either standardize on one
  for new material or document both as frozen; NUL-separation of
  unvalidated text fields is the weaker construction.
  **Candidate-stays — needs G1.**

### W-OFFCHAIN — owner-signed off-chain shapes

- **W14.** A signed value record (`ont-value-record`, recordVersion 2 in
  the legacy source cited here; the spec restates the construction with
  recordVersion 1 — WIRE_FORMAT §8.1) is
  the full field set: `format`, `recordVersion`, `name`, `ownerPubkey`
  (32-byte x-only hex), `ownershipRef` (32-byte hex), `sequence`,
  `previousRecordHash` (32-byte hex or null), `valueType` (1 byte),
  `payloadHex` (see payload-bound note below), `issuedAt` (ISO timestamp),
  `signature`
  (64-byte Schnorr). The signature digest is domain-separated and
  byte-precise: label, version byte, length-prefixed normalized name,
  ownerPubkey, ownershipRef, sequence u64 BE, null-flagged
  previousRecordHash, valueType byte, u16-length-prefixed payload bytes,
  length-prefixed issuedAt (`value-record.ts:142-169`).
  Chain *rules* (sequence exactly +1, hash links to head) are kernel/adapter
  material (B2/B4) — B1 owns shape and digest.
  *Payload bound, two distinct things:* **65,535 bytes is the encodable
  wire bound** — a B1 constant if this format survives, forced by the u16
  payload-length prefix in the digest and enforced at
  `value-record.ts:164,184-185`. A launch policy may *accept* less than
  the encodable bound; that lower cap is the kernel/launch parameter
  STATUS lists. The wire bound is not policy.
  *Source:* spec/ONT_ACQUISITION_STATE_MACHINE.md (sequence/predecessor
  concept), STATUS (accepted-payload cap); field set and digest layout are
  code-only. **Candidate-stays — needs G2** (spec must state the envelope
  encoding and digest layout; the old stack's JSON envelope is evidence,
  not authority).
- **W15.** A signed recovery descriptor (`ont-recovery-descriptor`,
  descriptorVersion 1) carries: `name`, `ownerPubkey`, `ownershipRef`,
  `sequence`, `previousDescriptorHash` (or null), `recoveryAddress`,
  `signingProfile` (default `bip322`), `challengeWindowBlocks` (default
  144), `issuedAt`, owner `signature` (64-byte Schnorr). Its
  domain-separated digest, byte-precise — this digest is both what the
  owner signs and the sha256 "descriptor hash" the on-chain RecoverOwner
  event references:
  `sha256( lenPrefix("ont-recovery-descriptor") ‖ version(1) ‖
  lenPrefix(name) ‖ ownerPubkey(32) ‖ ownershipRef(32) ‖ sequence(u64 BE)
  ‖ nullFlag(previousDescriptorHash) ‖ lenPrefix(recoveryAddress) ‖
  lenPrefix(signingProfile) ‖ challengeWindowBlocks(u32 BE) ‖
  lenPrefix(issuedAt) )` where `nullFlag(x)` = `0x00` if null else `0x01 ‖
  x(32)` (`recovery-descriptor.ts:142-170`).
  *Source:* spec/ONT_RECOVERY_INVOKE_SPEC.md names the surface; field set
  and digest layout are code-only. **Candidate-stays — needs G2.**
  *Tests:* descriptor digest golden vectors; null-vs-present
  previousDescriptorHash pair.
- **W15a.** The recovery wallet proof is a **separate object**
  (`ont-recovery-wallet-proof`, proofVersion 1), not part of the
  descriptor, and it is the one non-Schnorr signature surface. Three
  constructions, byte-precise:
  - *The signed message* is normalized text, not a hash: nine NL-joined
    lines — `"Open Name Tags owner recovery proof"`, then `profile:`,
    `name:`, `prevStateTxid:`, `recoveryDescriptorHash:`,
    `newOwnerPubkey:`, `successorBondVout:`, `challengeWindowBlocks:`,
    `chainTip:` (value `<hash>@<height>` or `unspecified`) — signed BIP322
    by the recovery *address* key and verified by a BIP322 verifier
    (`events.ts:223-233`, `recovery-wallet-proof.ts:158-164`).
  - *The proof hash* is domain-separated:
    `sha256( lenPrefix("ont-recovery-wallet-proof") ‖ version(1) ‖
    lenPrefix(name) ‖ prevStateTxid(32) ‖ recoveryDescriptorHash(32) ‖
    newOwnerPubkey(32) ‖ successorBondVout(1) ‖
    challengeWindowBlocks(u32 BE) ‖ presenceFlag(chainTipBlockHash) ‖
    presenceFlag(chainTipHeight u32) ‖ lenPrefix(recoveryAddress) ‖
    lenPrefix(signingProfile) ‖ lenPrefix(message) ‖
    lenPrefix(signatureBase64) )` with `presenceFlag` = `0x00` if absent
    else `0x01 ‖ value` (`recovery-wallet-proof.ts:174-201`).
  - *The proof commitment* is the 32-byte proof hash concatenated with 32
    reserved zero bytes (64 bytes total;
    `createRecoveryWalletProofCommitment`,
    `RECOVERY_WALLET_PROOF_COMMITMENT_RESERVED_HEX`). The reserved half is
    an undocumented extension slot — the wire spec must state what it is
    for or drop it. **Flag for attack.**
  *Source:* spec/ONT_RECOVERY_INVOKE_SPEC.md (BIP322 proof concept); all
  three layouts code-only. **Candidate-stays — needs G2.**
  *Tests:* message-format golden vector (incl. `unspecified` chain tip);
  proof-hash vectors with/without chain-tip fields; commitment
  reserved-bytes pin.
  *Note:* the RecoverOwner *authorization semantics* (which key signs the
  on-chain invoke — the spec's own open question a/b/c) is NOT a B1
  question; it blocks B2's recovery-authority hardening and is listed
  there. B1 pins only shapes, digests, and the 64-byte slot codec (W7).
- **W16.** The auction commitments carried in the on-chain bid (W7) are
  **truncated hashes**: `bidderCommitment` and `auctionLotCommitment` are
  sha256 of NUL-separated labeled text, truncated to 32 hex chars = **16
  bytes / 128 bits** (`computeAuctionBidderCommitment`,
  `computeAuctionLotCommitment`, `auction-bid-package.ts:363-389`);
  `auctionStateCommitment` (`ont-auction-state-v1`) is full-width.
  *Source:* code-only. **Candidate-stays — needs G1.**
  **Flag for attack:** is 128-bit truncation acceptable for these
  commitments (collision birthday bound ~2^64), given what the transcript
  completeness predicate (B2) will lean on them for?
  *Round-2 ruling (ChatLunatique):* sustained as a real G1 decision point,
  not branch-blocking while candidate-stays — but B2 must not lean on
  these as full-width collision-resistant transcript commitments until G1
  explicitly freezes the tradeoff.
  **RULED (DK, 2026-06-11, event 27a1030b): full-width.** The rewrite uses
  32-byte bidder and lot commitments; the G1 spec PR states the new bid
  layout. Ripples: the new auction-bid event grows ~32 bytes (~184 at the
  32-char name max), which displaces RecoverOwner as the largest event —
  the W8 envelope is restated by the G1 spec, and the old 152-byte bid
  vector (W7) becomes evidence of the *legacy* codec only, not a
  conformance target for the new format. Relay headroom on modern node
  policy was checked as part of the ruling. B2 may treat the commitments
  as full-width collision-resistant once G1 lands.
- **W17 — routed-out proposal.** The exported package envelopes are
  **wallet-handoff artifacts, not wire**: `ont-transfer-package` v1 is an
  *unsigned* advisory JSON envelope (transfer parameters plus UI copy —
  mode titles, suitability text, command strings;
  `transfer-package.ts:18-53`), and `ont-auction-bid-package` v3 mixes the
  three commitments (wire, W16) with preview/UX state (phase, summaries,
  would-become-leader; `auction-bid-package.ts:22-51`). Proposal: B1/
  `@ont/wire` owns the commitment functions and any signed/hashed
  primitive; the package envelopes move to the surfaces layer (B5
  wallet-handoff formats), where their advisory fields belong. Their
  `format`/`version` labels stay reserved in the W13a inventory either way.
  *Round-2 ruling (ChatLunatique):* concurs — envelopes route to B5
  wallet-handoff formats; commitment functions stay in B1 because the
  on-chain bid carries those commitments.
  **RULED (DK, 2026-06-11, event 27a1030b): routed out as proposed.**
  `@ont/wire` owns only hashed/signed primitives; the
  `ont-transfer-package` / `ont-auction-bid-package` envelopes are B5
  wallet-handoff formats. Their labels stay reserved in W13a.

## Gaps — named spec PRs required before affected promotion

Per Item 1: gap ⇒ stop ⇒ named spec PR ⇒ then code.

- **G1 — wire-format spec.** There is no normative wire-format document:
  frame bytes, version-reject rule, exhaustive event-type enumeration,
  per-event byte layouts, endianness, canonical-name-bytes rule (W3),
  domain-separation labels and conventions (W13/W13a), commitment width /
  the full-width commitment layout (W16, as ruled), and the INCLUDES_NAME
  flag rule lived only in `packages/protocol` source and tests. The G1
  spec text is now drafted at
  [`docs/spec/WIRE_FORMAT.md`](../spec/WIRE_FORMAT.md) from this
  extraction with the W16/W17 rulings applied; it promotes (with this
  doc's sign-off) after its own review. **This is the main B1 spec
  deliverable; most candidate-stays items above promote through it.**
- **G2 — off-chain envelope encodings.** The owner-signed off-chain shapes
  (W14 value record, W15 recovery descriptor, W15a wallet proof) have
  concrete field sets and digest layouts only in code; no doc specifies
  the envelope encoding or digests. Either a section of G1's spec PR or
  its own; blocks the off-chain part of `@ont/wire`, not the rest of B1.

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

## Steps 4–5 — attacks became negative tests; sign-off evidence

*(Added at B1 close, 2026-06-12, after the implementation review completed
with no findings — ChatLunatique confirm on `8b82703`. Steps 1–2 are the
invariant extraction + source check above; step 3 was the adversarial
content passes across the spec, suite, and implementation review rounds,
all findings fixed. This section records step 4 — every attack surface
flagged above is covered by recorded suite evidence; where the attack is
byte-encodable that evidence is a named negative vector, and where it is
not (an ambiguity or divergence attack), it is a property sweep,
recomputation pin, or legacy cross-check, typed explicitly below — and
the evidence DK's per-section promotion ratifications (step 5) rest on.)*

### Step-4 evidence map: spec section → suite evidence (typed)

Evidence types: **NEG** named negative vector · **PROP** property test ·
**PIN** positive recomputation pin · **XCHK** legacy cross-check.
Vectors live in `packages/wire/vectors/`; named tests in
`packages/wire/test/conformance.test.ts` (suite) and
`test/implementation.test.ts` (driver).

| WIRE_FORMAT § | Attack surfaces flagged in B1 | Suite evidence |
| --- | --- | --- |
| §1 conventions | endianness/framing ambiguity (W1) | PIN: every digest/commitment vector is recomputed byte-identically from §1's constructions, independently in suite and driver — an endianness or framing disagreement fails every one |
| §2 names | normalization malleability (W3 flag) | NEG: names.json reject sets; events.json `bid-reject-noncanonical-name` |
| §3 frame | unassigned/retired type acceptance, version creep | NEG: frame.json exhaustive type sweep (251 unassigned + retired `0x0d`), bad magic, version `0x00`/`0x02`, short frame · PROP: "vectors cover every type byte 0x00-0xff" sweeps all 256 independently of the vectors |
| §4 layouts | truncation/extension, flag bypass, length mismatch | NEG: events.json truncations at multiple offsets per type, trailing byte, `bid-reject-no-includes-name-flag`, `bid-reject-name-length-mismatch` · PROP: every valid event ≤ 184 (§4.6) |
| §5 keys/digests | cross-context signature replay (W13); derivation drift | NEG: digests.json `cross-context-transfer-sig-on-recover-digest` + converse · XCHK: transfer/recover digests vs `packages/protocol/dist` (generator, throws on mismatch); derivation vs `apps/claim/src/keys.ts` `deriveOwnerKey` (suite test "cross-checks key derivation against the legacy claim-site implementation") |
| §6 commitments | truncated commitments (W16 — ruled full-width), phase/rendering confusion | NEG: commitments.json `state-reject-unknown-phase`, `bidder-reject-empty-after-trim`, `decimal-reject-leading-zeros`, `hex32-reject-uppercase` · PIN: `state-commitment-absents` pins the absent-field = empty-lenPrefix rendering |
| §7 label registry | label reuse/collision (W13a two-conventions flag) | NEG: suite test "retired legacy labels never collide with the live registry" (conformance.test.ts) · the one-concept-one-label rule itself is enforced editorially by the §7 table — no dedicated uniqueness test exists; reviews are the check (stated, not claimed as a test) · lenPrefix standardization ratified (former PROPOSAL 1) |
| §8.1 value record | unsigned-metadata smuggling, version confusion, registry creep | NEG: value-record.json closed-field rejects, duplicate-JSON-key raw fixture, `recordVersion 2` MUST-REJECT, gns-format reject, valueType-outside-registry, non-ISO issuedAt, non-hex64 signature |
| §8.2 descriptor | profile-rendering hash malleability (on-chain-referenced hash) | NEG: recovery-descriptor.json grammar rejects, closed-field rejects, version reject · PIN: `descriptor-valid-noncanonical-profile-input` pins `" BIP322 "` ≡ `"bip322"` to one hash (the never-diverge rule) |
| §8.3 wallet proof | reserved-bytes extension slot (W15a — ruled dropped), message/hash divergence, verifier crash | NEG: wallet-proof.json real-BIP322 invalid + malformed-witness (verify false, never throw), tampered message, trailing LF, profile rejects, closed-field rejects · PIN: proof commitment = bare 32-byte hash |

### Step-5 standing

Every section above is `candidate` per the normative-hardening amendment.
The promotion walk (DK ratifies per section) proposes:

- **§1–§7: promote in one batch** — no open flags. (The three writer
  PROPOSALs were ratified by DK 2026-06-12 — events 2297bc36/f6bf18d4 —
  and their markers cleared from WIRE_FORMAT.md at close-out, so none
  remain inside the batch. One stated non-flag: §7's one-concept-one-label
  rule has no dedicated uniqueness test — the registry table is small and
  review-checked; promote with that stated.)
- **§8.1–8.3: promote after three flags are ruled** (stated, not buried):
  (1) "ISO timestamp" is loose — legacy `Date.parse` rule admits non-ISO
  strings; recommend tightening to a literal RFC3339 form with vectors
  before promotion. (2) spec `sequence` is u64; implementation accepts JS
  safe integers (≤ 2^53−1) — unreachable in practice, divergence must be
  stated or closed. (3) base64 gate is shape-only by design; structural
  BIP322 validity belongs to the verifier (malformed ⇒ verify false).
- **§9: analysis tier** — a routing table, not a rule set.

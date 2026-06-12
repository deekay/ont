# ONT wire format

> **Normativity: `candidate`** — per the clean-build (#46) ledger
> ([SOFTWARE_INVENTORY.md](../core/SOFTWARE_INVENTORY.md)). This is the G1+G2
> named spec PR required by
> [B1_WIRE_HARDENING.md](../core/B1_WIRE_HARDENING.md): the byte-level rules
> previously stated only in `packages/protocol` source and tests, restated as
> spec text with the hardening rulings applied (W16 full-width commitments,
> W17 envelope routing — DK, 2026-06-11). Sections promote to `normative` at
> DK's sign-off of this PR; the B1 conformance suite cites this file.
> Writer proposals not yet ratified are marked **[PROPOSAL]**.

## 1. Conventions

- **Byte order:** all multi-byte integers are big-endian unsigned. `u16`,
  `u32`, `u64` denote 2/4/8-byte widths.
- **`lenPrefix(s)`** = `u16` byte-length of `s` (UTF-8) followed by the
  UTF-8 bytes. Used to domain-separate and unambiguously frame variable
  text.
- **`nullFlag(x)`** = byte `0x00` if `x` is null/absent, else `0x01`
  followed by `x`'s bytes.
- **Hex fields:** fields described as "32-byte hex" are 32 raw bytes on the
  wire; hex is their JSON/text representation.
- **Hash:** SHA-256 throughout.

## 2. Names

- A valid name matches `[a-z0-9]{1,32}`. There is no Unicode, punctuation,
  whitespace, reserved list, or any other name class.
- *Accepted input* at surfaces is case-insensitive: normalization maps input
  to the canonical lowercase form or rejects it, and is idempotent.
- *Canonical name bytes:* a name inside any encoded payload appears only in
  canonical form. A decoder MUST reject a payload whose name bytes are
  non-canonical (e.g. contains `A-Z`). The wire never normalizes — two
  encodings of one name would be malleability.

## 3. Event frame

Every ONT OP_RETURN payload begins with the 5-byte frame:

| Offset | Size | Field | Value |
| --- | --- | --- | --- |
| 0 | 3 | magic | `"ONT"` (UTF-8) |
| 3 | 1 | version | `0x01` |
| 4 | 1 | event type | registry below |

- A decoder MUST reject any payload whose magic is not `"ONT"`.
- A decoder MUST reject any version other than `0x01` (fail closed). The
  version-upgrade policy is explicitly out of v1 scope; v1's only rule is
  "not 1 ⇒ reject."
- A decoder MUST reject any event type byte not in the registry. Unassigned
  values are reserved.

### Event type registry

| Byte | Event |
| --- | --- |
| `0x03` | Transfer |
| `0x07` | AuctionBid |
| `0x09` | RecoverOwner |
| `0x0b` | RootAnchor |
| `0x0d` | **Retired — never reuse** (was AvailabilityMarker; marker-fold (#47)) |

Values are carried forward from the legacy stack so mined vectors remain
byte-comparable where layouts are unchanged. All other byte values are
reserved and MUST be rejected. A **retired** value is rejected by a v1
decoder exactly like an unassigned one; the difference is permanence — a
retired value MUST never be reassigned to a new event type.

## 4. Event layouts

All sizes include the 5-byte frame. `encode` then `decode` MUST be the
identity for every well-formed event; a decoder MUST reject truncated
payloads (at any byte offset) and trailing bytes.

### 4.1 Transfer — 135 bytes

frame ‖ `prevStateTxid`(32) ‖ `newOwnerPubkey`(32) ‖ `flags`(1) ‖
`successorBondVout`(1) ‖ `signature`(64, Schnorr).

### 4.2 RecoverOwner — 171 bytes

frame ‖ `prevStateTxid`(32) ‖ `newOwnerPubkey`(32) ‖ `flags`(1) ‖
`successorBondVout`(1) ‖ `challengeWindowBlocks`(u32) ‖
`recoveryDescriptorHash`(32) ‖ `signature`(64, Schnorr).

### 4.3 AuctionBid — up to 184 bytes *(new layout per the W16 ruling)*

frame ‖ `flags`(1) ‖ `bondVout`(1) ‖ `settlementLockBlocks`(u32) ‖
`bidAmountSats`(u64) ‖ `ownerPubkey`(32) ‖ `auctionLotCommitment`(**32**) ‖
`auctionStateCommitment`(32) ‖ `bidderCommitment`(**32**) ‖
`unlockBlock`(u32) ‖ `nameLength`(1) ‖ `name`(1–32, canonical bytes).

- Sizes, stated unambiguously: post-frame fixed fields total **142** bytes
  (1+1+4+8+32+32+32+32); with the 5-byte frame the fixed portion is
  **147**; the variable tail is `unlockBlock`(4) + `nameLength`(1) +
  name(≤32); maximum total **184** at the 32-char name. (Legacy
  arithmetic, same shape: 110 body + frame = 115 fixed, max 152.)
- The `INCLUDES_NAME` flag (bit 0) MUST be set; a decoder MUST reject a bid
  without it. Bids always carry the name — there are no bare-hash bids.
- The legacy layout used 16-byte truncated lot/bidder commitments (152-byte
  maximum). Legacy vectors document the old codec only and are not
  conformance targets for this layout.

### 4.4 RootAnchor — 73 bytes

frame ‖ `prevRoot`(32) ‖ `newRoot`(32) ‖ `batchSize`(u32).

### 4.5 AvailabilityMarker (`0x0d`) — RETIRED, legacy evidence only

Retired by marker-fold (#47): availability deadlines key off the anchor's
mined height, so no second on-chain event exists. The legacy layout —
frame ‖ `dataDigest`(32) ‖ `batchSize`(u32), 41 bytes — is preserved here
solely as legacy-codec evidence (the event was wire-defined and tested but
never emitted in production). A v1 decoder MUST reject `0x0d` (see the
registry); the conformance suite carries a negative vector for it.

### 4.6 Maximum event size

The largest event is the maximum-name AuctionBid at **184 bytes**. The
conformance suite MUST enforce "every event ≤ 184" as a property over all
event types. (Legacy envelope was 171; superseded by the W16 ruling.)
OP_RETURN payloads of this size rely on modern node relay policy, as the
legacy 171-byte envelope already did.

## 5. Keys and owner-key Schnorr digests

- An owner key is a 32-byte x-only public key. Owner signatures are 64-byte
  BIP340 Schnorr, no parity/recovery byte.
- Owner keys derive from the 12-word secret: `masterSeed` = first 32 bytes
  of the BIP-39 seed; owner key *i* at path `m/696969'/0'/i'`. The same 12
  words MUST derive byte-identical keys in every implementation, locked by
  the shared cross-surface conformance vectors.
- Every ONT owner-key Schnorr digest is **domain-separated**: SHA-256 over
  `lenPrefix(label)` followed by the fields. Labels are unique per context
  (registry in §7). The two on-chain authorization digests:
  - **Transfer:** `sha256( lenPrefix("ont-transfer-owner") ‖
    prevStateTxid(32) ‖ newOwnerPubkey(32) ‖ flags(1) ‖
    successorBondVout(1) )`
  - **RecoverOwner:** `sha256( lenPrefix("ont-recover-owner") ‖
    prevStateTxid(32) ‖ newOwnerPubkey(32) ‖ flags(1) ‖
    successorBondVout(1) ‖ challengeWindowBlocks(u32) ‖
    recoveryDescriptorHash(32) )`
- A signature valid in one context MUST NOT verify in any other (the
  conformance suite carries cross-context negative tests).
- *Authorization semantics* — which key must have produced a signature for
  an event to change name state — are kernel rules (B2), not wire. The wire
  defines digests and verification primitives only.

## 6. Auction commitments *(full-width per the W16 ruling)*

The on-chain bid carries three 32-byte commitments. **[PROPOSAL]** — new
constructions standardized on the length-prefixed convention (the legacy
NUL-separated text convention is retired for new material), labels bumped
to `-v2` accordingly:

**Input renderings**, used by all three commitments — defined here so this
section stands without any source file:

- *text* (`auctionId`, `bidderId`): UTF-8, trimmed of leading/trailing
  whitespace; MUST be non-empty after trimming.
- *decimal(n)*: the canonical base-10 rendering of a non-negative integer —
  no sign, no leading zeros (`"0"` for zero), no separators.
- *hex32*: exactly 64 lowercase hex characters (a 32-byte value as text).
- *absent*: an absent optional field renders as the **empty string** (a
  zero-length `lenPrefix`, i.e. bytes `0x0000`). Unambiguous under
  `lenPrefix` framing.

The commitments:

- `bidderCommitment = sha256( lenPrefix("ont-auction-bidder-v2") ‖
  lenPrefix(text(bidderId)) )`
- `auctionLotCommitment = sha256( lenPrefix("ont-auction-lot-v2") ‖
  lenPrefix(text(auctionId)) ‖ lenPrefix(name) ‖
  lenPrefix(decimal(unlockBlock)) )` — `name` in canonical bytes (§2).
- `auctionStateCommitment = sha256( lenPrefix("ont-auction-state-v2") ‖
  lenPrefix(f₁) ‖ … ‖ lenPrefix(f₁₁) )` over exactly these eleven fields,
  in this order:

  | # | Field | Rendering |
  | --- | --- | --- |
  | 1 | `auctionId` | text |
  | 2 | `name` | canonical name bytes |
  | 3 | `currentBlockHeight` | decimal |
  | 4 | `phase` | exactly one of `pending_unlock`, `awaiting_opening_bid`, `live_bidding`, `soft_close`, `settled`; anything else MUST be rejected |
  | 5 | `unlockBlock` | decimal |
  | 6 | `auctionCloseBlockAfter` | decimal, or absent |
  | 7 | `openingMinimumBidSats` | decimal (satoshis) |
  | 8 | `currentLeaderBidderCommitment` | hex32, or absent |
  | 9 | `currentHighestBidSats` | decimal, or absent |
  | 10 | `currentRequiredMinimumBidSats` | decimal, or absent |
  | 11 | `settlementLockBlocks` | decimal |

  (Field list and order carried from the legacy `ont-auction-state-v1`
  construction, restated here in full so no source file is the hidden
  spec.)

No truncation anywhere: B2's transcript-completeness predicate may treat
all three as full-width collision-resistant commitments.

## 7. Domain label registry

One concept, one label; no two contexts may share one.

| Label | Context | Convention |
| --- | --- | --- |
| `ont-transfer-owner` | on-chain transfer auth digest | lenPrefix |
| `ont-recover-owner` | on-chain recovery auth digest | lenPrefix |
| `ont-value-record` | value record digest (§8.1) | lenPrefix |
| `ont-recovery-descriptor` | recovery descriptor digest (§8.2) | lenPrefix |
| `ont-recovery-wallet-proof` | wallet proof hash (§8.3) | lenPrefix |
| `ont-auction-bidder-v2` | bid commitment (§6) **[PROPOSAL]** | lenPrefix |
| `ont-auction-lot-v2` | lot commitment (§6) **[PROPOSAL]** | lenPrefix |
| `ont-auction-state-v2` | state commitment (§6) **[PROPOSAL]** | lenPrefix |
| `ont-transfer-package` | B5 wallet-handoff envelope (W17 ruling) | reserved here, specified at B5 |
| `ont-auction-bid-package` | B5 wallet-handoff envelope (W17 ruling) | reserved here, specified at B5 |
| `ont-auction-bidder-v1` / `-lot-v1` / `-state-v1` | legacy commitments | retired; never reused |

## 8. Off-chain owner-signed shapes (G2)

JSON envelopes whose signatures cover a domain-separated binary digest —
the JSON is transport, the digest is the contract.

**Field sets are closed.** For every envelope in this section, the listed
fields are the complete set: a parser MUST reject an envelope with a
missing required field or an unrecognized extra field, and MUST reject
duplicate JSON keys where its JSON layer can detect them. Rationale:
nothing may ride alongside the digest-covered fields as unsigned metadata
— an envelope either is exactly its specified shape or it is rejected.

### 8.1 Value record (`ont-value-record`, recordVersion 2)

Fields (the complete JSON envelope; a parser MUST reject an envelope whose
`format` or `recordVersion` does not match exactly):
`format` = `"ont-value-record"`, `recordVersion` = `2`, `name`,
`ownerPubkey`(32-hex), `ownershipRef`(32-hex), `sequence`,
`previousRecordHash`(32-hex or null), `valueType`(1 byte; registry: `0x00`
null, `0x01` Bitcoin payment target, `0x02` HTTPS target, `0xff`
raw/app-defined), `payloadHex`, `issuedAt` (ISO timestamp),
`signature`(64, owner Schnorr).

Digest: `sha256( lenPrefix("ont-value-record") ‖ version(1) ‖
lenPrefix(name) ‖ ownerPubkey(32) ‖ ownershipRef(32) ‖ sequence(u64) ‖
nullFlag(previousRecordHash(32)) ‖ valueType(1) ‖
u16(payloadByteLen) ‖ payloadBytes ‖ lenPrefix(issuedAt) )`

The `u16` length prefix fixes the **encodable payload bound at 65,535
bytes** — a wire constant. A lower *accepted-payload* cap is launch policy
(kernel/adapters), not wire.

Chain rules (sequence exactly +1, hash links to head) are kernel/adapter
material, not wire.

### 8.2 Recovery descriptor (`ont-recovery-descriptor`, descriptorVersion 1)

Fields (the complete JSON envelope; a parser MUST reject an envelope whose
`format` or `descriptorVersion` differ from the values below):
`format` = `"ont-recovery-descriptor"`, `descriptorVersion` = `1`, `name`,
`ownerPubkey`(32-hex), `ownershipRef`(32-hex), `sequence`,
`previousDescriptorHash`(32-hex or null), `recoveryAddress`,
`signingProfile`, `challengeWindowBlocks`, `issuedAt` (ISO timestamp),
`signature`(64, owner Schnorr).

The descriptor's `signingProfile` is deliberately looser than the proof's
(§8.3): after trim+lowercase normalization it must match
`[a-z0-9._-]{1,32}` (default `bip322`) — the grammar leaves room for
future profiles. But descriptorVersion 1 *defines* only `bip322`: a
descriptor naming any other profile is well-formed yet cannot be invoked.
That guarantee rests on **two** checks: (a) the §8.3 proof rejects every
profile except `bip322` (wire shape, B1); and (b) at recovery invocation
the verifier MUST also check that the proof's normalized `signingProfile`
equals the descriptor's normalized `signingProfile` (the legacy source
enforces this). Check (b) is a cross-object rule — recovery-authority
semantics, B2 scope (routed out of B1 with the rest of recovery auth) —
B1 validates only each envelope's own shape.

Digest (= the descriptor hash the on-chain RecoverOwner event references):
`sha256( lenPrefix("ont-recovery-descriptor") ‖ version(1) ‖
lenPrefix(name) ‖ ownerPubkey(32) ‖ ownershipRef(32) ‖ sequence(u64) ‖
nullFlag(previousDescriptorHash(32)) ‖ lenPrefix(recoveryAddress) ‖
lenPrefix(signingProfile) ‖ challengeWindowBlocks(u32) ‖
lenPrefix(issuedAt) )`

### 8.3 Recovery wallet proof (`ont-recovery-wallet-proof`, proofVersion 1)

A separate object from the descriptor, and the deliberate exception to the
Schnorr-digest rule: it is signed **BIP322 by the recovery address key**
over a normalized *text message*, and verified by a BIP322 verifier.

Fields (the complete JSON envelope; a parser MUST reject an envelope whose
`format` or `proofVersion` differ from the values below):
`format` = `"ont-recovery-wallet-proof"`, `proofVersion` = `1`, `name`,
`prevStateTxid`(32-hex), `recoveryDescriptorHash`(32-hex),
`newOwnerPubkey`(32-hex), `successorBondVout`, `challengeWindowBlocks`,
optional `chainTipBlockHash`(32-hex) and `chainTipHeight`,
`recoveryAddress`, `signingProfile` = `"bip322"`, `message`,
`signatureBase64`.

- **`signingProfile` is constrained:** a parser normalizes the value
  (trim, lowercase) and MUST reject the proof if the result is not exactly
  `bip322` — proofVersion 1 defines no other profile. The proof hash and
  the message's `profile:` line both use the normalized literal `bip322`,
  so the hashed value and the signed value can never diverge.

- **Message** — the exact template. Nine lines joined by a single LF
  (`0x0a`), **no trailing newline**; each labeled line is the literal label,
  one colon, one space, then the value:

  ```text
  Open Name Tags owner recovery proof
  profile: bip322
  name: <canonical name>
  prevStateTxid: <hex32>
  recoveryDescriptorHash: <hex32>
  newOwnerPubkey: <hex32>
  successorBondVout: <decimal 0-255>
  challengeWindowBlocks: <decimal>
  chainTip: <hex32>@<decimal> | unspecified
  ```

  Value renderings are §6's: canonical name bytes, `hex32` = 64 lowercase
  hex chars, `decimal` = canonical base-10. `chainTip` is
  `<blockHash>@<height>` **only when both** `chainTipBlockHash` and
  `chainTipHeight` are present; if either is absent it is the literal
  string `unspecified`.
- **Verification rule:** a parser MUST regenerate the message from the
  envelope's normalized fields and reject the proof if the stored
  `message` differs byte-for-byte, before any BIP322 verification.
- **Proof hash:** `sha256( lenPrefix("ont-recovery-wallet-proof") ‖
  version(1) ‖ lenPrefix(name) ‖ prevStateTxid(32) ‖
  recoveryDescriptorHash(32) ‖ newOwnerPubkey(32) ‖ successorBondVout(1) ‖
  challengeWindowBlocks(u32) ‖ nullFlag(chainTipBlockHash(32)) ‖
  nullFlag(chainTipHeight(u32)) ‖ lenPrefix(recoveryAddress) ‖
  lenPrefix(signingProfile) ‖ lenPrefix(message) ‖
  lenPrefix(signatureBase64) )`
- **Proof commitment.** **[PROPOSAL]** The commitment is the 32-byte proof
  hash, full stop. The legacy construction appended 32 reserved zero bytes
  with no documented purpose (the W15a attack flag); the rewrite drops the
  reserved half. If a future profile needs an extension slot, that is a
  spec change with its own label/version, not silent reserved bytes.

## 9. What this spec deliberately does not cover

| Concern | Where it lives |
| --- | --- |
| Whether an event changes name state (authorization, ordering, finality) | kernel spec material, B2 |
| Gate-fee validation (fee ≥ Σ gates) | B2 (spec/ONT_ISSUANCE_FEE_MECHANICS.md) |
| Data-availability deadlines; marker-vs-folded-anchor | pre-B2 named spec decision + B2/B3 |
| RecoverOwner authorization semantics (open question a/b/c) | B2 recovery-authority hardening |
| Economic parameter values | launch-parameter freeze |
| Proof-bundle construction and sizes | B3 evidence layer |
| Wallet-handoff envelope formats | B5 (W17 ruling); labels reserved in §7 |

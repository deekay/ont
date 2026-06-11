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
| `0x0d` | AvailabilityMarker |

Values are carried forward from the legacy stack so mined vectors remain
byte-comparable where layouts are unchanged. All other byte values are
reserved and MUST be rejected.

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

- Fixed portion 147 bytes; maximum total 184 at the 32-char name.
- The `INCLUDES_NAME` flag (bit 0) MUST be set; a decoder MUST reject a bid
  without it. Bids always carry the name — there are no bare-hash bids.
- The legacy layout used 16-byte truncated lot/bidder commitments (152-byte
  maximum). Legacy vectors document the old codec only and are not
  conformance targets for this layout.

### 4.4 RootAnchor — 73 bytes

frame ‖ `prevRoot`(32) ‖ `newRoot`(32) ‖ `batchSize`(u32).

### 4.5 AvailabilityMarker — 41 bytes

frame ‖ `dataDigest`(32) ‖ `batchSize`(u32).

Defined at the wire level regardless of the pending marker-vs-folded-anchor
spec decision ([OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md) §1.1); whether and
when it is *emitted/required* is that decision's to make.

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

- `bidderCommitment = sha256( lenPrefix("ont-auction-bidder-v2") ‖
  lenPrefix(bidderId) )`
- `auctionLotCommitment = sha256( lenPrefix("ont-auction-lot-v2") ‖
  lenPrefix(auctionId) ‖ lenPrefix(name) ‖ lenPrefix(decimal(unlockBlock)) )`
- `auctionStateCommitment = sha256( lenPrefix("ont-auction-state-v2") ‖
  lenPrefix(field₁) ‖ … ‖ lenPrefix(fieldₙ) )` over the auction-state field
  list in the legacy `ont-auction-state-v1` order, each field rendered as
  its legacy text form, absent optional fields as empty strings.

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

### 8.1 Value record (`ont-value-record`, recordVersion 2)

Fields: `format`, `recordVersion`, `name`, `ownerPubkey`(32-hex),
`ownershipRef`(32-hex), `sequence`, `previousRecordHash`(32-hex or null),
`valueType`(1 byte; registry: `0x00` null, `0x01` Bitcoin payment target,
`0x02` HTTPS target, `0xff` raw/app-defined), `payloadHex`, `issuedAt`
(ISO timestamp), `signature`(64, owner Schnorr).

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

Fields: `name`, `ownerPubkey`, `ownershipRef`, `sequence`,
`previousDescriptorHash`(or null), `recoveryAddress`, `signingProfile`
(default `bip322`), `challengeWindowBlocks`, `issuedAt`, owner
`signature`(64, Schnorr).

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

- **Message** (nine NL-joined lines):
  `"Open Name Tags owner recovery proof"`, then `profile:`, `name:`,
  `prevStateTxid:`, `recoveryDescriptorHash:`, `newOwnerPubkey:`,
  `successorBondVout:`, `challengeWindowBlocks:`, `chainTip:` (value
  `<blockHash>@<height>` or `unspecified`).
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

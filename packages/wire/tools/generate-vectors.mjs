// B1 conformance vector generator — executable rendering of docs/spec/WIRE_FORMAT.md.
// Deterministic: all field material is sha256 of fixed labels; signatures use
// zeroed BIP340 aux randomness. Regenerating must be byte-identical.
//
// Cross-checks: constructions carried forward from the legacy stack (transfer /
// recover digests, key derivation, wallet-proof message, legacy evidence
// encodings) are recomputed via packages/protocol/dist and must agree, or this
// script throws. Legacy is evidence, never authority (clean-build #46).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/ripemd160.js";
import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import { bech32, base58check } from "@scure/base";
import bip322 from "bip322-js";

import * as legacyEvents from "../../protocol/dist/events.js";
import * as legacyWire from "../../protocol/dist/wire.js";
import * as legacyBidPkg from "../../protocol/dist/auction-bid-package.js";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "vectors");
const SPEC = "docs/spec/WIRE_FORMAT.md";

// ---- §1 conventions -------------------------------------------------------
const utf8 = (s) => new TextEncoder().encode(s);
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (s) => Uint8Array.from(s.match(/.{2}/g) ?? [], (x) => parseInt(x, 16));
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const u16 = (n) => Uint8Array.of((n >> 8) & 0xff, n & 0xff);
const u32 = (n) => Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
const u64 = (n) => {
  const v = BigInt(n);
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) out[7 - i] = Number((v >> BigInt(8 * i)) & 0xffn);
  return out;
};
const lenPrefix = (s) => { const b = utf8(s); return cat(u16(b.length), b); };
const nullFlag = (x) => (x == null ? Uint8Array.of(0x00) : cat(Uint8Array.of(0x01), x));

// Deterministic 32-byte field material, labeled so vectors are self-describing.
const material32 = (label) => sha256(utf8(`ont-conformance-vector:${label}`));
const ZERO_AUX = new Uint8Array(32);

// ---- §5 keys ---------------------------------------------------------------
// Public BIP-39 test mnemonic — vectors carry no secret material.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const masterSeed = mnemonicToSeedSync(MNEMONIC).slice(0, 32);
const ownerKey = (i) => {
  const node = HDKey.fromMasterSeed(masterSeed).derive(`m/696969'/0'/${i}'`);
  return { priv: node.privateKey, pub: schnorr.getPublicKey(node.privateKey) };
};
const owners = [ownerKey(0), ownerKey(1), ownerKey(2)];

// §8.3 recovery-address key — deterministic, NOT from the owner tree (the
// recovery address is an ordinary wallet address). WIF testnet/compressed,
// P2WPKH "tb1..." per the legacy claim-site encoding.
const { Signer: Bip322Signer, Verifier: Bip322Verifier } = bip322;
const recoveryPriv = material32("wp.recoveryAddressKey");
const recoveryWif = base58check(sha256).encode(Uint8Array.from([0xef, ...recoveryPriv, 0x01]));
const recoveryH160 = ripemd160(sha256(secp256k1.getPublicKey(recoveryPriv, true)));
const recoveryAddress = bech32.encode("tb", [0, ...bech32.toWords(recoveryH160)]);

// ---- §3 frame ---------------------------------------------------------------
const FRAME = (type) => cat(utf8("ONT"), Uint8Array.of(0x01, type));
const LIVE_TYPES = { transfer: 0x03, auctionBid: 0x07, recoverOwner: 0x09, rootAnchor: 0x0b };
const RETIRED_TYPES = [0x0d];
// §3: exhaustive — every byte not in the live registry rejects (251 unassigned + 1 retired)
const UNASSIGNED_TYPES = Array.from({ length: 256 }, (_, t) => t)
  .filter((t) => !Object.values(LIVE_TYPES).includes(t) && !RETIRED_TYPES.includes(t));

// ---- §5 digests --------------------------------------------------------------
const transferDigest = (f) =>
  sha256(cat(lenPrefix("ont-transfer-owner"), f.prevStateTxid, f.newOwnerPubkey,
    Uint8Array.of(f.flags), Uint8Array.of(f.successorBondVout)));
const recoverDigest = (f) =>
  sha256(cat(lenPrefix("ont-recover-owner"), f.prevStateTxid, f.newOwnerPubkey,
    Uint8Array.of(f.flags), Uint8Array.of(f.successorBondVout),
    u32(f.challengeWindowBlocks), f.recoveryDescriptorHash));

// ---- §6 commitments -----------------------------------------------------------
const decimal = (n) => String(n); // canonical base-10 of a non-negative integer
const bidderCommitment = (bidderId) =>
  sha256(cat(lenPrefix("ont-auction-bidder"), lenPrefix(bidderId)));
const lotCommitment = ({ auctionId, name, unlockBlock }) =>
  sha256(cat(lenPrefix("ont-auction-lot"), lenPrefix(auctionId), lenPrefix(name),
    lenPrefix(decimal(unlockBlock))));
const STATE_FIELDS = ["auctionId", "name", "currentBlockHeight", "phase", "unlockBlock",
  "auctionCloseBlockAfter", "openingMinimumBidSats", "currentLeaderBidderCommitment",
  "currentHighestBidSats", "currentRequiredMinimumBidSats", "settlementLockBlocks"];
const PHASES = ["pending_unlock", "awaiting_opening_bid", "live_bidding", "soft_close", "settled"];
const stateCommitment = (s) => {
  if (!PHASES.includes(s.phase)) throw new Error(`unknown phase: ${s.phase}`);
  // absent optional field renders as the empty string (zero-length lenPrefix)
  const render = (v) => lenPrefix(v == null ? "" : String(v));
  return sha256(cat(lenPrefix("ont-auction-state"), ...STATE_FIELDS.map((k) => render(s[k]))));
};

// ---- §8 off-chain digests ------------------------------------------------------
const valueRecordDigest = (r) =>
  sha256(cat(lenPrefix("ont-value-record"), Uint8Array.of(r.recordVersion),
    lenPrefix(r.name), fromHex(r.ownerPubkey), fromHex(r.ownershipRef), u64(r.sequence),
    nullFlag(r.previousRecordHash == null ? null : fromHex(r.previousRecordHash)),
    Uint8Array.of(r.valueType), u16(fromHex(r.payloadHex).length), fromHex(r.payloadHex),
    lenPrefix(r.issuedAt)));
const descriptorDigest = (d) =>
  sha256(cat(lenPrefix("ont-recovery-descriptor"), Uint8Array.of(d.descriptorVersion),
    lenPrefix(d.name), fromHex(d.ownerPubkey), fromHex(d.ownershipRef), u64(d.sequence),
    nullFlag(d.previousDescriptorHash == null ? null : fromHex(d.previousDescriptorHash)),
    lenPrefix(d.recoveryAddress), lenPrefix(d.signingProfile),
    u32(d.challengeWindowBlocks), lenPrefix(d.issuedAt)));
const proofMessage = (p) => {
  const chainTip = p.chainTipBlockHash == null || p.chainTipHeight == null
    ? "unspecified" : `${p.chainTipBlockHash}@${decimal(p.chainTipHeight)}`;
  return ["Open Name Tags owner recovery proof", "profile: bip322", `name: ${p.name}`,
    `prevStateTxid: ${p.prevStateTxid}`, `recoveryDescriptorHash: ${p.recoveryDescriptorHash}`,
    `newOwnerPubkey: ${p.newOwnerPubkey}`, `successorBondVout: ${decimal(p.successorBondVout)}`,
    `challengeWindowBlocks: ${decimal(p.challengeWindowBlocks)}`, `chainTip: ${chainTip}`,
  ].join("\n");
};
const proofHash = (p) =>
  sha256(cat(lenPrefix("ont-recovery-wallet-proof"), Uint8Array.of(p.proofVersion),
    lenPrefix(p.name), fromHex(p.prevStateTxid), fromHex(p.recoveryDescriptorHash),
    fromHex(p.newOwnerPubkey), Uint8Array.of(p.successorBondVout), u32(p.challengeWindowBlocks),
    nullFlag(p.chainTipBlockHash == null ? null : fromHex(p.chainTipBlockHash)),
    nullFlag(p.chainTipHeight == null ? null : u32(p.chainTipHeight)),
    lenPrefix(p.recoveryAddress), lenPrefix(p.signingProfile),
    lenPrefix(p.message), lenPrefix(p.signatureBase64)));

// ---- assemble vectors -----------------------------------------------------------
const assert = (cond, msg) => { if (!cond) throw new Error(`cross-check failed: ${msg}`); };

// keys.json (§5)
const keysFile = {
  spec: SPEC, section: "§5", mnemonic: MNEMONIC, masterSeed: hex(masterSeed),
  note: "public BIP-39 test phrase; masterSeed = first 32 bytes of the BIP-39 seed",
  derivationPath: "m/696969'/0'/i'",
  owners: owners.map((k, i) => ({ index: i, privateKey: hex(k.priv), xOnlyPubkey: hex(k.pub) })),
};

// frame.json (§3)
const frameFile = {
  spec: SPEC, section: "§3",
  vectors: [
    ...Object.entries(LIVE_TYPES).map(([name, t]) => ({
      id: `frame-valid-${name}`, kind: "valid", cite: "§3 event type registry",
      hex: hex(FRAME(t)), eventType: t,
    })),
    { id: "frame-reject-bad-magic", kind: "reject", cite: "§3 'MUST reject any payload whose magic is not ONT'",
      hex: hex(cat(utf8("GNS"), Uint8Array.of(0x01, 0x03))) },
    { id: "frame-reject-version-0", kind: "reject", cite: "§3 'reject any version other than 0x01'",
      hex: hex(cat(utf8("ONT"), Uint8Array.of(0x00, 0x03))) },
    { id: "frame-reject-version-2", kind: "reject", cite: "§3 'not 1 => reject' (fail closed)",
      hex: hex(cat(utf8("ONT"), Uint8Array.of(0x02, 0x03))) },
    { id: "frame-reject-short", kind: "reject", cite: "§4 'reject truncated payloads at any byte offset'",
      hex: hex(utf8("ONT")) },
    ...UNASSIGNED_TYPES.map((t) => ({
      id: `frame-reject-unassigned-0x${t.toString(16).padStart(2, "0")}`, kind: "reject",
      cite: "§3 'Unassigned values are reserved' / MUST reject", hex: hex(FRAME(t)) })),
    ...RETIRED_TYPES.map((t) => ({
      id: `frame-reject-retired-0x${t.toString(16).padStart(2, "0")}`, kind: "reject",
      cite: "§3 registry: 0x0d retired, never reuse (marker-fold #47); §4.5", hex: hex(FRAME(t)) })),
  ],
};

// names.json (§2, W2/W3)
const namesFile = {
  spec: SPEC, section: "§2",
  acceptedInput: [
    { input: "example", canonical: "example" },
    { input: "EXAMPLE", canonical: "example", note: "surface normalization only — never on the wire" },
    { input: "Name123", canonical: "name123" },
  ],
  rejectInput: [
    { input: "", cite: "§2 [a-z0-9]{1,32}" },
    { input: "a".repeat(33), cite: "§2 [a-z0-9]{1,32}" },
    { input: "with space", cite: "§2 no whitespace" },
    { input: "héllo", cite: "§2 no Unicode" },
    { input: "dash-name", cite: "§2 no punctuation" },
  ],
  canonicalWireBytes: [
    { nameHex: hex(utf8("example")), valid: true },
    { nameHex: hex(utf8("Example")), valid: false,
      cite: "§2 'decoder MUST reject a payload whose name bytes are non-canonical — the wire never normalizes' (W3)" },
  ],
};

// events.json (§4) — full event encodings
const tf = {
  prevStateTxid: material32("transfer.prevStateTxid"),
  newOwnerPubkey: owners[1].pub, flags: 0x00, successorBondVout: 0x01,
};
const tfDigest = transferDigest(tf);
const tfSig = schnorr.sign(tfDigest, owners[0].priv, ZERO_AUX);
assert(schnorr.verify(tfSig, tfDigest, owners[0].pub), "transfer self-verify");
assert(hex(tfDigest) === legacyEvents.computeTransferAuthorizationHash({
  prevStateTxid: hex(tf.prevStateTxid), newOwnerPubkey: hex(tf.newOwnerPubkey),
  flags: tf.flags, successorBondVout: tf.successorBondVout,
}), "transfer digest vs legacy");
const transferEvent = cat(FRAME(0x03), tf.prevStateTxid, tf.newOwnerPubkey,
  Uint8Array.of(tf.flags), Uint8Array.of(tf.successorBondVout), tfSig);
assert(transferEvent.length === 135, "transfer length 135");

const rc = {
  prevStateTxid: material32("recover.prevStateTxid"),
  newOwnerPubkey: owners[2].pub, flags: 0x01, successorBondVout: 0x00,
  challengeWindowBlocks: 144, recoveryDescriptorHash: material32("recover.descriptorHash"),
};
const rcDigest = recoverDigest(rc);
const rcSig = schnorr.sign(rcDigest, owners[0].priv, ZERO_AUX);
assert(hex(rcDigest) === legacyEvents.computeRecoverOwnerAuthorizationHash({
  prevStateTxid: hex(rc.prevStateTxid), newOwnerPubkey: hex(rc.newOwnerPubkey),
  flags: rc.flags, successorBondVout: rc.successorBondVout,
  challengeWindowBlocks: rc.challengeWindowBlocks,
  recoveryDescriptorHash: hex(rc.recoveryDescriptorHash),
}), "recover digest vs legacy");
const recoverEvent = cat(FRAME(0x09), rc.prevStateTxid, rc.newOwnerPubkey,
  Uint8Array.of(rc.flags), Uint8Array.of(rc.successorBondVout),
  u32(rc.challengeWindowBlocks), rc.recoveryDescriptorHash, rcSig);
assert(recoverEvent.length === 171, "recover length 171");

const anchor = { prevRoot: material32("anchor.prevRoot"), newRoot: material32("anchor.newRoot"), batchSize: 42 };
const anchorEvent = cat(FRAME(0x0b), anchor.prevRoot, anchor.newRoot, u32(anchor.batchSize));
assert(anchorEvent.length === 73, "anchor length 73");

const buildBid = (bid) => {
  const lot = lotCommitment({ auctionId: bid.auctionId, name: bid.name, unlockBlock: bid.unlockBlock });
  const state = stateCommitment(bid.state);
  const bidder = bidderCommitment(bid.bidderId);
  const nameBytes = utf8(bid.name);
  const event = cat(FRAME(0x07), Uint8Array.of(bid.flags), Uint8Array.of(bid.bondVout),
    u32(bid.settlementLockBlocks), u64(bid.bidAmountSats), bid.ownerPubkey,
    lot, state, bidder, u32(bid.unlockBlock), Uint8Array.of(nameBytes.length), nameBytes);
  return { event, lot, state, bidder };
};
const bidStateFull = {
  auctionId: "auction-0001", name: "example", currentBlockHeight: 1000, phase: "live_bidding",
  unlockBlock: 1200, auctionCloseBlockAfter: 1300, openingMinimumBidSats: 10000,
  currentLeaderBidderCommitment: hex(bidderCommitment("bidder-alpha")),
  currentHighestBidSats: 50000, currentRequiredMinimumBidSats: 51000, settlementLockBlocks: 288,
};
const bid = {
  flags: 0x01, bondVout: 0x01, settlementLockBlocks: 288, bidAmountSats: 51000,
  ownerPubkey: owners[0].pub, auctionId: "auction-0001", bidderId: "bidder-beta",
  unlockBlock: 1200, name: "example", state: bidStateFull,
};
const bidBuilt = buildBid(bid);
assert(bidBuilt.event.length === 147 + 4 + 1 + 7, "bid length 159 at 7-char name");
const maxName = "a".repeat(32);
const bidMaxBuilt = buildBid({ ...bid, name: maxName,
  state: { ...bidStateFull, name: maxName } });
assert(bidMaxBuilt.event.length === 184, "max bid length 184 (§4.6)");

const truncations = (label, bytes) => [1, 5, Math.floor(bytes.length / 2), bytes.length - 1]
  .map((n) => ({ id: `${label}-reject-truncated-${n}`, kind: "reject",
    cite: "§4 'reject truncated payloads (at any byte offset)'", hex: hex(bytes.slice(0, n)) }));

const eventsFile = {
  spec: SPEC, section: "§4",
  vectors: [
    { id: "transfer-valid", kind: "valid", cite: "§4.1 (135 bytes)", hex: hex(transferEvent),
      fields: { prevStateTxid: hex(tf.prevStateTxid), newOwnerPubkey: hex(tf.newOwnerPubkey),
        flags: tf.flags, successorBondVout: tf.successorBondVout, signature: hex(tfSig) },
      signerXOnlyPubkey: hex(owners[0].pub), digest: hex(tfDigest), crossCheckedAgainstLegacy: true },
    { id: "recover-valid", kind: "valid", cite: "§4.2 (171 bytes)", hex: hex(recoverEvent),
      fields: { prevStateTxid: hex(rc.prevStateTxid), newOwnerPubkey: hex(rc.newOwnerPubkey),
        flags: rc.flags, successorBondVout: rc.successorBondVout,
        challengeWindowBlocks: rc.challengeWindowBlocks,
        recoveryDescriptorHash: hex(rc.recoveryDescriptorHash), signature: hex(rcSig) },
      signerXOnlyPubkey: hex(owners[0].pub), digest: hex(rcDigest), crossCheckedAgainstLegacy: true },
    { id: "anchor-valid", kind: "valid", cite: "§4.4 (73 bytes)", hex: hex(anchorEvent),
      fields: { prevRoot: hex(anchor.prevRoot), newRoot: hex(anchor.newRoot), batchSize: anchor.batchSize } },
    { id: "bid-valid", kind: "valid", cite: "§4.3 new full-width layout (W16 ruling)",
      hex: hex(bidBuilt.event),
      fields: { flags: bid.flags, bondVout: bid.bondVout, settlementLockBlocks: bid.settlementLockBlocks,
        bidAmountSats: bid.bidAmountSats, ownerPubkey: hex(bid.ownerPubkey),
        auctionLotCommitment: hex(bidBuilt.lot), auctionStateCommitment: hex(bidBuilt.state),
        bidderCommitment: hex(bidBuilt.bidder), unlockBlock: bid.unlockBlock, name: bid.name },
      commitmentInputs: { auctionId: bid.auctionId, bidderId: bid.bidderId, state: bidStateFull } },
    { id: "bid-valid-max", kind: "valid", cite: "§4.3/§4.6 maximum event: 184 bytes at 32-char name",
      hex: hex(bidMaxBuilt.event), name: maxName },
    { id: "bid-reject-no-includes-name-flag", kind: "reject",
      cite: "§4.3 'INCLUDES_NAME flag (bit 0) MUST be set'",
      hex: hex(buildBid({ ...bid, flags: 0x00 }).event) },
    { id: "bid-reject-noncanonical-name", kind: "reject",
      cite: "§2 reject non-canonical name bytes (W3); wire never normalizes",
      hex: hex(cat(bidBuilt.event.slice(0, bidBuilt.event.length - 7), utf8("Example"))) },
    { id: "bid-reject-name-length-mismatch", kind: "reject",
      cite: "§4 trailing/truncated bytes; nameLength must match remaining bytes",
      hex: hex(cat(bidBuilt.event.slice(0, 152), Uint8Array.of(31), utf8("example"))) },
    { id: "transfer-reject-trailing-byte", kind: "reject", cite: "§4 'reject trailing bytes'",
      hex: hex(cat(transferEvent, Uint8Array.of(0x00))) },
    ...truncations("transfer", transferEvent),
    ...truncations("anchor", anchorEvent),
    ...truncations("bid", bidBuilt.event),
  ],
};

// digests.json (§5) — incl. cross-context negatives
const digestsFile = {
  spec: SPEC, section: "§5",
  vectors: [
    { id: "transfer-digest", kind: "valid", cite: "§5 transfer digest",
      label: "ont-transfer-owner", fields: eventsFile.vectors[0].fields,
      digest: hex(tfDigest), signature: hex(tfSig), signerXOnlyPubkey: hex(owners[0].pub),
      crossCheckedAgainstLegacy: true },
    { id: "recover-digest", kind: "valid", cite: "§5 recover digest",
      label: "ont-recover-owner", fields: eventsFile.vectors[1].fields,
      digest: hex(rcDigest), signature: hex(rcSig), signerXOnlyPubkey: hex(owners[0].pub),
      crossCheckedAgainstLegacy: true },
    { id: "cross-context-transfer-sig-on-recover-digest", kind: "reject",
      cite: "§5 'a signature valid in one context MUST NOT verify in any other'",
      signature: hex(tfSig), digest: hex(rcDigest), signerXOnlyPubkey: hex(owners[0].pub) },
    { id: "cross-context-recover-sig-on-transfer-digest", kind: "reject",
      cite: "§5 cross-context negative",
      signature: hex(rcSig), digest: hex(tfDigest), signerXOnlyPubkey: hex(owners[0].pub) },
  ],
};

// commitments.json (§6)
const stateAbsent = {
  auctionId: "auction-0001", name: "example", currentBlockHeight: 900,
  phase: "awaiting_opening_bid", unlockBlock: 1200, auctionCloseBlockAfter: null,
  openingMinimumBidSats: 10000, currentLeaderBidderCommitment: null,
  currentHighestBidSats: null, currentRequiredMinimumBidSats: null, settlementLockBlocks: 288,
};
const commitmentsFile = {
  spec: SPEC, section: "§6",
  vectors: [
    { id: "bidder-commitment", kind: "valid", cite: "§6 bidderCommitment",
      bidderId: "bidder-beta", commitment: hex(bidderCommitment("bidder-beta")) },
    { id: "lot-commitment", kind: "valid", cite: "§6 auctionLotCommitment",
      auctionId: "auction-0001", name: "example", unlockBlock: 1200,
      commitment: hex(lotCommitment({ auctionId: "auction-0001", name: "example", unlockBlock: 1200 })) },
    { id: "state-commitment-full", kind: "valid", cite: "§6 11-field state commitment, all present",
      state: bidStateFull, commitment: hex(stateCommitment(bidStateFull)) },
    { id: "state-commitment-absents", kind: "valid",
      cite: "§6 absent optional field = empty string (zero-length lenPrefix)",
      state: stateAbsent, commitment: hex(stateCommitment(stateAbsent)) },
    { id: "state-reject-unknown-phase", kind: "reject",
      cite: "§6 phase 'anything else MUST be rejected'",
      state: { ...bidStateFull, phase: "finished" } },
    { id: "bidder-reject-empty-after-trim", kind: "reject",
      cite: "§6 text 'MUST be non-empty after trimming'", bidderId: "   " },
    { id: "decimal-reject-leading-zeros", kind: "reject",
      cite: "§6 decimal: no leading zeros", rendering: "007" },
    { id: "hex32-reject-uppercase", kind: "reject",
      cite: "§6 hex32: exactly 64 lowercase hex characters",
      rendering: hex(bidderCommitment("bidder-alpha")).toUpperCase() },
  ],
};

// value-record.json (§8.1)
const vr = {
  format: "ont-value-record", recordVersion: 1, name: "example",
  ownerPubkey: hex(owners[0].pub), ownershipRef: hex(material32("vr.ownershipRef")),
  sequence: 1, previousRecordHash: null, valueType: 0x01,
  payloadHex: hex(utf8("bc1qexamplepaymenttarget")), issuedAt: "2026-06-12T00:00:00.000Z",
};
const vrDigest = valueRecordDigest(vr);
const vrSig = schnorr.sign(vrDigest, owners[0].priv, ZERO_AUX);
const vr2 = { ...vr, sequence: 2, previousRecordHash: hex(vrDigest) };
const vr2Digest = valueRecordDigest(vr2);
const valueRecordFile = {
  spec: SPEC, section: "§8.1",
  vectors: [
    { id: "value-record-valid", kind: "valid", cite: "§8.1 recordVersion 1",
      envelope: { ...vr, signature: hex(vrSig) }, digest: hex(vrDigest),
      signerXOnlyPubkey: hex(owners[0].pub) },
    { id: "value-record-valid-chained", kind: "valid",
      cite: "§8.1 nullFlag(previousRecordHash) present arm (chain RULES are B2 — this is shape only)",
      envelope: { ...vr2, signature: hex(schnorr.sign(vr2Digest, owners[0].priv, ZERO_AUX)) },
      digest: hex(vr2Digest), signerXOnlyPubkey: hex(owners[0].pub) },
    { id: "value-record-reject-version-2", kind: "reject",
      cite: "§8.1 'reject an envelope whose format or recordVersion does not match exactly' — legacy 2 is evidence-only",
      envelope: { ...vr, recordVersion: 2, signature: hex(vrSig) } },
    { id: "value-record-reject-extra-field", kind: "reject",
      cite: "§8 'field sets are closed' — unrecognized extra field",
      envelope: { ...vr, signature: hex(vrSig), comment: "unsigned metadata must not ride along" } },
    { id: "value-record-reject-missing-field", kind: "reject",
      cite: "§8 closed field set — missing required field",
      envelope: (() => { const e = { ...vr, signature: hex(vrSig) }; delete e.issuedAt; return e; })() },
    { id: "value-record-reject-wrong-format", kind: "reject",
      cite: "§8.1 format must match exactly (gns-era label is a different domain)",
      envelope: { ...vr, format: "gns-value-record", signature: hex(vrSig) } },
    { id: "value-record-reject-duplicate-json-key", kind: "reject",
      cite: "§8 'MUST reject duplicate JSON keys where its JSON layer can detect them'",
      note: "raw JSON text — JS objects cannot carry duplicates, so this fixture is a string; 'sequence' appears twice",
      rawJson: JSON.stringify({ ...vr, signature: hex(vrSig) }, null, 0)
        .replace('"sequence":1,', '"sequence":1,"sequence":2,') },
  ],
  encodablePayloadBound: 65535,
  boundCite: "§8.1 u16 length prefix fixes the encodable payload bound — wire constant, not policy",
};

// recovery-descriptor.json (§8.2)
const rd = {
  format: "ont-recovery-descriptor", descriptorVersion: 1, name: "example",
  ownerPubkey: hex(owners[0].pub), ownershipRef: hex(material32("rd.ownershipRef")),
  sequence: 1, previousDescriptorHash: null,
  recoveryAddress,
  signingProfile: "bip322", challengeWindowBlocks: 144, issuedAt: "2026-06-12T00:00:00.000Z",
};
const rdDigest = descriptorDigest(rd);
const rdSig = schnorr.sign(rdDigest, owners[0].priv, ZERO_AUX);
const descriptorFile = {
  spec: SPEC, section: "§8.2",
  vectors: [
    { id: "descriptor-valid", kind: "valid", cite: "§8.2 descriptorVersion 1",
      envelope: { ...rd, signature: hex(rdSig) }, digest: hex(rdDigest),
      signerXOnlyPubkey: hex(owners[0].pub),
      note: "digest = the descriptor hash the on-chain RecoverOwner event references" },
    { id: "descriptor-valid-future-profile", kind: "valid",
      cite: "§8.2 grammar [a-z0-9._-]{1,32} — well-formed yet cannot be invoked (v1 defines only bip322)",
      envelope: (() => { const d = { ...rd, signingProfile: "frost.v1" };
        return { ...d, signature: hex(schnorr.sign(descriptorDigest(d), owners[0].priv, ZERO_AUX)) }; })(),
      digest: hex(descriptorDigest({ ...rd, signingProfile: "frost.v1" })) },
    { id: "descriptor-reject-profile-grammar", kind: "reject",
      cite: "§8.2 signingProfile grammar (uppercase survives normalization? no — but '!' never matches)",
      envelope: { ...rd, signingProfile: "bip322!", signature: hex(rdSig) } },
    { id: "descriptor-reject-profile-too-long", kind: "reject",
      cite: "§8.2 signingProfile {1,32}",
      envelope: { ...rd, signingProfile: "a".repeat(33), signature: hex(rdSig) } },
    { id: "descriptor-reject-version-2", kind: "reject",
      cite: "§8.2 descriptorVersion must equal 1",
      envelope: { ...rd, descriptorVersion: 2, signature: hex(rdSig) } },
    { id: "descriptor-reject-extra-field", kind: "reject",
      cite: "§8 'field sets are closed' — unrecognized extra field",
      envelope: { ...rd, signature: hex(rdSig), memo: "unsigned metadata must not ride along" } },
    { id: "descriptor-reject-missing-field", kind: "reject",
      cite: "§8 closed field set — missing required field",
      envelope: (() => { const e = { ...rd, signature: hex(rdSig) }; delete e.issuedAt; return e; })() },
  ],
};

// wallet-proof.json (§8.3)
const wpBase = {
  format: "ont-recovery-wallet-proof", proofVersion: 1, name: "example",
  prevStateTxid: hex(rc.prevStateTxid), recoveryDescriptorHash: hex(rdDigest),
  newOwnerPubkey: hex(owners[2].pub), successorBondVout: 0,
  challengeWindowBlocks: 144, recoveryAddress, signingProfile: "bip322",
};
const wpTip = { ...wpBase,
  chainTipBlockHash: hex(material32("wp.chainTipBlockHash")), chainTipHeight: 4321 };
const finishProof = (p) => {
  const message = proofMessage(p);
  assert(message === legacyEvents.createRecoveryWalletProofMessage({
    name: p.name, prevStateTxid: p.prevStateTxid, recoveryDescriptorHash: p.recoveryDescriptorHash,
    newOwnerPubkey: p.newOwnerPubkey, successorBondVout: p.successorBondVout,
    challengeWindowBlocks: p.challengeWindowBlocks,
    chainTipBlockHash: p.chainTipBlockHash ?? undefined, chainTipHeight: p.chainTipHeight ?? undefined,
  }), "proof message vs legacy");
  // Real BIP322 signature by the recovery-address key (deterministic in bip322-js).
  const signatureBase64 = Bip322Signer.sign(recoveryWif, recoveryAddress, message);
  assert(Bip322Verifier.verifySignature(recoveryAddress, message, signatureBase64),
    "BIP322 self-verify");
  const full = { ...p, message, signatureBase64 };
  return { envelope: full, hash: hex(proofHash(full)) };
};
const wpNoTip = finishProof(wpBase);
const wpWithTip = finishProof(wpTip);
const tamperedSig = (() => {
  const raw = Buffer.from(wpNoTip.envelope.signatureBase64, "base64");
  raw[Math.floor(raw.length / 2)] ^= 0x01;
  return raw.toString("base64");
})();
const walletProofFile = {
  spec: SPEC, section: "§8.3",
  signatureNote: "signatureBase64 values are REAL BIP322 signatures by the deterministic recovery-address key (recoveryKey.privateKey below) — verifiable with any BIP322 verifier",
  recoveryKey: { privateKey: hex(recoveryPriv), wif: recoveryWif, address: recoveryAddress,
    note: "deterministic test key (sha256 of a fixed label); P2WPKH testnet encoding" },
  vectors: [
    { id: "wallet-proof-valid-no-tip", kind: "valid",
      cite: "§8.3 chainTip = 'unspecified' when either tip field absent",
      envelope: wpNoTip.envelope, proofHash: wpNoTip.hash, crossCheckedAgainstLegacy: true,
      proofCommitment: wpNoTip.hash,
      commitmentCite: "§8.3 [PROPOSAL] commitment = 32-byte proof hash, no reserved bytes (W15a resolved)" },
    { id: "wallet-proof-valid-with-tip", kind: "valid",
      cite: "§8.3 chainTip = <blockHash>@<height> only when BOTH present",
      envelope: wpWithTip.envelope, proofHash: wpWithTip.hash, crossCheckedAgainstLegacy: true },
    { id: "wallet-proof-reject-tampered-message", kind: "reject",
      cite: "§8.3 regenerate-and-compare: stored message must match byte-for-byte before BIP322 verification",
      envelope: { ...wpNoTip.envelope, message: wpNoTip.envelope.message.replace("example", "exbmple") } },
    { id: "wallet-proof-reject-profile", kind: "reject",
      cite: "§8.3 normalized signingProfile must be exactly 'bip322'",
      envelope: { ...wpNoTip.envelope, signingProfile: "bip340" } },
    { id: "wallet-proof-accept-profile-normalization", kind: "valid",
      cite: "§8.3 parser normalizes (trim, lowercase) then compares — ' BIP322 ' normalizes to bip322; hash uses the normalized literal",
      envelope: { ...wpNoTip.envelope, signingProfile: " BIP322 " },
      normalizedProfile: "bip322", proofHash: wpNoTip.hash },
    { id: "wallet-proof-reject-trailing-newline", kind: "reject",
      cite: "§8.3 nine lines joined by single LF, no trailing newline",
      envelope: { ...wpNoTip.envelope, message: wpNoTip.envelope.message + "\n" } },
    { id: "wallet-proof-reject-bip322-invalid-signature", kind: "reject",
      cite: "§8.3 'signed BIP322 by the recovery address key... verified by a BIP322 verifier' — message regenerates cleanly, signature does not verify",
      envelope: { ...wpNoTip.envelope, signatureBase64: tamperedSig } },
    { id: "wallet-proof-reject-extra-field", kind: "reject",
      cite: "§8 'field sets are closed' — unrecognized extra field",
      envelope: { ...wpNoTip.envelope, metadata: "unsigned metadata must not ride along" } },
    { id: "wallet-proof-reject-missing-field", kind: "reject",
      cite: "§8 closed field set — missing required field",
      envelope: (() => { const e = { ...wpNoTip.envelope }; delete e.recoveryAddress; return e; })() },
  ],
};

// legacy-evidence.json — mined from quarantine-bound legacy code; never conformance targets
const legacyBid = legacyWire.encodeAuctionBidPayload({
  flags: 0x01, bondVout: 1, settlementLockBlocks: 288, bidAmountSats: 51000n,
  ownerPubkey: hex(owners[0].pub),
  auctionLotCommitment: hex(material32("legacy.lot")).slice(0, 32),
  auctionCommitment: hex(material32("legacy.state")),
  bidderCommitment: hex(material32("legacy.bidder")).slice(0, 32),
  unlockBlock: 1200, name: maxName, // 32-char name = the documented 152-byte legacy maximum
});
const legacyMarker = legacyWire.encodeAvailabilityMarkerPayload
  ? legacyWire.encodeAvailabilityMarkerPayload({ dataDigest: hex(material32("legacy.marker")), batchSize: 7 })
  : cat(FRAME(0x0d), material32("legacy.marker"), u32(7));
const legacyEvidenceFile = {
  spec: SPEC, section: "§3/§4.5/§6/§7 legacy rows",
  note: "Mined from packages/protocol (quarantine-bound). Evidence of the old codec only — every entry MUST be rejected by a v1 decoder or is dead by retired label.",
  vectors: [
    { id: "legacy-bid-152-truncated-commitments", kind: "legacy-evidence",
      cite: "§4.3 'legacy layout used 16-byte truncated lot/bidder commitments' — not a conformance target; ALSO rejects under v1 (length mismatch with new layout)",
      hex: hex(legacyBid) },
    { id: "legacy-availability-marker-41", kind: "legacy-evidence",
      cite: "§4.5 retired layout, never emitted in production; v1 decoder MUST reject 0x0d",
      hex: hex(legacyMarker) },
    { id: "legacy-commitment-labels", kind: "legacy-evidence",
      cite: "§7 'ont-auction-bidder-v1 / -lot-v1 / -state-v1: retired; never reused'",
      labels: ["ont-auction-bidder-v1", "ont-auction-lot-v1", "ont-auction-state-v1"],
      legacyBidderCommitment: legacyBidPkg.computeAuctionBidderCommitment("bidder-beta"),
      note: "NUL-separated text convention, retired with the labels" },
    { id: "legacy-value-record-version-2", kind: "legacy-evidence",
      cite: "§8.1 legacy recordVersion 2 = GNS→ONT rebrand artifact; digests differ by version byte, never valid under v1",
      digestUnderLegacyVersionByte: hex(valueRecordDigest({ ...vr, recordVersion: 2 })) },
  ],
};

// ---- write ------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const files = {
  "keys.json": keysFile, "frame.json": frameFile, "names.json": namesFile,
  "events.json": eventsFile, "digests.json": digestsFile, "commitments.json": commitmentsFile,
  "value-record.json": valueRecordFile, "recovery-descriptor.json": descriptorFile,
  "wallet-proof.json": walletProofFile, "legacy-evidence.json": legacyEvidenceFile,
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(OUT_DIR, name), JSON.stringify(data, null, 2) + "\n");
}
console.log(`wrote ${Object.keys(files).length} vector files to ${OUT_DIR}`);
console.log("all legacy cross-checks passed");

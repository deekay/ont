// @ont/wire — the wire layer of the clean-build (#46) rebuild.
// Implements docs/spec/WIRE_FORMAT.md and nothing else: grammar, digests,
// commitments, envelope shapes. No policy, no authorization semantics, no
// state (those are kernel/B2 material — spec §9).
//
// Written AFTER the conformance suite; test/implementation.test.ts drives
// every vector in ../vectors through this module. The suite is the contract.
import { sha256 } from "@noble/hashes/sha2.js";
import { schnorr } from "@noble/curves/secp256k1.js";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import bip322 from "bip322-js";

// ---------- §1 conventions ----------
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
export const utf8 = (s: string): Uint8Array => textEncoder.encode(s);
export const bytesToHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const hexToBytes = (s: string): Uint8Array => {
  if (!/^([0-9a-f]{2})*$/.test(s)) throw new WireError("invalid lowercase hex");
  return Uint8Array.from(s.match(/.{2}/g) ?? [], (x) => parseInt(x, 16));
};
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const u16 = (n: number): Uint8Array => Uint8Array.of((n >> 8) & 0xff, n & 0xff);
const u32 = (n: number): Uint8Array =>
  Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
const u64 = (n: bigint): Uint8Array => {
  if (n < 0n || n > 0xffff_ffff_ffff_ffffn) throw new WireError("u64 out of range");
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) out[7 - i] = Number((n >> BigInt(8 * i)) & 0xffn);
  return out;
};
const byteAt = (b: Uint8Array, i: number): number => {
  const v = b[i];
  if (v === undefined) throw new WireError("read past end of payload");
  return v;
};
const readU32 = (b: Uint8Array, o: number): number =>
  ((byteAt(b, o) << 24) | (byteAt(b, o + 1) << 16) | (byteAt(b, o + 2) << 8) | byteAt(b, o + 3)) >>> 0;
const readU64 = (b: Uint8Array, o: number): bigint => {
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(byteAt(b, o + i));
  return v;
};
const lenPrefix = (s: string): Uint8Array => {
  const b = utf8(s);
  if (b.length > 0xffff) throw new WireError("lenPrefix input exceeds u16");
  return concat(u16(b.length), b);
};
const nullFlag = (x: Uint8Array | null): Uint8Array =>
  x == null ? Uint8Array.of(0x00) : concat(Uint8Array.of(0x01), x);

export class WireError extends Error {}
const reject = (msg: string): never => { throw new WireError(msg); };

const checkByte = (n: unknown, what: string): number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 0xff ? n : reject(`${what} must be a byte`);
const checkU32 = (n: unknown, what: string): number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 0xffff_ffff ? n : reject(`${what} must be u32`);
const checkHex32 = (s: unknown, what: string): string =>
  typeof s === "string" && /^[0-9a-f]{64}$/.test(s) ? s : reject(`${what} must be 32-byte lowercase hex`);
const checkHex64 = (s: unknown, what: string): string =>
  typeof s === "string" && /^[0-9a-f]{128}$/.test(s) ? s : reject(`${what} must be 64-byte lowercase hex`);
// ISO timestamp rule mirrors the legacy assertIsoTimestamp: a string Date.parse accepts.
const checkIsoTimestamp = (s: unknown, what: string): string =>
  typeof s === "string" && !Number.isNaN(Date.parse(s)) ? s : reject(`${what} must be an ISO timestamp`);
const checkBase64 = (s: unknown, what: string): string =>
  typeof s === "string" && s.length > 0 && s.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s)
    ? s : reject(`${what} must be base64`);

// ---------- §2 names ----------
const NAME_RE = /^[a-z0-9]{1,32}$/;
export const isCanonicalName = (s: string): boolean => NAME_RE.test(s);
/** Surface normalization: case-insensitive accepted input → canonical, or throw. Idempotent. */
export const normalizeNameInput = (input: string): string => {
  const n = input.trim().toLowerCase();
  if (!isCanonicalName(n)) throw new WireError("invalid name");
  return n;
};
/** Wire rule (W3): never normalize — non-canonical name bytes reject. */
const checkCanonicalNameBytes = (bytes: Uint8Array): string => {
  let s: string;
  try { s = textDecoder.decode(bytes); } catch { return reject("name bytes not UTF-8"); }
  if (!isCanonicalName(s)) reject("non-canonical name bytes (wire never normalizes)");
  return s;
};

// ---------- §3 frame / §4 layouts ----------
export const MAGIC = "ONT";
export const WIRE_VERSION = 0x01;
export enum EventType {
  Transfer = 0x03,
  AuctionBid = 0x07,
  RecoverOwner = 0x09,
  RootAnchor = 0x0b,
}
const LIVE_TYPES = new Set<number>([0x03, 0x07, 0x09, 0x0b]);
export const MAX_EVENT_BYTES = 184; // §4.6

const frame = (type: EventType): Uint8Array => concat(utf8(MAGIC), Uint8Array.of(WIRE_VERSION, type));

export interface TransferEvent {
  readonly type: EventType.Transfer;
  readonly prevStateTxid: string; readonly newOwnerPubkey: string;
  readonly flags: number; readonly successorBondVout: number; readonly signature: string;
}
export interface RecoverOwnerEvent {
  readonly type: EventType.RecoverOwner;
  readonly prevStateTxid: string; readonly newOwnerPubkey: string;
  readonly flags: number; readonly successorBondVout: number;
  readonly challengeWindowBlocks: number; readonly recoveryDescriptorHash: string;
  readonly signature: string;
}
export interface RootAnchorEvent {
  readonly type: EventType.RootAnchor;
  readonly prevRoot: string; readonly newRoot: string; readonly batchSize: number;
}
export const AUCTION_BID_FLAG_INCLUDES_NAME = 0x01;
export interface AuctionBidEvent {
  readonly type: EventType.AuctionBid;
  readonly flags: number; readonly bondVout: number; readonly settlementLockBlocks: number;
  readonly bidAmountSats: bigint; readonly ownerPubkey: string;
  readonly auctionLotCommitment: string; readonly auctionStateCommitment: string;
  readonly bidderCommitment: string; readonly unlockBlock: number; readonly name: string;
}
export type OntEvent = TransferEvent | RecoverOwnerEvent | RootAnchorEvent | AuctionBidEvent;

export function encodeEvent(e: OntEvent): Uint8Array {
  switch (e.type) {
    case EventType.Transfer:
      return concat(frame(e.type), hexToBytes(checkHex32(e.prevStateTxid, "prevStateTxid")),
        hexToBytes(checkHex32(e.newOwnerPubkey, "newOwnerPubkey")),
        Uint8Array.of(checkByte(e.flags, "flags")), Uint8Array.of(checkByte(e.successorBondVout, "successorBondVout")),
        hexToBytes(e.signature.length === 128 ? e.signature : reject("signature must be 64 bytes")));
    case EventType.RecoverOwner:
      return concat(frame(e.type), hexToBytes(checkHex32(e.prevStateTxid, "prevStateTxid")),
        hexToBytes(checkHex32(e.newOwnerPubkey, "newOwnerPubkey")),
        Uint8Array.of(checkByte(e.flags, "flags")), Uint8Array.of(checkByte(e.successorBondVout, "successorBondVout")),
        u32(checkU32(e.challengeWindowBlocks, "challengeWindowBlocks")),
        hexToBytes(checkHex32(e.recoveryDescriptorHash, "recoveryDescriptorHash")),
        hexToBytes(e.signature.length === 128 ? e.signature : reject("signature must be 64 bytes")));
    case EventType.RootAnchor:
      return concat(frame(e.type), hexToBytes(checkHex32(e.prevRoot, "prevRoot")),
        hexToBytes(checkHex32(e.newRoot, "newRoot")), u32(checkU32(e.batchSize, "batchSize")));
    case EventType.AuctionBid: {
      if ((e.flags & AUCTION_BID_FLAG_INCLUDES_NAME) === 0) reject("INCLUDES_NAME flag must be set (§4.3)");
      if (!isCanonicalName(e.name)) reject("non-canonical name");
      const nameBytes = utf8(e.name);
      return concat(frame(e.type), Uint8Array.of(checkByte(e.flags, "flags")),
        Uint8Array.of(checkByte(e.bondVout, "bondVout")),
        u32(checkU32(e.settlementLockBlocks, "settlementLockBlocks")), u64(e.bidAmountSats),
        hexToBytes(checkHex32(e.ownerPubkey, "ownerPubkey")),
        hexToBytes(checkHex32(e.auctionLotCommitment, "auctionLotCommitment")),
        hexToBytes(checkHex32(e.auctionStateCommitment, "auctionStateCommitment")),
        hexToBytes(checkHex32(e.bidderCommitment, "bidderCommitment")),
        u32(checkU32(e.unlockBlock, "unlockBlock")), Uint8Array.of(nameBytes.length), nameBytes);
    }
  }
}

/** §3: validate the 5-byte frame alone; returns the live event type or throws. */
export function validateFrame(payload: Uint8Array): EventType {
  if (payload.length < 5) reject("truncated frame");
  if (payload[0] !== 0x4f || payload[1] !== 0x4e || payload[2] !== 0x54) reject("bad magic");
  if (payload[3] !== WIRE_VERSION) reject("unsupported version (not 1 ⇒ reject)");
  const type = byteAt(payload, 4);
  if (!LIVE_TYPES.has(type)) reject("unassigned/retired event type");
  return type as EventType;
}

export function decodeEvent(payload: Uint8Array): OntEvent {
  const type = validateFrame(payload);
  const h32 = (o: number) => bytesToHex(payload.slice(o, o + 32));
  switch (type) {
    case EventType.Transfer: {
      if (payload.length !== 135) reject("Transfer must be exactly 135 bytes");
      return { type, prevStateTxid: h32(5), newOwnerPubkey: h32(37), flags: byteAt(payload, 69),
        successorBondVout: byteAt(payload, 70), signature: bytesToHex(payload.slice(71, 135)) };
    }
    case EventType.RecoverOwner: {
      if (payload.length !== 171) reject("RecoverOwner must be exactly 171 bytes");
      return { type, prevStateTxid: h32(5), newOwnerPubkey: h32(37), flags: byteAt(payload, 69),
        successorBondVout: byteAt(payload, 70), challengeWindowBlocks: readU32(payload, 71),
        recoveryDescriptorHash: h32(75), signature: bytesToHex(payload.slice(107, 171)) };
    }
    case EventType.RootAnchor: {
      if (payload.length !== 73) reject("RootAnchor must be exactly 73 bytes");
      return { type, prevRoot: h32(5), newRoot: h32(37), batchSize: readU32(payload, 69) };
    }
    case EventType.AuctionBid: {
      if (payload.length < 152 + 1) reject("AuctionBid truncated");
      const flags = byteAt(payload, 5);
      if ((flags & AUCTION_BID_FLAG_INCLUDES_NAME) === 0) reject("INCLUDES_NAME flag must be set (§4.3)");
      const nameLength = byteAt(payload, 151);
      if (nameLength < 1 || nameLength > 32) reject("name length out of range");
      if (payload.length !== 152 + nameLength) reject("AuctionBid length/nameLength mismatch");
      const name = checkCanonicalNameBytes(payload.slice(152));
      return { type, flags, bondVout: byteAt(payload, 6), settlementLockBlocks: readU32(payload, 7),
        bidAmountSats: readU64(payload, 11), ownerPubkey: h32(19), auctionLotCommitment: h32(51),
        auctionStateCommitment: h32(83), bidderCommitment: h32(115),
        unlockBlock: readU32(payload, 147), name };
    }
    default: return reject("unreachable");
  }
}

// ---------- §5 keys and owner-key Schnorr digests ----------
export const OWNER_DERIVATION_PATH = (index: number): string => `m/696969'/0'/${index}'`;
export function deriveOwnerKey(mnemonic: string, index = 0): { privateKey: string; xOnlyPubkey: string } {
  if (!Number.isInteger(index) || index < 0) throw new WireError("owner index must be a non-negative integer");
  const masterSeed = mnemonicToSeedSync(mnemonic.trim()).slice(0, 32);
  const node = HDKey.fromMasterSeed(masterSeed).derive(OWNER_DERIVATION_PATH(index));
  if (!node.privateKey) throw new WireError("derived owner node has no private key");
  return { privateKey: bytesToHex(node.privateKey), xOnlyPubkey: bytesToHex(schnorr.getPublicKey(node.privateKey)) };
}

export interface TransferAuthFields {
  prevStateTxid: string; newOwnerPubkey: string; flags: number; successorBondVout: number;
}
export interface RecoverAuthFields extends TransferAuthFields {
  challengeWindowBlocks: number; recoveryDescriptorHash: string;
}
export const transferAuthDigest = (f: TransferAuthFields): Uint8Array =>
  sha256(concat(lenPrefix("ont-transfer-owner"), hexToBytes(checkHex32(f.prevStateTxid, "prevStateTxid")),
    hexToBytes(checkHex32(f.newOwnerPubkey, "newOwnerPubkey")),
    Uint8Array.of(checkByte(f.flags, "flags")), Uint8Array.of(checkByte(f.successorBondVout, "successorBondVout"))));
export const recoverAuthDigest = (f: RecoverAuthFields): Uint8Array =>
  sha256(concat(lenPrefix("ont-recover-owner"), hexToBytes(checkHex32(f.prevStateTxid, "prevStateTxid")),
    hexToBytes(checkHex32(f.newOwnerPubkey, "newOwnerPubkey")),
    Uint8Array.of(checkByte(f.flags, "flags")), Uint8Array.of(checkByte(f.successorBondVout, "successorBondVout")),
    u32(checkU32(f.challengeWindowBlocks, "challengeWindowBlocks")),
    hexToBytes(checkHex32(f.recoveryDescriptorHash, "recoveryDescriptorHash"))));
export const verifySchnorr = (signatureHex: string, digest: Uint8Array, xOnlyPubkeyHex: string): boolean =>
  schnorr.verify(hexToBytes(signatureHex), digest, hexToBytes(xOnlyPubkeyHex));

// ---------- §6 auction commitments ----------
export const AUCTION_PHASES =
  ["pending_unlock", "awaiting_opening_bid", "live_bidding", "soft_close", "settled"] as const;
export type AuctionPhase = (typeof AUCTION_PHASES)[number];
export const isDecimalRendering = (s: string): boolean => /^(0|[1-9][0-9]*)$/.test(s);
export const isHex32Rendering = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);
const textInput = (s: unknown, what: string): string => {
  if (typeof s !== "string") reject(`${what} must be a string`);
  const t = (s as string).trim();
  if (t.length === 0) reject(`${what} must be non-empty after trimming (§6)`);
  return t;
};
const decimal = (n: unknown, what: string): string => {
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) reject(`${what} must be a non-negative integer`);
  return String(n);
};

export const computeBidderCommitment = (bidderId: string): string =>
  bytesToHex(sha256(concat(lenPrefix("ont-auction-bidder"), lenPrefix(textInput(bidderId, "bidderId")))));
export const computeLotCommitment = (i: { auctionId: string; name: string; unlockBlock: number }): string => {
  if (!isCanonicalName(i.name)) reject("non-canonical name");
  return bytesToHex(sha256(concat(lenPrefix("ont-auction-lot"), lenPrefix(textInput(i.auctionId, "auctionId")),
    lenPrefix(i.name), lenPrefix(decimal(i.unlockBlock, "unlockBlock")))));
};
export interface AuctionState {
  auctionId: string; name: string; currentBlockHeight: number; phase: AuctionPhase;
  unlockBlock: number; auctionCloseBlockAfter: number | null; openingMinimumBidSats: number;
  currentLeaderBidderCommitment: string | null; currentHighestBidSats: number | null;
  currentRequiredMinimumBidSats: number | null; settlementLockBlocks: number;
}
export function computeStateCommitment(s: AuctionState): string {
  if (!(AUCTION_PHASES as readonly string[]).includes(s.phase)) reject("unknown auction phase (§6)");
  if (!isCanonicalName(s.name)) reject("non-canonical name");
  if (s.currentLeaderBidderCommitment != null && !isHex32Rendering(s.currentLeaderBidderCommitment))
    reject("currentLeaderBidderCommitment must render hex32");
  const opt = (v: number | string | null, what: string): string =>
    v == null ? "" : typeof v === "number" ? decimal(v, what) : v;
  const fields = [textInput(s.auctionId, "auctionId"), s.name,
    decimal(s.currentBlockHeight, "currentBlockHeight"), s.phase, decimal(s.unlockBlock, "unlockBlock"),
    opt(s.auctionCloseBlockAfter, "auctionCloseBlockAfter"),
    decimal(s.openingMinimumBidSats, "openingMinimumBidSats"),
    opt(s.currentLeaderBidderCommitment, "currentLeaderBidderCommitment"),
    opt(s.currentHighestBidSats, "currentHighestBidSats"),
    opt(s.currentRequiredMinimumBidSats, "currentRequiredMinimumBidSats"),
    decimal(s.settlementLockBlocks, "settlementLockBlocks")];
  return bytesToHex(sha256(concat(lenPrefix("ont-auction-state"), ...fields.map(lenPrefix))));
}

// ---------- §8 off-chain envelopes ----------
// Closed field sets: parse from RAW JSON TEXT so duplicate keys are detectable.
const scanTopLevelKeys = (json: string): string[] => {
  const keys: string[] = [];
  let depth = 0, inString = false, escape = false, current = "", afterString = false, lastString = "";
  for (const ch of json) {
    if (inString) {
      if (escape) { escape = false; current += ch; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = false; lastString = current; afterString = true; continue; }
      current += ch; continue;
    }
    if (ch === '"') { inString = true; current = ""; continue; }
    if (afterString && ch === ":" && depth === 1) keys.push(lastString);
    if (!/\s/.test(ch)) afterString = afterString && ch === ":";
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
  }
  return keys;
};
const parseClosedEnvelope = (json: string, required: string[], optional: string[]): Record<string, unknown> => {
  let obj: unknown;
  try { obj = JSON.parse(json); } catch { return reject("invalid JSON"); }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) reject("envelope must be a JSON object");
  const keys = scanTopLevelKeys(json);
  if (new Set(keys).size !== keys.length) reject("duplicate JSON key (§8)");
  const e = obj as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  for (const k of required) if (!(k in e)) reject(`missing required field ${k} (§8 closed field set)`);
  for (const k of Object.keys(e)) if (!allowed.has(k)) reject(`unrecognized field ${k} (§8 closed field set)`);
  return e;
};
const str = (e: Record<string, unknown>, k: string): string =>
  typeof e[k] === "string" ? (e[k] as string) : reject(`${k} must be a string`);
const safeInt = (e: Record<string, unknown>, k: string): number =>
  typeof e[k] === "number" && Number.isSafeInteger(e[k] as number) && (e[k] as number) >= 0
    ? (e[k] as number) : reject(`${k} must be a non-negative integer`);

// §8.1 value record
export const VALUE_RECORD_FORMAT = "ont-value-record";
export const VALUE_RECORD_VERSION = 1;
export const VALUE_RECORD_ENCODABLE_PAYLOAD_BOUND = 0xffff;
const VR_REQUIRED = ["format", "recordVersion", "name", "ownerPubkey", "ownershipRef", "sequence",
  "previousRecordHash", "valueType", "payloadHex", "issuedAt", "signature"];
export function valueRecordDigest(e: Record<string, unknown>): Uint8Array {
  const payload = hexToBytes(str(e, "payloadHex"));
  if (payload.length > VALUE_RECORD_ENCODABLE_PAYLOAD_BOUND) reject("payload exceeds encodable u16 bound");
  return sha256(concat(lenPrefix(VALUE_RECORD_FORMAT), Uint8Array.of(VALUE_RECORD_VERSION),
    lenPrefix(str(e, "name")), hexToBytes(checkHex32(e.ownerPubkey, "ownerPubkey")),
    hexToBytes(checkHex32(e.ownershipRef, "ownershipRef")), u64(BigInt(safeInt(e, "sequence"))),
    nullFlag(e.previousRecordHash == null ? null : hexToBytes(checkHex32(e.previousRecordHash, "previousRecordHash"))),
    Uint8Array.of(checkByte(e.valueType, "valueType")), u16(payload.length), payload,
    lenPrefix(str(e, "issuedAt"))));
}
export const VALUE_TYPE_REGISTRY = new Set<number>([0x00, 0x01, 0x02, 0xff]);
export function parseValueRecord(json: string): Record<string, unknown> {
  const e = parseClosedEnvelope(json, VR_REQUIRED, []);
  if (e.format !== VALUE_RECORD_FORMAT) reject("format must match exactly (§8.1)");
  if (e.recordVersion !== VALUE_RECORD_VERSION) reject("recordVersion must be exactly 1 (§8.1)");
  if (!isCanonicalName(str(e, "name"))) reject("non-canonical name");
  if (!VALUE_TYPE_REGISTRY.has(checkByte(e.valueType, "valueType")))
    reject("valueType outside the registry (§8.1: reserved, fail closed)");
  checkIsoTimestamp(e.issuedAt, "issuedAt");
  checkHex64(e.signature, "signature");
  valueRecordDigest(e); // remaining field-level validation
  return e;
}
export const verifyValueRecord = (e: Record<string, unknown>): boolean =>
  verifySchnorr(str(e, "signature"), valueRecordDigest(e), str(e, "ownerPubkey"));

// §8.2 recovery descriptor
export const RECOVERY_DESCRIPTOR_FORMAT = "ont-recovery-descriptor";
export const RECOVERY_DESCRIPTOR_VERSION = 1;
const RD_REQUIRED = ["format", "descriptorVersion", "name", "ownerPubkey", "ownershipRef", "sequence",
  "previousDescriptorHash", "recoveryAddress", "signingProfile", "challengeWindowBlocks", "issuedAt", "signature"];
const PROFILE_GRAMMAR = /^[a-z0-9._-]{1,32}$/;
export const normalizeSigningProfile = (s: string): string => s.trim().toLowerCase();
export function recoveryDescriptorDigest(e: Record<string, unknown>): Uint8Array {
  return sha256(concat(lenPrefix(RECOVERY_DESCRIPTOR_FORMAT), Uint8Array.of(RECOVERY_DESCRIPTOR_VERSION),
    lenPrefix(str(e, "name")), hexToBytes(checkHex32(e.ownerPubkey, "ownerPubkey")),
    hexToBytes(checkHex32(e.ownershipRef, "ownershipRef")), u64(BigInt(safeInt(e, "sequence"))),
    nullFlag(e.previousDescriptorHash == null ? null : hexToBytes(checkHex32(e.previousDescriptorHash, "previousDescriptorHash"))),
    lenPrefix(str(e, "recoveryAddress")),
    // §8.2 never-diverge: the profile enters the digest NORMALIZED — the hash
    // is referenced on-chain and must not vary with JSON rendering.
    lenPrefix(normalizeSigningProfile(str(e, "signingProfile"))),
    u32(checkU32(e.challengeWindowBlocks, "challengeWindowBlocks")), lenPrefix(str(e, "issuedAt"))));
}
export function parseRecoveryDescriptor(json: string): Record<string, unknown> {
  const e = parseClosedEnvelope(json, RD_REQUIRED, []);
  if (e.format !== RECOVERY_DESCRIPTOR_FORMAT) reject("format must match exactly (§8.2)");
  if (e.descriptorVersion !== RECOVERY_DESCRIPTOR_VERSION) reject("descriptorVersion must be exactly 1 (§8.2)");
  if (!isCanonicalName(str(e, "name"))) reject("non-canonical name");
  const profile = normalizeSigningProfile(str(e, "signingProfile"));
  if (!PROFILE_GRAMMAR.test(profile)) reject("signingProfile fails grammar [a-z0-9._-]{1,32} (§8.2)");
  checkIsoTimestamp(e.issuedAt, "issuedAt");
  checkHex64(e.signature, "signature");
  recoveryDescriptorDigest(e);
  return { ...e, signingProfile: profile }; // parsed envelopes carry the normalized value (§8.2)
}
export const verifyRecoveryDescriptor = (e: Record<string, unknown>): boolean =>
  verifySchnorr(str(e, "signature"), recoveryDescriptorDigest(e), str(e, "ownerPubkey"));

// §8.3 recovery wallet proof — the deliberate BIP322 text-message exception
export const WALLET_PROOF_FORMAT = "ont-recovery-wallet-proof";
export const WALLET_PROOF_VERSION = 1;
export const WALLET_PROOF_PROFILE = "bip322";
const WP_REQUIRED = ["format", "proofVersion", "name", "prevStateTxid", "recoveryDescriptorHash",
  "newOwnerPubkey", "successorBondVout", "challengeWindowBlocks", "recoveryAddress",
  "signingProfile", "message", "signatureBase64"];
const WP_OPTIONAL = ["chainTipBlockHash", "chainTipHeight"];
export function walletProofMessage(e: Record<string, unknown>): string {
  const both = e.chainTipBlockHash != null && e.chainTipHeight != null;
  const chainTip = both
    ? `${checkHex32(e.chainTipBlockHash, "chainTipBlockHash")}@${safeInt(e, "chainTipHeight")}`
    : "unspecified";
  return ["Open Name Tags owner recovery proof", `profile: ${WALLET_PROOF_PROFILE}`,
    `name: ${str(e, "name")}`, `prevStateTxid: ${checkHex32(e.prevStateTxid, "prevStateTxid")}`,
    `recoveryDescriptorHash: ${checkHex32(e.recoveryDescriptorHash, "recoveryDescriptorHash")}`,
    `newOwnerPubkey: ${checkHex32(e.newOwnerPubkey, "newOwnerPubkey")}`,
    `successorBondVout: ${checkByte(e.successorBondVout, "successorBondVout")}`,
    `challengeWindowBlocks: ${checkU32(e.challengeWindowBlocks, "challengeWindowBlocks")}`,
    `chainTip: ${chainTip}`].join("\n");
}
export function walletProofHash(e: Record<string, unknown>): Uint8Array {
  return sha256(concat(lenPrefix(WALLET_PROOF_FORMAT), Uint8Array.of(WALLET_PROOF_VERSION),
    lenPrefix(str(e, "name")), hexToBytes(checkHex32(e.prevStateTxid, "prevStateTxid")),
    hexToBytes(checkHex32(e.recoveryDescriptorHash, "recoveryDescriptorHash")),
    hexToBytes(checkHex32(e.newOwnerPubkey, "newOwnerPubkey")),
    Uint8Array.of(checkByte(e.successorBondVout, "successorBondVout")),
    u32(checkU32(e.challengeWindowBlocks, "challengeWindowBlocks")),
    nullFlag(e.chainTipBlockHash == null ? null : hexToBytes(checkHex32(e.chainTipBlockHash, "chainTipBlockHash"))),
    nullFlag(e.chainTipHeight == null ? null : u32(safeInt(e, "chainTipHeight"))),
    lenPrefix(str(e, "recoveryAddress")), lenPrefix(WALLET_PROOF_PROFILE),
    lenPrefix(str(e, "message")), lenPrefix(str(e, "signatureBase64"))));
}
/** §8.3 proof commitment [PROPOSAL ratified]: the 32-byte hash, no reserved bytes. */
export const walletProofCommitment = (e: Record<string, unknown>): Uint8Array => walletProofHash(e);
export function parseWalletProof(json: string): Record<string, unknown> {
  const e = parseClosedEnvelope(json, WP_REQUIRED, WP_OPTIONAL);
  if (e.format !== WALLET_PROOF_FORMAT) reject("format must match exactly (§8.3)");
  if (e.proofVersion !== WALLET_PROOF_VERSION) reject("proofVersion must be exactly 1 (§8.3)");
  if (!isCanonicalName(str(e, "name"))) reject("non-canonical name");
  if (normalizeSigningProfile(str(e, "signingProfile")) !== WALLET_PROOF_PROFILE)
    reject("signingProfile must normalize to exactly 'bip322' (§8.3)");
  checkBase64(e.signatureBase64, "signatureBase64");
  // Regenerate-and-compare BEFORE any BIP322 verification (§8.3).
  if (walletProofMessage(e) !== str(e, "message")) reject("stored message differs from regenerated message (§8.3)");
  return e;
}
export const verifyWalletProofSignature = (e: Record<string, unknown>): boolean => {
  // The base64 shape gate in parseWalletProof admits strings that are not
  // structurally valid BIP322 witnesses (e.g. "AAAA"); the verifier throws on
  // those. A malformed signature is an invalid signature, not a crash.
  try {
    return bip322.Verifier.verifySignature(
      str(e, "recoveryAddress"), str(e, "message"), str(e, "signatureBase64"));
  } catch {
    return false;
  }
};

// Client-side transfer-authorization signing for ONT names.
//
// Faithful, self-contained port of the transfer digest + signature in
// packages/protocol/src/events.ts (computeTransferAuthorizationDigest /
// signTransferAuthorization / verifyTransferAuthorization). No @ont/* dependency
// so it bundles under Hermes. BIP340 Schnorr over secp256k1 via @noble/curves —
// identical bytes to the engine, so a transfer signed on-device verifies in the
// consensus engine, and vice versa.
//
// A transfer hands a name from its current owner to a DIFFERENT owner key
// (the recipient's). The current owner signs an authorization over
//   sha256( prevStateTxid(32) || newOwnerPubkey(32) || flags(1) || successorBondVout(1) )
// which the engine re-verifies against the name's recorded current owner before
// rewriting ownership. (The on-chain OP_RETURN + successor bond is the broadcast
// step; this module produces the signed authorization that goes inside it.)
import { sha256 } from "@noble/hashes/sha2";
import { schnorr, secp256k1 } from "@noble/curves/secp256k1";

export interface TransferAuthorizationFields {
  /** The name's current lastStateTxid (32-byte hex). */
  readonly prevStateTxid: string;
  /** The recipient's x-only owner pubkey (32-byte hex). */
  readonly newOwnerPubkey: string;
  /** Mode flags (one byte). 0 = plain gift. */
  readonly flags: number;
  /** Output index of the successor bond (one byte). */
  readonly successorBondVout: number;
}

const HEX_PATTERN = /^[0-9a-f]+$/i;

function assertHexBytes(hex: string, expectedByteLength: number, label: string): string {
  const normalized = hex.toLowerCase();
  if (!HEX_PATTERN.test(normalized)) {
    throw new Error(`${label} must be hex`);
  }
  if (normalized.length !== expectedByteLength * 2) {
    throw new Error(`${label} must be ${expectedByteLength} bytes`);
  }
  return normalized;
}

function assertByte(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${label} must fit in one byte`);
  }
  return value;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function computeTransferAuthorizationDigest(fields: TransferAuthorizationFields): Uint8Array {
  const prevStateTxid = assertHexBytes(fields.prevStateTxid, 32, "prevStateTxid");
  const newOwnerPubkey = assertHexBytes(fields.newOwnerPubkey, 32, "newOwnerPubkey");
  const flags = assertByte(fields.flags, "flags");
  const successorBondVout = assertByte(fields.successorBondVout, "successorBondVout");

  const buf = new Uint8Array(32 + 32 + 2);
  buf.set(hexToBytes(prevStateTxid), 0);
  buf.set(hexToBytes(newOwnerPubkey), 32);
  buf[64] = flags;
  buf[65] = successorBondVout;
  return sha256(buf);
}

export function computeTransferAuthorizationHash(fields: TransferAuthorizationFields): string {
  return bytesToHex(computeTransferAuthorizationDigest(fields));
}

export function signTransferAuthorization(
  input: TransferAuthorizationFields & { readonly ownerPrivateKeyHex: string },
): string {
  const ownerPrivateKey = hexToBytes(assertHexBytes(input.ownerPrivateKeyHex, 32, "ownerPrivateKeyHex"));
  if (!secp256k1.utils.isValidSecretKey(ownerPrivateKey)) {
    throw new Error("ownerPrivateKeyHex must be a valid secp256k1 private key");
  }
  return bytesToHex(schnorr.sign(computeTransferAuthorizationDigest(input), ownerPrivateKey));
}

export function verifyTransferAuthorization(
  input: TransferAuthorizationFields & { readonly ownerPubkey: string; readonly signature: string },
): boolean {
  try {
    return schnorr.verify(
      hexToBytes(assertHexBytes(input.signature, 64, "signature")),
      computeTransferAuthorizationDigest(input),
      hexToBytes(assertHexBytes(input.ownerPubkey, 32, "ownerPubkey")),
    );
  } catch {
    return false;
  }
}

// On-chain wire encoding for the transfer event (the OP_RETURN payload).
// Framing mirrors @ont/protocol wire.ts exactly:
//   MAGIC("ONT") ‖ [version, type=0x03] ‖ prevStateTxid(32) ‖ newOwnerPubkey(32)
//     ‖ flags(1) ‖ successorBondVout(1) ‖ signature(64)   = 135 bytes
const PROTOCOL_MAGIC = Uint8Array.of(0x4f, 0x4e, 0x54); // "ONT"
const PROTOCOL_VERSION = 1;
const TRANSFER_EVENT_TYPE = 0x03;

/** Encode the framed transfer event payload (hex) that goes in the OP_RETURN output. */
export function encodeTransferPayloadHex(
  input: TransferAuthorizationFields & { readonly signature: string },
): string {
  const prevStateTxid = assertHexBytes(input.prevStateTxid, 32, "prevStateTxid");
  const newOwnerPubkey = assertHexBytes(input.newOwnerPubkey, 32, "newOwnerPubkey");
  const flags = assertByte(input.flags, "flags");
  const successorBondVout = assertByte(input.successorBondVout, "successorBondVout");
  const signature = assertHexBytes(input.signature, 64, "signature");

  const framed = new Uint8Array(3 + 2 + 130);
  framed.set(PROTOCOL_MAGIC, 0);
  framed[3] = PROTOCOL_VERSION;
  framed[4] = TRANSFER_EVENT_TYPE;
  framed.set(hexToBytes(prevStateTxid), 5);
  framed.set(hexToBytes(newOwnerPubkey), 37);
  framed[69] = flags;
  framed[70] = successorBondVout;
  framed.set(hexToBytes(signature), 71);
  return bytesToHex(framed);
}

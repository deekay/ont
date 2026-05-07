import { sha256 } from "@noble/hashes/sha2.js";

import { bytesToHex } from "./bytes.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export function utf8ToBytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

export function sha256Bytes(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(sha256(bytes));
}

export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256Bytes(bytes));
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }

  return combined;
}

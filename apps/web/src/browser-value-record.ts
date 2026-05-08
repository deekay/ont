import {
  assertHexString,
  bytesToHex
} from "@ont/protocol/bytes";
import {
  computeValueRecordHash as computeBrowserValueRecordHash,
  deriveOwnerPubkey,
  signValueRecord as signBrowserValueRecord,
  verifyValueRecord as verifyBrowserValueRecord,
  VALUE_RECORD_FORMAT,
  VALUE_RECORD_VERSION,
  type SignedValueRecord as BrowserSignedValueRecord,
  type ValueRecordFields as BrowserValueRecordFields
} from "@ont/protocol/value-record";

export {
  computeBrowserValueRecordHash,
  deriveOwnerPubkey,
  signBrowserValueRecord,
  verifyBrowserValueRecord,
  VALUE_RECORD_FORMAT,
  VALUE_RECORD_VERSION,
  type BrowserSignedValueRecord,
  type BrowserValueRecordFields
};

export function payloadUtf8ToHex(value: string): string {
  return bytesToHex(new TextEncoder().encode(value));
}

export function normalizeRawPayloadHex(value: string): string {
  const normalized = assertHexString(value.trim().replace(/\s+/g, ""), "payloadHex");
  if (normalized.length / 2 > 0xffff) {
    throw new Error("payloadHex must fit in 65535 bytes");
  }

  return normalized;
}

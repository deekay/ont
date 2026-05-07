import {
  assertHexString,
  bytesToHex,
  computeValueRecordHash as computeBrowserValueRecordHash,
  deriveOwnerPubkey,
  signValueRecord as signBrowserValueRecord,
  utf8ToBytes,
  verifyValueRecord as verifyBrowserValueRecord,
  VALUE_RECORD_FORMAT,
  VALUE_RECORD_VERSION,
  type SignedValueRecord as BrowserSignedValueRecord,
  type ValueRecordFields as BrowserValueRecordFields
} from "@ont/protocol";

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
  return bytesToHex(utf8ToBytes(value));
}

export function normalizeRawPayloadHex(value: string): string {
  const normalized = assertHexString(value.trim().replace(/\s+/g, ""), "payloadHex");
  if (normalized.length / 2 > 0xffff) {
    throw new Error("payloadHex must fit in 65535 bytes");
  }

  return normalized;
}

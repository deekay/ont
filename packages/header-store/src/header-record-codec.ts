import type { HeaderRecord } from "./record.js";

export interface EncodedHeaderRecord {
  readonly height: number;
  readonly headerHex: string;
}

const U32_MAX = 0xffff_ffff;
const HEADER_HEX = /^[0-9a-f]{160}$/;

export function isHeaderHeight(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= U32_MAX;
}

export function isHeaderHex(value: unknown): value is string {
  return typeof value === "string" && HEADER_HEX.test(value);
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function failEncode(reason: string): never {
  throw new Error(`cannot encode header record: ${reason}`);
}

function failDecode(reason: string): never {
  throw new Error(`invalid encoded header record: ${reason}`);
}

export function encodeHeaderRecord(record: HeaderRecord): EncodedHeaderRecord {
  if (!isHeaderHeight(record.height)) failEncode("height must be a u32 integer");
  if (!isHeaderHex(record.headerHex)) failEncode("headerHex must be 160 lowercase hex chars");
  return { height: record.height, headerHex: record.headerHex };
}

export function decodeHeaderRecord(value: unknown): HeaderRecord {
  if (!hasExactKeys(value, ["height", "headerHex"])) failDecode("expected exactly { height, headerHex }");
  if (!isHeaderHeight(value.height)) failDecode("height must be a u32 integer");
  if (!isHeaderHex(value.headerHex)) failDecode("headerHex must be 160 lowercase hex chars");
  return { height: value.height, headerHex: value.headerHex };
}

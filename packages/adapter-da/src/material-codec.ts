const HEX_64_LOWER = /^[0-9a-f]{64}$/;

export interface EncodedBatchMaterial {
  readonly anchoredRoot: string;
  readonly prevRoot: string;
  readonly committedEntries: readonly { readonly name: string; readonly ownerPubkey: string }[];
  readonly baseLeaves: readonly { readonly keyHex: string; readonly valueHex: string }[];
  readonly servedLeaves: readonly { readonly keyHex: string; readonly valueHex: string }[];
}

export interface EncodedBatchMaterialFile {
  readonly materials: readonly EncodedBatchMaterial[];
}

export function isHex64Lower(value: unknown): value is string {
  return typeof value === "string" && HEX_64_LOWER.test(value);
}

export function decodeEncodedMaterial(value: unknown): EncodedBatchMaterial {
  if (value === null || typeof value !== "object") throw new Error("batch material entry must be an object");
  const v = value as Record<string, unknown>;
  const anchoredRoot = readHex64(v.anchoredRoot, "anchoredRoot");
  const prevRoot = readHex64(v.prevRoot, "prevRoot");
  const committedEntries = readObjectArray(v.committedEntries, "committedEntries").map((entry) => ({
    name: readString(entry.name, "committedEntries.name"),
    ownerPubkey: readHex64(entry.ownerPubkey, "committedEntries.ownerPubkey"),
  }));
  const baseLeaves = readObjectArray(v.baseLeaves, "baseLeaves").map((leaf) => ({
    keyHex: readHex64(leaf.keyHex, "baseLeaves.keyHex"),
    valueHex: readHex64(leaf.valueHex, "baseLeaves.valueHex"),
  }));
  const servedLeaves = readObjectArray(v.servedLeaves, "servedLeaves").map((leaf) => ({
    keyHex: readHex64(leaf.keyHex, "servedLeaves.keyHex"),
    valueHex: readHex64(leaf.valueHex, "servedLeaves.valueHex"),
  }));
  return { anchoredRoot, prevRoot, committedEntries, baseLeaves, servedLeaves };
}

export function encodeEncodedMaterial(value: EncodedBatchMaterial): EncodedBatchMaterial {
  return {
    anchoredRoot: value.anchoredRoot,
    prevRoot: value.prevRoot,
    committedEntries: value.committedEntries.map((entry) => ({
      name: entry.name,
      ownerPubkey: entry.ownerPubkey,
    })),
    baseLeaves: value.baseLeaves.map((leaf) => ({
      keyHex: leaf.keyHex,
      valueHex: leaf.valueHex,
    })),
    servedLeaves: value.servedLeaves.map((leaf) => ({
      keyHex: leaf.keyHex,
      valueHex: leaf.valueHex,
    })),
  };
}

export function encodeEncodedMaterialJson(value: EncodedBatchMaterial): string {
  return JSON.stringify(encodeEncodedMaterial(value));
}

export function decodeEncodedMaterialJson(raw: string): EncodedBatchMaterial {
  return decodeEncodedMaterial(JSON.parse(raw));
}

export function decodeEncodedMaterialFile(value: unknown): EncodedBatchMaterialFile {
  if (value === null || typeof value !== "object" || !Array.isArray((value as { materials?: unknown }).materials)) {
    throw new Error("batch material file must be an object with a materials array");
  }
  return {
    materials: (value as { materials: unknown[] }).materials.map(decodeEncodedMaterial),
  };
}

export const decodeEncodedBatchMaterial = decodeEncodedMaterial;
export const decodeEncodedBatchMaterialFile = decodeEncodedMaterialFile;
export const decodeEncodedBatchMaterialJson = decodeEncodedMaterialJson;
export const encodeEncodedBatchMaterial = encodeEncodedMaterial;
export const encodeEncodedBatchMaterialJson = encodeEncodedMaterialJson;

function readObjectArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry) => {
    if (entry === null || typeof entry !== "object") throw new Error(`${label} entries must be objects`);
    return entry as Record<string, unknown>;
  });
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function readHex64(value: unknown, label: string): string {
  const s = readString(value, label);
  if (!isHex64Lower(s)) throw new Error(`${label} must be 32-byte lowercase hex`);
  return s;
}

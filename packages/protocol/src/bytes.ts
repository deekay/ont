const HEX_PATTERN = /^[0-9a-f]+$/i;

export function assertHexBytes(hex: string, expectedByteLength: number, label: string): string {
  const normalized = assertHexString(hex, label);

  if (normalized.length !== expectedByteLength * 2) {
    throw new Error(`${label} must be ${expectedByteLength} bytes`);
  }

  return normalized;
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = assertHexString(hex, "hex");
  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }

  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function assertHexString(hex: string, label: string): string {
  const normalized = hex.toLowerCase();

  if (!HEX_PATTERN.test(normalized)) {
    throw new Error(`${label} must be lowercase or uppercase hex`);
  }

  if (normalized.length % 2 !== 0) {
    throw new Error(`${label} must have an even number of hex characters`);
  }

  return normalized;
}

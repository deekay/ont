export const PROFILE_BUNDLE_KIND = "ont-key-value-bundle";
export const PROFILE_BUNDLE_VERSION = 1;

export interface ProfileBundleEntry {
  readonly key: string;
  readonly value: string;
}

export interface ProfileBundleDraft {
  readonly entries: readonly ProfileBundleEntry[];
}

export interface ProfileBundlePayload {
  readonly kind: typeof PROFILE_BUNDLE_KIND;
  readonly version: number;
  readonly entries: readonly ProfileBundleEntry[];
}

export function emptyProfileBundleDraft(): ProfileBundleDraft {
  return {
    entries: [{ key: "", value: "" }]
  };
}

export function createProfileBundlePayload(input: ProfileBundleDraft): ProfileBundlePayload {
  return {
    kind: PROFILE_BUNDLE_KIND,
    version: PROFILE_BUNDLE_VERSION,
    entries: normalizeDraftEntries(input.entries)
  };
}

export function encodeProfileBundlePayloadHex(input: ProfileBundleDraft): string {
  const payload = createProfileBundlePayload(input);

  if (payload.entries.length === 0) {
    throw new Error("Add at least one destination entry to the bundle.");
  }

  return utf8ToHex(JSON.stringify(payload, null, 2));
}

export function decodeProfileBundlePayloadHex(payloadHex: string): ProfileBundlePayload | null {
  const text = decodeHexUtf8(payloadHex);
  if (text === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (record.kind !== PROFILE_BUNDLE_KIND) {
      return null;
    }

    if (record.version !== PROFILE_BUNDLE_VERSION) {
      return null;
    }

    const entries = parseBundleEntries(record.entries);
    return entries === null
      ? null
      : {
          kind: PROFILE_BUNDLE_KIND,
          version: PROFILE_BUNDLE_VERSION,
          entries
        };
  } catch {
    return null;
  }
}

export function profileBundleDraftFromPayload(payload: ProfileBundlePayload | null): ProfileBundleDraft {
  if (payload === null || payload.entries.length === 0) {
    return emptyProfileBundleDraft();
  }

  return {
    entries: payload.entries.map((entry) => ({ key: entry.key, value: entry.value }))
  };
}

export function describeProfileBundle(payload: ProfileBundlePayload): string {
  const entries = listProfileBundleEntries(payload);

  if (entries.length === 0) {
    return "Key/value bundle";
  }

  const keys = entries.slice(0, 3).map((entry) => entry.key);
  const suffix = entries.length > 3 ? ` +${entries.length - 3} more` : "";
  return `Key/value bundle · ${keys.join(", ")}${suffix}`;
}

export function listProfileBundleEntries(payload: ProfileBundlePayload): Array<{ key: string; value: string }> {
  return payload.entries.map((entry) => ({
    key: entry.key,
    value: entry.value
  }));
}

export function decodeHexUtf8(payloadHex: string): string | null {
  try {
    const normalized = normalizeHex(payloadHex);
    const bytes = new Uint8Array(normalized.length / 2);
    for (let index = 0; index < normalized.length; index += 2) {
      bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function utf8ToHex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeDraftEntries(entries: readonly ProfileBundleEntry[]): ProfileBundleEntry[] {
  const normalized: ProfileBundleEntry[] = [];

  for (const [index, entry] of entries.entries()) {
    const key = normalizeOptionalString(entry?.key);
    const value = normalizeOptionalString(entry?.value);

    if (key === null && value === null) {
      continue;
    }

    if (key === null || value === null) {
      throw new Error(`Key/value bundle entry ${index + 1} needs both a key and a value.`);
    }

    normalized.push({ key, value });
  }

  return normalized;
}

function parseBundleEntries(value: unknown): ProfileBundleEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  try {
    return normalizeDraftEntries(
      value.map((entry) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          throw new Error("invalid destination bundle entry");
        }

        const record = entry as Record<string, unknown>;
        return {
          key: typeof record.key === "string" ? record.key : "",
          value: typeof record.value === "string" ? record.value : ""
        };
      })
    );
  } catch {
    return null;
  }
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeHex(payloadHex: string): string {
  const normalized = String(payloadHex).trim().toLowerCase();
  if (normalized.length % 2 !== 0 || /[^0-9a-f]/.test(normalized)) {
    throw new Error("invalid hex");
  }
  return normalized;
}

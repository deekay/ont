import { BASE_UNITS_PER_USD } from "./config";

/** Parse a wire amount (string | number | bigint | null) into a bigint of base units. */
export function toBaseUnits(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.round(value));
  const trimmed = value.trim();
  if (trimmed === "") return 0n;
  try {
    return BigInt(trimmed);
  } catch {
    return 0n;
  }
}

function groupDigits(n: bigint): string {
  const neg = n < 0n;
  const digits = (neg ? -n : n).toString();
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return neg ? `-${out}` : out;
}

/** Bitcoin-first amount: ₿<grouped integer>. Never names the legacy unit. */
export function formatBtc(value: string | number | bigint | null | undefined): string {
  return `₿${groupDigits(toBaseUnits(value))}`;
}

/** Approximate dollar helper anchored at ₿1,000 ≈ $1. */
export function formatUsdApprox(value: string | number | bigint | null | undefined): string {
  const units = toBaseUnits(value);
  const usd = Number(units) / BASE_UNITS_PER_USD;
  if (usd === 0) return "~$0";
  if (usd < 0.01) return "<~$0.01";
  if (usd < 10) return `~$${usd.toFixed(2)}`;
  if (usd < 1000) return `~$${Math.round(usd).toLocaleString()}`;
  return `~$${Math.round(usd).toLocaleString()}`;
}

/** ₿<int> · ~$<approx> for prominent amounts. */
export function formatAmount(value: string | number | bigint | null | undefined): string {
  return `${formatBtc(value)} · ${formatUsdApprox(value)}`;
}

/** Truncate a long hex string (txid / pubkey / hash) for compact display. */
export function shortHex(hex: string | null | undefined, head = 8, tail = 6): string {
  if (!hex) return "—";
  const clean = hex.trim();
  if (clean.length <= head + tail + 1) return clean;
  return `${clean.slice(0, head)}…${clean.slice(-tail)}`;
}

/** Decode a hex payload to UTF-8 when it looks printable, else return null. */
export function hexToUtf8(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  if (clean.length === 0 || clean.length % 2 !== 0) return null;
  let out = "";
  for (let i = 0; i < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (code < 0x09 || (code > 0x0d && code < 0x20) || code > 0x7e) {
      // contains non-printable bytes — not human text
      if (code !== 0x0a && code !== 0x0d && code !== 0x09) return null;
    }
    out += String.fromCharCode(code);
  }
  return out;
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : plural ?? `${singular}s`}`;
}

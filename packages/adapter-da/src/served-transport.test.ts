import { describe, expect, it } from "vitest";
import { accumulatorRootOf } from "@ont/protocol";
import { verifyAvailabilityHeight, type ServedLeaf } from "@ont/evidence";
import { verifyServedDelta } from "@ont/adapter-indexer";
import {
  fetchServedLeaves,
  parseServedTransport,
  type DaSource,
} from "./served-transport.js";

// B4-DA red battery (B4_ADAPTERS_PLAN §10). B4-DA fetches + structurally parses the /da/{root} served-
// transport into a ServedLeaf[]; the firewall (root reconstruction) is DATASOURCE's verifyServedDelta +
// the REAL verifyAvailabilityHeight. The transport is the PROVISIONAL candidate (CL): version ‖ count(u32
// BE) ‖ count×[key32‖value32]. RED until the parser + wrapper land (the stubs return null).

// ---------- byte helpers ----------
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(bytes: Uint8Array): string {
  let h = "";
  for (const b of bytes) h += b.toString(16).padStart(2, "0");
  return h;
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
const u32be = (n: number): Uint8Array => Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);

/** Build a candidate served-transport hex: version ‖ count(u32 BE) ‖ leaves; `declaredCount` overridable. */
function buildTransport(leaves: readonly ServedLeaf[], version = 0x01, declaredCount = leaves.length): string {
  const parts = [Uint8Array.of(version), u32be(declaredCount)];
  for (const l of leaves) parts.push(hexToBytes(l.keyHex), hexToBytes(l.valueHex));
  return bytesToHex(concat(...parts));
}

// ---------- fixtures (mirror idx-ds; letter-containing hex) ----------
const BASE_KEY = "ab".repeat(32);
const BASE_VAL = "cd".repeat(32);
const baseLeaves = new Map<string, string>([[BASE_KEY, BASE_VAL]]);
const PREV_ROOT = accumulatorRootOf(baseLeaves);
const served: readonly ServedLeaf[] = [
  { keyHex: "3a".repeat(32), valueHex: "4b".repeat(32) },
  { keyHex: "5c".repeat(32), valueHex: "6d".repeat(32) },
];
const fullLeaves = new Map<string, string>([
  [BASE_KEY, BASE_VAL],
  ...served.map((l) => [l.keyHex, l.valueHex] as [string, string]),
]);
const ANCHORED_ROOT = accumulatorRootOf(fullLeaves);
const MINED_HEIGHT = 800_000;

describe("parseServedTransport — structural decode of the candidate transport", () => {
  it("a canonical buffer → the exact ServedLeaf[] in transport order (fresh objects, lowercase)", () => {
    const r = parseServedTransport(buildTransport(served));
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r).toEqual(served);
    for (let i = 0; i < r.length; i++) expect(r[i]).not.toBe(served[i]); // fresh leaf objects
  });

  it("preserves transport order — NO sort (DATASOURCE canonicalizes)", () => {
    const reversed = [served[1]!, served[0]!];
    expect(parseServedTransport(buildTransport(reversed))).toEqual(reversed);
  });

  it("count=0 → [] structurally (the non-empty requirement is DATASOURCE's, not B4-DA's)", () => {
    expect(parseServedTransport(buildTransport([]))).toEqual([]);
    // ...and the pipe shows DATASOURCE rejects an empty served delta:
    expect(verifyServedDelta({ prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, baseLeaves, presentedServed: [] })).toBeNull();
  });

  it("exact-count firewall — short / long-trailing / declared-count mismatch → null", () => {
    const valid = buildTransport(served);
    expect(parseServedTransport(valid.slice(0, valid.length - 2))).toBeNull(); // short (drop a byte)
    expect(parseServedTransport(valid + "00")).toBeNull(); // trailing byte
    expect(parseServedTransport(buildTransport(served, 0x01, 3))).toBeNull(); // declares 3, carries 2
  });

  it("bad version → null", () => {
    expect(parseServedTransport(buildTransport(served, 0x02))).toBeNull();
  });

  it("raw hex hygiene — 0x prefix / odd length / non-hex → null", () => {
    expect(parseServedTransport("0x" + buildTransport(served))).toBeNull();
    expect(parseServedTransport(buildTransport(served) + "a")).toBeNull(); // odd length
    expect(parseServedTransport("zz".repeat(5))).toBeNull(); // non-hex
  });
});

describe("parseServedTransport → DATASOURCE pipe (the firewall)", () => {
  it("firewall-positive: canonical bytes → verifyServedDelta → REAL verifyAvailabilityHeight reconstructs", () => {
    const parsed = parseServedTransport(buildTransport(served));
    expect(parsed).not.toBeNull();
    if (parsed === null) return;
    const verified = verifyServedDelta({ prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, baseLeaves, presentedServed: parsed });
    expect(verified).not.toBeNull();
    if (verified === null) return;
    const availability = verifyAvailabilityHeight({
      baseLeaves,
      servedDelta: verified,
      binding: { anchorHeight: MINED_HEIGHT, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT },
      confirmedAnchorMinedHeight: MINED_HEIGHT,
    });
    expect(availability.firstServableHeight).toBe(MINED_HEIGHT);
    expect(availability.bound.anchoredRoot).toBe(ANCHORED_ROOT);
  });

  it("pipe-negative: a tampered / omitted leaf parses but DATASOURCE rejects (root mismatch)", () => {
    const tampered = parseServedTransport(buildTransport([{ keyHex: served[0]!.keyHex, valueHex: "99".repeat(32) }, served[1]!]));
    const omitted = parseServedTransport(buildTransport([served[0]!]));
    expect(tampered).not.toBeNull();
    expect(omitted).not.toBeNull();
    if (tampered === null || omitted === null) return;
    expect(verifyServedDelta({ prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, baseLeaves, presentedServed: tampered })).toBeNull();
    expect(verifyServedDelta({ prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, baseLeaves, presentedServed: omitted })).toBeNull();
  });
});

describe("fetchServedLeaves — async wrapper (root validation before provider; totality)", () => {
  const daReturning = (raw: string | null): DaSource => ({ fetchServed: async () => raw });

  it("a valid provider serve → the parsed ServedLeaf[]", async () => {
    const r = await fetchServedLeaves({ daSource: daReturning(buildTransport(served)), anchoredRoot: ANCHORED_ROOT });
    expect(r).toEqual(served);
  });

  it("validates anchoredRoot (lowercase HEX_64) BEFORE consulting the provider", async () => {
    let probed = false;
    const tripwire: DaSource = { fetchServed: async () => { probed = true; return buildTransport(served); } };
    for (const badRoot of [ANCHORED_ROOT.toUpperCase(), "xyz", "ab".repeat(16)]) {
      expect(await fetchServedLeaves({ daSource: tripwire, anchoredRoot: badRoot })).toBeNull();
    }
    expect(probed).toBe(false); // a malformed root never reaches the provider
  });

  it("forwards the EXACT anchoredRoot to the provider", async () => {
    const calls: string[] = [];
    const capturing: DaSource = { fetchServed: async (r) => { calls.push(r); return buildTransport(served); } };
    await fetchServedLeaves({ daSource: capturing, anchoredRoot: ANCHORED_ROOT });
    expect(calls).toEqual([ANCHORED_ROOT]);
  });

  it("provider null / reject / throw / non-string → null (never throws / rejects)", async () => {
    const nullp = await fetchServedLeaves({ daSource: daReturning(null), anchoredRoot: ANCHORED_ROOT });
    const rejecting: DaSource = { fetchServed: () => Promise.reject(new Error("da down")) };
    const throwing: DaSource = { fetchServed: () => { throw new Error("da threw"); } };
    const nonString: DaSource = { fetchServed: async () => 123 as unknown as string };
    expect(nullp).toBeNull();
    await expect(fetchServedLeaves({ daSource: rejecting, anchoredRoot: ANCHORED_ROOT })).resolves.toBeNull();
    await expect(fetchServedLeaves({ daSource: throwing, anchoredRoot: ANCHORED_ROOT })).resolves.toBeNull();
    expect(await fetchServedLeaves({ daSource: nonString, anchoredRoot: ANCHORED_ROOT })).toBeNull();
  });
});

describe("parseServedTransport — totality", () => {
  it("is deterministic", () => {
    expect(parseServedTransport(buildTransport(served))).toEqual(parseServedTransport(buildTransport(served)));
  });

  it("never throws on bogus input", () => {
    expect(() => parseServedTransport(null as unknown as string)).not.toThrow();
    expect(() => parseServedTransport("")).not.toThrow();
  });
});

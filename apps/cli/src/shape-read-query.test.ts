import { describe, expect, it } from "vitest";
import { shapeNameQuery, shapeTxidQuery, shapeReadQuery, type ReadCommand } from "./shape-read-query.js";

// B5-CLI read-query shaping red battery. Per-family shapers consume @ont/wire rules (reject-don't-normalize);
// the dispatcher routes each read command to its family shaper. RED until the cores land (stubs reject).

const TXID = "ab".repeat(32); // 32-byte lowercase hex

describe("shapeNameQuery", () => {
  it("canonical name → accept", () => {
    const r = shapeNameQuery("alice");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.name).toBe("alice");
  });
  it("non-canonical name (uppercase/empty/too long/illegal) → non-canonical-name (reject, don't normalize)", () => {
    for (const name of ["Alice", "", "a".repeat(33), "al-ce", "al ce"]) {
      const r = shapeNameQuery(name);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("non-canonical-name");
    }
  });
  it("non-string → malformed (never throws)", () => {
    let r: ReturnType<typeof shapeNameQuery> | undefined;
    expect(() => { r = shapeNameQuery(123 as unknown as string); }).not.toThrow();
    expect(r?.ok).toBe(false);
  });
});

describe("shapeTxidQuery", () => {
  it("valid 32-byte lowercase hex → accept", () => {
    const r = shapeTxidQuery(TXID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.txid).toBe(TXID);
  });
  it("bad txid (uppercase/short/non-hex/non-string) → malformed-txid (never throws)", () => {
    for (const txid of [TXID.toUpperCase(), "ab".repeat(16), "zz".repeat(32), 123 as unknown as string]) {
      let r: ReturnType<typeof shapeTxidQuery> | undefined;
      expect(() => { r = shapeTxidQuery(txid); }).not.toThrow();
      expect(r?.ok).toBe(false);
      if (r && !r.ok) expect(r.reason).toBe("malformed-txid");
    }
  });
});

describe("shapeReadQuery — dispatcher", () => {
  it("routes name reads to the name shaper", () => {
    for (const command of ["get-value-history", "get-recovery-descriptor-history"] as const) {
      const r = shapeReadQuery(command, "alice");
      expect(r.ok).toBe(true);
      if (r.ok && r.command !== "get-tx") {
        expect(r.command).toBe(command);
        expect(r.name).toBe("alice");
      }
    }
  });
  it("routes get-tx to the txid shaper", () => {
    const r = shapeReadQuery("get-tx", TXID);
    expect(r.ok).toBe(true);
    if (r.ok && r.command === "get-tx") expect(r.txid).toBe(TXID);
  });
  it("propagates family rejects (non-canonical name / bad txid)", () => {
    expect(shapeReadQuery("get-value-history", "Alice").ok).toBe(false);
    expect(shapeReadQuery("get-tx", "nope").ok).toBe(false);
  });
  it("unknown command → unknown-command (never throws)", () => {
    let r: ReturnType<typeof shapeReadQuery> | undefined;
    expect(() => { r = shapeReadQuery("frobnicate" as unknown as ReadCommand, "x"); }).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("unknown-command");
  });
});

describe("shaping — determinism", () => {
  it("is deterministic", () => {
    expect(shapeNameQuery("alice")).toEqual(shapeNameQuery("alice"));
    expect(shapeTxidQuery(TXID)).toEqual(shapeTxidQuery(TXID));
    expect(shapeReadQuery("get-tx", TXID)).toEqual(shapeReadQuery("get-tx", TXID));
  });
});

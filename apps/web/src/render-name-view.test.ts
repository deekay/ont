import { describe, expect, it } from "vitest";
import { signValueRecord, signRecoveryDescriptor, type SignedValueRecord, type SignedRecoveryDescriptor } from "@ont/protocol";
import type { OwnershipInterval } from "@ont/adapter-resolver";
import { renderNameView, shapeName } from "./render-name-view.js";
import type { WebReadPort } from "./web-read-port.js";

// B5-WEB name-resolution view red battery (CL design-concur event 6ab36188). Server-rendered HTML; read/display
// only. Pins: reject-don't-normalize name; visible resolver-indexed-mirror / not-ownership-authority copy; MR1
// (no canonical/longest/winning adjudication); HTML-escape every dynamic field (malicious-name fixture);
// fail-closed to unavailable/error view on absent/throwing read-port; never throws.

const OWNER0_PRIVATE = "a4711cdd2c0e159b58098da37369ae84c2e626a25f7f641a75741c1e225c3d50";
const OWNER0_PUBKEY = "7fb0dc13cea75a622e8ba13d1c3abdeba2258649dd3069f2aa98357777eb2dba";
const REF = "ab".repeat(32);
const RECOVERY_ADDRESS = "tb1q9vza2e8x573nczrlzms0wvx3gsqjx7vaxwd45v";

const ownership: OwnershipInterval = { currentOwnerPubkey: OWNER0_PUBKEY, ownershipRef: REF };

function valueRecord(): SignedValueRecord {
  return signValueRecord({
    name: "alice",
    ownerPrivateKeyHex: OWNER0_PRIVATE,
    ownershipRef: REF,
    sequence: 1,
    previousRecordHash: null,
    valueType: 0,
    payloadHex: "00",
    issuedAt: "2026-01-01T00:00:00.000Z",
  });
}
function recoveryDescriptor(): SignedRecoveryDescriptor {
  return signRecoveryDescriptor({
    name: "alice",
    ownerPrivateKeyHex: OWNER0_PRIVATE,
    ownershipRef: REF,
    sequence: 1,
    previousDescriptorHash: null,
    recoveryAddress: RECOVERY_ADDRESS,
    challengeWindowBlocks: 144,
    issuedAt: "2026-01-01T00:00:00.000Z",
  });
}

/** A resolver that serves "alice" only. */
function port(): WebReadPort {
  return {
    valueHistory: (name) => (name === "alice" ? { currentOwnership: ownership, records: [valueRecord()] } : null),
    recoveryHistory: (name) => (name === "alice" ? { currentOwnership: ownership, descriptors: [recoveryDescriptor()] } : null),
    tx: () => null,
  };
}

describe("shapeName — reject-don't-normalize", () => {
  it("rejects non-strings (typeof guard before isCanonicalName) and non-canonical names; accepts canonical", () => {
    expect(shapeName(123 as unknown).ok).toBe(false);
    expect(shapeName("Alice!").ok).toBe(false);
    expect(shapeName("alice").ok).toBe(true);
  });
});

describe("renderNameView — served name", () => {
  it("renders the served value + recovery history with not-authority copy and no ranking language", () => {
    const out = renderNameView({ name: "alice", port: port() });
    expect(out).toContain("alice");
    expect(out).toContain("resolver-indexed-mirror");
    expect(out).toContain("not-ownership-authority");
    expect(out).toContain(OWNER0_PUBKEY); // the served value record is actually rendered
    expect(out).toContain(RECOVERY_ADDRESS); // the served recovery descriptor is rendered
    // MR1: the web never adjudicates canonicality / ranks chains / claims ownership authority
    expect(out).not.toMatch(/canonical|longest|winning|owner[- ]authority/i);
  });
});

describe("renderNameView — fail-closed views", () => {
  it("invalid name → an error view (does not throw)", () => {
    let out = "";
    expect(() => {
      out = renderNameView({ name: "Not A Name!", port: port() });
    }).not.toThrow();
    expect(out).toContain("Invalid name");
  });
  it("name not served → an unavailable view", () => {
    const out = renderNameView({ name: "bob", port: port() });
    expect(out).toContain("not currently served");
  });
  it("a throwing read-port → an unavailable view, never throws", () => {
    const throwingPort: WebReadPort = {
      valueHistory() {
        throw new Error("read failed");
      },
      recoveryHistory() {
        throw new Error("read failed");
      },
      tx: () => null,
    };
    let out = "";
    expect(() => {
      out = renderNameView({ name: "alice", port: throwingPort });
    }).not.toThrow();
    expect(out).toContain("not currently served");
  });
});

describe("renderNameView — HTML escaping", () => {
  it("escapes a malicious name in the error view (no raw <script>)", () => {
    const out = renderNameView({ name: "<script>alert(1)</script>", port: port() });
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>");
  });
});

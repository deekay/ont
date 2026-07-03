import { describe, expect, it } from "vitest";
import { signValueRecord, signRecoveryDescriptor, type SignedValueRecord, type SignedRecoveryDescriptor } from "@ont/protocol";
import type { OwnershipInterval } from "@ont/adapter-resolver";
import { renderNameView, shapeName } from "./render-name-view.js";
import type { ServedNameStateResult, WebReadPort } from "./web-read-port.js";

// B5-WEB name-resolution view red battery (CL design-concur event 6ab36188). Server-rendered HTML; read/display
// only. Pins: reject-don't-normalize name; visible resolver-indexed-mirror / not-ownership-authority copy; MR1
// (no canonical/longest/winning adjudication); HTML-escape every dynamic field (malicious-name fixture);
// fail-closed to unavailable/error view on absent/throwing read-port; never throws.

const OWNER0_PRIVATE = "a4711cdd2c0e159b58098da37369ae84c2e626a25f7f641a75741c1e225c3d50";
const OWNER0_PUBKEY = "7fb0dc13cea75a622e8ba13d1c3abdeba2258649dd3069f2aa98357777eb2dba";
const NS_OWNER = "22".repeat(32);
const REF = "ab".repeat(32);
const RECOVERY_ADDRESS = "tb1q9vza2e8x573nczrlzms0wvx3gsqjx7vaxwd45v";
const ANCHORED_ROOT = "f93b90c055208630762382e331ef07f3be22df520a7ab7e4ff54707b599839b8";
const ANCHOR_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16";
const LEAF = "2bd806c97f0e00af1a1fc3328fa763a9269723c8db8fac4f93af71db186d6e90";
const BLOCK_170_HEADER =
  "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70";
const BLOCK_176_HEADER =
  "01000000089d2d7196d00f737762fe82cfd86820c6e44bb2a9dd0f5fc1fc4afd000000005c3de10cb7cb6934b0050360980f9a37a95a8bf705edfbcbd3541591ad95c16466c96a49ffff001d09338966";
const MAINNET_TEST_CHECKPOINT_ID = "mainnet:block-169-real-range";

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

function proofBundle(): Extract<ServedNameStateResult, { readonly ok: true }>["proofBundle"] {
  return {
    format: "ont-proof-bundle",
    bundleVersion: 0,
    proofSource: "accumulator_batch_claim",
    assuranceTier: "accumulator-batched",
    verificationGoal: "web render proof-bundle fixture",
    name: "alice",
    normalizedName: "alice",
    ownershipProof: { currentOwnerPubkey: NS_OWNER, ownershipRef: "accumulator-leaf:alice" },
    accumulatorProof: {
      root: ANCHORED_ROOT,
      leaf: LEAF,
      value: NS_OWNER,
      siblings: [
        { level: 1, hash: "7a4ab456e0112c950c4f443951f713667438075e48fb9ec2b6613d81385ab8ca" },
        { level: 2, hash: "5530fccbd45e1da9514e57a90a83f74aafbfb7820c005a69a9688f5a3ac2c485" },
      ],
    },
    batchAnchor: { anchorTxid: ANCHOR_TXID, anchorHeight: 170 },
    bitcoinInclusion: {
      anchors: [
        {
          txid: ANCHOR_TXID,
          height: 170,
          blockHeaderHex: BLOCK_170_HEADER,
          merkle: ["b1fea52486ce0c62bb442b530a3f0132b826c74e473d1f2c220bfa78111c5082"],
          pos: 1,
        },
      ],
    },
  };
}

function nameState(over: Partial<Extract<ServedNameStateResult, { readonly ok: true }>> = {}): Extract<ServedNameStateResult, { readonly ok: true }> {
  return {
    ok: true,
    canonicalName: "alice",
    owner: { kind: "owner-key", ownerPubkeyHex: NS_OWNER },
    leafKeyHex: LEAF,
    batchLocalIndex: 0,
    anchoredRoot: ANCHORED_ROOT,
    anchor: { txid: ANCHOR_TXID, minedHeight: 170, txIndex: 1, vout: 0 },
    firstServableHeight: 170,
    trace: [{ step: "verdict", ok: true, reason: "batched-claim-accepted" }],
    proofBundle: proofBundle(),
    provenance: "resolver-indexed-mirror",
    authority: "not-ownership-authority",
    ...over,
  };
}

function nameStatePort(state: ServedNameStateResult | null): WebReadPort {
  return {
    valueHistory: () => null,
    recoveryHistory: () => null,
    nameState: () => state,
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

describe("renderNameView — Bitcoin verification state", () => {
  it("renders Bitcoin-verified only when core verification passes and header coverage reaches anchor + launch depth", () => {
    const out = renderNameView({
      name: "alice",
      port: nameStatePort(nameState()),
      bitcoinVerification: {
        headerSource: { headerHexAtHeight: (height) => (height === 170 ? BLOCK_170_HEADER : height === 176 ? BLOCK_176_HEADER : null) },
        checkpointId: MAINNET_TEST_CHECKPOINT_ID,
        network: "mainnet",
      },
    });
    expect(out).toContain("Bitcoin-verified");
    expect(out).toContain("height 170");
    expect(out).toContain("Header coverage reaches 176");
    expect(out).toContain(NS_OWNER);
    expect(out).not.toContain("not yet Bitcoin-verified: missing-header-source");
  });

  it("no header source -> not yet Bitcoin-verified, while ownership remains visible", () => {
    const out = renderNameView({ name: "alice", port: nameStatePort(nameState()) });
    expect(out).toContain("not yet Bitcoin-verified");
    expect(out).toContain("missing-header-source");
    expect(out).toContain(NS_OWNER);
  });

  it("missing bitcoinInclusion -> not yet Bitcoin-verified, while ownership remains visible", () => {
    const bundle = proofBundle();
    delete (bundle as Record<string, unknown>).bitcoinInclusion;
    const out = renderNameView({
      name: "alice",
      port: nameStatePort(nameState({ proofBundle: bundle })),
      bitcoinVerification: {
        headerSource: { headerHexAtHeight: (height) => (height === 170 ? BLOCK_170_HEADER : height === 176 ? BLOCK_176_HEADER : null) },
        checkpointId: MAINNET_TEST_CHECKPOINT_ID,
        network: "mainnet",
      },
    });
    expect(out).toContain("not yet Bitcoin-verified");
    expect(out).toContain("unverified");
    expect(out).toContain(NS_OWNER);
  });

  it("short header coverage -> not yet Bitcoin-verified even when the core verifier accepts the anchor header", () => {
    const out = renderNameView({
      name: "alice",
      port: nameStatePort(nameState()),
      bitcoinVerification: {
        headerSource: { headerHexAtHeight: (height) => (height === 170 ? BLOCK_170_HEADER : null) },
        checkpointId: MAINNET_TEST_CHECKPOINT_ID,
        network: "mainnet",
      },
    });
    expect(out).toContain("not yet Bitcoin-verified");
    expect(out).toContain("short-header-range");
    expect(out).toContain(NS_OWNER);
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

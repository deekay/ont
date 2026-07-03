import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import {
  createRecoveryWalletProof,
  createRecoveryWalletProofMessage,
  deriveOwnerPubkey,
  signRecoveryDescriptor,
  verifyRecoveryWalletProof,
  computeRecoveryDescriptorHash,
} from "@ont/protocol";
import { verifyProofBundleAgainstBitcoin, verifyProofBundleStructure } from "@ont/consensus";
import type { BitcoinHeaderSource } from "@ont/consensus";
import {
  buildSignetLaunchHeaderSourceFromHeaders,
  fetchSignetLaunchHeaderSource,
  renderRecoveryWalletProofMessage,
  runVerifyRecoveryWalletProof,
  runInspectProofBundle,
  runVerifyProofBundleAgainstBitcoin,
  type RecoveryWalletProofMessageFields,
  type VerifyProofBundleAgainstBitcoinInput,
} from "./verify-commands.js";

// B5-CLI verify-cores red battery. The cores consume the AUDITED @ont/* APIs and surface the result VERBATIM
// (consume-don't-reimplement, asserted by deep-equal to the audited call); malformed input → {ok:false,
// reason:"malformed"}; total. RED until the cores land (stubs reject).

const OWNER_SK = "11".repeat(32);
const OWNER_PUB = deriveOwnerPubkey(OWNER_SK);
const REF = "ab".repeat(32);
const RECOVERY_ADDRESS = "bc1qexamplerecoveryaddress00000000000000000";
const T0 = "2026-01-01T00:00:00.000Z";

const MESSAGE_FIELDS: RecoveryWalletProofMessageFields = {
  name: "alice",
  prevStateTxid: "0a".repeat(32),
  recoveryDescriptorHash: "cd".repeat(32),
  newOwnerPubkey: "ab".repeat(32),
  successorBondVout: 1,
  challengeWindowBlocks: 144,
};

const DESCRIPTOR = signRecoveryDescriptor({ name: "alice", ownerPrivateKeyHex: OWNER_SK, ownershipRef: REF, sequence: 1, previousDescriptorHash: null, recoveryAddress: RECOVERY_ADDRESS, issuedAt: T0 });
const PROOF = createRecoveryWalletProof({
  name: "alice",
  prevStateTxid: "0a".repeat(32),
  recoveryDescriptorHash: computeRecoveryDescriptorHash(DESCRIPTOR),
  newOwnerPubkey: "ab".repeat(32),
  successorBondVout: 1,
  challengeWindowBlocks: 144,
  recoveryAddress: RECOVERY_ADDRESS,
  signatureBase64: "AAAA", // dummy (wallet-signed externally); verify will surface a failed result verbatim
});
const BLOCK_170_HEADER =
  "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70";
const GOOD_HEADER_SOURCE: BitcoinHeaderSource = {
  headerHexAtHeight: (height) => (height === 170 ? BLOCK_170_HEADER : null),
};

interface SignetHeaderFixture {
  readonly anchorHeight: number;
  readonly requiredHeight: number;
  readonly headers: readonly { readonly height: number; readonly headerHex: string }[];
}

describe("renderRecoveryWalletProofMessage", () => {
  it("valid fields → message equals the audited createRecoveryWalletProofMessage (consume-don't-reimplement)", () => {
    const r = renderRecoveryWalletProofMessage(MESSAGE_FIELDS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message).toBe(createRecoveryWalletProofMessage(MESSAGE_FIELDS));
  });
  it("bad fields (non-hex) → malformed (never throws)", () => {
    let r: ReturnType<typeof renderRecoveryWalletProofMessage> | undefined;
    expect(() => { r = renderRecoveryWalletProofMessage({ ...MESSAGE_FIELDS, prevStateTxid: "nope" }); }).not.toThrow();
    expect(r?.ok).toBe(false);
  });
});

describe("runVerifyRecoveryWalletProof", () => {
  it("surfaces the audited verifyRecoveryWalletProof result verbatim (ok/reason/proofHash)", () => {
    const r = runVerifyRecoveryWalletProof({ descriptor: DESCRIPTOR, proof: PROOF });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const audited = verifyRecoveryWalletProof({ descriptor: DESCRIPTOR, proof: PROOF });
    expect(r.result).toEqual(audited); // verbatim — no recomputed verdict
    expect(r.result).toHaveProperty("ok");
    expect(r.result).toHaveProperty("reason");
    expect(r.result).toHaveProperty("proofHash");
  });
  it("malformed input → malformed (never throws)", () => {
    let r: ReturnType<typeof runVerifyRecoveryWalletProof> | undefined;
    expect(() => { r = runVerifyRecoveryWalletProof(null as unknown as { descriptor: typeof DESCRIPTOR; proof: typeof PROOF }); }).not.toThrow();
    expect(r?.ok).toBe(false);
  });
});

describe("runInspectProofBundle", () => {
  it("surfaces the audited structural report verbatim (consume-don't-reimplement)", () => {
    const bundle = { proofSource: "accumulator_batch_claim", name: "alice" };
    const r = runInspectProofBundle(bundle);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toEqual(verifyProofBundleStructure(bundle)); // mirrors the audited report exactly
    expect(r.report).toHaveProperty("valid");
    expect(r.report).toHaveProperty("proofSource");
    expect(r.report).toHaveProperty("passedCheckCount");
    expect(r.report).toHaveProperty("failedCheckCount");
    expect(r.report).toHaveProperty("checks");
  });
  it("malformed/garbage bundle → still surfaces a structural report (valid:false), never throws", () => {
    let r: ReturnType<typeof runInspectProofBundle> | undefined;
    expect(() => { r = runInspectProofBundle(null); }).not.toThrow();
    expect(r?.ok).toBe(true);
    if (r?.ok) expect(r.report.valid).toBe(false);
  });
});

describe("runVerifyProofBundleAgainstBitcoin", () => {
  it("requires a header source instead of falling back to Merkle/PoW-only verification", async () => {
    const bundle = await loadBitcoinAnchoredBundle();
    expect(verifyProofBundleAgainstBitcoin(bundle).valid).toBe(true);

    const r = runVerifyProofBundleAgainstBitcoin({ bundle });

    expect(r).toEqual({ ok: false, reason: "missing-header-source" });
  });

  it("accepts a verified bundle and surfaces the audited Bitcoin report verbatim", async () => {
    const bundle = await loadBitcoinAnchoredBundle();
    const r = runVerifyProofBundleAgainstBitcoin({ bundle, headerSource: GOOD_HEADER_SOURCE });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toEqual(verifyProofBundleAgainstBitcoin(bundle, { headerSource: GOOD_HEADER_SOURCE }));
    expect(r.report.checks).toContainEqual({
      id: "btc.0.chain",
      status: "passed",
      message: "anchor 1 header is the canonical chain header at height 170",
    });
  });

  it("accepts a real signet bundle through the checkpoint-validated launch provider", async () => {
    const fixture = await loadSignetHeaderRange();
    const source = buildSignetLaunchHeaderSourceFromHeaders({
      headersHex: fixture.headers.map((header) => header.headerHex),
      anchorHeight: fixture.anchorHeight,
    });
    expect(source.ok).toBe(true);
    if (!source.ok) return;

    const bundle = await loadSignetAnchoredBundle();
    const r = runVerifyProofBundleAgainstBitcoin({ bundle, headerSource: source.headerSource });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(source.headerSource.headerHexAtHeight(fixture.anchorHeight)).toBe(fixture.headers[0]?.headerHex);
    expect(source.headerSource.headerHexAtHeight(fixture.requiredHeight)).toBe(fixture.headers.at(-1)?.headerHex);
    expect(r.report.checks).toContainEqual({
      id: "btc.0.chain",
      status: "passed",
      message: "anchor 1 header is the canonical chain header at height 311446",
    });
  });

  it("fails closed when the injected signet header provider withholds the required tail", async () => {
    const fixture = await loadSignetHeaderRange();
    const source = await fetchSignetLaunchHeaderSource({
      anchorHeight: fixture.anchorHeight,
      provider: {
        fetchHeaderHex: async () => fixture.headers.slice(0, -1).map((header) => header.headerHex),
      },
    });

    expect(source.ok).toBe(false);
    if (!source.ok) expect(source.reason).toBe("header-range-count-mismatch");
  });

  it("rejects a structurally-valid bundle missing bitcoinInclusion", async () => {
    const bundle = await loadBitcoinAnchoredBundle();
    delete bundle.bitcoinInclusion;

    const r = runVerifyProofBundleAgainstBitcoin({ bundle, headerSource: GOOD_HEADER_SOURCE });

    expect(r.ok).toBe(false);
    expect(r).toHaveProperty("reason", "unverified");
    if (r.ok || r.reason !== "unverified") return;
    expect(r.report.checks).toContainEqual({
      id: "btc.inclusion.present",
      status: "failed",
      message: "bundle carries Bitcoin inclusion proofs (bitcoinInclusion.anchors)",
    });
  });

  it("rejects a bundle whose inclusion header is not the canonical header source header", async () => {
    const bundle = await loadBitcoinAnchoredBundle();
    const wrongSource: BitcoinHeaderSource = { headerHexAtHeight: () => "00".repeat(80) };

    const r = runVerifyProofBundleAgainstBitcoin({ bundle, headerSource: wrongSource });

    expect(r.ok).toBe(false);
    expect(r).toHaveProperty("reason", "unverified");
    if (r.ok || r.reason !== "unverified") return;
    expect(r.report.checks).toContainEqual({
      id: "btc.0.chain",
      status: "failed",
      message: "anchor 1 header is the canonical chain header at height 170",
    });
  });

  it("malformed input → malformed (never throws)", () => {
    let r: ReturnType<typeof runVerifyProofBundleAgainstBitcoin> | undefined;
    expect(() => { r = runVerifyProofBundleAgainstBitcoin(null as unknown as VerifyProofBundleAgainstBitcoinInput); }).not.toThrow();
    expect(r).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("verify-cores — determinism", () => {
  it("is deterministic", () => {
    expect(renderRecoveryWalletProofMessage(MESSAGE_FIELDS)).toEqual(renderRecoveryWalletProofMessage(MESSAGE_FIELDS));
    expect(runInspectProofBundle({ proofSource: "accumulator_batch_claim" })).toEqual(runInspectProofBundle({ proofSource: "accumulator_batch_claim" }));
    expect(runVerifyProofBundleAgainstBitcoin({ bundle: { proofSource: "accumulator_batch_claim" }, headerSource: GOOD_HEADER_SOURCE })).toEqual(
      runVerifyProofBundleAgainstBitcoin({ bundle: { proofSource: "accumulator_batch_claim" }, headerSource: GOOD_HEADER_SOURCE })
    );
  });
});

async function loadBitcoinAnchoredBundle(): Promise<Record<string, unknown>> {
  const fixtureUrl = new URL("../../../fixtures/proof-bundles/bitcoin-anchored-claim-proof.json", import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function loadSignetAnchoredBundle(): Promise<Record<string, unknown>> {
  const fixtureUrl = new URL("../../../fixtures/proof-bundles/signet-anchored-claim-proof.json", import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function loadSignetHeaderRange(): Promise<SignetHeaderFixture> {
  const fixtureUrl = new URL("../../../fixtures/bitcoin/signet-launch-header-range-311446-311452.json", import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as SignetHeaderFixture;
}

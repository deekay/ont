import { describe, expect, it } from "vitest";
import { deriveOwnerPubkey, signValueRecord, signRecoveryDescriptor } from "@ont/protocol";
import {
  projectServedValueHistory,
  projectServedRecoveryHistory,
  type OwnershipInterval,
} from "@ont/adapter-resolver";
import { renderValueHistory, renderRecoveryHistory, renderTx } from "./render-read.js";
import type { CliTxRead } from "./read-port.js";

// B5-CLI read-render red battery. The two history renders carry the resolver's not-ownership-authority /
// resolver-indexed-mirror stamps verbatim; the tx render is provenance/display only. Fixtures use the REAL
// resolver read projections. RED until the cores land (stubs unavailable).

const NAME = "alice";
const OWNER_SK = "11".repeat(32);
const OWNER_PUB = deriveOwnerPubkey(OWNER_SK);
const REF = "ab".repeat(32);
const T0 = "2026-01-01T00:00:00.000Z";
const CURRENT: OwnershipInterval = { currentOwnerPubkey: OWNER_PUB, ownershipRef: REF };

const SERVED_VALUE = projectServedValueHistory({
  name: NAME, currentOwnership: CURRENT,
  records: [signValueRecord({ name: NAME, ownerPrivateKeyHex: OWNER_SK, ownershipRef: REF, sequence: 1, previousRecordHash: null, valueType: 0, payloadHex: "00", issuedAt: T0 })],
});
const SERVED_RECOVERY = projectServedRecoveryHistory({
  name: NAME, currentOwnership: CURRENT,
  descriptors: [signRecoveryDescriptor({ name: NAME, ownerPrivateKeyHex: OWNER_SK, ownershipRef: REF, sequence: 1, previousDescriptorHash: null, recoveryAddress: "bc1qexamplerecoveryaddress00000000000000000", issuedAt: T0 })],
});
const TX: CliTxRead = { txid: "cd".repeat(32), confirmations: 6, blockHeight: 800_000, rawHex: "00" };

describe("renderValueHistory", () => {
  it("served-ok → view carries resolver stamps verbatim", () => {
    expect(SERVED_VALUE.ok).toBe(true); // guard fixture
    const r = renderValueHistory(SERVED_VALUE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.view.name).toBe(NAME);
    expect(r.view.count).toBe(1);
    expect(r.view.provenance).toBe("resolver-indexed-mirror");
    expect(r.view.authority).toBe("not-ownership-authority");
  });
  it("served-rejected → unavailable", () => {
    const rejected = projectServedValueHistory({ name: NAME, currentOwnership: null, records: [] });
    expect(rejected.ok).toBe(false);
    expect(renderValueHistory(rejected).ok).toBe(false);
  });
});

describe("renderRecoveryHistory", () => {
  it("served-ok → view carries resolver stamps verbatim", () => {
    expect(SERVED_RECOVERY.ok).toBe(true);
    const r = renderRecoveryHistory(SERVED_RECOVERY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.view.name).toBe(NAME);
    expect(r.view.count).toBe(1);
    expect(r.view.provenance).toBe("resolver-indexed-mirror");
    expect(r.view.authority).toBe("not-ownership-authority");
  });
});

describe("renderTx", () => {
  it("tx → view is provenance/display only, never ownership authority", () => {
    const r = renderTx(TX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.view.txid).toBe(TX.txid);
    expect(r.view.confirmations).toBe(6);
    expect(r.view.blockHeight).toBe(800_000);
    expect(r.view.provenance).toBe("bitcoin-chain");
    expect(r.view.authority).toBe("not-ownership-authority");
  });
  it("malformed tx → unavailable (never throws)", () => {
    let r: ReturnType<typeof renderTx> | undefined;
    expect(() => { r = renderTx(null as unknown as CliTxRead); }).not.toThrow();
    expect(r?.ok).toBe(false);
  });
});

describe("render — determinism", () => {
  it("is deterministic", () => {
    expect(renderValueHistory(SERVED_VALUE)).toEqual(renderValueHistory(SERVED_VALUE));
    expect(renderTx(TX)).toEqual(renderTx(TX));
  });
});

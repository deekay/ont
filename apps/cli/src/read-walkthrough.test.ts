import { describe, expect, it } from "vitest";
import { deriveOwnerPubkey, signValueRecord, signRecoveryDescriptor } from "@ont/protocol";
import {
  projectServedValueHistory,
  projectServedRecoveryHistory,
  type OwnershipInterval,
} from "@ont/adapter-resolver";
import { shapeReadQuery } from "./shape-read-query.js";
import { renderValueHistory, renderRecoveryHistory, renderTx } from "./render-read.js";
import type { CliReadPort, CliTxRead } from "./read-port.js";

// B5-CLI read walkthrough (hermetic). Each read command runs shape → mocked CliReadPort → render, with no live
// network/resolver/signing. RED until the shaping + render cores land.

const NAME = "alice";
const OWNER_SK = "11".repeat(32);
const OWNER_PUB = deriveOwnerPubkey(OWNER_SK);
const REF = "ab".repeat(32);
const T0 = "2026-01-01T00:00:00.000Z";
const TXID = "cd".repeat(32);
const CURRENT: OwnershipInterval = { currentOwnerPubkey: OWNER_PUB, ownershipRef: REF };

// Mocked read port (test double for the injected I/O seam — no live network).
const mockPort: CliReadPort = {
  fetchValueHistory: async () =>
    projectServedValueHistory({
      name: NAME, currentOwnership: CURRENT,
      records: [signValueRecord({ name: NAME, ownerPrivateKeyHex: OWNER_SK, ownershipRef: REF, sequence: 1, previousRecordHash: null, valueType: 0, payloadHex: "00", issuedAt: T0 })],
    }),
  fetchRecoveryDescriptorHistory: async () =>
    projectServedRecoveryHistory({
      name: NAME, currentOwnership: CURRENT,
      descriptors: [signRecoveryDescriptor({ name: NAME, ownerPrivateKeyHex: OWNER_SK, ownershipRef: REF, sequence: 1, previousDescriptorHash: null, recoveryAddress: "bc1qexamplerecoveryaddress00000000000000000", issuedAt: T0 })],
    }),
  fetchTx: async (txid: string): Promise<CliTxRead> => ({ txid, confirmations: 6, blockHeight: 800_000, rawHex: "00" }),
};

describe("B5-CLI read walkthrough — shape → mocked port → render (hermetic)", () => {
  it("get-value-history: shape → fetch → render preserves stamps", async () => {
    const q = shapeReadQuery("get-value-history", NAME);
    expect(q.ok).toBe(true);
    if (!q.ok || q.command === "get-tx") return;
    const served = await mockPort.fetchValueHistory(q.name);
    expect(served).not.toBeNull();
    const r = renderValueHistory(served!);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.view.authority).toBe("not-ownership-authority");
  });

  it("get-recovery-descriptor-history: shape → fetch → render preserves stamps", async () => {
    const q = shapeReadQuery("get-recovery-descriptor-history", NAME);
    expect(q.ok).toBe(true);
    if (!q.ok || q.command === "get-tx") return;
    const served = await mockPort.fetchRecoveryDescriptorHistory(q.name);
    expect(served).not.toBeNull();
    const r = renderRecoveryHistory(served!);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.view.authority).toBe("not-ownership-authority");
  });

  it("get-tx: shape → fetch → render is display/not-authority", async () => {
    const q = shapeReadQuery("get-tx", TXID);
    expect(q.ok).toBe(true);
    if (!q.ok || q.command !== "get-tx") return;
    const tx = await mockPort.fetchTx(q.txid);
    expect(tx).not.toBeNull();
    const r = renderTx(tx!);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.view.txid).toBe(TXID);
      expect(r.view.provenance).toBe("bitcoin-chain");
      expect(r.view.authority).toBe("not-ownership-authority");
    }
  });
});

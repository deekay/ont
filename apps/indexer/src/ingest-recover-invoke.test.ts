import { describe, expect, it } from "vitest";
import type { LegacyTransaction } from "@ont/bitcoin";
import type { ConfirmedRecoverOwnerInvoke } from "@ont/claim-path";
import type {
  BuildConfirmedRecoverOwnerInvokeInput,
  ConfirmedRecoverOwnerInvokeResult,
} from "@ont/adapter-indexer";
import {
  ingestRecoverInvokes,
  type ConfirmRecoverInvoke,
  type RecoverInvokeStore,
} from "./ingest-recover-invoke.js";

// @ont/indexer slice-4 red battery — recover-owner-invoke ingest driver (parallel to slice-1 confirmed-anchors).
// Drives the recover-invoke firewall (injected, default real buildConfirmedRecoverOwnerInvoke), persists ONLY
// accepted ConfirmedRecoverOwnerInvoke facts idempotently per txid, fail-closed, total. Hermetic: faked confirm
// for orchestration + one real-adapter pin via a malformed candidate. RED until the driver lands.

const minimalTx: LegacyTransaction = { version: 2, inputs: [], outputs: [], locktime: 0 };
const TXID_A = "ab".repeat(32);
const TXID_B = "ba".repeat(32);

function invokeFact(txid: string): ConfirmedRecoverOwnerInvoke {
  return {
    txid,
    minedHeight: 200,
    recoveryDescriptorHash: "cd".repeat(32),
    invokeFields: { opaque: "to-the-service" },
  } as unknown as ConfirmedRecoverOwnerInvoke;
}
function okResult(txid: string): ConfirmedRecoverOwnerInvokeResult {
  return { ok: true, confirmedInvoke: invokeFact(txid) };
}
const okConfirm = (txid: string): ConfirmRecoverInvoke => () => okResult(txid);
const rejectConfirm: ConfirmRecoverInvoke = () => ({ ok: false, reason: "invoke-malformed" });
const candidate = {} as unknown as BuildConfirmedRecoverOwnerInvokeInput;

function memStore() {
  const records = new Map<string, ConfirmedRecoverOwnerInvoke>();
  const store: RecoverInvokeStore = {
    has: (txid) => Promise.resolve(records.has(txid)),
    put: (invoke) => {
      records.set(invoke.txid, invoke);
      return Promise.resolve();
    },
  };
  return { store, records };
}

describe("ingestRecoverInvokes — orchestration (faked firewall)", () => {
  it("persists an accepted invoke and reports its txid", async () => {
    const { store, records } = memStore();
    const report = await ingestRecoverInvokes([candidate], store, okConfirm(TXID_A));
    expect(report.accepted).toEqual([TXID_A]);
    expect(report.rejected).toEqual([]);
    expect(records.has(TXID_A)).toBe(true);
  });

  it("persists exactly the firewall fact (no service-added fields)", async () => {
    const { store, records } = memStore();
    await ingestRecoverInvokes([candidate], store, okConfirm(TXID_A));
    expect(records.get(TXID_A)).toEqual(invokeFact(TXID_A));
  });

  it("fails closed on reject — nothing stored, reason reported", async () => {
    const { store, records } = memStore();
    const report = await ingestRecoverInvokes([candidate], store, rejectConfirm);
    expect(report.accepted).toEqual([]);
    expect(records.size).toBe(0);
    expect(report.rejected).toEqual([{ reason: "invoke-malformed" }]);
  });

  it("is idempotent per txid — second ingest skips, no re-put", async () => {
    const { store, records } = memStore();
    await ingestRecoverInvokes([candidate], store, okConfirm(TXID_A));
    let putCount = 0;
    const counting: RecoverInvokeStore = {
      has: store.has,
      put: (r) => {
        putCount++;
        return store.put(r);
      },
    };
    const report = await ingestRecoverInvokes([candidate], counting, okConfirm(TXID_A));
    expect(report.skipped).toEqual([TXID_A]);
    expect(report.accepted).toEqual([]);
    expect(putCount).toBe(0);
    expect(records.size).toBe(1);
  });

  it("drives a mixed batch independently — only the ok fact is stored", async () => {
    const { store, records } = memStore();
    let n = 0;
    const mixed: ConfirmRecoverInvoke = () => (n++ === 0 ? okResult(TXID_B) : { ok: false, reason: "invoke-malformed" });
    const report = await ingestRecoverInvokes([candidate, candidate], store, mixed);
    expect(report.accepted).toEqual([TXID_B]);
    expect(report.rejected).toEqual([{ reason: "invoke-malformed" }]);
    expect(records.size).toBe(1);
  });

  it("is total — a throwing firewall becomes ingest-error and the loop continues", async () => {
    const { store, records } = memStore();
    let n = 0;
    const throwThenOk: ConfirmRecoverInvoke = () => {
      if (n++ === 0) throw new Error("boom");
      return okResult(TXID_A);
    };
    const report = await ingestRecoverInvokes([candidate, candidate], store, throwThenOk);
    expect(report.rejected).toEqual([{ reason: "ingest-error" }]);
    expect(report.accepted).toEqual([TXID_A]);
    expect(records.size).toBe(1);
  });
});

describe("ingestRecoverInvokes — real-wiring smoke (default adapter)", () => {
  it("a malformed candidate runs through the REAL buildConfirmedRecoverOwnerInvoke → invoke-malformed, store untouched", async () => {
    const { store, records } = memStore();
    const malformed: BuildConfirmedRecoverOwnerInvokeInput = {
      invokeTx: minimalTx, // no RecoverOwner OP_RETURN output
      blockHeaderHex: "00".repeat(80),
      minedHeight: 200,
      merkle: [],
      pos: 0,
      headerSource: { headerHexAtHeight: () => null },
    };
    const report = await ingestRecoverInvokes([malformed], store); // DEFAULT confirm = real adapter
    expect(report.accepted).toEqual([]);
    expect(records.size).toBe(0);
    expect(report.rejected).toEqual([{ reason: "invoke-malformed" }]);
  });
});

import { describe, expect, it } from "vitest";
import type { LegacyTransaction } from "@ont/bitcoin";
import type { ConfirmedBatchAnchor } from "@ont/claim-path";
import type { BuildConfirmedBatchAnchorInput, ConfirmedBatchAnchorResult } from "@ont/adapter-indexer";
import {
  ingestConfirmedAnchors,
  type ConfirmAnchor,
  type ConfirmedAnchorRecord,
  type ConfirmedAnchorStore,
} from "./ingest-anchors.js";

// @ont/indexer slice-1 red battery — confirmed-anchor ingest driver. The service drives the firewall (injected,
// default real buildConfirmedBatchAnchor), persists ONLY ok facts, idempotent per anchoredRoot, fail-closed,
// total. Hermetic: a faked confirm for the orchestration pins + one real-adapter pin via a malformed candidate.
// RED until the driver lands (stub returns an empty report).

const minimalTx: LegacyTransaction = { version: 2, inputs: [], outputs: [], locktime: 0 };
const ROOT_A = "11".repeat(32);
const ROOT_B = "22".repeat(32);

function anchorFact(root: string): ConfirmedBatchAnchor {
  return { anchorTxid: "ab".repeat(32), minedHeight: 100, anchoredRoot: root, batchSize: 3 };
}
function okResult(root: string): ConfirmedBatchAnchorResult {
  return { ok: true, confirmedAnchor: anchorFact(root), feeTxParts: { anchorTx: minimalTx, prevoutTxs: [] } };
}
const okConfirm = (root: string): ConfirmAnchor => () => okResult(root);
const rejectConfirm: ConfirmAnchor = () => ({ ok: false, reason: "anchor-malformed" });

/** In-memory async store capturing puts — mirrors the future DB/filesystem port shape. */
function memStore() {
  const records = new Map<string, ConfirmedAnchorRecord>();
  const store: ConfirmedAnchorStore = {
    has: (root) => Promise.resolve(records.has(root)),
    put: (record) => {
      records.set(record.confirmedAnchor.anchoredRoot, record);
      return Promise.resolve();
    },
    getByTxid: (txid) => {
      for (const r of records.values()) if (r.confirmedAnchor.anchorTxid === txid) return Promise.resolve(r);
      return Promise.resolve(null);
    },
  };
  return { store, records };
}

// The faked-confirm pins ignore candidate content; cast an empty object through unknown.
const candidate = {} as unknown as BuildConfirmedBatchAnchorInput;

describe("ingestConfirmedAnchors — orchestration (faked firewall)", () => {
  it("persists an accepted anchor and reports its root", async () => {
    const { store, records } = memStore();
    const report = await ingestConfirmedAnchors([candidate], store, okConfirm(ROOT_A));
    expect(report.accepted).toEqual([ROOT_A]);
    expect(report.rejected).toEqual([]);
    expect(records.has(ROOT_A)).toBe(true);
  });

  it("persists exactly the adapter ok facts (no service-added fields)", async () => {
    const { store, records } = memStore();
    await ingestConfirmedAnchors([candidate], store, okConfirm(ROOT_A));
    // Whole-record equality (per CL): a stray service-added field (e.g. indexedAt) must fail this pin.
    expect(records.get(ROOT_A)).toEqual({
      confirmedAnchor: anchorFact(ROOT_A),
      feeTxParts: { anchorTx: minimalTx, prevoutTxs: [] },
    });
  });

  it("fails closed on reject — nothing stored, reason reported", async () => {
    const { store, records } = memStore();
    const report = await ingestConfirmedAnchors([candidate], store, rejectConfirm);
    expect(report.accepted).toEqual([]);
    expect(records.size).toBe(0);
    expect(report.rejected).toEqual([{ reason: "anchor-malformed" }]);
  });

  it("is idempotent per anchoredRoot — second ingest skips, no re-put", async () => {
    const { store, records } = memStore();
    await ingestConfirmedAnchors([candidate], store, okConfirm(ROOT_A));
    let putCount = 0;
    const counting: ConfirmedAnchorStore = {
      has: store.has,
      put: (r) => {
        putCount++;
        return store.put(r);
      },
      getByTxid: store.getByTxid,
    };
    const report = await ingestConfirmedAnchors([candidate], counting, okConfirm(ROOT_A));
    expect(report.skipped).toEqual([ROOT_A]);
    expect(report.accepted).toEqual([]);
    expect(putCount).toBe(0);
    expect(records.size).toBe(1);
  });

  it("drives a mixed batch independently — only the ok fact is stored", async () => {
    const { store, records } = memStore();
    let n = 0;
    const mixed: ConfirmAnchor = () => (n++ === 0 ? okResult(ROOT_B) : { ok: false, reason: "anchor-malformed" });
    const report = await ingestConfirmedAnchors([candidate, candidate], store, mixed);
    expect(report.accepted).toEqual([ROOT_B]);
    expect(report.rejected).toEqual([{ reason: "anchor-malformed" }]);
    expect(records.size).toBe(1);
  });

  it("is total — a throwing firewall becomes ingest-error and the loop continues", async () => {
    const { store, records } = memStore();
    let n = 0;
    const throwThenOk: ConfirmAnchor = () => {
      if (n++ === 0) throw new Error("boom");
      return okResult(ROOT_A);
    };
    const report = await ingestConfirmedAnchors([candidate, candidate], store, throwThenOk);
    expect(report.rejected).toEqual([{ reason: "ingest-error" }]);
    expect(report.accepted).toEqual([ROOT_A]);
    expect(records.size).toBe(1);
  });
});

describe("ingestConfirmedAnchors — real-wiring smoke (default adapter)", () => {
  it("a malformed candidate runs through the REAL buildConfirmedBatchAnchor → anchor-malformed, store untouched", async () => {
    const { store, records } = memStore();
    const malformed: BuildConfirmedBatchAnchorInput = {
      anchorTx: minimalTx, // no RootAnchor OP_RETURN output
      prevoutTxs: [],
      blockHeaderHex: "00".repeat(80),
      minedHeight: 100,
      merkle: [],
      pos: 0,
      headerSource: { headerHexAtHeight: () => null },
    };
    const report = await ingestConfirmedAnchors([malformed], store); // DEFAULT confirm = real adapter
    expect(report.accepted).toEqual([]);
    expect(records.size).toBe(0);
    expect(report.rejected).toEqual([{ reason: "anchor-malformed" }]);
  });
});

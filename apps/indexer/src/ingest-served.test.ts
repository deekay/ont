import { describe, expect, it } from "vitest";
import type { VerifyServedDeltaInput } from "@ont/adapter-indexer";
import {
  ingestServedBatches,
  type VerifyServedDelta,
  type IndexedBatchStore,
} from "./ingest-served.js";

// @ont/indexer slice-2 red battery — served-batch (availability) ingest driver. The service drives the
// availability firewall (injected, default real verifyServedDelta), persists ONLY verified batches as
// IndexedBatchRecords, idempotent per anchoredRoot, fail-closed on null, total. Hermetic: a faked verify for the
// orchestration pins + one real-adapter pin via a non-binding candidate. RED until the driver lands.

const PREV = "00".repeat(32);
const ROOT_A = "11".repeat(32);
const ROOT_B = "22".repeat(32);
const LEAF = { keyHex: "33".repeat(32), valueHex: "44".repeat(32) };

/** A candidate; faked verify ignores its content (the orchestration pins). */
function candidate(anchoredRoot: string): VerifyServedDeltaInput {
  return { prevRoot: PREV, anchoredRoot, baseLeaves: new Map(), presentedServed: [LEAF] };
}

const okVerify: VerifyServedDelta = () => [LEAF];
const rejectVerify: VerifyServedDelta = () => null;

/** In-memory async store capturing puts — mirrors the future DB/filesystem port shape. */
function memStore() {
  const records = new Map<string, VerifyServedDeltaInput>();
  const store: IndexedBatchStore = {
    has: (root) => Promise.resolve(records.has(root)),
    put: (record) => {
      records.set(record.anchoredRoot, record);
      return Promise.resolve();
    },
  };
  return { store, records };
}

describe("ingestServedBatches — orchestration (faked firewall)", () => {
  it("persists a verified batch and reports its root", async () => {
    const { store, records } = memStore();
    const report = await ingestServedBatches([candidate(ROOT_A)], store, okVerify);
    expect(report.accepted).toEqual([ROOT_A]);
    expect(report.rejected).toEqual([]);
    expect(records.has(ROOT_A)).toBe(true);
  });

  it("persists exactly the IndexedBatchRecord (no service-added fields)", async () => {
    const { store, records } = memStore();
    const c = candidate(ROOT_A);
    await ingestServedBatches([c], store, okVerify);
    // Whole-record equality so a stray service-added field would fail this pin.
    expect(records.get(ROOT_A)).toEqual({
      prevRoot: PREV,
      anchoredRoot: ROOT_A,
      baseLeaves: c.baseLeaves,
      presentedServed: [LEAF],
    });
  });

  it("fails closed on an unverifiable batch — nothing stored, reason reported", async () => {
    const { store, records } = memStore();
    const report = await ingestServedBatches([candidate(ROOT_A)], store, rejectVerify);
    expect(report.accepted).toEqual([]);
    expect(records.size).toBe(0);
    expect(report.rejected).toEqual([{ reason: "unverifiable" }]);
  });

  it("is idempotent per anchoredRoot — second ingest skips, no re-put", async () => {
    const { store, records } = memStore();
    await ingestServedBatches([candidate(ROOT_A)], store, okVerify);
    let putCount = 0;
    const counting: IndexedBatchStore = {
      has: store.has,
      put: (r) => {
        putCount++;
        return store.put(r);
      },
    };
    const report = await ingestServedBatches([candidate(ROOT_A)], counting, okVerify);
    expect(report.skipped).toEqual([ROOT_A]);
    expect(report.accepted).toEqual([]);
    expect(putCount).toBe(0);
    expect(records.size).toBe(1);
  });

  it("drives a mixed batch independently — only the verified record is stored", async () => {
    const { store, records } = memStore();
    let n = 0;
    const mixed: VerifyServedDelta = () => (n++ === 0 ? [LEAF] : null);
    const report = await ingestServedBatches([candidate(ROOT_B), candidate(ROOT_A)], store, mixed);
    expect(report.accepted).toEqual([ROOT_B]);
    expect(report.rejected).toEqual([{ reason: "unverifiable" }]);
    expect(records.size).toBe(1);
  });

  it("is total — a throwing firewall becomes ingest-error and the loop continues", async () => {
    const { store, records } = memStore();
    let n = 0;
    const throwThenOk: VerifyServedDelta = () => {
      if (n++ === 0) throw new Error("boom");
      return [LEAF];
    };
    const report = await ingestServedBatches([candidate(ROOT_A), candidate(ROOT_B)], store, throwThenOk);
    expect(report.rejected).toEqual([{ reason: "ingest-error" }]);
    expect(report.accepted).toEqual([ROOT_B]);
    expect(records.size).toBe(1);
  });
});

describe("ingestServedBatches — real-wiring smoke (default adapter)", () => {
  it("a non-binding candidate runs through the REAL verifyServedDelta → unverifiable, store untouched", async () => {
    const { store, records } = memStore();
    // valid-hex roots/leaves that cannot bind to the accumulator → verifyServedDelta returns null
    const nonBinding: VerifyServedDeltaInput = {
      prevRoot: "00".repeat(32),
      anchoredRoot: "11".repeat(32),
      baseLeaves: new Map(),
      presentedServed: [{ keyHex: "22".repeat(32), valueHex: "33".repeat(32) }],
    };
    const report = await ingestServedBatches([nonBinding], store); // DEFAULT verify = real adapter
    expect(report.accepted).toEqual([]);
    expect(records.size).toBe(0);
    expect(report.rejected).toEqual([{ reason: "unverifiable" }]);
  });
});

// LE-INDEX driver battery (LIVE_ENFORCEMENT_PLAN). A COHERENT fixture (synthetic mined fee-adequate anchor
// carrying a REAL RootAnchor OP_RETURN + real accumulator roots + a value-record-free anchorInclusionBundle the
// loop builds) so green only accepts when the audited enforceBatchedClaim genuinely passes. The driver writes
// ALL committed entries on accept and nothing on any reject/skip (CL's four separation tests + the §6 battery).
import { describe, expect, it } from "vitest";
import {
  accumulatorRootOf,
  deriveOwnerPubkey,
  sha256Hex,
  utf8ToBytes,
  normalizeName,
  signValueRecord,
} from "@ont/protocol";
import { encodeEvent, EventType } from "@ont/wire";
import { buildAccumulatorBatchClaimBundle, buildMembershipProof } from "@ont/evidence";
import { verifyProofBundleAgainstBitcoin, type BitcoinHeaderSource } from "@ont/consensus";
import { legacyTxidOf, headerMeetsTarget, type LegacyTransaction } from "@ont/bitcoin";
import type { BuildConfirmedBatchAnchorInput } from "@ont/adapter-indexer";
import type { NameStateRecord, NameStateStore } from "@ont/name-state-store";
import { enforceBatchedClaims, type BatchMaterial, type EnforceBatchedClaimsDeps } from "./enforce-batched-claims.js";
import { runIndexerTick, createInMemoryIndexerCursorStore, createInMemoryConfirmedAnchorStore } from "./runner.js";

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
const reversedBytes = (b: Uint8Array): Uint8Array => Uint8Array.from(b).reverse();
/** OP_RETURN scriptPubKey hex for a payload via the minimal push (the firewall's exactly-one-RootAnchor scan). */
function opReturn(payload: Uint8Array): string {
  const len = payload.length;
  const prefix = len <= 75 ? Uint8Array.of(0x6a, len) : Uint8Array.of(0x6a, 0x4c, len);
  return bytesToHex(prefix) + bytesToHex(payload);
}

// ---------- a coherent 2-name batch ----------
const NAME_A = "alice"; // 5 bytes
const NAME_C = "carol"; // 5 bytes (≥5 ⇒ gate floor 100k each ⇒ Σg 200k ≤ paidFee 1M)
const SK_A = "11".repeat(32);
const SK_C = "22".repeat(32);
const OWNER_A = deriveOwnerPubkey(SK_A); // real x-only pubkey (32-byte hex accumulator value)
const OWNER_C = deriveOwnerPubkey(SK_C);
const LEAF_A = sha256Hex(utf8ToBytes(normalizeName(NAME_A)));
const LEAF_C = sha256Hex(utf8ToBytes(normalizeName(NAME_C)));
const OTHER_KEY = "aa".repeat(32);
const OTHER_VAL = "33".repeat(32);

const BASE = new Map([[OTHER_KEY, OTHER_VAL]]);
const FULL = new Map([
  [OTHER_KEY, OTHER_VAL],
  [LEAF_A, OWNER_A],
  [LEAF_C, OWNER_C],
]);
const PREV_ROOT = accumulatorRootOf(BASE);
const ANCHORED_ROOT = accumulatorRootOf(FULL);
const SERVED = [
  { keyHex: LEAF_A, valueHex: OWNER_A },
  { keyHex: LEAF_C, valueHex: OWNER_C },
];
const BATCH_SIZE = 2;

// Fee-adequate anchor carrying a REAL RootAnchor OP_RETURN: prevouts 5M + 3M, one 7M output ⇒ paidFee 1M.
const PREVOUT_A: LegacyTransaction = { version: 1, inputs: [{ prevoutTxid: "00".repeat(32), prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff }], outputs: [{ valueSats: 5_000_000n, scriptPubKeyHex: "51" }], locktime: 0 };
const PREVOUT_B: LegacyTransaction = { version: 1, inputs: [{ prevoutTxid: "00".repeat(32), prevoutVout: 1, scriptSigHex: "", sequence: 0xffffffff }], outputs: [{ valueSats: 3_000_000n, scriptPubKeyHex: "51" }], locktime: 0 };
const ROOT_ANCHOR_PAYLOAD = encodeEvent({ type: EventType.RootAnchor, prevRoot: PREV_ROOT, newRoot: ANCHORED_ROOT, batchSize: BATCH_SIZE });
const ANCHOR_TX: LegacyTransaction = {
  version: 1,
  inputs: [PREVOUT_A, PREVOUT_B].map((p) => ({ prevoutTxid: legacyTxidOf(p)!, prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff })),
  outputs: [{ valueSats: 7_000_000n, scriptPubKeyHex: opReturn(ROOT_ANCHOR_PAYLOAD) }],
  locktime: 0,
};
const ANCHOR_TXID = legacyTxidOf(ANCHOR_TX)!;
const ANCHOR_HEIGHT = 170;

// Synthetic 1-tx block header: merkleRoot (internal) = the anchor txid; easy nBits 0x2000ffff + mined nonce.
function mineAnchorHeader(): string {
  const h = new Uint8Array(80);
  h[0] = 1;
  h.set(reversedBytes(hexToBytes(ANCHOR_TXID)), 36);
  h[68] = 0x40; h[69] = 0x9c; h[70] = 0x00; h[71] = 0x00;
  h[72] = 0xff; h[73] = 0xff; h[74] = 0x00; h[75] = 0x20; // nBits LE = 0x2000ffff
  for (let nonce = 0; nonce < 5_000_000; nonce++) {
    h[76] = nonce & 0xff; h[77] = (nonce >>> 8) & 0xff; h[78] = (nonce >>> 16) & 0xff; h[79] = (nonce >>> 24) & 0xff;
    if (headerMeetsTarget(h)) return bytesToHex(h);
  }
  throw new Error("mineAnchorHeader: no nonce found");
}
const ANCHOR_HEADER = mineAnchorHeader();
const HEADER_SOURCE: BitcoinHeaderSource = { headerHexAtHeight: (height) => (height === ANCHOR_HEIGHT ? ANCHOR_HEADER : null) };

function candidate(over: Partial<BuildConfirmedBatchAnchorInput> = {}): BuildConfirmedBatchAnchorInput {
  return {
    anchorTx: ANCHOR_TX,
    prevoutTxs: [PREVOUT_A, PREVOUT_B],
    blockHeaderHex: ANCHOR_HEADER,
    minedHeight: ANCHOR_HEIGHT,
    merkle: [],
    pos: 0,
    headerSource: HEADER_SOURCE,
    anchorVout: 0,
    ...over,
  };
}

const FULL_MATERIAL: BatchMaterial = {
  committedEntries: [{ name: NAME_A, ownerPubkey: OWNER_A }, { name: NAME_C, ownerPubkey: OWNER_C }],
  baseLeaves: BASE,
  servedLeaves: SERVED,
};
const POLICY = { window: { K: 6, W: 2, C: 3 }, gateFeeSchedule: { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 100_000n } };

function inMemoryStore(): NameStateStore & { all(): NameStateRecord[] } {
  const m = new Map<string, NameStateRecord>();
  return {
    has: (n) => Promise.resolve(m.has(n)),
    put: (r) => { m.set(r.canonicalName, r); return Promise.resolve(); },
    putMany: (rs) => { for (const r of rs) m.set(r.canonicalName, r); return Promise.resolve(); },
    getByName: (n) => Promise.resolve(m.get(n) ?? null),
    all: () => [...m.values()],
  };
}

/** A store whose batch write FAILS — models a mid-batch persistence failure. all() proves no record landed. */
function failingPutManyStore(): NameStateStore & { all(): NameStateRecord[] } {
  const m = new Map<string, NameStateRecord>();
  return {
    has: (n) => Promise.resolve(m.has(n)),
    put: () => Promise.reject(new Error("disk full")),
    putMany: () => Promise.reject(new Error("disk full")), // atomic write fails → NOTHING durable
    getByName: (n) => Promise.resolve(m.get(n) ?? null),
    all: () => [...m.values()],
  };
}

function deps(over: Partial<EnforceBatchedClaimsDeps> = {}): EnforceBatchedClaimsDeps & { store: ReturnType<typeof inMemoryStore> } {
  const store = (over.nameStateStore as ReturnType<typeof inMemoryStore>) ?? inMemoryStore();
  return {
    batchMaterial: over.batchMaterial ?? ((r, p) => (r === ANCHORED_ROOT && p === PREV_ROOT ? FULL_MATERIAL : null)),
    nameStateStore: store,
    policy: over.policy ?? POLICY,
    store,
  };
}

describe("enforceBatchedClaims (LE-INDEX driver)", () => {
  it("accept: a valid bundle + verified full batch writes ALL committed entries (not just [0])", async () => {
    const d = deps();
    const report = await enforceBatchedClaims([candidate()], d);
    expect(report.accepted).toEqual([ANCHORED_ROOT]);
    expect(report.namesWritten).toBe(2);
    const alice = await d.store.getByName(NAME_A);
    const carol = await d.store.getByName(NAME_C);
    expect(alice?.owner.ownerPubkeyHex).toBe(OWNER_A);
    expect(carol?.owner.ownerPubkeyHex).toBe(OWNER_C);
    expect(alice?.leafKeyHex).toBe(LEAF_A);
    expect(alice?.batchLocalIndex).toBe(0);
    expect(carol?.batchLocalIndex).toBe(1);
    expect(alice?.anchor).toEqual({ txid: ANCHOR_TXID, minedHeight: ANCHOR_HEIGHT, txIndex: 0, vout: 0 });
    expect(alice?.anchoredRoot).toBe(ANCHORED_ROOT);
    expect(alice?.trace.at(-1)).toEqual({ step: "verdict", ok: true, reason: "batched-claim-accepted" });
  });

  it("CL#1 inclusion: a non-canonical header (bundle anchor not Bitcoin-bound) rejects with NO writes", async () => {
    const wrongHeaderCandidate = candidate({ headerSource: { headerHexAtHeight: () => "00".repeat(80) } });
    const d = deps();
    const report = await enforceBatchedClaims([wrongHeaderCandidate], d);
    expect(report.accepted).toEqual([]);
    expect(report.namesWritten).toBe(0);
    expect(d.store.all()).toEqual([]);
    expect(report.rejected[0]?.reason).toMatch(/hrns-rejected-at-inclusion/);
  });

  it("CL#2 availability: withheld served bytes (incomplete) rejects after inclusion with NO writes", async () => {
    const withheld: BatchMaterial = { ...FULL_MATERIAL, servedLeaves: [{ keyHex: LEAF_A, valueHex: OWNER_A }] }; // only 1 of 2
    const d = deps({ batchMaterial: (r, p) => (r === ANCHORED_ROOT && p === PREV_ROOT ? withheld : null) });
    const report = await enforceBatchedClaims([candidate()], d);
    expect(report.accepted).toEqual([]);
    expect(report.namesWritten).toBe(0);
    expect(d.store.all()).toEqual([]);
    expect(report.rejected[0]?.reason).toMatch(/hrns-rejected-at-(availability|completeness)/);
  });

  it("CL#4 fail-closed: an empty committed set rejects BEFORE picking entry[0] (no throw, no writes)", async () => {
    const empty: BatchMaterial = { committedEntries: [], baseLeaves: BASE, servedLeaves: [] };
    const d = deps({ batchMaterial: (r, p) => (r === ANCHORED_ROOT && p === PREV_ROOT ? empty : null) });
    const report = await enforceBatchedClaims([candidate()], d);
    expect(report.rejected).toEqual([{ anchoredRoot: ANCHORED_ROOT, reason: "empty-committed-set" }]);
    expect(report.namesWritten).toBe(0);
    expect(d.store.all()).toEqual([]);
  });

  it("bare RootAnchor: no batch material is SKIPPED (read path untouched, no writes)", async () => {
    const d = deps({ batchMaterial: () => null });
    const report = await enforceBatchedClaims([candidate()], d);
    expect(report.skipped).toEqual([ANCHORED_ROOT]);
    expect(report.accepted).toEqual([]);
    expect(report.namesWritten).toBe(0);
    expect(d.store.all()).toEqual([]);
  });

  it("atomicity: a name-state write failure THROWS out (accept writes ALL or NONE — no partial durable state)", async () => {
    const store = failingPutManyStore();
    const d: EnforceBatchedClaimsDeps = {
      batchMaterial: (r, p) => (r === ANCHORED_ROOT && p === PREV_ROOT ? FULL_MATERIAL : null),
      nameStateStore: store,
      policy: POLICY,
    };
    // The atomic putMany failure is NOT swallowed as a reject — it throws out (so the wired tick won't advance
    // the cursor), and the all-or-nothing write left NO partial name-state.
    await expect(enforceBatchedClaims([candidate()], d)).rejects.toThrow(/disk full/);
    expect(store.all()).toEqual([]);
  });

  it("atomicity (wired): a name-state write failure aborts runIndexerTick so the cursor is NOT advanced (retry)", async () => {
    const store = failingPutManyStore();
    const cursorStore = createInMemoryIndexerCursorStore(0);
    const blockSource = { nextConfirmedAnchors: () => Promise.resolve({ candidates: [candidate()], cursor: { height: 99 } }) };
    await expect(
      runIndexerTick({
        blockSource,
        cursorStore,
        anchorStore: createInMemoryConfirmedAnchorStore(),
        enforcement: { batchMaterial: (r, p) => (r === ANCHORED_ROOT && p === PREV_ROOT ? FULL_MATERIAL : null), nameStateStore: store, policy: POLICY },
      }),
    ).rejects.toThrow(/disk full/);
    expect(store.all()).toEqual([]); // no partial name-state
    expect(await cursorStore.load()).toEqual({ height: 0 }); // cursor NOT advanced — the batch retries
  });
});

// CL boundary test: the value-record-free anchorInclusionBundle the driver builds passes structure +
// against-Bitcoin, but attaching a value record whose ownershipRef ≠ the synthetic carrier ref fails the
// existing value-record chain checks — pinning "synthetic ref is OK ONLY because no value chain rides here".
describe("anchorInclusionBundle carrier safety (value-record-free is the precondition)", () => {
  const repLeaf = LEAF_A; // the driver's synthetic carrier ref = H(rep.name)
  const membership = buildMembershipProof(FULL, repLeaf);
  const inclusion = { txid: ANCHOR_TXID, height: ANCHOR_HEIGHT, blockHeaderHex: ANCHOR_HEADER, merkle: [] as string[], pos: 0 };

  it("the value-record-free carrier bundle verifies against Bitcoin", () => {
    const bundle = buildAccumulatorBatchClaimBundle({
      name: NAME_A, assuranceTier: "accumulator-batched", verificationGoal: "carrier",
      ownership: { currentOwnerPubkey: OWNER_A, ownershipRef: repLeaf },
      membership, anchor: { anchorTxid: ANCHOR_TXID, anchorHeight: ANCHOR_HEIGHT }, inclusion,
    });
    expect(verifyProofBundleAgainstBitcoin(bundle, { headerSource: HEADER_SOURCE }).valid).toBe(true);
  });

  it("a value record with a MISMATCHED ownershipRef is rejected AT CONSTRUCTION (the synthetic ref can't ride a value chain)", () => {
    const mismatchedRecord = signValueRecord({
      name: NAME_A, ownerPrivateKeyHex: SK_A, ownershipRef: "ff".repeat(32), // ≠ repLeaf (the carrier ref)
      sequence: 1, previousRecordHash: null, valueType: 0, payloadHex: "00", issuedAt: "2026-06-01T00:00:00.000Z",
    });
    // Even stronger than a verify-time reject: buildAccumulatorBatchClaimBundle refuses to ASSEMBLE a bundle
    // whose value record's ownershipRef ≠ the bundle ownershipRef — so a synthetic carrier ref is only ever
    // valid where no value chain rides (exactly the LE-INDEX value-record-free carrier).
    expect(() =>
      buildAccumulatorBatchClaimBundle({
        name: NAME_A, assuranceTier: "accumulator-batched", verificationGoal: "carrier+badvaluerecord",
        ownership: { currentOwnerPubkey: OWNER_A, ownershipRef: repLeaf },
        membership, anchor: { anchorTxid: ANCHOR_TXID, anchorHeight: ANCHOR_HEIGHT }, inclusion,
        valueRecords: [mismatchedRecord],
      }),
    ).toThrow(/ownershipRef does not match/);
  });
});

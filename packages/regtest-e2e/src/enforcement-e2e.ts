// LE-INDEX slice-3 — the hermetic live-enforcement e2e (HERMETIC; no bitcoind, no ONT_E2E_REGTEST gate).
//
// Proves the audited batched-claim enforcement runs through the DEPLOYED indexer path over DURABLE state:
//   - a COHERENT synthetic mined fee-adequate RootAnchor anchor (a real RootAnchor OP_RETURN + real accumulator
//     roots over a 2-name batch alice+carol) — so the audited enforceBatchedClaim only accepts when it genuinely
//     passes against Bitcoin (inclusion → gate-fee → availability → completeness → verdict), not a stub;
//   - driven through the REAL daemon selector path (selectIndexerRunnerDeps, as called by main.ts) into the REAL
//     runIndexerTick with ONT_STORE=file and ONT_ENFORCEMENT=fixture-file — cursor/anchor/name-state stores and
//     batch-material loading are selected exactly as the daemon does;
//   - the per-name name-state is read back through a FRESH file store after the stores are dropped (restart);
//   - the §6.3 acceptance battery (LIVE_ENFORCEMENT_PLAN): (a) accept writes per-name state + survives restart;
//     (b) withheld served bytes → reject at availability, NO mutation; (c) a mismatched proof bundle
//     (non-canonical header) → reject at inclusion, NO mutation; (d) missing fixture material in the daemon path
//     THROWS out of the tick so the durable cursor is NOT advanced and NO name-state lands on disk;
//     (e) generated A' fixture material enforces through the same selector path; (f) operator-A serves
//     /da/{root} over HTTP while operator-B fetches through ONT_ENFORCEMENT=http-da, accepts identical state, and
//     holds the cursor with no name-state on 404 or non-reconstructing declared roots.
//
// HERMETIC by design (mirrors the G2 restart e2e): the ingest firewall `confirm` is FAKED (this slice locks live
// ENFORCEMENT + durable name-state, not the inclusion firewall — that is slice-1 tested), while ENFORCEMENT
// re-verifies the coherent anchor against Bitcoin independently via the candidate's headerSource. The driver-level
// separation/atomicity tests live in apps/indexer/src/enforce-batched-claims.test.ts; this e2e pins the live
// wiring + durability end-to-end. TESTS: ./enforcement-e2e.test.ts.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { accumulatorRootOf, deriveOwnerPubkey, sha256Hex, utf8ToBytes, normalizeName } from "@ont/protocol";
import { encodeEvent, EventType } from "@ont/wire";
import { legacyTxidOf, headerMeetsTarget, type LegacyTransaction } from "@ont/bitcoin";
import { assembleRootAnchorTx } from "@ont/adapter-publisher";
import { createInMemoryPublisherBroadcastPort, createPublisherHttpServer } from "@ont/publisher";
import {
  createFileNameStateStore,
  type NameStateRecord,
} from "@ont/name-state-store";
import {
  runIndexerTick,
  selectIndexerRunnerDeps,
  selectIndexerStores,
  type ConfirmAnchor,
  type IndexerBlockSource,
  type IndexerTickReport,
  type BuildConfirmedBatchAnchorInput,
  type BatchMaterial,
  type EnforceBatchedClaimsReport,
} from "@ont/indexer";

// ── result shape (the test asserts on this) ────────────────────────────────────────────────────────────────
interface AcceptOutcome {
  readonly acceptedRoots: readonly string[];
  readonly namesWritten: number;
  readonly anchorInReadPath: boolean; // the anchor ALSO lands in the G1/G2/G3 read path (additive)
  readonly cursorHeightAfterRestart: number;
  readonly aliceDurable: NameStateRecord | null; // read via a FRESH file store over the same dir = restart-survival
  readonly carolDurable: NameStateRecord | null;
}
interface RejectOutcome {
  readonly rejectedReason: string | undefined;
  readonly namesWritten: number;
  readonly anchorInReadPath: boolean;
  readonly aliceDurable: boolean;
}
interface HttpDaPendingOutcome {
  readonly threw: boolean;
  readonly errorMessage: string;
  readonly cursorHeightAfterRestart: number;
  readonly anchorInReadPath: boolean;
  readonly aliceDurable: boolean;
}
interface MissingMaterialOutcome {
  readonly threw: boolean;
  readonly errorMessage: string;
  readonly cursorHeightAfterRestart: number; // unchanged (0) — the failed batch retries
  readonly aliceDurable: boolean;
}
interface GeneratedFixtureOutcome {
  readonly materialKey: string;
  readonly anchorInput: { readonly prevRoot: string; readonly newRoot: string; readonly batchSize: number };
  readonly anchorTxid: string;
  readonly acceptedRoots: readonly string[];
  readonly namesWritten: number;
  readonly aliceDurable: NameStateRecord | null;
}
interface TwoOperatorHttpDaOutcome {
  readonly served: AcceptOutcome;
  readonly withheld: HttpDaPendingOutcome;
  readonly tampered: HttpDaPendingOutcome;
}
export interface EnforcementE2eResult {
  readonly anchorTxid: string;
  readonly anchoredRoot: string;
  readonly minedHeight: number;
  readonly nameA: string;
  readonly nameC: string;
  readonly ownerA: string;
  readonly ownerC: string;
  readonly leafA: string;
  readonly accept: AcceptOutcome;
  readonly withheld: RejectOutcome;
  readonly badHeader: RejectOutcome;
  readonly missingMaterial: MissingMaterialOutcome;
  readonly generatedFixture: GeneratedFixtureOutcome;
  readonly twoOperatorHttpDa: TwoOperatorHttpDaOutcome;
}

// ── byte helpers (the firewall's exactly-one-RootAnchor OP_RETURN scan) ─────────────────────────────────────
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
function opReturn(payload: Uint8Array): string {
  const len = payload.length;
  const prefix = len <= 75 ? Uint8Array.of(0x6a, len) : Uint8Array.of(0x6a, 0x4c, len);
  return bytesToHex(prefix) + bytesToHex(payload);
}

// ── a coherent 2-name batch (alice + carol, both 5 bytes => gate floor 100k each => Σg 200k <= paidFee 1M) ─────
const NAME_A = "alice";
const NAME_C = "carol";
const SK_A = "11".repeat(32);
const SK_C = "22".repeat(32);
const OWNER_A = deriveOwnerPubkey(SK_A);
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

// Fee-adequate anchor carrying a REAL RootAnchor OP_RETURN: prevouts 5M + 3M, one 7M output => paidFee 1M.
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
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const GENERATOR_SCRIPT = join(REPO_ROOT, "scripts/generate-fixture-batch-material.mjs");

// Synthetic 1-tx block header: merkleRoot (internal) = the anchor txid; easy nBits 0x2000ffff + mined nonce.
function mineAnchorHeader(txid = ANCHOR_TXID): string {
  const h = new Uint8Array(80);
  h[0] = 1;
  h.set(reversedBytes(hexToBytes(txid)), 36);
  h[68] = 0x40; h[69] = 0x9c; h[70] = 0x00; h[71] = 0x00;
  h[72] = 0xff; h[73] = 0xff; h[74] = 0x00; h[75] = 0x20; // nBits LE = 0x2000ffff
  for (let nonce = 0; nonce < 5_000_000; nonce++) {
    h[76] = nonce & 0xff; h[77] = (nonce >>> 8) & 0xff; h[78] = (nonce >>> 16) & 0xff; h[79] = (nonce >>> 24) & 0xff;
    if (headerMeetsTarget(h)) return bytesToHex(h);
  }
  throw new Error("mineAnchorHeader: no nonce found");
}
const ANCHOR_HEADER = mineAnchorHeader();
const HEADER_SOURCE = { headerHexAtHeight: (height: number): string | null => (height === ANCHOR_HEIGHT ? ANCHOR_HEADER : null) };

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
const WITHHELD_MATERIAL: BatchMaterial = { ...FULL_MATERIAL, servedLeaves: [{ keyHex: LEAF_A, valueHex: OWNER_A }] }; // only 1 of 2
const TAMPERED_SERVED_MATERIAL: BatchMaterial = {
  ...FULL_MATERIAL,
  servedLeaves: [{ keyHex: LEAF_A, valueHex: OWNER_A }],
};

// The ingest firewall is faked (this slice locks enforcement + durability, not inclusion): confirm returns the ok
// record for the anchor so it lands in the read path. Enforcement re-verifies the anchor against Bitcoin itself.
const confirm: ConfirmAnchor = () => ({
  ok: true,
  confirmedAnchor: { anchorTxid: ANCHOR_TXID, minedHeight: ANCHOR_HEIGHT, anchoredRoot: ANCHORED_ROOT, batchSize: BATCH_SIZE },
  feeTxParts: { anchorTx: ANCHOR_TX, prevoutTxs: [PREVOUT_A, PREVOUT_B] },
});

const NAME_STATE_FILE = "name-state.json";
const BATCH_MATERIAL_FILE = "batch-material.json";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "ont-enforcement-e2e-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function encodeMaterialFileEntry(material: BatchMaterial) {
  return {
    anchoredRoot: ANCHORED_ROOT,
    prevRoot: PREV_ROOT,
    committedEntries: material.committedEntries,
    baseLeaves: [...material.baseLeaves.entries()].map(([keyHex, valueHex]) => ({ keyHex, valueHex })),
    servedLeaves: material.servedLeaves,
  };
}

async function writeMaterialFile(dir: string, material: BatchMaterial | null): Promise<string> {
  const path = join(dir, BATCH_MATERIAL_FILE);
  const materials = material === null ? [] : [encodeMaterialFileEntry(material)];
  await writeFile(path, JSON.stringify({ materials }), "utf8");
  return path;
}

async function runTickWithMaterialFile(opts: {
  readonly dir: string;
  readonly materialFile: string;
  readonly candidateOverride?: Partial<BuildConfirmedBatchAnchorInput>;
}): Promise<IndexerTickReport> {
  const cand = candidate(opts.candidateOverride);
  let yielded = false;
  const blockSource: IndexerBlockSource = {
    nextConfirmedAnchors: (cursor) => {
      if (yielded) return Promise.resolve({ candidates: [], cursor });
      yielded = true;
      const nextHeight = cursor.height + 1;
      return Promise.resolve({
        candidates: [cand],
        cursor: { height: nextHeight },
        headers: [{ height: nextHeight, headerHex: "00".repeat(80) }],
      });
    },
  };
  const deps = await selectIndexerRunnerDeps(
    { ONT_STORE: "file", ONT_STORE_DIR: opts.dir, ONT_ENFORCEMENT: "fixture-file", ONT_BATCH_MATERIAL_FILE: opts.materialFile },
    { blockSource, confirm },
  );
  return runIndexerTick(deps);
}

async function runTickWithHttpDa(opts: {
  readonly dir: string;
  readonly endpoint: string;
  readonly roots?: string;
  readonly candidateOverride?: Partial<BuildConfirmedBatchAnchorInput>;
}): Promise<IndexerTickReport> {
  const cand = candidate(opts.candidateOverride);
  let yielded = false;
  const blockSource: IndexerBlockSource = {
    nextConfirmedAnchors: (cursor) => {
      if (yielded) return Promise.resolve({ candidates: [], cursor });
      yielded = true;
      const nextHeight = cursor.height + 1;
      return Promise.resolve({
        candidates: [cand],
        cursor: { height: nextHeight },
        headers: [{ height: nextHeight, headerHex: "00".repeat(80) }],
      });
    },
  };
  const deps = await selectIndexerRunnerDeps(
    {
      ONT_STORE: "file",
      ONT_STORE_DIR: opts.dir,
      ONT_ENFORCEMENT: "http-da",
      ONT_DA_ENDPOINT: opts.endpoint,
      ONT_DA_ROOTS: opts.roots ?? ANCHORED_ROOT,
    },
    { blockSource, confirm },
  );
  return runIndexerTick(deps);
}

/** One enforcement tick over REAL daemon-selected file stores under `dir`: selectIndexerRunnerDeps is the
 *  main.ts selector path, with only the block-source and ingest-confirm seams injected for this hermetic fixture. */
async function runTick(opts: {
  readonly dir: string;
  readonly material: BatchMaterial | null;
  readonly candidateOverride?: Partial<BuildConfirmedBatchAnchorInput>;
}): Promise<IndexerTickReport> {
  const materialFile = await writeMaterialFile(opts.dir, opts.material);
  return runTickWithMaterialFile({
    dir: opts.dir,
    materialFile,
    ...(opts.candidateOverride === undefined ? {} : { candidateOverride: opts.candidateOverride }),
  });
}

function materialRecordJson(material: BatchMaterial): string {
  return JSON.stringify(encodeMaterialFileEntry(material));
}

async function withPublisherDaServer<T>(
  records: ReadonlyMap<string, string>,
  fn: (endpoint: string) => Promise<T>,
): Promise<T> {
  const server = createPublisherHttpServer({
    broadcast: createInMemoryPublisherBroadcastPort(),
    daRecordSource: {
      getRecord: (anchoredRoot) => Promise.resolve(records.get(anchoredRoot) ?? null),
    },
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  try {
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("publisher e2e server did not bind TCP");
    return await fn(`http://127.0.0.1:${(address as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

/** The "restart": FRESH env-selected stores + a FRESH name-state store over the same dir, then read durable state. */
async function restartReads(dir: string): Promise<{ anchorInReadPath: boolean; cursorHeight: number; alice: NameStateRecord | null; carol: NameStateRecord | null }> {
  const stores = selectIndexerStores({ ONT_STORE: "file", ONT_STORE_DIR: dir });
  const reader = createFileNameStateStore(join(dir, NAME_STATE_FILE));
  return {
    anchorInReadPath: await stores.anchorStore.has(ANCHORED_ROOT),
    cursorHeight: (await stores.cursorStore.load()).height,
    alice: await reader.getByName(NAME_A),
    carol: await reader.getByName(NAME_C),
  };
}

function requireEnforcement(report: IndexerTickReport): EnforceBatchedClaimsReport {
  if (report.enforcement === undefined) throw new Error("e2e: enforcement report missing (enforcement dep not configured?)");
  return report.enforcement;
}

async function runGeneratedFixture(dir: string): Promise<GeneratedFixtureOutcome> {
  const materialFile = join(dir, "generated-batch-material.json");
  const anchorInputFile = join(dir, "generated-root-anchor-input.json");
  execFileSync(process.execPath, [
    GENERATOR_SCRIPT,
    "--entry-secret",
    `${NAME_A}:${SK_A}`,
    "--material-out",
    materialFile,
    "--anchor-out",
    anchorInputFile,
  ], { cwd: REPO_ROOT, stdio: "pipe" });

  const anchorInput = JSON.parse(await readFile(anchorInputFile, "utf8")) as {
    readonly prevRoot: string;
    readonly newRoot: string;
    readonly batchSize: number;
  };
  const anchorTx = assembleRootAnchorTx({
    prevRoot: anchorInput.prevRoot,
    newRoot: anchorInput.newRoot,
    batchSize: anchorInput.batchSize,
    fundingInputs: [
      { prevoutTxid: legacyTxidOf(PREVOUT_A)!, prevoutVout: 0 },
      { prevoutTxid: legacyTxidOf(PREVOUT_B)!, prevoutVout: 0 },
    ],
    changeOutput: { valueSats: 7_000_000n, scriptPubKeyHex: "51" },
  });
  if (anchorTx === null) throw new Error("generated fixture: assembleRootAnchorTx returned null");
  const anchorTxid = legacyTxidOf(anchorTx);
  if (anchorTxid === null) throw new Error("generated fixture: anchor tx not serializable");
  const header = mineAnchorHeader(anchorTxid);
  const headerSource = { headerHexAtHeight: (height: number): string | null => (height === ANCHOR_HEIGHT ? header : null) };
  const generatedCandidate: BuildConfirmedBatchAnchorInput = {
    anchorTx,
    prevoutTxs: [PREVOUT_A, PREVOUT_B],
    blockHeaderHex: header,
    minedHeight: ANCHOR_HEIGHT,
    merkle: [],
    pos: 0,
    headerSource,
    anchorVout: 0,
  };
  const generatedConfirm: ConfirmAnchor = () => ({
    ok: true,
    confirmedAnchor: {
      anchorTxid,
      minedHeight: ANCHOR_HEIGHT,
      anchoredRoot: anchorInput.newRoot,
      batchSize: anchorInput.batchSize,
    },
    feeTxParts: { anchorTx, prevoutTxs: [PREVOUT_A, PREVOUT_B] },
  });

  let yielded = false;
  const blockSource: IndexerBlockSource = {
    nextConfirmedAnchors: (cursor) => {
      if (yielded) return Promise.resolve({ candidates: [], cursor });
      yielded = true;
      return Promise.resolve({
        candidates: [generatedCandidate],
        cursor: { height: cursor.height + 1 },
        headers: [{ height: cursor.height + 1, headerHex: "00".repeat(80) }],
      });
    },
  };
  const deps = await selectIndexerRunnerDeps(
    { ONT_STORE: "file", ONT_STORE_DIR: dir, ONT_ENFORCEMENT: "fixture-file", ONT_BATCH_MATERIAL_FILE: materialFile },
    { blockSource, confirm: generatedConfirm },
  );
  const enforcement = requireEnforcement(await runIndexerTick(deps));
  const back = await restartReads(dir);

  return {
    materialKey: `${anchorInput.prevRoot}:${anchorInput.newRoot}`,
    anchorInput,
    anchorTxid,
    acceptedRoots: enforcement.accepted,
    namesWritten: enforcement.namesWritten,
    aliceDurable: back.alice,
  };
}

async function runTwoOperatorHttpDa(): Promise<TwoOperatorHttpDaOutcome> {
  const served = await withTempDir((dir) => withPublisherDaServer(
    new Map([[ANCHORED_ROOT, materialRecordJson(FULL_MATERIAL)]]),
    async (endpoint) => {
      const enf = requireEnforcement(await runTickWithHttpDa({ dir, endpoint }));
      const back = await restartReads(dir);
      return {
        acceptedRoots: enf.accepted,
        namesWritten: enf.namesWritten,
        anchorInReadPath: back.anchorInReadPath,
        cursorHeightAfterRestart: back.cursorHeight,
        aliceDurable: back.alice,
        carolDurable: back.carol,
      };
    },
  ));

  const withheld = await runPendingHttpDa(new Map());
  const tampered = await runPendingHttpDa(new Map([[ANCHORED_ROOT, materialRecordJson(TAMPERED_SERVED_MATERIAL)]]));

  return { served, withheld, tampered };
}

async function runPendingHttpDa(records: ReadonlyMap<string, string>): Promise<HttpDaPendingOutcome> {
  return withTempDir((dir) => withPublisherDaServer(
    records,
    async (endpoint) => {
      let threw = false;
      let errorMessage = "";
      try {
        await runTickWithHttpDa({ dir, endpoint });
      } catch (error) {
        threw = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      const back = await restartReads(dir);
      return {
        threw,
        errorMessage,
        cursorHeightAfterRestart: back.cursorHeight,
        anchorInReadPath: back.anchorInReadPath,
        aliceDurable: back.alice !== null,
      };
    },
  ));
}

export async function runEnforcementE2e(): Promise<EnforcementE2eResult> {
  // (a) accept + restart-survival
  const accept = await withTempDir(async (dir) => {
    const enf = requireEnforcement(await runTick({ dir, material: FULL_MATERIAL }));
    const back = await restartReads(dir);
    return {
      acceptedRoots: enf.accepted,
      namesWritten: enf.namesWritten,
      anchorInReadPath: back.anchorInReadPath,
      cursorHeightAfterRestart: back.cursorHeight,
      aliceDurable: back.alice,
      carolDurable: back.carol,
    };
  });

  // (b) withheld served bytes → reject at availability, no mutation
  const withheld = await withTempDir(async (dir) => {
    const enf = requireEnforcement(await runTick({ dir, material: WITHHELD_MATERIAL }));
    const back = await restartReads(dir);
    return { rejectedReason: enf.rejected[0]?.reason, namesWritten: enf.namesWritten, anchorInReadPath: back.anchorInReadPath, aliceDurable: back.alice !== null };
  });

  // (c) mismatched proof bundle (non-canonical header) → reject at inclusion, no mutation
  const badHeader = await withTempDir(async (dir) => {
    const enf = requireEnforcement(await runTick({ dir, material: FULL_MATERIAL, candidateOverride: { headerSource: { headerHexAtHeight: () => "00".repeat(80) } } }));
    const back = await restartReads(dir);
    return { rejectedReason: enf.rejected[0]?.reason, namesWritten: enf.namesWritten, anchorInReadPath: back.anchorInReadPath, aliceDurable: back.alice !== null };
  });

  // (d) daemon misconfiguration: fixture-file enforcement with no matching material fails loud/closed.
  const missingMaterial = await withTempDir(async (dir) => {
    let threw = false;
    let errorMessage = "";
    try {
      await runTick({ dir, material: null });
    } catch (e) {
      threw = true;
      errorMessage = e instanceof Error ? e.message : String(e);
    }
    const back = await restartReads(dir);
    return { threw, errorMessage, cursorHeightAfterRestart: back.cursorHeight, aliceDurable: back.alice !== null };
  });

  // (e) A' generator output + matching RootAnchor input enforce through the same daemon selector and write state.
  const generatedFixture = await withTempDir((dir) => runGeneratedFixture(dir));

  // (f) G-B 7c: operator A serves /da/{root}; operator B fetches through ONT_ENFORCEMENT=http-da.
  const twoOperatorHttpDa = await runTwoOperatorHttpDa();

  return {
    anchorTxid: ANCHOR_TXID,
    anchoredRoot: ANCHORED_ROOT,
    minedHeight: ANCHOR_HEIGHT,
    nameA: NAME_A,
    nameC: NAME_C,
    ownerA: OWNER_A,
    ownerC: OWNER_C,
    leafA: LEAF_A,
    accept,
    withheld,
    badHeader,
    missingMaterial,
    generatedFixture,
    twoOperatorHttpDa,
  };
}

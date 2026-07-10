import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { BitcoinTransactionInBlock } from "@ont/bitcoin";
import { bytesToHex, encodeEvent, EventType, type RootAnchorEvent } from "@ont/wire";
import { describe, expect, it } from "vitest";

import {
  applyBlockTransactionsWithProvenance,
  createEmptyState,
  reduceBlock,
  type ResolvedBatchMaterial,
  type ResolvedBlockEvidence,
} from "./engine.js";
import type { LaunchParams } from "./params.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
type Assert<T extends true> = T;

const resolvedBatchMaterialKeysAreClosed: Assert<
  Equal<keyof ResolvedBatchMaterial, "committedEntries">
> = true;
const resolvedBlockEvidenceKeysAreClosed: Assert<
  Equal<keyof ResolvedBlockEvidence, "availabilityByAnchor" | "batchMaterialByAnchor" | "recovery">
> = true;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const h32 = (fill: string): string => fill.repeat(32);

const PREV_ROOT = h32("00");
const ROOT = h32("ab");
const OTHER_ROOT = h32("cd");
const OWNER = h32("11");
const PARAMS: LaunchParams = {
  launchHeight: 0,
  daWindow: { K: 3, W: 1, C: 1 },
  availabilityMode: "O1-collapsed",
};

function rootAnchorTx(input: {
  readonly txid?: string;
  readonly blockHeight?: number;
  readonly newRoot?: string;
  readonly batchSize?: number;
} = {}): BitcoinTransactionInBlock {
  const payload: RootAnchorEvent = {
    type: EventType.RootAnchor,
    prevRoot: PREV_ROOT,
    newRoot: input.newRoot ?? ROOT,
    batchSize: input.batchSize ?? 1,
  };
  return {
    tx: {
      txid: input.txid ?? h32("aa"),
      inputs: [],
      outputs: [{ valueSats: 0n, scriptType: "op_return", dataHex: bytesToHex(encodeEvent(payload)) }],
    },
    blockHeight: input.blockHeight ?? 300,
    txIndex: 0,
  };
}

function evidence(input: {
  readonly root?: string;
  readonly anchorHeight?: number;
  readonly batchSize?: number;
  readonly material?: ResolvedBatchMaterial;
  readonly availabilityRoot?: string;
  readonly includeAvailability?: boolean;
} = {}): ResolvedBlockEvidence {
  const root = input.root ?? ROOT;
  const batchSize = input.batchSize ?? 1;
  const material = input.material ?? { committedEntries: [{ name: "alice", ownerPubkey: OWNER }] };
  return {
    batchMaterialByAnchor: new Map([[root, material]]),
    availabilityByAnchor: input.includeAvailability === false
      ? new Map()
      : new Map([
        [
          root,
          {
            anchorHeight: input.anchorHeight ?? 300,
            anchoredRoot: input.availabilityRoot ?? root,
            batchSize,
            firstServableHeight: input.anchorHeight ?? 300,
          },
        ],
      ]),
  };
}

function firstRootAnchorEvent(result: ReturnType<typeof reduceBlock>) {
  return result.provenance[0]?.events[0];
}

describe("reduceBlock Delta A.0 — RootAnchor creation seam", () => {
  it("keeps @ont/consensus deps deep-equal to the audited three-package set", () => {
    const pkg = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
      readonly dependencies: Readonly<Record<string, string>>;
    };

    expect(pkg.dependencies).toEqual({
      "@ont/bitcoin": "file:../bitcoin",
      "@ont/protocol": "file:../protocol",
      "@ont/wire": "file:../wire",
    });
    expect(JSON.stringify(pkg)).not.toMatch(/@ont\/(claim-path|name-state-store|evidence)/);
  });

  it("keeps resolved evidence types closed to raw batch leaves", () => {
    expect(resolvedBatchMaterialKeysAreClosed).toBe(true);
    expect(resolvedBlockEvidenceKeysAreClosed).toBe(true);
  });

  it("leaves the direct applyBlockTransactionsWithProvenance path behavior-neutral for RootAnchor", () => {
    const state = createEmptyState();

    expect(applyBlockTransactionsWithProvenance(state, [rootAnchorTx()], PARAMS.launchHeight)).toEqual([]);
    expect(state.names.size).toBe(0);
  });

  it("logs a bare RootAnchor as no resolved material and writes no name state", () => {
    const state = createEmptyState();
    const result = reduceBlock(
      state,
      { height: 300, txs: [rootAnchorTx()] },
      { batchMaterialByAnchor: new Map(), availabilityByAnchor: new Map() },
      PARAMS
    );

    expect(firstRootAnchorEvent(result)).toMatchObject({
      typeName: "ROOT_ANCHOR",
      validationStatus: "ignored",
      reason: "root_anchor_no_resolved_material",
      affectedName: null,
    });
    expect(state.names.size).toBe(0);
  });

  it("rejects empty committed material and zero-sized RootAnchor batches deterministically", () => {
    const state = createEmptyState();
    const result = reduceBlock(
      state,
      { height: 300, txs: [rootAnchorTx({ batchSize: 0 })] },
      evidence({ batchSize: 0, material: { committedEntries: [] } }),
      PARAMS
    );

    expect(firstRootAnchorEvent(result)?.reason).toBe("root_anchor_empty_committed_set");
    expect(state.names.size).toBe(0);
  });

  it("binds resolved material and availability evidence to the decoded RootAnchor root", () => {
    const wrongMaterialRootState = createEmptyState();
    const wrongMaterialRoot = reduceBlock(
      wrongMaterialRootState,
      { height: 300, txs: [rootAnchorTx({ newRoot: ROOT })] },
      evidence({ root: OTHER_ROOT, availabilityRoot: OTHER_ROOT }),
      PARAMS
    );
    expect(firstRootAnchorEvent(wrongMaterialRoot)?.reason).toBe("root_anchor_no_resolved_material");
    expect(wrongMaterialRootState.names.size).toBe(0);

    const state = createEmptyState();
    const result = reduceBlock(
      state,
      { height: 300, txs: [rootAnchorTx({ newRoot: ROOT })] },
      evidence({ root: ROOT, availabilityRoot: OTHER_ROOT }),
      PARAMS
    );

    expect(firstRootAnchorEvent(result)?.reason).toBe("root_anchor_availability_mismatch");
    expect(state.names.size).toBe(0);
  });

  it("runtime-kill-switches raw BatchMaterial leaves on the reducer input", () => {
    const state = createEmptyState();
    const rawMaterial = {
      committedEntries: [{ name: "alice", ownerPubkey: OWNER }],
      baseLeaves: new Map<string, string>(),
      servedLeaves: [],
    } as unknown as ResolvedBatchMaterial;
    const result = reduceBlock(
      state,
      { height: 300, txs: [rootAnchorTx()] },
      evidence({ material: rawMaterial }),
      PARAMS
    );

    expect(firstRootAnchorEvent(result)?.reason).toBe("root_anchor_raw_material_rejected");
    expect(state.names.size).toBe(0);
  });

  it("records an accepted RootAnchor creation candidate without minting accumulator state", () => {
    const state = createEmptyState();
    const result = reduceBlock(
      state,
      { height: 300, txs: [rootAnchorTx()] },
      evidence(),
      PARAMS
    );

    expect(firstRootAnchorEvent(result)).toMatchObject({
      typeName: "ROOT_ANCHOR",
      validationStatus: "applied",
      reason: "root_anchor_creation_candidate",
      affectedName: null,
    });
    expect(state.names.size).toBe(0);
  });
});

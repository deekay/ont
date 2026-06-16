import { describe, expect, it } from "vitest";
import { legacyTxidOf, type BitcoinHeaderSource, type LegacyTransaction } from "@ont/bitcoin";
import { deriveOwnerPubkey, signValueRecord } from "@ont/protocol";
import { assembleRootAnchorTx, type RootAnchorFundingInput } from "@ont/adapter-publisher";
import { buildConfirmedBatchAnchor } from "@ont/adapter-indexer";
import { projectServedValueHistory, type OwnershipInterval } from "@ont/adapter-resolver";
import { shapeClaimRequest } from "./shape-claim-request.js";
import { projectClaimView } from "./project-claim-view.js";

// B5-CLAIM hermetic walkthrough (B5_SURFACES_PLAN §7.5). Drives the full claim loop against the REAL adapters
// in a synthetic 1-tx block (no signet): the surface shapes the request + assembles via the publisher adapter
// + hands signing across a mock-wallet boundary + the indexer read firewall confirms + the surface renders the
// resolver view. The surface holds no keys and never signs; the batch root comes from the fixture, NOT a
// surface rule. RED until the surface cores land (shapeClaimRequest / projectClaimView stubs).

// ---- DI mock-wallet fixture (test-only): proves the surface crosses a wallet boundary; NOT real signing. ----
const mockWalletSignTx = async (unsignedTx: LegacyTransaction): Promise<LegacyTransaction> => ({
  ...unsignedTx,
  inputs: unsignedTx.inputs.map((i) => ({ ...i, scriptSigHex: "00" })), // marker, not a real signature; no crypto
});

// ---- synthetic-block helpers (reused from the B4 round-trip machinery) ----
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
const internal = (displayHex: string): Uint8Array => Uint8Array.from(hexToBytes(displayHex)).reverse();
function make80ByteHeader(merkleInternal: Uint8Array): string {
  const h = new Uint8Array(80);
  h[0] = 1;
  h.set(merkleInternal, 36);
  return bytesToHex(h);
}

const NAME = "alice";
const OWNER_SK = "11".repeat(32);
const OWNER_PUB = deriveOwnerPubkey(OWNER_SK);
const REF = "ab".repeat(32);
const FUNDING: readonly RootAnchorFundingInput[] = [{ prevoutTxid: "11".repeat(32), prevoutVout: 0 }];
// The batch result — prevRoot/newRoot/batchSize come from the publisher/batch FIXTURE, never the surface.
const BATCH = { prevRoot: "0a".repeat(32), newRoot: "ab".repeat(32), batchSize: 2 };
const MINED_HEIGHT = 800_000;
const CURRENT: OwnershipInterval = { currentOwnerPubkey: OWNER_PUB, ownershipRef: REF };

describe("B5-CLAIM walkthrough — shape → assemble → mock-sign → confirm → render (hermetic)", () => {
  it("the claim loop runs end-to-end against the real adapters in a synthetic block", async () => {
    // 1. surface shapes the request (validate canonical name + funding).
    const shaped = shapeClaimRequest({ name: NAME, fundingInputs: FUNDING });
    expect(shaped.ok).toBe(true);
    if (!shaped.ok) return;

    // 2. publisher/batch FIXTURE supplies the batch root (NOT the surface). 3. surface assembles via the adapter.
    const unsigned = assembleRootAnchorTx({
      prevRoot: BATCH.prevRoot, newRoot: BATCH.newRoot, batchSize: BATCH.batchSize, fundingInputs: shaped.fundingInputs,
    });
    expect(unsigned).not.toBeNull();
    if (unsigned === null) return;
    expect(unsigned.inputs[0]!.scriptSigHex).toBe(""); // assembled UNSIGNED

    // 4. hand off signing across the wallet boundary (the surface never signs).
    const signed = await mockWalletSignTx(unsigned);
    expect(signed.inputs[0]!.scriptSigHex).not.toBe(""); // boundary crossed

    // 5. the indexer read firewall confirms the signed tx in a synthetic 1-tx block.
    const headerHex = make80ByteHeader(internal(legacyTxidOf(signed)!));
    const headerSource: BitcoinHeaderSource = { headerHexAtHeight: (h) => (h === MINED_HEIGHT ? headerHex : null) };
    const confirm = buildConfirmedBatchAnchor({
      anchorTx: signed, prevoutTxs: [], blockHeaderHex: headerHex, minedHeight: MINED_HEIGHT, merkle: [], pos: 0, headerSource,
    });
    expect(confirm.ok).toBe(true);
    if (!confirm.ok) return;
    expect(confirm.confirmedAnchor.anchoredRoot).toBe(BATCH.newRoot);
    expect(confirm.confirmedAnchor.batchSize).toBe(BATCH.batchSize);
    expect(confirm.confirmedAnchor.anchorTxid).toBe(legacyTxidOf(signed));

    // 6. the resolver serves the chain-derived value-history. 7. the surface renders it (not-authority preserved).
    const served = projectServedValueHistory({
      name: NAME, currentOwnership: CURRENT,
      records: [signValueRecord({ name: NAME, ownerPrivateKeyHex: OWNER_SK, ownershipRef: REF, sequence: 1, previousRecordHash: null, valueType: 0, payloadHex: "00", issuedAt: "2026-01-01T00:00:00.000Z" })],
    });
    expect(served.ok).toBe(true);
    const view = projectClaimView(served);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.view.name).toBe(NAME);
    expect(view.view.authority).toBe("not-ownership-authority");
    expect(view.view.recordCount).toBe(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import { handleWebRequest, type WebServiceOptions } from "./server.js";
import type { ServedNameStateResult, WebReadPort } from "./web-read-port.js";

const NS_OWNER = "22".repeat(32);
const ANCHORED_ROOT = "f93b90c055208630762382e331ef07f3be22df520a7ab7e4ff54707b599839b8";
const ANCHOR_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16";
const LEAF = "2bd806c97f0e00af1a1fc3328fa763a9269723c8db8fac4f93af71db186d6e90";
const BLOCK_170_HEADER =
  "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70";
const BLOCK_176_HEADER =
  "01000000089d2d7196d00f737762fe82cfd86820c6e44bb2a9dd0f5fc1fc4afd000000005c3de10cb7cb6934b0050360980f9a37a95a8bf705edfbcbd3541591ad95c16466c96a49ffff001d09338966";

const emptyPort: WebReadPort = {
  valueHistory: () => null,
  recoveryHistory: () => null,
  tx: () => null,
};

const served: Extract<ServedNameStateResult, { readonly ok: true }> = {
  ok: true,
  canonicalName: "alice",
  owner: { kind: "owner-key", ownerPubkeyHex: NS_OWNER },
  leafKeyHex: LEAF,
  batchLocalIndex: 0,
  anchoredRoot: ANCHORED_ROOT,
  anchor: { txid: ANCHOR_TXID, minedHeight: 170, txIndex: 1, vout: 0 },
  firstServableHeight: 170,
  trace: [{ step: "verdict", ok: true, reason: "batched-claim-accepted" }],
  proofBundle: {
    format: "ont-proof-bundle",
    bundleVersion: 0,
    proofSource: "accumulator_batch_claim",
    assuranceTier: "accumulator-batched",
    verificationGoal: "web server proof-bundle fixture",
    name: "alice",
    normalizedName: "alice",
    ownershipProof: { currentOwnerPubkey: NS_OWNER, ownershipRef: "accumulator-leaf:alice" },
    accumulatorProof: {
      root: ANCHORED_ROOT,
      leaf: LEAF,
      value: NS_OWNER,
      siblings: [
        { level: 1, hash: "7a4ab456e0112c950c4f443951f713667438075e48fb9ec2b6613d81385ab8ca" },
        { level: 2, hash: "5530fccbd45e1da9514e57a90a83f74aafbfb7820c005a69a9688f5a3ac2c485" },
      ],
    },
    batchAnchor: { anchorTxid: ANCHOR_TXID, anchorHeight: 170 },
    bitcoinInclusion: {
      anchors: [
        {
          txid: ANCHOR_TXID,
          height: 170,
          blockHeaderHex: BLOCK_170_HEADER,
          merkle: ["b1fea52486ce0c62bb442b530a3f0132b826c74e473d1f2c220bfa78111c5082"],
          pos: 1,
        },
      ],
    },
  },
  provenance: "resolver-indexed-mirror",
  authority: "not-ownership-authority",
};

async function get(path: string, options: WebServiceOptions) {
  const res = await handleWebRequest(new Request(`http://web.test${path}`, { method: "GET" }), options);
  return { status: res.status, text: await res.text() };
}

describe("web server — live resolver name-state path", () => {
  it("direct /names/:name uses nameStateSource and can render Bitcoin-verified state", async () => {
    const nameStateSource = vi.fn(async () => served);
    const r = await get("/names/alice", {
      port: emptyPort,
      nameStateSource,
      bitcoinHeaderSource: { headerHexAtHeight: (height) => (height === 170 ? BLOCK_170_HEADER : height === 176 ? BLOCK_176_HEADER : null) },
      verificationCheckpointId: "mainnet:block-169-real-range",
      verificationNetwork: "mainnet",
    });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Bitcoin-verified");
    expect(r.text).toContain(NS_OWNER);
    expect(nameStateSource).toHaveBeenCalledWith("alice");
  });

  it("/?q=<name> uses the same live name-state path when configured", async () => {
    const nameStateSource = vi.fn(async () => served);
    const r = await get("/?q=alice", { port: emptyPort, nameStateSource });
    expect(r.status).toBe(200);
    expect(r.text).toContain("not yet Bitcoin-verified");
    expect(r.text).toContain(NS_OWNER);
    expect(nameStateSource).toHaveBeenCalledWith("alice");
  });

  it("source null -> unavailable page (200) with an empty sync port", async () => {
    const nameStateSource = vi.fn(async () => null);
    const r = await get("/names/alice", { port: emptyPort, nameStateSource });
    expect(r.status).toBe(200);
    expect(r.text).toContain("not currently served");
    expect(nameStateSource).toHaveBeenCalledWith("alice");
  });

  it("source throw -> generic 502, no resolver exception leak", async () => {
    const leak = "SECRET-name-state-stacktrace";
    const nameStateSource = vi.fn(async () => {
      throw new Error(leak);
    });
    const r = await get("/names/alice", { port: emptyPort, nameStateSource });
    expect(r.status).toBe(502);
    expect(r.text).not.toContain(leak);
    expect(r.text).not.toContain("SECRET");
    expect(r.text).not.toContain("not currently served");
  });

  it("bad name -> error view and source is never called", async () => {
    const nameStateSource = vi.fn(async () => served);
    const r = await get("/names/Not%20A%20Name!", { port: emptyPort, nameStateSource });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Invalid name");
    expect(nameStateSource).not.toHaveBeenCalled();
  });
});

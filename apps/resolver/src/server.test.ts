import { describe, expect, it } from "vitest";
import {
  computeRecoveryDescriptorHash,
  computeValueRecordHash,
  deriveOwnerPubkey,
  sha256Hex,
  signRecoveryDescriptor,
  signValueRecord,
  utf8ToBytes,
  type SignedRecoveryDescriptor,
  type SignedValueRecord,
} from "@ont/protocol";
import type { OwnershipInterval, ProjectServedRecoveryHistoryInput, ProjectServedValueHistoryInput } from "@ont/adapter-resolver";
import type { NameStateProofBundle, NameStateRecord } from "@ont/name-state-store";
import {
  handleResolverRequest,
  type HeaderRangeViewSource,
  type NameStateViewSource,
  type ResolverStore,
} from "./server.js";

// Clean runnable resolver red battery. The resolver app is an imperative HTTP shell around @ont/adapter-resolver:
// it reads/writes only through a mocked store port, delegates projection and submission guards to the adapter,
// preserves resolver-indexed-mirror / not-ownership-authority stamps, and fails closed without throwing.

const NAME = "alice";
const OWNER_SK = "11".repeat(32);
const OWNER_PUB = deriveOwnerPubkey(OWNER_SK);
const OTHER_SK = "22".repeat(32);
const REF = "ab".repeat(32);
const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-02T00:00:00.000Z";
const RECOVERY_ADDRESS = "bc1qexamplerecoveryaddress00000000000000000";

const ownership: OwnershipInterval = { currentOwnerPubkey: OWNER_PUB, ownershipRef: REF };

function valueRecord(over: Partial<SignedValueRecord> & { sk?: string } = {}): SignedValueRecord {
  return signValueRecord({
    name: over.name ?? NAME,
    ownerPrivateKeyHex: over.sk ?? OWNER_SK,
    ownershipRef: over.ownershipRef ?? REF,
    sequence: over.sequence ?? 1,
    previousRecordHash: over.previousRecordHash ?? null,
    valueType: over.valueType ?? 0,
    payloadHex: over.payloadHex ?? "00",
    issuedAt: over.issuedAt ?? T0,
  });
}

function recoveryDescriptor(
  over: Partial<SignedRecoveryDescriptor> & { sk?: string } = {}
): SignedRecoveryDescriptor {
  return signRecoveryDescriptor({
    name: over.name ?? NAME,
    ownerPrivateKeyHex: over.sk ?? OWNER_SK,
    ownershipRef: over.ownershipRef ?? REF,
    sequence: over.sequence ?? 1,
    previousDescriptorHash: over.previousDescriptorHash ?? null,
    recoveryAddress: over.recoveryAddress ?? RECOVERY_ADDRESS,
    issuedAt: over.issuedAt ?? T0,
  });
}

const genesisValue = valueRecord();
const nextValue = valueRecord({
  sequence: 2,
  previousRecordHash: computeValueRecordHash(genesisValue),
  payloadHex: "01",
  issuedAt: T1,
});
const genesisRecovery = recoveryDescriptor();
const nextRecovery = recoveryDescriptor({
  sequence: 2,
  previousDescriptorHash: computeRecoveryDescriptorHash(genesisRecovery),
  issuedAt: T1,
});

function jsonRequest(path: string, body: unknown, method = "POST"): Request {
  return new Request(`http://resolver.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getJson(path: string, store = storeFixture()): Promise<{ status: number; body: unknown }> {
  const res = await handleResolverRequest(new Request(`http://resolver.test${path}`), { store });
  return { status: res.status, body: await res.json() };
}

function storeFixture(over: Partial<ResolverStore> = {}): ResolverStore {
  const appendedValues: SignedValueRecord[] = [];
  const appendedRecoveries: SignedRecoveryDescriptor[] = [];
  return {
    valueState: async (name): Promise<ProjectServedValueHistoryInput | null> =>
      name === NAME ? { name, currentOwnership: ownership, records: [genesisValue, nextValue] } : null,
    recoveryState: async (name): Promise<ProjectServedRecoveryHistoryInput | null> =>
      name === NAME ? { name, currentOwnership: ownership, descriptors: [genesisRecovery, nextRecovery] } : null,
    valueHead: async (name) => (name === NAME ? { currentOwnership: ownership, head: nextValue } : null),
    recoveryHead: async (name) => (name === NAME ? { currentOwnership: ownership, head: nextRecovery } : null),
    appendValueRecord: async (record) => {
      appendedValues.push(record);
    },
    appendRecoveryDescriptor: async (descriptor) => {
      appendedRecoveries.push(descriptor);
    },
    ...over,
  };
}

describe("resolver service — read routes", () => {
  it("GET /health returns a running status", async () => {
    const r = await getJson("/health");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, service: "@ont/resolver" });
  });

  it("serves value history through the adapter projection with not-authority stamps", async () => {
    const r = await getJson(`/names/${NAME}/value-history`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      ok: true,
      provenance: "resolver-indexed-mirror",
      authority: "not-ownership-authority",
      name: NAME,
      ownershipRef: REF,
    });
  });

  it("serves recovery history through the adapter projection with not-authority stamps", async () => {
    const r = await getJson(`/names/${NAME}/recovery-history`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      ok: true,
      provenance: "resolver-indexed-mirror",
      authority: "not-ownership-authority",
      name: NAME,
      ownershipRef: REF,
    });
  });

  it("corrupt mirror data fails closed and is not served as a partial prefix", async () => {
    const forged = { ...genesisValue, signature: "00".repeat(64) };
    const r = await getJson(
      `/names/${NAME}/value-history`,
      storeFixture({ valueState: async (name) => ({ name, currentOwnership: ownership, records: [forged] }) })
    );
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ ok: false, reason: "invalid-signature" });
  });

  it("unknown names return a JSON 404 and never throw", async () => {
    const r = await getJson("/names/bob/value-history");
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ ok: false, reason: "not-served" });
  });
});

describe("resolver service — submission routes", () => {
  it("POST /submissions/value-record validates with the store guard before appending", async () => {
    let appended: SignedValueRecord | null = null;
    const record = valueRecord({
      sequence: 3,
      previousRecordHash: computeValueRecordHash(nextValue),
      payloadHex: "02",
      issuedAt: "2026-01-03T00:00:00.000Z",
    });
    const store = storeFixture({
      appendValueRecord: async (r) => {
        appended = r;
      },
    });
    const res = await handleResolverRequest(jsonRequest("/submissions/value-record", record), { store });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ ok: true, ownershipRef: REF, expectedSequence: 3 });
    expect(appended).toEqual(record);
  });

  it("POST /submissions/recovery-descriptor validates with the recovery guard before appending", async () => {
    let appended: SignedRecoveryDescriptor | null = null;
    const descriptor = recoveryDescriptor({
      sequence: 3,
      previousDescriptorHash: computeRecoveryDescriptorHash(nextRecovery),
      issuedAt: "2026-01-03T00:00:00.000Z",
    });
    const store = storeFixture({
      appendRecoveryDescriptor: async (d) => {
        appended = d;
      },
    });
    const res = await handleResolverRequest(jsonRequest("/submissions/recovery-descriptor", descriptor), { store });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ ok: true, ownershipRef: REF, expectedSequence: 3 });
    expect(appended).toEqual(descriptor);
  });

  it("invalid submissions return 422 and do not append", async () => {
    let appended = false;
    const stale = valueRecord({ sequence: 1, previousRecordHash: null });
    const store = storeFixture({
      appendValueRecord: async () => {
        appended = true;
      },
    });
    const res = await handleResolverRequest(jsonRequest("/submissions/value-record", stale), { store });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, reason: "stale-sequence" });
    expect(appended).toBe(false);
  });
});

describe("resolver service — HTTP shell totality", () => {
  it("bad JSON, unsupported methods, unknown routes, and store throws return JSON errors", async () => {
    const badJson = await handleResolverRequest(
      new Request("http://resolver.test/submissions/value-record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      { store: storeFixture() }
    );
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toMatchObject({ ok: false, reason: "bad-json" });

    const method = await handleResolverRequest(new Request("http://resolver.test/health", { method: "POST" }), {
      store: storeFixture(),
    });
    expect(method.status).toBe(405);

    const unknown = await getJson("/unknown");
    expect(unknown.status).toBe(404);

    const throwing = await handleResolverRequest(new Request(`http://resolver.test/names/${NAME}/value-history`), {
      store: storeFixture({
        valueState() {
          throw new Error("store down");
        },
      }),
    });
    expect(throwing.status).toBe(503);
    expect(await throwing.json()).toMatchObject({ ok: false, reason: "store-unavailable" });
  });
});

describe("resolver service — GET /bitcoin/header-range", () => {
  const emptyStore = {} as ResolverStore;
  const H1 = "11".repeat(80);
  const H2 = "22".repeat(80);
  const request = (path: string, headerRangeView?: HeaderRangeViewSource): Promise<Response> =>
    handleResolverRequest(new Request(`http://resolver.test${path}`), { store: emptyStore, headerRangeView });

  it("returns exactly the requested startHeight and headersHex array", async () => {
    const calls: Array<readonly [number, number]> = [];
    const headerRangeView: HeaderRangeViewSource = async (startHeight, count) => {
      calls.push([startHeight, count]);
      return [H1, H2];
    };

    const res = await request("/bitcoin/header-range?startHeight=311446&count=2", headerRangeView);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ startHeight: 311_446, headersHex: [H1, H2] });
    expect(calls).toEqual([[311_446, 2]]);
  });

  it("missing source or any gap returns unavailable and never a partial body", async () => {
    const absent = await request("/bitcoin/header-range?startHeight=311446&count=2");
    expect(absent.status).toBe(404);
    expect(await absent.json()).toEqual({ ok: false, reason: "unavailable" });

    const gap = await request("/bitcoin/header-range?startHeight=311446&count=2", async () => null);
    expect(gap.status).toBe(404);
    expect(await gap.json()).toEqual({ ok: false, reason: "unavailable" });

    const short = await request("/bitcoin/header-range?startHeight=311446&count=2", async () => [H1]);
    expect(short.status).toBe(404);
    expect(await short.json()).toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects malformed query params before consulting the source", async () => {
    let called = false;
    const headerRangeView: HeaderRangeViewSource = async () => {
      called = true;
      return [H1];
    };
    for (const path of [
      "/bitcoin/header-range",
      "/bitcoin/header-range?startHeight=&count=1",
      "/bitcoin/header-range?startHeight=-1&count=1",
      "/bitcoin/header-range?startHeight=1.5&count=1",
      "/bitcoin/header-range?startHeight=1&count=0",
      "/bitcoin/header-range?startHeight=1&count=2.5",
    ]) {
      const res = await request(path, headerRangeView);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, reason: "bad-header-range-query" });
    }
    expect(called).toBe(false);
  });

  it("a throwing header source returns store-unavailable", async () => {
    const res = await request("/bitcoin/header-range?startHeight=1&count=1", async () => {
      throw new Error("boom");
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: "store-unavailable" });
  });

  it("POST /bitcoin/header-range is read-only", async () => {
    const res = await handleResolverRequest(
      new Request("http://resolver.test/bitcoin/header-range?startHeight=1&count=1", { method: "POST" }),
      { store: emptyStore },
    );
    expect(res.status).toBe(405);
  });
});

// LE-RESOLVE — GET /names/:name/state: the resolver serves enforced name-state through the adapter read firewall
// over an injected, READ-ONLY NameStateViewSource (NOT the submission ResolverStore). The route is governed
// entirely by that injected source — absent ⇒ 404, throwing ⇒ 503 — and projectServedNameState decides
// serve-or-reject from the full §2a recheck. The deep firewall behaviour is in serve-name-state.test.ts; these
// pin the wiring + reason→status mapping.
describe("resolver service — GET /names/:name/state (LE-RESOLVE)", () => {
  const NS_NAME = "alice";
  const NS_OWNER = "22".repeat(32);
  const NS_ROOT = "f93b90c055208630762382e331ef07f3be22df520a7ab7e4ff54707b599839b8";
  const NS_ANCHOR_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16";
  const NS_PROOF_BUNDLE: NameStateProofBundle = {
    format: "ont-proof-bundle",
    bundleVersion: 0,
    proofSource: "accumulator_batch_claim",
    assuranceTier: "accumulator-batched",
    verificationGoal: "resolver server served proof-bundle fixture",
    name: NS_NAME,
    normalizedName: NS_NAME,
    ownershipProof: { currentOwnerPubkey: NS_OWNER, ownershipRef: "accumulator-leaf:alice" },
    accumulatorProof: {
      root: NS_ROOT,
      leaf: sha256Hex(utf8ToBytes(NS_NAME)),
      value: NS_OWNER,
      siblings: [
        { level: 1, hash: "7a4ab456e0112c950c4f443951f713667438075e48fb9ec2b6613d81385ab8ca" },
        { level: 2, hash: "5530fccbd45e1da9514e57a90a83f74aafbfb7820c005a69a9688f5a3ac2c485" },
      ],
    },
    batchAnchor: { anchorTxid: NS_ANCHOR_TXID, anchorHeight: 170 },
    bitcoinInclusion: {
      anchors: [
        {
          txid: NS_ANCHOR_TXID,
          height: 170,
          blockHeaderHex:
            "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70",
          merkle: ["b1fea52486ce0c62bb442b530a3f0132b826c74e473d1f2c220bfa78111c5082"],
          pos: 1,
        },
      ],
    },
  };
  function nameStateRecord(over: Partial<NameStateRecord> = {}): NameStateRecord {
    return {
      canonicalName: NS_NAME,
      leafKeyHex: sha256Hex(utf8ToBytes(NS_NAME)),
      owner: { kind: "owner-key", ownerPubkeyHex: NS_OWNER },
      batchLocalIndex: 0,
      anchoredRoot: NS_ROOT,
      anchor: { txid: NS_ANCHOR_TXID, minedHeight: 170, txIndex: 1, vout: 0 },
      firstServableHeight: 170,
      trace: [{ step: "verdict", ok: true, reason: "batched-claim-accepted" }],
      proofBundle: JSON.parse(JSON.stringify(NS_PROOF_BUNDLE)) as NameStateProofBundle,
      ...over,
    };
  }
  const nsStore = {} as ResolverStore; // the state route never touches the submission store
  const reqState = (name: string, nameStateView?: NameStateViewSource): Promise<Response> =>
    handleResolverRequest(new Request(`http://resolver.test/names/${name}/state`), { store: nsStore, nameStateView });

  it("serves a valid enforced record at 200 with not-ownership-authority stamps", async () => {
    const res = await reqState(NS_NAME, async () => nameStateRecord());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      provenance: "resolver-indexed-mirror",
      authority: "not-ownership-authority",
      canonicalName: NS_NAME,
      owner: { kind: "owner-key", ownerPubkeyHex: NS_OWNER },
      proofBundle: NS_PROOF_BUNDLE,
    });
  });

  it("no nameStateView source → 404 not-served (route governed entirely by the injected source)", async () => {
    const res = await reqState(NS_NAME);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, reason: "not-served" });
  });

  it("an unknown name (source returns null) → 404 name-unknown", async () => {
    const res = await reqState("bob", async () => null);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, reason: "name-unknown" });
  });

  it("a corrupt mirror record → 409 invalid-record (firewall fail-closed, never served)", async () => {
    const res = await reqState(NS_NAME, async () => nameStateRecord({ anchoredRoot: "nothex" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: "invalid-record" });
  });

  it("a source that returns a record for a different name → 409 name-mismatch (reject-don't-normalize)", async () => {
    // stored "alice", asked "Alice" — no case-fold, so the firewall refuses to serve it.
    const res = await reqState("Alice", async () => nameStateRecord());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: "name-mismatch" });
  });

  it("a throwing source → 503 store-unavailable (broken durable read surfaced, never store-coupled)", async () => {
    const res = await reqState(NS_NAME, async () => {
      throw new Error("boom");
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, reason: "store-unavailable" });
  });

  it("POST /names/:name/state → 405 (the state route is read-only)", async () => {
    const res = await handleResolverRequest(
      new Request(`http://resolver.test/names/${NS_NAME}/state`, { method: "POST" }),
      { store: nsStore },
    );
    expect(res.status).toBe(405);
  });
});

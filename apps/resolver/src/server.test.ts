import { describe, expect, it } from "vitest";
import {
  computeRecoveryDescriptorHash,
  computeValueRecordHash,
  deriveOwnerPubkey,
  signRecoveryDescriptor,
  signValueRecord,
  type SignedRecoveryDescriptor,
  type SignedValueRecord,
} from "@ont/protocol";
import type { OwnershipInterval, ProjectServedRecoveryHistoryInput, ProjectServedValueHistoryInput } from "@ont/adapter-resolver";
import { handleResolverRequest, type ResolverStore } from "./server.js";

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

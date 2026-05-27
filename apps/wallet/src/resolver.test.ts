import { afterEach, describe, expect, it, vi } from "vitest";

import { ResolverClient, ResolverError } from "./resolver.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: { ok: boolean; status: number; body: string }): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: () => Promise.resolve(response.body)
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("ResolverClient", () => {
  it("returns null when a name is unknown (404)", async () => {
    stubFetch({ ok: false, status: 404, body: "" });
    expect(await new ResolverClient("http://r/").getNameRecord("alice")).toBeNull();
  });

  it("normalizes the name and returns the record on 200", async () => {
    const body = JSON.stringify({
      name: "alice",
      status: "mature",
      currentOwnerPubkey: "ab",
      lastStateTxid: "cd",
      maturityHeight: 1,
      requiredBondSats: "0"
    });
    const mock = stubFetch({ ok: true, status: 200, body });

    const record = await new ResolverClient("http://r").getNameRecord("Alice");
    expect(record?.name).toBe("alice");

    const call = mock.mock.calls[0];
    if (!call) {
      throw new Error("fetch was not called");
    }
    expect(call[0]).toBe("http://r/name/alice");
  });

  it("POSTs a value record to /values", async () => {
    const mock = stubFetch({ ok: true, status: 200, body: "{}" });
    const client = new ResolverClient("http://r");

    await client.publishValueRecord(
      { format: "ont-value-record" } as unknown as Parameters<typeof client.publishValueRecord>[0]
    );

    const call = mock.mock.calls[0];
    if (!call) {
      throw new Error("fetch was not called");
    }
    expect(call[0]).toBe("http://r/values");
    expect(call[1].method).toBe("POST");
  });

  it("throws ResolverError on a server error", async () => {
    stubFetch({ ok: false, status: 500, body: "boom" });
    await expect(new ResolverClient("http://r").getNameRecord("alice")).rejects.toThrow(ResolverError);
  });

  it("returns null when no recovery descriptor exists (404)", async () => {
    stubFetch({ ok: false, status: 404, body: "" });
    expect(await new ResolverClient("http://r").getRecoveryDescriptor("alice")).toBeNull();
  });

  it("reads a recovery descriptor from /name/{name}/recovery", async () => {
    const mock = stubFetch({ ok: true, status: 200, body: JSON.stringify({ name: "alice", sequence: 2 }) });
    const descriptor = await new ResolverClient("http://r").getRecoveryDescriptor("Alice");
    expect(descriptor?.sequence).toBe(2);
    expect(mock.mock.calls[0]?.[0]).toBe("http://r/name/alice/recovery");
  });

  it("POSTs a recovery descriptor to /recovery-descriptors", async () => {
    const mock = stubFetch({ ok: true, status: 201, body: "{}" });
    const client = new ResolverClient("http://r");
    await client.publishRecoveryDescriptor(
      { format: "ont-recovery-descriptor" } as unknown as Parameters<typeof client.publishRecoveryDescriptor>[0]
    );
    const call = mock.mock.calls[0];
    if (!call) {
      throw new Error("fetch was not called");
    }
    expect(call[0]).toBe("http://r/recovery-descriptors");
    expect(call[1].method).toBe("POST");
  });
});

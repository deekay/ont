import { describe, expect, it } from "vitest";

import { OntEventType } from "./constants.js";
import {
  decodeAvailabilityMarkerPayload,
  decodeRootAnchorPayload,
  encodeAvailabilityMarkerPayload,
  encodeRootAnchorPayload
} from "./wire.js";

describe("scaling-rail wire codecs", () => {
  it("round-trips a root anchor payload (magic+version+type framing)", () => {
    const anchor = { prevRoot: "11".repeat(32), newRoot: "22".repeat(32), batchSize: 10_000 };
    const payload = encodeRootAnchorPayload(anchor);

    expect(payload.length).toBe(5 + 32 + 32 + 4); // 73
    expect(payload[4]).toBe(OntEventType.RootAnchor);
    expect(decodeRootAnchorPayload(payload)).toEqual(anchor);
  });

  it("round-trips an availability marker payload", () => {
    const marker = { dataDigest: "ab".repeat(32), batchSize: 42 };
    const payload = encodeAvailabilityMarkerPayload(marker);

    expect(payload.length).toBe(5 + 32 + 4); // 41
    expect(payload[4]).toBe(OntEventType.AvailabilityMarker);
    expect(decodeAvailabilityMarkerPayload(payload)).toEqual(marker);
  });

  it("does not confuse the two rail message types", () => {
    const anchor = encodeRootAnchorPayload({ prevRoot: "11".repeat(32), newRoot: "22".repeat(32), batchSize: 1 });
    expect(() => decodeAvailabilityMarkerPayload(anchor)).toThrow();

    const marker = encodeAvailabilityMarkerPayload({ dataDigest: "cd".repeat(32), batchSize: 1 });
    expect(() => decodeRootAnchorPayload(marker)).toThrow();
  });

  it("rejects malformed lengths and bad magic", () => {
    expect(() => decodeRootAnchorPayload(new Uint8Array(10))).toThrow(/73 bytes/);
    const good = encodeRootAnchorPayload({ prevRoot: "11".repeat(32), newRoot: "22".repeat(32), batchSize: 1 });
    const badMagic = good.slice();
    badMagic[0] = 0x00;
    expect(() => decodeRootAnchorPayload(badMagic)).toThrow(/magic/);
  });

  // Cross-language conformance: these exact bytes are pinned in the Rust encoder's
  // golden-vector test (rust/ont-core/src/root_anchor.rs). If you change the wire
  // format here, the Rust test MUST be regenerated in lockstep — a drift on either
  // side breaks byte-identical read-back by @ont/consensus.
  it("emits the byte-pinned cross-language golden vectors", () => {
    const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");
    expect(toHex(encodeRootAnchorPayload({ prevRoot: "00".repeat(32), newRoot: "11".repeat(32), batchSize: 1 }))).toBe(
      "4f4e54010b" + "00".repeat(32) + "11".repeat(32) + "00000001"
    );
    expect(toHex(encodeRootAnchorPayload({ prevRoot: "aa".repeat(32), newRoot: "bb".repeat(32), batchSize: 4096 }))).toBe(
      "4f4e54010b" + "aa".repeat(32) + "bb".repeat(32) + "00001000"
    );
    expect(
      toHex(
        encodeRootAnchorPayload({
          prevRoot: "0123456789abcdef".repeat(4),
          newRoot: "fedcba9876543210".repeat(4),
          batchSize: 0xdeadbeef
        })
      )
    ).toBe(
      "4f4e54010b" +
        "0123456789abcdef".repeat(4) +
        "fedcba9876543210".repeat(4) +
        "deadbeef"
    );
  });
});

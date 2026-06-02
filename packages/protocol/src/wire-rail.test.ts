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
});

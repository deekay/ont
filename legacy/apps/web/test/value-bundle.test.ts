import { describe, expect, it } from "vitest";

import {
  decodeProfileBundlePayloadHex,
  describeProfileBundle,
  encodeProfileBundlePayloadHex,
  listProfileBundleEntries
} from "../src/value-bundle.js";

describe("destination bundle helpers", () => {
  it("encodes and decodes a multi-destination bundle", () => {
    const payloadHex = encodeProfileBundlePayloadHex({
      entries: [
        { key: "website", value: "https://example.com" },
        { key: "payment", value: "bitcoin:bc1qexample" },
        { key: "profile", value: "https://social.example/alice" },
        { key: "endpoint", value: "https://api.example.com" }
      ]
    });

    const decoded = decodeProfileBundlePayloadHex(payloadHex);
    expect(decoded).not.toBeNull();
    expect(decoded).toMatchObject({
      kind: "ont-key-value-bundle",
      version: 1,
      entries: [
        { key: "website", value: "https://example.com" },
        { key: "payment", value: "bitcoin:bc1qexample" },
        { key: "profile", value: "https://social.example/alice" },
        { key: "endpoint", value: "https://api.example.com" }
      ]
    });
  });

  it("describes the destinations present in a destination bundle", () => {
    const payloadHex = encodeProfileBundlePayloadHex({
      entries: [
        { key: "website", value: "https://example.com" },
        { key: "payment", value: "bitcoin:bc1qexample" },
        { key: "profile", value: "https://social.example/alice" }
      ]
    });

    const decoded = decodeProfileBundlePayloadHex(payloadHex);
    expect(decoded).not.toBeNull();
    expect(listProfileBundleEntries(decoded!)).toEqual([
      { key: "website", value: "https://example.com" },
      { key: "payment", value: "bitcoin:bc1qexample" },
      { key: "profile", value: "https://social.example/alice" }
    ]);
    expect(describeProfileBundle(decoded!)).toBe("Key/value bundle · website, payment, profile");
  });

  it("requires at least one destination entry", () => {
    expect(() => encodeProfileBundlePayloadHex({ entries: [] })).toThrow(
      "Add at least one destination entry to the bundle."
    );
  });

  it("rejects legacy payload shapes", () => {
    const legacyHex = Buffer.from(
      JSON.stringify({
        kind: "ont-profile-bundle",
        version: 1,
        website: "https://example.com"
      }),
      "utf8"
    ).toString("hex");

    expect(decodeProfileBundlePayloadHex(legacyHex)).toBeNull();
  });

  it("allows repeated keys", () => {
    const payloadHex = encodeProfileBundlePayloadHex({
      entries: [
        { key: "profile", value: "https://social.example/one" },
        { key: "profile", value: "https://social.example/two" }
      ]
    });

    expect(decodeProfileBundlePayloadHex(payloadHex)).toMatchObject({
      entries: [
        { key: "profile", value: "https://social.example/one" },
        { key: "profile", value: "https://social.example/two" }
      ]
    });
  });

  it("rejects partial entries", () => {
    expect(() =>
      encodeProfileBundlePayloadHex({
        entries: [{ key: "profile", value: "" }]
      })
    ).toThrow(
      "Key/value bundle entry 1 needs both a key and a value."
    );
  });
});

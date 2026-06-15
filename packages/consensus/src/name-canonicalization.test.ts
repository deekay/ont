import { describe, expect, it } from "vitest";

import { acceptCanonicalLeafName } from "./name-canonicalization.js";

// hex helpers (lowercase): a canonical name and its non-canonical variants.
const hex = (s: string): string => [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");

describe("acceptCanonicalLeafName — A6 reject-don't-normalize", () => {
  it("accepts a canonical [a-z0-9]{1,32} name", () => {
    expect(acceptCanonicalLeafName(hex("alice"))).toEqual({ canonical: true, reason: "canonical-name-accepted" });
    expect(acceptCanonicalLeafName(hex("a1b2c3"))).toMatchObject({ canonical: true });
    expect(acceptCanonicalLeafName(hex("a".repeat(32)))).toMatchObject({ canonical: true }); // max length
  });

  it("REJECTS non-canonical names — never normalizes (no lowercasing / trimming)", () => {
    // "Alice" (uppercase A = 0x41) must reject, NOT normalize to "alice".
    expect(acceptCanonicalLeafName(hex("Alice"))).toEqual({ canonical: false, reason: "a6-non-canonical-name-rejected" });
    expect(acceptCanonicalLeafName(hex("ALICE")).canonical).toBe(false);
    expect(acceptCanonicalLeafName(hex("al ce")).canonical).toBe(false); // space
    expect(acceptCanonicalLeafName(hex("al-ce")).canonical).toBe(false); // hyphen
    expect(acceptCanonicalLeafName(hex("a".repeat(33))).canonical).toBe(false); // over length — not truncated
  });

  it("fails closed on malformed hex / empty input without throwing", () => {
    expect(acceptCanonicalLeafName("").reason).toBe("a6-name-bytes-malformed");
    expect(acceptCanonicalLeafName("41x").reason).toBe("a6-name-bytes-malformed"); // odd length + non-hex
    expect(acceptCanonicalLeafName("4G").reason).toBe("a6-name-bytes-malformed"); // non-hex
    expect(acceptCanonicalLeafName("41C6").reason).toBe("a6-name-bytes-malformed"); // uppercase hex not accepted
    expect(acceptCanonicalLeafName(null as never).canonical).toBe(false);
  });

  it("is deterministic on identical inputs", () => {
    expect(acceptCanonicalLeafName(hex("Alice"))).toEqual(acceptCanonicalLeafName(hex("Alice")));
  });
});

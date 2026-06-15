import { describe, expect, it } from "vitest";

import {
  resolveNoticeWindow,
  type NoticeWindowClaim,
  type NoticeWindowInput,
} from "./notice-window.js";

const pubkey = (byte: string): string => byte.repeat(64);
const OWNER_A = pubkey("a");
const OWNER_B = pubkey("b");

const daValid = (ownerKey: string): NoticeWindowClaim => ({
  ownerKey,
  daVerdict: { decided: true, holdsPriority: true },
});
const daExcluded = (ownerKey: string): NoticeWindowClaim => ({
  ownerKey,
  daVerdict: { decided: true, holdsPriority: false },
});
const daUndecided = (ownerKey: string): NoticeWindowClaim => ({
  ownerKey,
  daVerdict: { decided: false, holdsPriority: false },
});

const input = (overrides: Partial<NoticeWindowInput> = {}): NoticeWindowInput => ({
  anchorHeight: 900_000,
  currentHeight: 900_006, // anchorHeight + W_notice = the deadline (>= gate satisfied)
  claims: [daValid(OWNER_A)],
  bond: { bondAmountSats: null, bondFloorSats: 10_000n },
  params: { noticeWindowBlocks: 6 },
  ...overrides,
});

describe("resolveNoticeWindow — A13 deadline gate", () => {
  it("is provisional strictly before the deadline and resolves at currentHeight >= anchorHeight + W_notice", () => {
    // close - 1 -> still provisional (pins the >= comparison)
    expect(resolveNoticeWindow(input({ currentHeight: 900_005 }))).toMatchObject({
      outcome: "provisional",
      awarded: false,
    });
    // exactly at the deadline (inclusive) -> resolves; single DA-valid bondless claim finalizes
    expect(resolveNoticeWindow(input({ currentHeight: 900_006 }))).toMatchObject({
      outcome: "finalized",
      awarded: true,
      daValidOwnerCount: 1,
    });
    // well past the deadline -> still resolves
    expect(resolveNoticeWindow(input({ currentHeight: 950_000 })).outcome).toBe("finalized");
  });
});

describe("resolveNoticeWindow — T17/F11/#37 finalize / nullify / escalate", () => {
  it("one distinct-owner DA-valid claim with no qualifying bond finalizes", () => {
    expect(resolveNoticeWindow(input({ claims: [daValid(OWNER_A)] }))).toMatchObject({
      outcome: "finalized",
      awarded: true,
      daValidOwnerCount: 1,
    });
  });

  it("two distinct-owner DA-valid claims with no qualifying bond nullify (no owner, never an award)", () => {
    expect(resolveNoticeWindow(input({ claims: [daValid(OWNER_A), daValid(OWNER_B)] }))).toMatchObject({
      outcome: "nullified",
      awarded: false,
      daValidOwnerCount: 2,
    });
  });

  it("a qualifying bond escalates to auction regardless of claim count (against a claim or bond-first)", () => {
    // against a claim
    expect(
      resolveNoticeWindow(
        input({ claims: [daValid(OWNER_A)], bond: { bondAmountSats: 10_000n, bondFloorSats: 10_000n } })
      )
    ).toMatchObject({ outcome: "escalated", awarded: false });
    // bond-first: no claims at all
    expect(
      resolveNoticeWindow(
        input({ claims: [], bond: { bondAmountSats: 50_000n, bondFloorSats: 10_000n } })
      )
    ).toMatchObject({ outcome: "escalated", awarded: false });
    // a qualifying bond escalates even past a 2-claim collision
    expect(
      resolveNoticeWindow(
        input({
          claims: [daValid(OWNER_A), daValid(OWNER_B)],
          bond: { bondAmountSats: 10_000n, bondFloorSats: 10_000n },
        })
      ).outcome
    ).toBe("escalated");
  });

  it("a sub-floor (non-qualifying) bond does not escalate — the #37 floor is delegated to bond-qualification", () => {
    // one claim + sub-floor bond -> the bond is a no-op, the single claim finalizes
    expect(
      resolveNoticeWindow(
        input({ claims: [daValid(OWNER_A)], bond: { bondAmountSats: 9_999n, bondFloorSats: 10_000n } })
      )
    ).toMatchObject({ outcome: "finalized", awarded: true });
    // two claims + sub-floor bond -> still a bare collision, nullify
    expect(
      resolveNoticeWindow(
        input({
          claims: [daValid(OWNER_A), daValid(OWNER_B)],
          bond: { bondAmountSats: 9_999n, bondFloorSats: 10_000n },
        })
      ).outcome
    ).toBe("nullified");
  });

  it("zero DA-valid claims with no qualifying bond leaves no owner (nullified, name reopens)", () => {
    expect(resolveNoticeWindow(input({ claims: [] }))).toMatchObject({
      outcome: "nullified",
      awarded: false,
      daValidOwnerCount: 0,
    });
  });
});

describe("resolveNoticeWindow — PR-6 distinct-owner counting (A12 idempotence)", () => {
  it("same-owner duplicate / re-anchor claims are idempotent, not a second nullifier", () => {
    // two claims, SAME owner -> distinct-owner count is 1 -> finalize, not nullify
    expect(
      resolveNoticeWindow(input({ claims: [daValid(OWNER_A), daValid(OWNER_A)] }))
    ).toMatchObject({ outcome: "finalized", awarded: true, daValidOwnerCount: 1 });
    // three claims, two distinct owners -> count 2 -> nullify
    expect(
      resolveNoticeWindow(
        input({ claims: [daValid(OWNER_A), daValid(OWNER_A), daValid(OWNER_B)] })
      )
    ).toMatchObject({ outcome: "nullified", daValidOwnerCount: 2 });
  });
});

describe("resolveNoticeWindow — D10 DA exclusion / withholding", () => {
  it("a resolved non-priority (withheld / forfeited) claim does not count toward finalize or nullify", () => {
    // one DA-valid + one resolved-excluded -> only the DA-valid counts -> finalize (the excluded
    // competitor does not nullify the available claim, D10)
    expect(
      resolveNoticeWindow(input({ claims: [daValid(OWNER_A), daExcluded(OWNER_B)] }))
    ).toMatchObject({ outcome: "finalized", awarded: true, daValidOwnerCount: 1 });
    // the F11 holdsPriority (h+W) boundary in action: flip the borderline claim to priority-bearing
    // and the same two claims now nullify
    expect(
      resolveNoticeWindow(input({ claims: [daValid(OWNER_A), daValid(OWNER_B)] })).outcome
    ).toBe("nullified");
  });

  it("fails closed (undecidable) when any claim's DA verdict is still undecided at the deadline", () => {
    expect(
      resolveNoticeWindow(input({ claims: [daValid(OWNER_A), daUndecided(OWNER_B)] }))
    ).toMatchObject({ outcome: "undecidable", awarded: false, daValidOwnerCount: null });
  });
});

describe("resolveNoticeWindow — total / fail-closed + closed-shape", () => {
  it("rejects malformed or extra-field inputs without throwing and never awards", () => {
    expect(resolveNoticeWindow(null as never)).toMatchObject({ outcome: "undecidable", awarded: false });
    expect(resolveNoticeWindow({ ...input(), source: "catalog" } as never).awarded).toBe(false);
    // producer-asserted boolean is not admitted: a claim with an extra "daValid: true" field rejects
    expect(
      resolveNoticeWindow(
        input({ claims: [{ ownerKey: OWNER_A, daVerdict: { decided: true, holdsPriority: true }, daValid: true } as never] })
      ).outcome
    ).toBe("undecidable");
    // non-hex owner key, non-bigint floor, zero/negative window all fail closed
    expect(resolveNoticeWindow(input({ claims: [{ ownerKey: "not-hex", daVerdict: { decided: true, holdsPriority: true } } as never] })).awarded).toBe(false);
    expect(resolveNoticeWindow(input({ bond: { bondAmountSats: 1n, bondFloorSats: 1 } as never })).outcome).toBe("undecidable");
    expect(resolveNoticeWindow(input({ params: { noticeWindowBlocks: 0 } })).outcome).toBe("undecidable");
  });

  it("is deterministic on identical inputs", () => {
    const i = input({ claims: [daValid(OWNER_A), daValid(OWNER_B)] });
    expect(resolveNoticeWindow(i)).toEqual(resolveNoticeWindow(i));
  });
});

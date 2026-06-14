// Unit tests for the value-record interval-chain acceptance predicate.
//
// Grounded in the ratified/normative V vectors (V1/V3/V4/V6/V7/V8/V10/V11) and
// the V-area rules (B2_KERNEL_HARDENING.md V1-V13; DECISIONS #17/#18). The
// PR-17-blocked interval-OPENING cases (V2/V5/V13 recovery timing) are NOT
// exercised here — the interval is supplied as an input, so these tests use only
// plain (claim/transfer) intervals.
//
// AUTHORITY = the B1 @ont/wire v1 §8.1 record (recordVersion 1). Records here are
// signed against the wire v1 digest (valueRecordDigest), NOT the legacy
// @ont/protocol v2 digest, which is evidence-only and must never authorize. There
// is no v1 signer in @ont/wire (it is verify-only for records), so the test signs
// the wire digest directly with @noble/curves schnorr — the same primitive
// @ont/wire verifies with. @noble/curves is root-hoisted in the workspace and
// this test file is not part of the audited @ont/consensus trust surface.

import { describe, expect, it } from "vitest";

import { schnorr } from "@noble/curves/secp256k1.js";

import {
  VALUE_RECORD_FORMAT,
  VALUE_RECORD_VERSION,
  SEQUENCE_BOUND,
  RECOVERY_DESCRIPTOR_FORMAT,
  RECOVERY_DESCRIPTOR_VERSION,
  bytesToHex,
  hexToBytes,
  recoveryDescriptorDigest,
  valueRecordDigest,
} from "@ont/wire";

import {
  valueRecordAccept,
  type OwnershipInterval,
  type ValueRecordEnvelope,
} from "./value-record-authority.js";

const PRIV_A = "11".repeat(32);
const PRIV_B = "22".repeat(32);
// Deterministic test signatures (BIP340 with zero aux) — verdicts are pure, so a
// fixed signature keeps the suite reproducible.
const AUX = new Uint8Array(32);
const xonly = (privHex: string): string => bytesToHex(schnorr.getPublicKey(hexToBytes(privHex)));
const PUB_A = xonly(PRIV_A);
const REF_1 = "aa".repeat(32);
const REF_2 = "bb".repeat(32);
const NAME = "alice";
const T0 = "2026-01-01T00:00:00Z";

const intervalA: OwnershipInterval = { ownerPubkey: PUB_A, ownershipRef: REF_1 };

function sign(opts: {
  priv?: string;
  name?: string;
  ownershipRef?: string;
  sequence: number;
  previousRecordHash?: string | null;
  payloadHex?: string;
  issuedAt?: string;
}): ValueRecordEnvelope {
  const priv = opts.priv ?? PRIV_A;
  const unsigned: ValueRecordEnvelope = {
    format: VALUE_RECORD_FORMAT,
    recordVersion: VALUE_RECORD_VERSION,
    name: opts.name ?? NAME,
    ownerPubkey: xonly(priv),
    ownershipRef: opts.ownershipRef ?? REF_1,
    sequence: opts.sequence,
    previousRecordHash: opts.previousRecordHash ?? null,
    valueType: 1,
    payloadHex: opts.payloadHex ?? "00",
    issuedAt: opts.issuedAt ?? T0,
    signature: "00".repeat(64),
  };
  // The digest excludes the signature, so it is computed over the unsigned shape.
  const digest = valueRecordDigest(unsigned as unknown as Record<string, unknown>);
  const signature = bytesToHex(schnorr.sign(digest, hexToBytes(priv), AUX));
  return { ...unsigned, signature };
}

const headHash = (h: ValueRecordEnvelope): string =>
  bytesToHex(valueRecordDigest(h as unknown as Record<string, unknown>));

describe("valueRecordAccept — interval binding (V2/V4/V13)", () => {
  it("V13: a record for a name with no current interval is rejected", () => {
    expect(valueRecordAccept(sign({ sequence: 1 }), null, null)).toEqual({
      accepted: false,
      reason: "v13-no-current-ownership-interval",
    });
  });

  it("V2: ownerPubkey != current owner key is rejected", () => {
    const rec = sign({ priv: PRIV_B, sequence: 1 }); // signed by B; ownerPubkey = PUB_B
    expect(valueRecordAccept(rec, intervalA, null).reason).toBe("v2-owner-key-mismatch");
  });

  it("V4: a prior interval's ownershipRef is rejected even under the same owner key", () => {
    const rec = sign({ ownershipRef: REF_2, sequence: 1 });
    expect(valueRecordAccept(rec, intervalA, null).reason).toBe("v4-ownership-ref-mismatch");
  });

  it("a correctly bound, validly signed first record is accepted", () => {
    expect(valueRecordAccept(sign({ sequence: 1 }), intervalA, null)).toEqual({
      accepted: true,
      reason: "value-record-accepted",
    });
  });
});

describe("valueRecordAccept — v1 authority record only (legacy v2 rejected)", () => {
  it("a legacy recordVersion-2 record (the @ont/protocol digest) is rejected, never authorizes", () => {
    const legacy = { ...sign({ sequence: 1 }), recordVersion: 2 } as ValueRecordEnvelope;
    expect(valueRecordAccept(legacy, intervalA, null).reason).toBe(
      "v3-legacy-record-version-rejected"
    );
  });

  it("a wrong format label is rejected", () => {
    const bad = { ...sign({ sequence: 1 }), format: "ont-recovery-descriptor" } as ValueRecordEnvelope;
    expect(valueRecordAccept(bad, intervalA, null).reason).toBe("v3-malformed-value-record");
  });
});

describe("valueRecordAccept — fail-closed on malformed candidates (no throw)", () => {
  it("malformed payload hex is a stable reject, not a throw", () => {
    const bad = { ...sign({ sequence: 1 }), payloadHex: "zz" } as ValueRecordEnvelope;
    expect(valueRecordAccept(bad, intervalA, null).reason).toBe("v3-malformed-value-record");
  });

  it("an out-of-bound (unsafe) candidate sequence is a wire-shape reject", () => {
    const bad = {
      ...sign({ sequence: 1 }),
      sequence: Number.MAX_SAFE_INTEGER + 1,
    } as ValueRecordEnvelope;
    expect(valueRecordAccept(bad, intervalA, null).reason).toBe("v3-malformed-value-record");
  });

  it("a malformed (short) signature fails closed as an invalid signature", () => {
    const bad = { ...sign({ sequence: 1 }), signature: "00".repeat(10) } as ValueRecordEnvelope;
    expect(valueRecordAccept(bad, intervalA, null).reason).toBe("v3-invalid-signature");
  });
});

describe("valueRecordAccept — signature & digest binding (V3 replay/cross-context)", () => {
  it("V3: a record with a signed field altered after signing is rejected (digest binds fields)", () => {
    const rec = sign({ sequence: 1, payloadHex: "0011" });
    const altered = { ...rec, payloadHex: "0012" }; // signature was over payload 0011
    expect(valueRecordAccept(altered, intervalA, null).reason).toBe("v3-invalid-signature");
  });

  it("V3: cross-name replay — relabeling the envelope's name breaks the name-bound digest", () => {
    const recA = sign({ name: "alice", sequence: 1 });
    const swapped = { ...recA, name: "bob" }; // keep A's signature, swap the name
    expect(valueRecordAccept(swapped, intervalA, null).reason).toBe("v3-invalid-signature");
  });

  it("V3: a recovery-descriptor signature presented as a value-record signature is rejected (domain separation)", () => {
    // A valid BIP340 signature by owner A — but over the 'ont-recovery-descriptor'
    // digest, not 'ont-value-record'. Same key, same name/ref; only the domain
    // label differs, so it must not authorize a value record.
    const descriptor = {
      format: RECOVERY_DESCRIPTOR_FORMAT,
      descriptorVersion: RECOVERY_DESCRIPTOR_VERSION,
      name: NAME,
      ownerPubkey: PUB_A,
      ownershipRef: REF_1,
      sequence: 1,
      previousDescriptorHash: null,
      recoveryAddress: "bc1qrecoveryexampleaddr0000000000000000",
      signingProfile: "bip322",
      challengeWindowBlocks: 144,
      issuedAt: T0,
      signature: "00".repeat(64),
    };
    const descSig = bytesToHex(
      schnorr.sign(recoveryDescriptorDigest(descriptor), hexToBytes(PRIV_A), AUX)
    );
    const crossContext = { ...sign({ sequence: 1 }), signature: descSig };
    expect(valueRecordAccept(crossContext, intervalA, null).reason).toBe("v3-invalid-signature");
  });
});

describe("valueRecordAccept — first record (V6)", () => {
  it("accepts sequence 1 with null previousRecordHash", () => {
    expect(valueRecordAccept(sign({ sequence: 1 }), intervalA, null).accepted).toBe(true);
  });

  it("rejects a first record with sequence != 1", () => {
    expect(valueRecordAccept(sign({ sequence: 2 }), intervalA, null).reason).toBe(
      "v6-first-record-must-be-sequence-1"
    );
  });

  it("rejects a first record (sequence 1) with a non-null previousRecordHash", () => {
    const rec = sign({ sequence: 1, previousRecordHash: "cc".repeat(32) });
    expect(valueRecordAccept(rec, intervalA, null).reason).toBe(
      "v6-first-record-must-have-null-previous-hash"
    );
  });
});

describe("valueRecordAccept — non-first sequence + linkage (V7/V8)", () => {
  const head = sign({ sequence: 1 });

  it("V7+V8: accepts head+1 linking the recomputed head hash", () => {
    const rec = sign({ sequence: 2, previousRecordHash: headHash(head) });
    expect(valueRecordAccept(rec, intervalA, head)).toEqual({
      accepted: true,
      reason: "value-record-accepted",
    });
  });

  it("V7: rejects a stale/duplicate sequence (<= head)", () => {
    const rec = sign({ sequence: 1, previousRecordHash: headHash(head) });
    expect(valueRecordAccept(rec, intervalA, head).reason).toBe("v7-stale-or-duplicate-sequence");
  });

  it("V7: rejects a sequence gap (> head+1)", () => {
    const rec = sign({ sequence: 3, previousRecordHash: headHash(head) });
    expect(valueRecordAccept(rec, intervalA, head).reason).toBe("v7-sequence-gap");
  });

  it("V7: a chain at the max sequence bound freezes fail-closed (no head+1 is a safe integer)", () => {
    const maxHead = sign({ sequence: SEQUENCE_BOUND });
    const rec = sign({ sequence: 5, previousRecordHash: headHash(maxHead) });
    expect(valueRecordAccept(rec, intervalA, maxHead).reason).toBe("v7-head-sequence-bound-reached");
  });

  it("V8: rejects head+1 with a wrong previousRecordHash", () => {
    const rec = sign({ sequence: 2, previousRecordHash: "dd".repeat(32) });
    expect(valueRecordAccept(rec, intervalA, head).reason).toBe("v8-previous-record-hash-mismatch");
  });

  it("V8: rejects a previousRecordHash of a forged head (recompute, never trust declared)", () => {
    const forgedHead = sign({ sequence: 1, payloadHex: "deadbeef" }); // valid record, different content
    const rec = sign({ sequence: 2, previousRecordHash: headHash(forgedHead) });
    expect(valueRecordAccept(rec, intervalA, head).reason).toBe("v8-previous-record-hash-mismatch");
  });
});

describe("valueRecordAccept — transfer clears the chain (V10, compositional)", () => {
  // After a transfer the engine supplies the NEW interval (new ownershipRef) and
  // a null head; the old chain cannot be continued.
  const newInterval: OwnershipInterval = { ownerPubkey: PUB_A, ownershipRef: REF_2 };

  it("a record bearing the OLD interval reference is rejected under the new interval", () => {
    const rec = sign({ ownershipRef: REF_1, sequence: 1 });
    expect(valueRecordAccept(rec, newInterval, null).reason).toBe("v4-ownership-ref-mismatch");
  });

  it("continuing the old sequence space (sequence 2 on a fresh interval) is rejected", () => {
    const rec = sign({ ownershipRef: REF_2, sequence: 2 });
    expect(valueRecordAccept(rec, newInterval, null).reason).toBe(
      "v6-first-record-must-be-sequence-1"
    );
  });

  it("the new owner's fresh sequence-1 / null-prev record under the new ref is accepted", () => {
    const rec = sign({ ownershipRef: REF_2, sequence: 1 });
    expect(valueRecordAccept(rec, newInterval, null).accepted).toBe(true);
  });
});

describe("valueRecordAccept — issuedAt never orders the chain (V1/V11)", () => {
  const head = sign({ sequence: 1, issuedAt: "2026-06-01T00:00:00Z" });

  it("V11: a successor with an EARLIER issuedAt than its predecessor is accepted on valid linkage", () => {
    const rec = sign({
      sequence: 2,
      previousRecordHash: headHash(head),
      issuedAt: "2026-01-01T00:00:00Z",
    });
    expect(valueRecordAccept(rec, intervalA, head).accepted).toBe(true);
  });

  it("V11: a LATER issuedAt with a stale sequence is still rejected (recency grants nothing)", () => {
    const rec = sign({
      sequence: 1,
      previousRecordHash: headHash(head),
      issuedAt: "2027-01-01T00:00:00Z",
    });
    expect(valueRecordAccept(rec, intervalA, head).reason).toBe("v7-stale-or-duplicate-sequence");
  });

  it("V1: identical inputs yield identical verdicts (pure/deterministic)", () => {
    const rec = sign({ sequence: 2, previousRecordHash: headHash(head) });
    expect(valueRecordAccept(rec, intervalA, head)).toEqual(valueRecordAccept(rec, intervalA, head));
  });
});

// Drives EVERY conformance vector through the real @ont/wire API. This is the
// file that makes the suite binding on the implementation: valid vectors must
// round-trip, reject vectors must throw (or fail verification, where the cited
// rule is a verification rule). The vectors are authoritative; nothing here
// may special-case an id to dodge a failure.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as wire from "../src/index";

const VEC = (name: string) =>
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "vectors", name), "utf8"));
const fromHex = (s: string) => Uint8Array.from(s.match(/.{2}/g) ?? [], (x) => parseInt(x, 16));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("impl §3 frame", () => {
  it("validateFrame: every vector behaves as its kind says", () => {
    for (const v of VEC("frame.json").vectors) {
      const bytes = fromHex(v.hex);
      if (v.kind === "valid") expect(() => wire.validateFrame(bytes), v.id).not.toThrow();
      else expect(() => wire.validateFrame(bytes), `${v.id} (${v.cite})`).toThrow(wire.WireError);
    }
  });
});

describe("impl §2 names", () => {
  const names = VEC("names.json");
  it("normalizeNameInput maps accepted input, throws on rejects; wire bytes never normalize", () => {
    for (const c of names.acceptedInput) expect(wire.normalizeNameInput(c.input)).toBe(c.canonical);
    for (const c of names.rejectInput) expect(() => wire.normalizeNameInput(c.input), c.input).toThrow(wire.WireError);
    for (const c of names.canonicalWireBytes) {
      expect(wire.isCanonicalName(new TextDecoder().decode(fromHex(c.nameHex)))).toBe(c.valid);
    }
  });
});

describe("impl §4 events", () => {
  const events = VEC("events.json");
  it("valid vectors decode, and re-encode byte-identically (encode∘decode = id)", () => {
    for (const v of events.vectors.filter((v: any) => v.kind === "valid")) {
      const decoded = wire.decodeEvent(fromHex(v.hex));
      expect(toHex(wire.encodeEvent(decoded)), v.id).toBe(v.hex);
    }
  });
  it("reject vectors throw", () => {
    for (const v of events.vectors.filter((v: any) => v.kind === "reject")) {
      expect(() => wire.decodeEvent(fromHex(v.hex)), `${v.id} (${v.cite})`).toThrow(wire.WireError);
    }
  });
  it("decoded fields match the vector fields", () => {
    const t = events.vectors.find((v: any) => v.id === "transfer-valid");
    const decoded = wire.decodeEvent(fromHex(t.hex)) as wire.TransferEvent;
    expect(decoded.prevStateTxid).toBe(t.fields.prevStateTxid);
    expect(decoded.newOwnerPubkey).toBe(t.fields.newOwnerPubkey);
    expect(decoded.signature).toBe(t.fields.signature);
    const b = events.vectors.find((v: any) => v.id === "bid-valid");
    const bid = wire.decodeEvent(fromHex(b.hex)) as wire.AuctionBidEvent;
    expect(bid.bidAmountSats).toBe(BigInt(b.fields.bidAmountSats));
    expect(bid.name).toBe(b.fields.name);
    expect(bid.auctionStateCommitment).toBe(b.fields.auctionStateCommitment);
  });
  it("encodeEvent refuses a bid without INCLUDES_NAME", () => {
    const b = events.vectors.find((v: any) => v.id === "bid-valid");
    const bid = wire.decodeEvent(fromHex(b.hex)) as wire.AuctionBidEvent;
    expect(() => wire.encodeEvent({ ...bid, flags: 0x00 })).toThrow(wire.WireError);
  });
});

describe("impl §5 keys and digests", () => {
  const keys = VEC("keys.json");
  it("deriveOwnerKey reproduces the key vectors", () => {
    for (const o of keys.owners) {
      const k = wire.deriveOwnerKey(keys.mnemonic, o.index);
      expect(k.xOnlyPubkey).toBe(o.xOnlyPubkey);
      expect(k.privateKey).toBe(o.privateKey);
    }
  });
  it("digest vectors recompute and verify; cross-context signatures fail", () => {
    for (const v of VEC("digests.json").vectors) {
      if (v.kind === "valid") {
        const digest = v.label === "ont-transfer-owner"
          ? wire.transferAuthDigest(v.fields) : wire.recoverAuthDigest(v.fields);
        expect(toHex(digest), v.id).toBe(v.digest);
        expect(wire.verifySchnorr(v.signature, digest, v.signerXOnlyPubkey)).toBe(true);
      } else {
        expect(wire.verifySchnorr(v.signature, fromHex(v.digest), v.signerXOnlyPubkey), v.id).toBe(false);
      }
    }
  });
});

describe("impl §6 commitments", () => {
  const com = VEC("commitments.json");
  const byId = Object.fromEntries(com.vectors.map((v: any) => [v.id, v]));
  it("recomputes all three commitments from vector inputs", () => {
    expect(wire.computeBidderCommitment(byId["bidder-commitment"].bidderId))
      .toBe(byId["bidder-commitment"].commitment);
    expect(wire.computeLotCommitment(byId["lot-commitment"])).toBe(byId["lot-commitment"].commitment);
    for (const id of ["state-commitment-full", "state-commitment-absents"]) {
      expect(wire.computeStateCommitment(byId[id].state), id).toBe(byId[id].commitment);
    }
  });
  it("rejects per the §6 rendering rules", () => {
    expect(() => wire.computeStateCommitment(byId["state-reject-unknown-phase"].state)).toThrow(wire.WireError);
    expect(() => wire.computeBidderCommitment(byId["bidder-reject-empty-after-trim"].bidderId)).toThrow(wire.WireError);
    expect(wire.isDecimalRendering(byId["decimal-reject-leading-zeros"].rendering)).toBe(false);
    expect(wire.isHex32Rendering(byId["hex32-reject-uppercase"].rendering)).toBe(false);
  });
});

type EnvelopeCase = {
  file: string;
  parse: (json: string) => Record<string, unknown>;
  digest?: (e: Record<string, unknown>) => Uint8Array;
  digestKey?: string;
  verify: (e: Record<string, unknown>) => boolean;
  verificationRejects: string[]; // reject ids that parse cleanly and fail only at verification
};
const CASES: EnvelopeCase[] = [
  { file: "value-record.json", parse: wire.parseValueRecord, digest: wire.valueRecordDigest,
    digestKey: "digest", verify: wire.verifyValueRecord, verificationRejects: [] },
  { file: "recovery-descriptor.json", parse: wire.parseRecoveryDescriptor,
    digest: wire.recoveryDescriptorDigest, digestKey: "digest", verify: wire.verifyRecoveryDescriptor,
    verificationRejects: [] },
  { file: "wallet-proof.json", parse: wire.parseWalletProof, digest: wire.walletProofHash,
    digestKey: "proofHash", verify: wire.verifyWalletProofSignature,
    verificationRejects: ["wallet-proof-reject-bip322-invalid-signature"] },
];

describe("impl §8 envelopes", () => {
  for (const c of CASES) {
    it(`${c.file}: valids parse+digest+verify; rejects throw or fail verification`, () => {
      for (const v of VEC(c.file).vectors) {
        const json = v.rawJson ?? JSON.stringify(v.envelope);
        if (v.kind === "valid") {
          const e = c.parse(json);
          expect(toHex(c.digest!(e)), v.id).toBe(v[c.digestKey!]);
          expect(c.verify(e), `${v.id} signature`).toBe(true);
        } else if (c.verificationRejects.includes(v.id)) {
          const e = c.parse(json); // must parse cleanly...
          expect(c.verify(e), `${v.id} (${v.cite})`).toBe(false); // ...and fail only here
        } else {
          expect(() => c.parse(json), `${v.id} (${v.cite})`).toThrow(wire.WireError);
        }
      }
    });
  }
  it("duplicate JSON keys reject at the parse layer", () => {
    const dup = VEC("value-record.json").vectors
      .find((v: any) => v.id === "value-record-reject-duplicate-json-key");
    expect(() => wire.parseValueRecord(dup.rawJson)).toThrow(/duplicate/);
  });
  it("§8.3 proof commitment is the bare 32-byte hash", () => {
    const v = VEC("wallet-proof.json").vectors.find((v: any) => v.id === "wallet-proof-valid-no-tip");
    const e = wire.parseWalletProof(JSON.stringify(v.envelope));
    expect(toHex(wire.walletProofCommitment(e))).toBe(v.proofCommitment);
    expect(wire.walletProofCommitment(e)).toHaveLength(32);
  });
});

describe("impl legacy evidence rejects", () => {
  it("the legacy 152-byte bid and the retired 0x0d marker both reject", () => {
    const le = VEC("legacy-evidence.json");
    for (const id of ["legacy-bid-152-truncated-commitments", "legacy-availability-marker-41"]) {
      const v = le.vectors.find((x: any) => x.id === id);
      expect(() => wire.decodeEvent(fromHex(v.hex)), id).toThrow(wire.WireError);
    }
  });
});

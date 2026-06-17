// B1 conformance suite — self-validation of vectors/ against an independent
// in-test rendering of docs/spec/WIRE_FORMAT.md. Deliberately does NOT import
// tools/generate-vectors.mjs: the generator writes the vectors, this file
// re-derives them from the spec constructions, so an authoring error has to
// survive two readings of the spec text to pass.
//
// When the @ont/wire implementation lands (after this suite merges), its tests
// run the same vectors through the real encode/decode/digest API.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sha256 } from "@noble/hashes/sha2.js";
import { schnorr } from "@noble/curves/secp256k1.js";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";

const VEC = (name: string) =>
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "vectors", name), "utf8"));

// ---- §1 conventions, re-implemented from spec text ----
const utf8 = (s: string) => new TextEncoder().encode(s);
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (s: string) => Uint8Array.from(s.match(/.{2}/g) ?? [], (x) => parseInt(x, 16));
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const u16 = (n: number) => Uint8Array.of((n >> 8) & 0xff, n & 0xff);
const u32 = (n: number) => Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
const u64 = (n: number | bigint) => {
  const v = BigInt(n);
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) out[7 - i] = Number((v >> BigInt(8 * i)) & 0xffn);
  return out;
};
const lenPrefix = (s: string) => { const b = utf8(s); return cat(u16(b.length), b); };
const nullFlag = (x: Uint8Array | null) => (x == null ? Uint8Array.of(0x00) : cat(Uint8Array.of(0x01), x));

// ---- §2/§3 reference validators (executable spec) ----
const NAME_RE = /^[a-z0-9]{1,32}$/;
const LIVE_TYPE_BYTES = new Set([0x03, 0x07, 0x09, 0x0b]);
const frameOk = (bytes: Uint8Array) =>
  bytes.length >= 5 &&
  bytes[0] === 0x4f && bytes[1] === 0x4e && bytes[2] === 0x54 && // "ONT"
  bytes[3] === 0x01 &&
  LIVE_TYPE_BYTES.has(bytes[4]);

// §4 expected total sizes (frame included)
const FIXED_SIZES: Record<number, number> = { 0x03: 135, 0x09: 171, 0x0b: 73 };
const eventOk = (bytes: Uint8Array): boolean => {
  if (!frameOk(bytes)) return false;
  const t = bytes[4];
  if (t in FIXED_SIZES) return bytes.length === FIXED_SIZES[t];
  // AuctionBid §4.3: 147 fixed (incl frame) + unlockBlock(4) + nameLength(1) + name
  if (bytes.length < 147 + 5) return false;
  if ((bytes[5] & 0x01) !== 0x01) return false; // INCLUDES_NAME MUST be set
  const nameLength = bytes[151];
  if (bytes.length !== 152 + nameLength) return false; // trailing/truncated reject
  const name = new TextDecoder().decode(bytes.slice(152));
  return NAME_RE.test(name); // §2: wire never normalizes — reject non-canonical
};

// ---- §6 renderings ----
const PHASES = new Set(["pending_unlock", "awaiting_opening_bid", "live_bidding", "soft_close", "settled"]);
const isDecimal = (s: string) => /^(0|[1-9][0-9]*)$/.test(s);
const isHex32 = (s: string) => /^[0-9a-f]{64}$/.test(s);
const textRendering = (s: string) => s.trim().length > 0;

const stateCommitment = (s: Record<string, unknown>) => {
  if (!PHASES.has(s.phase as string)) throw new Error("unknown phase");
  const order = ["auctionId", "name", "currentBlockHeight", "phase", "unlockBlock",
    "auctionCloseBlockAfter", "openingMinimumBidSats", "currentLeaderBidderCommitment",
    "currentHighestBidSats", "currentRequiredMinimumBidSats", "settlementLockBlocks"];
  return sha256(cat(lenPrefix("ont-auction-state"),
    ...order.map((k) => lenPrefix(s[k] == null ? "" : String(s[k])))));
};

describe("§5 keys", () => {
  const keys = VEC("keys.json");
  it("derives byte-identical owner keys from the 12 words", () => {
    const seed = mnemonicToSeedSync(keys.mnemonic).slice(0, 32);
    expect(hex(seed)).toBe(keys.masterSeed);
    for (const o of keys.owners) {
      const node = HDKey.fromMasterSeed(seed).derive(`m/696969'/0'/${o.index}'`);
      expect(hex(schnorr.getPublicKey(node.privateKey!))).toBe(o.xOnlyPubkey);
    }
  });
  it("cross-checks key derivation against the legacy claim-site implementation", async () => {
    // Golden-vector mining per B0: the legacy deriveOwnerKey must produce the
    // same keys from the same 12 words, or the carried-forward derivation
    // (§5: 'byte-identical keys in every implementation') is misstated.
    const legacy = await import("../../../legacy/apps/claim/src/keys");
    for (const o of keys.owners) {
      const k = legacy.deriveOwnerKey(keys.mnemonic, o.index);
      expect(k.ownerPubkey, `owner ${o.index}`).toBe(o.xOnlyPubkey);
      expect(k.ownerPrivateKeyHex).toBe(o.privateKey);
    }
  });
});

describe("§3 frame", () => {
  const frame = VEC("frame.json");
  it("accepts exactly the registry, rejects everything else (exhaustive vectors)", () => {
    for (const v of frame.vectors) {
      expect(frameOk(fromHex(v.hex)), `${v.id} (${v.cite})`).toBe(v.kind === "valid");
    }
  });
  it("property: vectors cover every type byte 0x00-0xff, and only the registry passes", () => {
    const covered = new Set(
      frame.vectors.map((v: any) => fromHex(v.hex)).filter((b: Uint8Array) => b.length === 5)
        .map((b: Uint8Array) => b[4]));
    for (let t = 0; t <= 0xff; t++) {
      expect(covered.has(t), `type byte 0x${t.toString(16)} missing from vectors`).toBe(true);
      const bytes = cat(utf8("ONT"), Uint8Array.of(0x01, t));
      expect(frameOk(bytes)).toBe(LIVE_TYPE_BYTES.has(t));
    }
  });
});

describe("§2 names", () => {
  const names = VEC("names.json");
  it("canonical grammar [a-z0-9]{1,32}", () => {
    for (const c of names.acceptedInput) {
      expect(NAME_RE.test(c.canonical), c.input).toBe(true);
      expect(c.input.trim().toLowerCase()).toBe(c.canonical); // normalization is idempotent mapping
    }
    for (const c of names.rejectInput) {
      expect(NAME_RE.test(c.input.trim().toLowerCase()), `${c.input} (${c.cite})`).toBe(false);
    }
  });
  it("wire never normalizes: non-canonical name bytes reject", () => {
    for (const c of names.canonicalWireBytes) {
      const s = new TextDecoder().decode(fromHex(c.nameHex));
      expect(NAME_RE.test(s)).toBe(c.valid);
    }
  });
});

describe("§4 event layouts", () => {
  const events = VEC("events.json");
  const byId = Object.fromEntries(events.vectors.map((v: any) => [v.id, v]));

  it("re-encodes transfer/recover/anchor byte-identically from fields", () => {
    const t = byId["transfer-valid"];
    const tBytes = cat(utf8("ONT"), Uint8Array.of(0x01, 0x03), fromHex(t.fields.prevStateTxid),
      fromHex(t.fields.newOwnerPubkey), Uint8Array.of(t.fields.flags),
      Uint8Array.of(t.fields.successorBondVout), fromHex(t.fields.signature));
    expect(hex(tBytes)).toBe(t.hex);
    expect(tBytes.length).toBe(135);

    const r = byId["recover-valid"];
    const rBytes = cat(utf8("ONT"), Uint8Array.of(0x01, 0x09), fromHex(r.fields.prevStateTxid),
      fromHex(r.fields.newOwnerPubkey), Uint8Array.of(r.fields.flags),
      Uint8Array.of(r.fields.successorBondVout), u32(r.fields.challengeWindowBlocks),
      fromHex(r.fields.recoveryDescriptorHash), fromHex(r.fields.signature));
    expect(hex(rBytes)).toBe(r.hex);
    expect(rBytes.length).toBe(171);

    const a = byId["anchor-valid"];
    const aBytes = cat(utf8("ONT"), Uint8Array.of(0x01, 0x0b), fromHex(a.fields.prevRoot),
      fromHex(a.fields.newRoot), u32(a.fields.batchSize));
    expect(hex(aBytes)).toBe(a.hex);
    expect(aBytes.length).toBe(73);
  });

  it("re-encodes the full-width auction bid (§4.3, W16) byte-identically", () => {
    const b = byId["bid-valid"];
    const f = b.fields;
    const nameBytes = utf8(f.name);
    const bytes = cat(utf8("ONT"), Uint8Array.of(0x01, 0x07), Uint8Array.of(f.flags),
      Uint8Array.of(f.bondVout), u32(f.settlementLockBlocks), u64(f.bidAmountSats),
      fromHex(f.ownerPubkey), fromHex(f.auctionLotCommitment), fromHex(f.auctionStateCommitment),
      fromHex(f.bidderCommitment), u32(f.unlockBlock), Uint8Array.of(nameBytes.length), nameBytes);
    expect(hex(bytes)).toBe(b.hex);
    expect(bytes.length).toBe(147 + 5 + nameBytes.length);
  });

  it("valid vectors pass / reject vectors fail the reference decoder", () => {
    for (const v of events.vectors) {
      expect(eventOk(fromHex(v.hex)), `${v.id} (${v.cite})`).toBe(v.kind === "valid");
    }
  });

  it("§4.6 property: every valid event is ≤ 184 bytes, max bid is exactly 184", () => {
    for (const v of events.vectors.filter((v: any) => v.kind === "valid")) {
      expect(fromHex(v.hex).length).toBeLessThanOrEqual(184);
    }
    expect(fromHex(byId["bid-valid-max"].hex).length).toBe(184);
  });

  it("event signatures verify against the vector digests and signer keys", () => {
    for (const id of ["transfer-valid", "recover-valid"]) {
      const v = byId[id];
      expect(schnorr.verify(fromHex(v.fields.signature), fromHex(v.digest),
        fromHex(v.signerXOnlyPubkey))).toBe(true);
    }
  });
});

describe("§5 owner-key Schnorr digests", () => {
  const digests = VEC("digests.json");
  it("recomputes both on-chain authorization digests from fields", () => {
    for (const v of digests.vectors.filter((v: any) => v.kind === "valid")) {
      const f = v.fields;
      const bytes = v.label === "ont-transfer-owner"
        ? cat(lenPrefix(v.label), fromHex(f.prevStateTxid), fromHex(f.newOwnerPubkey),
            Uint8Array.of(f.flags), Uint8Array.of(f.successorBondVout))
        : cat(lenPrefix(v.label), fromHex(f.prevStateTxid), fromHex(f.newOwnerPubkey),
            Uint8Array.of(f.flags), Uint8Array.of(f.successorBondVout),
            u32(f.challengeWindowBlocks), fromHex(f.recoveryDescriptorHash));
      expect(hex(sha256(bytes)), v.id).toBe(v.digest);
      expect(schnorr.verify(fromHex(v.signature), fromHex(v.digest), fromHex(v.signerXOnlyPubkey))).toBe(true);
    }
  });
  it("cross-context: a signature from one context MUST NOT verify in another", () => {
    for (const v of digests.vectors.filter((v: any) => v.kind === "reject")) {
      expect(schnorr.verify(fromHex(v.signature), fromHex(v.digest), fromHex(v.signerXOnlyPubkey)),
        v.id).toBe(false);
    }
  });
});

describe("§6 auction commitments", () => {
  const com = VEC("commitments.json");
  const byId = Object.fromEntries(com.vectors.map((v: any) => [v.id, v]));

  it("recomputes bidder / lot / state commitments", () => {
    const b = byId["bidder-commitment"];
    expect(hex(sha256(cat(lenPrefix("ont-auction-bidder"), lenPrefix(b.bidderId))))).toBe(b.commitment);

    const l = byId["lot-commitment"];
    expect(hex(sha256(cat(lenPrefix("ont-auction-lot"), lenPrefix(l.auctionId),
      lenPrefix(l.name), lenPrefix(String(l.unlockBlock)))))).toBe(l.commitment);

    for (const id of ["state-commitment-full", "state-commitment-absents"]) {
      const s = byId[id];
      expect(hex(stateCommitment(s.state)), id).toBe(s.commitment);
    }
  });

  it("rejects: unknown phase, empty-after-trim text, bad renderings", () => {
    expect(() => stateCommitment(byId["state-reject-unknown-phase"].state)).toThrow();
    expect(textRendering(byId["bidder-reject-empty-after-trim"].bidderId)).toBe(false);
    expect(isDecimal(byId["decimal-reject-leading-zeros"].rendering)).toBe(false);
    expect(isHex32(byId["hex32-reject-uppercase"].rendering)).toBe(false);
  });

  it("commitments embedded in the bid vector match their stated inputs", () => {
    const events = VEC("events.json");
    const bid = events.vectors.find((v: any) => v.id === "bid-valid");
    const inp = bid.commitmentInputs;
    expect(hex(sha256(cat(lenPrefix("ont-auction-bidder"), lenPrefix(inp.bidderId)))))
      .toBe(bid.fields.bidderCommitment);
    expect(hex(sha256(cat(lenPrefix("ont-auction-lot"), lenPrefix(inp.auctionId),
      lenPrefix(bid.fields.name), lenPrefix(String(bid.fields.unlockBlock))))))
      .toBe(bid.fields.auctionLotCommitment);
    expect(hex(stateCommitment(inp.state))).toBe(bid.fields.auctionStateCommitment);
  });
});

describe("§8.1 value record (recordVersion 1)", () => {
  const vr = VEC("value-record.json");
  const digest = (e: any) =>
    sha256(cat(lenPrefix("ont-value-record"), Uint8Array.of(e.recordVersion), lenPrefix(e.name),
      fromHex(e.ownerPubkey), fromHex(e.ownershipRef), u64(e.sequence),
      nullFlag(e.previousRecordHash == null ? null : fromHex(e.previousRecordHash)),
      Uint8Array.of(e.valueType), u16(fromHex(e.payloadHex).length), fromHex(e.payloadHex),
      lenPrefix(e.issuedAt)));

  it("recomputes digests and verifies owner signatures", () => {
    for (const v of vr.vectors.filter((v: any) => v.kind === "valid")) {
      expect(hex(digest(v.envelope)), v.id).toBe(v.digest);
      expect(v.envelope.recordVersion).toBe(1);
      expect(schnorr.verify(fromHex(v.envelope.signature), fromHex(v.digest),
        fromHex(v.signerXOnlyPubkey))).toBe(true);
    }
  });

  it("u16 payload bound is 65,535 — a wire constant", () => {
    expect(vr.encodablePayloadBound).toBe(0xffff);
  });
});

describe("§8 closed field sets (all three envelopes)", () => {
  // Reference shape validator: every listed required field present, optionals
  // allowed, nothing else — per §8 "field sets are closed".
  const SHAPES: Record<string, { version: [string, number]; required: string[]; optional: string[] }> = {
    "ont-value-record": {
      version: ["recordVersion", 1],
      required: ["format", "recordVersion", "name", "ownerPubkey", "ownershipRef", "sequence",
        "previousRecordHash", "valueType", "payloadHex", "issuedAt", "signature"],
      optional: [],
    },
    "ont-recovery-descriptor": {
      version: ["descriptorVersion", 1],
      required: ["format", "descriptorVersion", "name", "ownerPubkey", "ownershipRef", "sequence",
        "previousDescriptorHash", "recoveryAddress", "signingProfile", "challengeWindowBlocks",
        "issuedAt", "signature"],
      optional: ["recoveryPubkey"],
    },
    "ont-recovery-wallet-proof": {
      version: ["proofVersion", 1],
      required: ["format", "proofVersion", "name", "prevStateTxid", "recoveryDescriptorHash",
        "newOwnerPubkey", "successorBondVout", "challengeWindowBlocks", "recoveryAddress",
        "signingProfile", "message", "signatureBase64"],
      optional: ["chainTipBlockHash", "chainTipHeight"],
    },
  };
  const shapeOk = (e: any, format: string) => {
    const s = SHAPES[format];
    const allowed = [...s.required, ...s.optional];
    if (format === "ont-recovery-descriptor") {
      const required = e.descriptorVersion === 2 ? [...s.required, "recoveryPubkey"] : s.required;
      return e.format === format && (e.descriptorVersion === 1 || e.descriptorVersion === 2) &&
        required.every((k) => k in e) && Object.keys(e).every((k) => allowed.includes(k)) &&
        (e.descriptorVersion === 2 || !("recoveryPubkey" in e));
    }
    return e.format === format && e[s.version[0]] === s.version[1] &&
      s.required.every((k) => k in e) && Object.keys(e).every((k) => allowed.includes(k));
  };

  const cases: Array<[string, string]> = [
    ["value-record.json", "ont-value-record"],
    ["recovery-descriptor.json", "ont-recovery-descriptor"],
    ["wallet-proof.json", "ont-recovery-wallet-proof"],
  ];
  for (const [file, format] of cases) {
    it(`${format}: every reject vector is off-shape or off-rule; valids are exactly on-shape`, () => {
      for (const v of VEC(file).vectors) {
        if (!v.envelope) continue; // raw-JSON fixtures handled below
        if (v.kind === "valid") {
          expect(shapeOk(v.envelope, format), v.id).toBe(true);
        } else if (v.id.includes("extra-field") || v.id.includes("missing-field") ||
                   v.id.includes("version") || v.id.includes("wrong-format")) {
          expect(shapeOk(v.envelope, format), v.id).toBe(false);
        }
      }
    });
  }

  it("duplicate JSON keys are detectable in the raw fixture (flat envelopes)", () => {
    const dup = VEC("value-record.json").vectors
      .find((v: any) => v.id === "value-record-reject-duplicate-json-key");
    const keys = [...dup.rawJson.matchAll(/"([^"]+)":/g)].map((m) => m[1]);
    expect(new Set(keys).size).toBeLessThan(keys.length); // duplicate present
    expect(keys.filter((k) => k === "sequence")).toHaveLength(2);
    // JSON.parse silently keeps the last duplicate — exactly why the spec
    // requires detection at the JSON layer where possible.
    expect(JSON.parse(dup.rawJson).sequence).toBe(2);
  });
});

describe("§8.2 recovery descriptor", () => {
  const rd = VEC("recovery-descriptor.json");
  const byId = Object.fromEntries(rd.vectors.map((v: any) => [v.id, v]));
  const digest = (e: any) =>
    sha256(cat(lenPrefix("ont-recovery-descriptor"), Uint8Array.of(e.descriptorVersion),
      lenPrefix(e.name), fromHex(e.ownerPubkey), fromHex(e.ownershipRef), u64(e.sequence),
      nullFlag(e.previousDescriptorHash == null ? null : fromHex(e.previousDescriptorHash)),
      // §8.2 never-diverge: profile enters the digest normalized
      lenPrefix(e.recoveryAddress), lenPrefix(e.signingProfile.trim().toLowerCase()),
      u32(e.challengeWindowBlocks), lenPrefix(e.issuedAt),
      ...(e.descriptorVersion === 2 ? [fromHex(e.recoveryPubkey)] : [])));
  const PROFILE_RE = /^[a-z0-9._-]{1,32}$/;

  it("recomputes descriptor digests (the on-chain-referenced hash)", () => {
    for (const v of rd.vectors.filter((v: any) => v.kind === "valid")) {
      expect(hex(digest(v.envelope)), v.id).toBe(v.digest);
    }
  });
  it("v1 remains parse-valid but not invokable; v2 invoke signatures verify only against recoveryPubkey", () => {
    const v1 = byId["descriptor-v1-not-invokable"];
    expect(v1.envelope.descriptorVersion).toBe(1);
    expect("recoveryPubkey" in v1.envelope).toBe(false);
    expect(v1.invokable).toBe(false);

    const v2 = byId["descriptor-v2-valid"];
    expect(v2.envelope.descriptorVersion).toBe(2);
    expect(hex(digest(v2.envelope))).toBe(v2.digest);
    expect(schnorr.verify(fromHex(v2.invoke.signature), fromHex(v2.invoke.digest),
      fromHex(v2.envelope.recoveryPubkey))).toBe(true);

    const wrong = byId["descriptor-v2-reject-wrong-recovery-pubkey-for-invoke"];
    expect(hex(digest(wrong.envelope))).toBe(wrong.digest);
    expect(schnorr.verify(fromHex(wrong.invoke.signature), fromHex(wrong.invoke.digest),
      fromHex(wrong.envelope.recoveryPubkey))).toBe(false);
  });
  it("signingProfile grammar accepts valids (incl. future profiles) and rejects rejects", () => {
    for (const v of rd.vectors.filter((v: any) => v.id.includes("profile"))) {
      const normalized = v.envelope.signingProfile.trim().toLowerCase();
      expect(PROFILE_RE.test(normalized), v.id).toBe(v.kind === "valid");
    }
  });
});

describe("§8.3 recovery wallet proof", () => {
  const wp = VEC("wallet-proof.json");
  const byId = Object.fromEntries(wp.vectors.map((v: any) => [v.id, v]));
  const message = (e: any) => {
    const chainTip = e.chainTipBlockHash == null || e.chainTipHeight == null
      ? "unspecified" : `${e.chainTipBlockHash}@${e.chainTipHeight}`;
    return ["Open Name Tags owner recovery proof", "profile: bip322", `name: ${e.name}`,
      `prevStateTxid: ${e.prevStateTxid}`, `recoveryDescriptorHash: ${e.recoveryDescriptorHash}`,
      `newOwnerPubkey: ${e.newOwnerPubkey}`, `successorBondVout: ${e.successorBondVout}`,
      `challengeWindowBlocks: ${e.challengeWindowBlocks}`, `chainTip: ${chainTip}`].join("\n");
  };
  const proofHash = (e: any, profile: string) =>
    sha256(cat(lenPrefix("ont-recovery-wallet-proof"), Uint8Array.of(e.proofVersion),
      lenPrefix(e.name), fromHex(e.prevStateTxid), fromHex(e.recoveryDescriptorHash),
      fromHex(e.newOwnerPubkey), Uint8Array.of(e.successorBondVout), u32(e.challengeWindowBlocks),
      nullFlag(e.chainTipBlockHash == null ? null : fromHex(e.chainTipBlockHash)),
      nullFlag(e.chainTipHeight == null ? null : u32(e.chainTipHeight)),
      lenPrefix(e.recoveryAddress), lenPrefix(profile),
      lenPrefix(e.message), lenPrefix(e.signatureBase64)));

  it("regenerates the 9-line message byte-for-byte (both chainTip arms)", () => {
    for (const id of ["wallet-proof-valid-no-tip", "wallet-proof-valid-with-tip"]) {
      const v = byId[id];
      expect(message(v.envelope), id).toBe(v.envelope.message);
      expect(v.envelope.message.split("\n")).toHaveLength(9);
      expect(v.envelope.message.endsWith("\n")).toBe(false);
      expect(hex(proofHash(v.envelope, "bip322"))).toBe(v.proofHash);
    }
  });
  it("regenerate-and-compare rejects a tampered or trailing-newline message", () => {
    for (const id of ["wallet-proof-reject-tampered-message", "wallet-proof-reject-trailing-newline"]) {
      const v = byId[id];
      expect(message(v.envelope)).not.toBe(v.envelope.message);
    }
  });
  it("profile normalization: ' BIP322 ' hashes as the normalized literal; others reject", () => {
    const norm = byId["wallet-proof-accept-profile-normalization"];
    expect(norm.envelope.signingProfile.trim().toLowerCase()).toBe("bip322");
    expect(hex(proofHash(norm.envelope, "bip322"))).toBe(norm.proofHash);
    expect(byId["wallet-proof-reject-profile"].envelope.signingProfile.trim().toLowerCase())
      .not.toBe("bip322");
  });
  it("BIP322: valid signatures verify, the tampered signature does not", async () => {
    const { Verifier } = (await import("bip322-js")).default;
    for (const id of ["wallet-proof-valid-no-tip", "wallet-proof-valid-with-tip"]) {
      const e = byId[id].envelope;
      expect(Verifier.verifySignature(e.recoveryAddress, e.message, e.signatureBase64), id).toBe(true);
    }
    const bad = byId["wallet-proof-reject-bip322-invalid-signature"].envelope;
    // message regenerates cleanly — this vector fails ONLY at BIP322 verification
    expect(message(bad)).toBe(bad.message);
    expect(Verifier.verifySignature(bad.recoveryAddress, bad.message, bad.signatureBase64)).toBe(false);
  });

  it("[PROPOSAL ratified] proof commitment = the 32-byte hash, no reserved zero bytes", () => {
    const v = byId["wallet-proof-valid-no-tip"];
    expect(v.proofCommitment).toBe(v.proofHash);
    expect(fromHex(v.proofCommitment)).toHaveLength(32);
  });
});

describe("legacy evidence (never conformance targets)", () => {
  const le = VEC("legacy-evidence.json");
  const byId = Object.fromEntries(le.vectors.map((v: any) => [v.id, v]));
  it("the 152-byte legacy bid and 41-byte marker both reject under v1", () => {
    const bid = fromHex(byId["legacy-bid-152-truncated-commitments"].hex);
    expect(bid.length).toBe(152);
    expect(eventOk(bid)).toBe(false); // truncated commitments → length mismatch with new layout
    const marker = fromHex(byId["legacy-availability-marker-41"].hex);
    expect(marker.length).toBe(41);
    expect(frameOk(marker)).toBe(false); // 0x0d retired (marker-fold #47)
  });
  it("retired legacy labels never collide with the live registry", () => {
    const live = ["ont-transfer-owner", "ont-recover-owner", "ont-value-record",
      "ont-recovery-descriptor", "ont-recovery-wallet-proof", "ont-auction-bidder",
      "ont-auction-lot", "ont-auction-state"];
    for (const retired of byId["legacy-commitment-labels"].labels) {
      expect(live).not.toContain(retired);
    }
  });
});

// D-PB — proof-bundle ASSEMBLY (B3; FREE / structural, conforms to the kernel's
// `verifyProofBundleStructure` / `verifyProofBundleAgainstBitcoin`). The kernel owns the
// VERIFIER; B3 owns the BUILDER. `buildAccumulatorBatchClaimBundle` assembles the
// `accumulator_batch_claim` `ont-proof-bundle` a claimant publishes from the already-built
// sub-witnesses the earlier slices produce:
//   - the D-AM membership proof (`BuiltMembershipProof`),
//   - the cited batch anchor + (optionally) its D-BI Bitcoin inclusion (`BuiltBitcoinInclusion`),
//   - ownership facts + an optional already-signed value-record chain.
//
// COMPOSITION STANCE (CL's D-SB-avail ruling — consume verified facts, don't re-derive). D-PB
// takes the OUTPUTS of D-AM / D-BI and assembles them; it does NOT re-run PoW / Merkle /
// membership and it does NOT call the verifier. Its obligation is that a WELL-FORMED input
// produces a bundle the resident verifiers accept, asserted by running
// `verifyProofBundleStructure` + `verifyProofBundleAgainstBitcoin` over the built bundle in the
// tests.
//
// NON-DECIDING + PURE PLACER (the §1 contract). The builder returns no verdict and decides no
// ownership. It fails closed (throws) only on the CHEAP ASSEMBLY-COHERENCE obligations it owns —
// leaf binds the name, value is a non-null commitment to the claimed owner, the cited anchor
// matches the embedded inclusion, and value-record owner/ref/sequence/predecessor linkage.
// CRYPTOGRAPHIC + VALUE-RECORD VALIDITY (Schnorr signatures, `recordHash`, full string shape)
// stays VERIFIER-owned: D-PB places signed records without re-verifying them, so handed forged
// signed-record material it CAN emit a bundle the kernel then rejects. That is the pure-placer
// split — forged evidence yields the kernel's no-accept (E-ND1), never a false accept.
//
// SCOPE (CL design review on `4c0e3fd`). Assembly-only: the branded verified-anchor-height
// coupling (consuming a D-SB-avail `VerifiedAvailability` so the stamped height is the minted
// brand) is a NAMED FOLLOW-UP (§11 "deferred coupling"), kept out of this slice so D-SB-avail
// stays closed. Here the anchor txid + height are gated to match the embedded D-BI inclusion.
import {
  computeValueRecordHash,
  normalizeName,
  sha256Hex,
  utf8ToBytes,
  type SignedValueRecord,
} from "@ont/protocol";

import type { BuiltBitcoinInclusion } from "./bitcoin-inclusion.js";
import type { BuiltMembershipProof } from "./membership.js";

/** Ownership facts the bundle commits (the claimed current owner + ownership reference). */
export interface BundleOwnership {
  /** 32-byte hex x-only owner pubkey; MUST equal the membership proof's committed value. */
  readonly currentOwnerPubkey: string;
  /** Non-empty ownership reference; hex32 when a value-record chain is attached (#52). */
  readonly ownershipRef: string;
}

/** The cited batch anchor (RootAnchor tx) — gated to match the embedded D-BI inclusion. */
export interface BundleAnchorRef {
  readonly anchorTxid: string;
  readonly anchorHeight: number;
}

/** Inputs to the batched-claim proof-bundle assembler — already-built component witnesses. */
export interface BuildBatchClaimBundleInput {
  /** The raw ONT name being claimed; `normalizedName` is derived, never caller-supplied. */
  readonly name: string;
  readonly assuranceTier: string;
  readonly verificationGoal: string;
  readonly ownership: BundleOwnership;
  /** D-AM: membership proof for `H(normalizedName)` committing the claimed owner. */
  readonly membership: BuiltMembershipProof;
  /** The cited batch anchor (txid + height). */
  readonly anchor: BundleAnchorRef;
  /**
   * D-BI: the anchor's Bitcoin inclusion. OPTIONAL: present → a Bitcoin-settled bundle (its
   * txid + height MUST match `anchor`); absent → a structurally-valid but not-Bitcoin-settled
   * bundle (passes `…Structure`, fails `…AgainstBitcoin` on `btc.inclusion.present`).
   */
  readonly inclusion?: BuiltBitcoinInclusion;
  /**
   * OPTIONAL, already-signed value records (B5 / wallet signs — D-PB NEVER signs). When present
   * the builder places them as `valueRecordChain.records` (computing each `recordHash`) and gates
   * owner / ref / sequence / previous-hash coherence; the kernel re-checks signatures + hashes.
   */
  readonly valueRecords?: readonly SignedValueRecord[];
}

/** One value record in bundle shape — signed fields + the computed `recordHash`. */
export interface BundleValueRecord {
  readonly recordHash: string;
  readonly name: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly ownerPubkey: string;
  readonly ownershipRef: string;
  readonly valueType: number;
  readonly payloadHex: string;
  readonly issuedAt: string;
  readonly signature: string;
}

/** The assembled `ont-proof-bundle` (accumulator batched-claim path), bundleVersion 0. */
export interface OntProofBundle {
  readonly format: "ont-proof-bundle";
  readonly bundleVersion: 0;
  readonly proofSource: "accumulator_batch_claim";
  readonly assuranceTier: string;
  readonly verificationGoal: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly ownershipProof: {
    readonly currentOwnerPubkey: string;
    readonly ownershipRef: string;
  };
  readonly accumulatorProof: {
    readonly root: string;
    readonly leaf: string;
    readonly value: string;
    readonly siblings: readonly { readonly level: number; readonly hash: string }[];
  };
  readonly batchAnchor: {
    readonly anchorTxid: string;
    readonly anchorHeight: number;
  };
  readonly bitcoinInclusion?: {
    readonly anchors: readonly {
      readonly txid: string;
      readonly height: number;
      readonly blockHeaderHex: string;
      readonly merkle: readonly string[];
      readonly pos: number;
    }[];
  };
  readonly valueRecordChain?: {
    readonly records: readonly BundleValueRecord[];
  };
}

const fail = (reason: string): never => {
  throw new Error(`@ont/evidence.buildAccumulatorBatchClaimBundle: ${reason}`);
};

/** Lay an already-signed value-record chain into bundle shape; gate cheap coherence. */
function placeValueRecords(
  records: readonly SignedValueRecord[],
  ownership: BundleOwnership,
): BundleValueRecord[] {
  const out: BundleValueRecord[] = [];
  let previousRecordHash: string | null = null;
  for (const [index, record] of records.entries()) {
    if (record.ownerPubkey.toLowerCase() !== ownership.currentOwnerPubkey.toLowerCase()) {
      fail(`value record ${index + 1} owner key does not match the claimed owner`);
    }
    if (record.ownershipRef.toLowerCase() !== ownership.ownershipRef.toLowerCase()) {
      fail(`value record ${index + 1} ownershipRef does not match the bundle ownershipRef`);
    }
    if (record.sequence !== index + 1) {
      fail(`value record ${index + 1} sequence is not contiguous from 1`);
    }
    if ((record.previousRecordHash ?? null) !== previousRecordHash) {
      fail(`value record ${index + 1} previousRecordHash does not chain to the prior record`);
    }
    const recordHash = computeValueRecordHash({
      name: record.name,
      ownerPubkey: record.ownerPubkey,
      ownershipRef: record.ownershipRef,
      sequence: record.sequence,
      previousRecordHash: record.previousRecordHash,
      valueType: record.valueType,
      payloadHex: record.payloadHex,
      issuedAt: record.issuedAt,
    });
    out.push({
      recordHash,
      name: record.name,
      sequence: record.sequence,
      previousRecordHash: record.previousRecordHash,
      ownerPubkey: record.ownerPubkey,
      ownershipRef: record.ownershipRef,
      valueType: record.valueType,
      payloadHex: record.payloadHex,
      issuedAt: record.issuedAt,
      signature: record.signature,
    });
    previousRecordHash = recordHash;
  }
  return out;
}

/**
 * Assemble an `accumulator_batch_claim` proof bundle from already-built component witnesses.
 * Fails closed (throws) on the cheap assembly-coherence obligations it owns — leaf binds the
 * name, value commits the claimed owner, and (when an inclusion is embedded) the cited anchor
 * txid + height match it. A WELL-FORMED input round-trips green through
 * `verifyProofBundleStructure` and (with an inclusion) `verifyProofBundleAgainstBitcoin`;
 * cryptographic + value-record validity remains the kernel's to decide (pure placer).
 */
export function buildAccumulatorBatchClaimBundle(
  input: BuildBatchClaimBundleInput,
): OntProofBundle {
  const { name, assuranceTier, verificationGoal, ownership, membership, anchor, inclusion } = input;

  const normalizedName = normalizeName(name);

  // (1) Leaf binds the name: the embedded membership proof must be the proof for H(name).
  const expectedLeaf = sha256Hex(utf8ToBytes(normalizedName));
  if (membership.proof.keyHex.toLowerCase() !== expectedLeaf) {
    fail("membership leaf does not bind the name (expected H(normalizedName))");
  }

  // (2) Value commits the claimed owner (and is a member, not a non-membership proof).
  const value = membership.proof.value;
  if (value === null) {
    throw new Error(
      "@ont/evidence.buildAccumulatorBatchClaimBundle: membership is a non-membership proof — no committed value to back an ownership claim",
    );
  }
  if (value.toLowerCase() !== ownership.currentOwnerPubkey.toLowerCase()) {
    fail("accumulator value does not commit to the claimed current owner");
  }

  // (3) One consistent anchor: when a D-BI inclusion is embedded, the cited batch anchor txid
  //     AND height must both match it (the verifier cites the anchor by txid, but a wrong height
  //     would otherwise pass the structure check that only requires anchorHeight to exist).
  if (inclusion !== undefined) {
    if (anchor.anchorTxid.toLowerCase() !== inclusion.txid.toLowerCase()) {
      fail("batch anchor txid does not match the embedded D-BI inclusion");
    }
    if (anchor.anchorHeight !== inclusion.height) {
      fail("batch anchor height does not match the embedded D-BI inclusion");
    }
  }

  const records = input.valueRecords?.length ? placeValueRecords(input.valueRecords, ownership) : null;

  return {
    format: "ont-proof-bundle",
    bundleVersion: 0,
    proofSource: "accumulator_batch_claim",
    assuranceTier,
    verificationGoal,
    name,
    normalizedName,
    ownershipProof: {
      currentOwnerPubkey: ownership.currentOwnerPubkey,
      ownershipRef: ownership.ownershipRef,
    },
    accumulatorProof: {
      root: membership.rootHex,
      leaf: membership.proof.keyHex,
      value,
      siblings: membership.proof.siblings,
    },
    batchAnchor: {
      anchorTxid: anchor.anchorTxid,
      anchorHeight: anchor.anchorHeight,
    },
    ...(inclusion !== undefined
      ? {
          bitcoinInclusion: {
            anchors: [
              {
                txid: inclusion.txid,
                height: inclusion.height,
                blockHeaderHex: inclusion.blockHeaderHex,
                merkle: inclusion.merkle,
                pos: inclusion.pos,
              },
            ],
          },
        }
      : {}),
    ...(records !== null ? { valueRecordChain: { records } } : {}),
  };
}

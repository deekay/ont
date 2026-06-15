// D-PB — proof-bundle ASSEMBLY (B3; structural, conforms to the kernel's
// `verifyProofBundleStructure` / `verifyProofBundleAgainstBitcoin`). The kernel owns the
// VERIFIER; B3 owns the BUILDER. It assembles the `ont-proof-bundle`
// (`accumulator_batch_claim`) a claimant publishes, from the already-VERIFIED component
// witnesses the earlier B3 slices mint:
//   - the D-AM membership proof (`BuiltMembershipProof`),
//   - the D-BI Bitcoin inclusion (`BuiltBitcoinInclusion`), and
//   - the D-SB-avail verified availability (`VerifiedAvailability`), which carries the
//     bound batch facts AND the branded first-servable height.
//
// NON-DECIDING (the §1 contract): the builder constructs a bundle the kernel verifier
// decides on. It never returns a verdict, never decides ownership, and — critically —
// fails closed (throws) on any cross-section incoherence, so it can never assemble a
// bundle the verifier would reject. Forged / incoherent inputs yield NO bundle, not a
// false-accepting one (forged evidence ≡ no-witness, fail-closed).
//
// THE D-PB TIGHTENING (B3_EVIDENCE_HARDENING.md §5.2, RESOLVED → realized here). The only
// height that reaches the bundle is the branded `VerifiedAvailabilityHeight` minted by
// D-SB-avail. The builder consumes the whole `VerifiedAvailability` object, so a bare
// number can never be stamped as the anchor height. The stamped `batchAnchor.anchorHeight`
// IS that verified height, and it is gated to the SAME anchor whose served bytes
// reconstruct `anchoredRoot` (D-SB-avail) AND whose D-BI inclusion is PoW/Merkle-proven —
// `inclusion.height === bound.anchorHeight === firstServableHeight`. This replaces §5.2's
// "raw number" with the branded verified-anchor-height coupling that section left to D-PB.
import {
  computeValueRecordHash,
  normalizeName,
  sha256Hex,
  utf8ToBytes,
  type SignedValueRecord,
} from "@ont/protocol";

import type { BuiltBitcoinInclusion } from "./bitcoin-inclusion.js";
import type { BuiltMembershipProof } from "./membership.js";
import type { VerifiedAvailability } from "./served-availability.js";

/** Ownership facts the bundle commits (the claimed current owner + ownership reference). */
export interface BundleOwnership {
  /** 32-byte hex x-only owner pubkey; MUST equal the membership proof's committed value. */
  readonly currentOwnerPubkey: string;
  /** Non-empty ownership reference; hex32 when a value-record chain is attached (#52). */
  readonly ownershipRef: string;
}

/** Inputs to the batched-claim proof-bundle assembler — verified component witnesses. */
export interface BatchClaimProofBundleInput {
  /** The raw ONT name being claimed; `normalizedName` is derived, never caller-supplied. */
  readonly name: string;
  readonly assuranceTier: string;
  readonly verificationGoal: string;
  readonly ownership: BundleOwnership;
  /** D-AM: membership proof folding to the anchored/served accumulator root. */
  readonly membership: BuiltMembershipProof;
  /** D-BI: Bitcoin inclusion for the batch anchor tx (the cited on-chain anchor). */
  readonly inclusion: BuiltBitcoinInclusion;
  /** D-SB-avail: the bound batch + branded first-servable height (the height provenance). */
  readonly availability: VerifiedAvailability;
  /**
   * OPTIONAL, already-signed value records (B5 / wallet signs — D-PB NEVER signs). When
   * present the builder places them as the bundle's `valueRecordChain.records` (computing
   * each `recordHash`) and gates owner / ref / sequence coherence; the kernel verifier
   * re-checks signatures + hashes.
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
    /** The branded D-SB-avail height (= bound.anchorHeight = inclusion.height). */
    readonly anchorHeight: number;
  };
  readonly bitcoinInclusion: {
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

// Referenced by the green implementation; imported now so the stub's contract is explicit.
void computeValueRecordHash;
void normalizeName;
void sha256Hex;
void utf8ToBytes;

/**
 * Assemble an `accumulator_batch_claim` proof bundle from verified component witnesses.
 * Fails closed (throws) on any cross-section incoherence — the assembled bundle is the
 * kernel verifier's inverse: it round-trips green through `verifyProofBundleStructure`
 * AND `verifyProofBundleAgainstBitcoin`, and the builder can never emit a bundle the
 * verifier rejects.
 */
export function assembleBatchClaimProofBundle(
  input: BatchClaimProofBundleInput,
): OntProofBundle {
  // D-PB stub (tests-first): the assembly + the coherence / height-coupling gates land on
  // CL's design-OK. Until then this is a sentinel so the E-PB battery is RED.
  void input;
  throw new Error(
    "@ont/evidence.assembleBatchClaimProofBundle: not implemented (D-PB stub)",
  );
}

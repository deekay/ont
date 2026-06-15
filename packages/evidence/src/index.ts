// @ont/evidence — L3 evidence layer (B3). Non-deciding witness construction +
// verification. See PURPOSE.md and docs/core/B3_EVIDENCE_HARDENING.md.
export {
  buildMembershipProof,
  buildNonMembershipProof,
  type BuiltMembershipProof,
} from "./membership.js";

export {
  buildBitcoinInclusion,
  type BuiltBitcoinInclusion,
  type BitcoinInclusionInput,
} from "./bitcoin-inclusion.js";

export {
  bindServedBytes,
  toServedEvidence,
  type ServedLeaf,
  type ServedBatchBinding,
  type BoundServedBatch,
  type VerifiedAvailabilityHeight,
} from "./served-bytes.js";

export {
  verifyAvailabilityHeight,
  type AvailabilityInput,
  type VerifiedAvailability,
} from "./served-availability.js";

export {
  assembleBatchClaimProofBundle,
  type BatchClaimProofBundleInput,
  type BundleOwnership,
  type BundleValueRecord,
  type OntProofBundle,
} from "./proof-bundle-assembly.js";

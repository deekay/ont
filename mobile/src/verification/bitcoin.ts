import {
  checkProofBundleHeaderDepthCoverage,
  createEsploraHeaderRangeProvider,
  createResolverHeaderRangeProvider,
  fetchSignetLaunchHeaderSource,
  runVerifyProofBundleAgainstBitcoin,
  type BitcoinHeaderSource,
  type CanonicalHeaderRejectReason,
  type HeaderRangeProvider,
} from "@ont/light-client";
import {
  LAUNCH_CONFIRMATION_DEPTH,
  SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT,
  signetLaunchCheckpointId,
  type LaunchBitcoinDifficultyCheckpoint,
} from "@ont/launch-config";

export type MobileBitcoinVerificationReason =
  | "no-proof-bundle"
  | "missing-header-source"
  | "unverified"
  | "malformed"
  | "missing-anchor-height"
  | "short-header-range";

export type MobileBitcoinVerificationState =
  | {
      readonly kind: "bitcoin-verified";
      readonly label: "verified against Bitcoin on this device";
      readonly ownerPubkeyHex: string | null;
      readonly anchorHeight: number;
      readonly requiredHeight: number;
      readonly checkpointId: string;
      readonly network: string;
      readonly signetHeaderAuthenticity: "provider-trusted" | null;
    }
  | {
      readonly kind: "resolver-mirror";
      readonly label: "resolver mirror - not yet Bitcoin-verified";
      readonly ownerPubkeyHex: string | null;
      readonly reason: MobileBitcoinVerificationReason;
      readonly showOwnership: true;
    }
  | {
      readonly kind: "unavailable";
      readonly label: "unavailable";
      readonly reason: "invalid-name" | "absent" | "transport-error";
    };

export interface MobileBitcoinVerificationInput {
  readonly proofBundle?: unknown | null;
  readonly headerSource?: BitcoinHeaderSource | null;
  readonly ownerPubkeyHex?: string | null;
  readonly confirmationDepth?: number | undefined;
  readonly checkpointId?: string | undefined;
  readonly network?: string | undefined;
}

export type MobileSignetHeaderSourceResult =
  | {
      readonly ok: true;
      readonly headerSource: BitcoinHeaderSource;
      readonly tipHeight: number;
      readonly tipHashHex: string;
      readonly checkpointId: string;
      readonly network: "signet";
    }
  | { readonly ok: false; readonly reason: "missing-header-provider" | CanonicalHeaderRejectReason };

export interface FetchMobileSignetHeaderSourceInput {
  readonly anchorHeight: number;
  readonly provider?: HeaderRangeProvider | null | undefined;
  readonly confirmationDepth?: number | undefined;
  readonly checkpoint?: LaunchBitcoinDifficultyCheckpoint | undefined;
}

export interface CreateMobileSignetHeaderRangeProviderInput {
  readonly provider: "resolver" | "esplora";
  readonly resolverUrl: string;
  readonly esploraBaseUrl: string;
  readonly fetchImpl?: typeof fetch | undefined;
}

export function createMobileSignetHeaderRangeProvider(
  input: CreateMobileSignetHeaderRangeProviderInput,
): HeaderRangeProvider {
  if (input.provider === "resolver") {
    return createResolverHeaderRangeProvider({ resolverUrl: input.resolverUrl, fetchImpl: input.fetchImpl });
  }
  return createEsploraHeaderRangeProvider({ esploraBaseUrl: input.esploraBaseUrl, fetchImpl: input.fetchImpl });
}

export function mobileBitcoinVerificationState(
  input: MobileBitcoinVerificationInput,
): MobileBitcoinVerificationState {
  const ownerPubkeyHex = input.ownerPubkeyHex ?? null;
  const proofBundle = input.proofBundle ?? null;
  if (proofBundle === null) {
    return mirrorState(ownerPubkeyHex, "no-proof-bundle");
  }

  const headerSource = input.headerSource ?? null;
  const verification = runVerifyProofBundleAgainstBitcoin({ bundle: proofBundle, headerSource });
  if (!verification.ok) {
    return mirrorState(ownerPubkeyHex, verification.reason);
  }

  const coverage = checkProofBundleHeaderDepthCoverage({
    bundle: proofBundle,
    headerSource,
    confirmationDepth: input.confirmationDepth ?? LAUNCH_CONFIRMATION_DEPTH,
  });
  if (!coverage.ok) {
    return mirrorState(ownerPubkeyHex, coverage.reason);
  }

  const network = input.network ?? "signet";
  return {
    kind: "bitcoin-verified",
    label: "verified against Bitcoin on this device",
    ownerPubkeyHex,
    anchorHeight: coverage.anchorHeight,
    requiredHeight: coverage.requiredHeight,
    checkpointId: input.checkpointId ?? signetLaunchCheckpointId(SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT),
    network,
    signetHeaderAuthenticity: network === "signet" ? "provider-trusted" : null,
  };
}

export async function fetchMobileSignetLaunchHeaderSource(
  input: FetchMobileSignetHeaderSourceInput,
): Promise<MobileSignetHeaderSourceResult> {
  if (input.provider === null || input.provider === undefined) {
    return { ok: false, reason: "missing-header-provider" };
  }

  const checkpoint = input.checkpoint ?? SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT;
  const result = await fetchSignetLaunchHeaderSource({
    anchorHeight: input.anchorHeight,
    confirmationDepth: input.confirmationDepth,
    checkpoint,
    provider: input.provider,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    headerSource: result.headerSource,
    tipHeight: result.tipHeight,
    tipHashHex: result.tipHashHex,
    checkpointId: signetLaunchCheckpointId(checkpoint),
    network: "signet",
  };
}

export function unavailableMobileBitcoinVerificationState(
  reason: Extract<MobileBitcoinVerificationState, { readonly kind: "unavailable" }>["reason"],
): MobileBitcoinVerificationState {
  return { kind: "unavailable", label: "unavailable", reason };
}

function mirrorState(
  ownerPubkeyHex: string | null,
  reason: MobileBitcoinVerificationReason,
): MobileBitcoinVerificationState {
  return {
    kind: "resolver-mirror",
    label: "resolver mirror - not yet Bitcoin-verified",
    ownerPubkeyHex,
    reason,
    showOwnership: true,
  };
}

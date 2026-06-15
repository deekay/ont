// Recovery-invoke authorization + evidence gate (#50-b1 / RECOVERY_AUTH §3 + §3c).
//
// One narrow, pure predicate — `acceptRecoverOwner` — the AUTHORIZATION/EVIDENCE-GATE
// half of a non-cancel `RecoverOwner` invoke, NOT full transaction acceptance. It answers
// exactly one question: is this invoke authorized by the name's current armed descriptor-v2
// head, with that descriptor evidence witnessed in time? It is the gate the engine consults
// before opening any recovery state (§3c, evidence-gated admission).
//
// SCOPE (the authorization core). It pins these cited conjuncts and nothing more:
//   - R7  descriptor profile: only descriptorVersion 2 is invokable (v1 parses but cannot
//         authorize an invoke). RECOVERY_DESCRIPTOR_INVOKABLE_VERSION (@ont/wire §8.2a).
//   - R10 invoke signature: a fresh BIP340 signature in the 64-byte slot over the W13
//         `ont-recover-owner` digest (recoverAuthDigest), verified against the descriptor's
//         recoveryPubkey — NOT a commitment parsed out of the slot.
//   - R6  head binding: recoveryDescriptorDigest(descriptor) equals the invoke's
//         recoveryDescriptorHash (the invoke names THIS descriptor).
//   - R8  challenge-window equality (T19 companion): descriptor.challengeWindowBlocks equals the
//         invoke's challengeWindowBlocks — the descriptor-committed window must match the event
//         window, or the invoke (which signs W13 with its own window) cannot authorize.
//   - R3  current armed head: that same digest equals the name-state's current descriptor
//         head-hash fact (hash/fact based; sequence is only a companion check, never a
//         substitute for the head hash).
//   - R2  owner-armed: the descriptor's arming signature verifies against the name's CURRENT
//         ownerPubkey (nameState.ownerPubkey) — not the descriptor's self-claimed ownerPubkey.
//   - R4  current interval: descriptor.ownershipRef equals the name-state's current-interval
//         ownershipRef (stops old-interval descriptor replay — the seller-reclaims-after-sale
//         theft, Decision #40's target).
//   - R5  state head: invoke.prevStateTxid equals the name-state head txid.
//   - §3c evidence timing: the descriptor evidence is demonstrably witnessed (a verifier-checked
//         witness) by height h_r + W_r, where h_r is the invoke's mined height and W_r is the
//         recovery-evidence window parameter (1 <= W_r <= challengeWindowBlocks). Fail closed:
//         late/absent/unverified evidence yields no authorization, so no recovery state opens.
//
// It DELIBERATELY EXCLUDES (engine integration / slice B, not this predicate): the bond-spend +
// qualifying-successor + outpoint-conflict mechanics (R11), the immature-bond gate (R12), the
// single-pending guard (R13), `pendingRecovery` construction, the X13 transfer block, bond
// rotation, finalization (R18), and the CANCEL path (engine routes cancel elsewhere — here a
// CANCEL-flagged or any nonzero-flag event presented as an invoke fails closed, pinning the split).
// The §8.3 BIP322 wallet proof is NON-authorizing corroboration: it has no field here, no
// witnessing deadline, and can neither block nor substitute for the descriptor evidence.
//
// W_r is a launch-freeze PARAMETER supplied per call; B2 does not fix its value. The "demonstrably
// witnessed" descriptor-evidence format is a B3 evidence-layer deliverable — B2 consumes an opaque,
// already-verifier-checked witness ({ kind: "b3-verified-recovery-descriptor-witness",
// witnessedByHeight }), exactly as the DA verdict consumes a served-bytes witness (S4).
//
// Total / fail-closed + closed-shape (the #63/#64/#65 discipline): every malformed input
// (non-object, extra field, wrong type, bad hex) yields a rejecting verdict, never an exception —
// all @ont/wire digest/verify calls (which throw on malformed input) are guarded — and no extra
// field on any owned input object or on the witness is silently admitted as authority.

import {
  recoverAuthDigest,
  recoveryDescriptorDigest,
  verifySchnorr,
  RECOVERY_DESCRIPTOR_INVOKABLE_VERSION,
} from "@ont/wire";

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isSafeNonNegInt = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const isU32 = (x: unknown): x is number => isSafeNonNegInt(x) && x <= 0xffff_ffff;
const isByte = (x: unknown): x is number => isSafeNonNegInt(x) && x <= 0xff;
// Canonical hex is LOWERCASE-only — matches @ont/wire checkHex32/checkHex64; an uppercase
// variant is non-canonical and must reject (no normalization).
const isHex = (x: unknown, bytes: number): x is string =>
  typeof x === "string" && new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(x);
const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

// The closed §8.2/§8.2a recovery-descriptor envelope key set — mirrors @ont/wire RD_REQUIRED +
// RD_OPTIONAL (those are not exported). Used to reject extra fields on the descriptor at the
// predicate boundary BEFORE digesting (recoveryDescriptorDigest reads known fields but does not
// reject extras — only parseRecoveryDescriptor closed-envelopes, and the kernel gets an object).
// A drift tripwire test builds a wire-shaped descriptor and asserts it passes this set.
const DESCRIPTOR_KEYS = [
  "format", "descriptorVersion", "name", "ownerPubkey", "ownershipRef", "sequence",
  "previousDescriptorHash", "recoveryAddress", "signingProfile", "challengeWindowBlocks",
  "issuedAt", "signature", "recoveryPubkey",
] as const;

/**
 * The on-chain `RecoverOwner` invoke facts the kernel reads — the §5 payload fields that enter the
 * W13 digest, plus the 64-byte invoke signature and the invoke's canonical mined height (h_r). It is
 * NOT the raw wire event (`blockHeight` is not a wire field); the caller assembles it. Closed shape.
 */
export interface RecoverOwnerInvokeFacts {
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string;
  /** §4.2 flags. A non-cancel invoke is flags === 0; CANCEL / any nonzero flag fails closed here. */
  readonly flags: number;
  readonly successorBondVout: number;
  readonly challengeWindowBlocks: number;
  readonly recoveryDescriptorHash: string;
  /** The 64-byte (128-hex) BIP340 invoke signature over recoverAuthDigest(...). */
  readonly signature: string;
  /** The canonical mined height of the invoke transaction, h_r (§3c origin). */
  readonly minedHeight: number;
}
const INVOKE_FACTS_KEYS = [
  "prevStateTxid", "newOwnerPubkey", "flags", "successorBondVout",
  "challengeWindowBlocks", "recoveryDescriptorHash", "signature", "minedHeight",
] as const;

/**
 * The verifier-checked descriptor-evidence witness (§3c). B3 defines the proof format; B2 consumes
 * only the already-checked height under a fixed kind tag. A bare `{ witnessedByHeight }`, a
 * producer-asserted kind, null, or an extra field is rejected — an asserted height is never authority.
 */
export interface RecoveryDescriptorWitness {
  readonly kind: "b3-verified-recovery-descriptor-witness";
  readonly witnessedByHeight: number;
}

/**
 * Witnessed descriptor-v2 evidence: the descriptor chain head (an @ont/wire recovery-descriptor
 * record, validated by recoveryDescriptorDigest) plus its §3c witness. Closed shape at the wrapper;
 * the descriptor record itself is the @ont/wire-owned envelope.
 */
export interface RecoveryDescriptorEvidence {
  readonly descriptor: Record<string, unknown>;
  readonly witness: RecoveryDescriptorWitness;
}
const EVIDENCE_KEYS = ["descriptor", "witness"] as const;
const WITNESS_KEYS = ["kind", "witnessedByHeight"] as const;

/**
 * The current name-state facts the gate binds against — the CURRENT owner key (R2), the current
 * descriptor head-hash + sequence (R3), the current-interval ownershipRef (R4), and the state head
 * txid (R5). Closed shape.
 */
export interface RecoveryNameStateFacts {
  readonly ownerPubkey: string;
  readonly headTxid: string;
  readonly currentOwnershipRef: string;
  readonly recoveryDescriptorHeadHash: string;
  readonly recoveryDescriptorHeadSequence: number;
}
const NAME_STATE_KEYS = [
  "ownerPubkey", "headTxid", "currentOwnershipRef", "recoveryDescriptorHeadHash", "recoveryDescriptorHeadSequence",
] as const;

/** Launch-freeze recovery parameters. W_r is the recovery-evidence window (1 <= W_r <= challengeWindowBlocks). */
export interface RecoveryParams {
  readonly recoveryEvidenceWindowBlocks: number;
}
const RECOVERY_PARAMS_KEYS = ["recoveryEvidenceWindowBlocks"] as const;

export interface RecoverOwnerInvokeVerdict {
  readonly accepted: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const reject = (reason: string): RecoverOwnerInvokeVerdict => ({ accepted: false, reason });

/**
 * acceptRecoverOwner — the recovery-invoke authorization + evidence gate. Returns `accepted: true`
 * only when every conjunct (R7, R10, R6, R3, R2, R4, R5) holds AND the descriptor evidence is
 * verifier-witnessed by h_r + W_r (§3c). Pure and total: any malformed input rejects and never
 * throws; the engine treats `accepted: false` as "open no recovery state" (forfeit = no-op).
 */
export function acceptRecoverOwner(
  invokeFacts: RecoverOwnerInvokeFacts,
  descriptorEvidence: RecoveryDescriptorEvidence,
  nameState: RecoveryNameStateFacts,
  recoveryParams: RecoveryParams
): RecoverOwnerInvokeVerdict {
  // ---- recovery params (W_r) ----
  const params = recoveryParams as unknown;
  if (!isObject(params)) return reject("recovery-params-malformed");
  if (!isClosedShape(params, RECOVERY_PARAMS_KEYS)) return reject("recovery-params-malformed");
  if (!isU32(params.recoveryEvidenceWindowBlocks) || params.recoveryEvidenceWindowBlocks < 1) {
    return reject("recovery-evidence-window-out-of-range");
  }
  const wR = params.recoveryEvidenceWindowBlocks;

  // ---- invoke facts ----
  const facts = invokeFacts as unknown;
  if (!isObject(facts)) return reject("invoke-facts-malformed");
  if (!isClosedShape(facts, INVOKE_FACTS_KEYS)) return reject("invoke-facts-malformed");
  if (
    !isHex(facts.prevStateTxid, 32) ||
    !isHex(facts.newOwnerPubkey, 32) ||
    !isHex(facts.recoveryDescriptorHash, 32) ||
    !isHex(facts.signature, 64) ||
    !isByte(facts.flags) ||
    !isByte(facts.successorBondVout) ||
    !isU32(facts.challengeWindowBlocks) ||
    !isU32(facts.minedHeight)
  ) {
    return reject("invoke-facts-malformed");
  }

  // ---- path split (amendment 5): only a non-cancel invoke (flags === 0) is authorized here ----
  if (facts.flags !== 0) return reject("non-invoke-flags");

  // ---- W_r upper bound now that challengeWindowBlocks is validated ----
  if (wR > facts.challengeWindowBlocks) return reject("recovery-evidence-window-out-of-range");

  // ---- descriptor evidence wrapper + witness ----
  const evidence = descriptorEvidence as unknown;
  if (!isObject(evidence)) return reject("descriptor-evidence-malformed");
  if (!isClosedShape(evidence, EVIDENCE_KEYS)) return reject("descriptor-evidence-malformed");
  const witness = evidence.witness as unknown;
  if (!isObject(witness)) return reject("descriptor-witness-malformed");
  if (!isClosedShape(witness, WITNESS_KEYS)) return reject("descriptor-witness-malformed");
  if (witness.kind !== "b3-verified-recovery-descriptor-witness") return reject("descriptor-witness-malformed");
  if (!isU32(witness.witnessedByHeight)) return reject("descriptor-witness-malformed");
  const descriptor = evidence.descriptor as unknown;
  if (!isObject(descriptor)) return reject("descriptor-malformed");
  // Closed-shape the descriptor envelope locally: recoveryDescriptorDigest reads known fields but
  // does not reject extras, so an injected `source`/`producer`/etc. field must be rejected here.
  if (!isClosedShape(descriptor, DESCRIPTOR_KEYS)) return reject("descriptor-extra-field");

  // ---- name-state facts ----
  const state = nameState as unknown;
  if (!isObject(state)) return reject("name-state-malformed");
  if (!isClosedShape(state, NAME_STATE_KEYS)) return reject("name-state-malformed");
  if (
    !isHex(state.ownerPubkey, 32) ||
    !isHex(state.headTxid, 32) ||
    !isHex(state.currentOwnershipRef, 32) ||
    !isHex(state.recoveryDescriptorHeadHash, 32) ||
    !isSafeNonNegInt(state.recoveryDescriptorHeadSequence)
  ) {
    return reject("name-state-malformed");
  }

  // ---- R7: descriptor profile must be the invokable version (v2) ----
  if (descriptor.descriptorVersion !== RECOVERY_DESCRIPTOR_INVOKABLE_VERSION) {
    return reject("descriptor-not-invokable-version");
  }

  // ---- compute the descriptor head digest (guarded: @ont/wire throws on a malformed descriptor) ----
  let descriptorDigestHex: string;
  try {
    descriptorDigestHex = toHex(recoveryDescriptorDigest(descriptor));
  } catch {
    return reject("descriptor-malformed");
  }

  // ---- R6: the invoke names THIS descriptor ----
  if (descriptorDigestHex !== facts.recoveryDescriptorHash) return reject("recovery-descriptor-hash-mismatch");

  // ---- T19 / R8: the descriptor-committed challenge window must equal the invoke's window ----
  // (descriptor.challengeWindowBlocks was checkU32-validated inside recoveryDescriptorDigest above).
  // Without this, an invoke could sign W13 with one challengeWindowBlocks while pointing at a
  // descriptor that commits a different window, and still authorize.
  if (descriptor.challengeWindowBlocks !== facts.challengeWindowBlocks) return reject("challenge-window-mismatch");

  // ---- R3: this descriptor IS the current armed head (hash fact authoritative) ----
  if (descriptorDigestHex !== state.recoveryDescriptorHeadHash) return reject("descriptor-not-current-head");
  // companion (never a substitute for the head hash): the head sequence must agree.
  if (descriptor.sequence !== state.recoveryDescriptorHeadSequence) return reject("descriptor-head-sequence-mismatch");

  // ---- R4: current interval (anti old-interval-replay) ----
  if (descriptor.ownershipRef !== state.currentOwnershipRef) {
    return reject("descriptor-ownership-ref-not-current-interval");
  }

  // ---- R5: the invoke builds on the current state head ----
  if (facts.prevStateTxid !== state.headTxid) return reject("prev-state-txid-not-head");

  // ---- R2: owner-armed — arming signature verifies against the CURRENT owner key ----
  let armedByCurrentOwner: boolean;
  try {
    armedByCurrentOwner = verifySchnorr(
      descriptor.signature as string,
      recoveryDescriptorDigest(descriptor),
      state.ownerPubkey
    );
  } catch {
    armedByCurrentOwner = false;
  }
  if (!armedByCurrentOwner) return reject("owner-arming-signature-invalid");

  // ---- R10: fresh BIP340 invoke signature over the W13 digest by the descriptor's recoveryPubkey ----
  let invokeSigValid: boolean;
  try {
    const w13 = recoverAuthDigest({
      prevStateTxid: facts.prevStateTxid,
      newOwnerPubkey: facts.newOwnerPubkey,
      flags: facts.flags,
      successorBondVout: facts.successorBondVout,
      challengeWindowBlocks: facts.challengeWindowBlocks,
      recoveryDescriptorHash: facts.recoveryDescriptorHash,
    });
    invokeSigValid = verifySchnorr(facts.signature, w13, descriptor.recoveryPubkey as string);
  } catch {
    invokeSigValid = false;
  }
  if (!invokeSigValid) return reject("invoke-signature-invalid");

  // ---- §3c: descriptor evidence demonstrably witnessed by h_r + W_r (fail closed on late/absent) ----
  if (witness.witnessedByHeight > facts.minedHeight + wR) return reject("descriptor-evidence-witnessed-too-late");

  return { accepted: true, reason: "recovery-invoke-authorized" };
}

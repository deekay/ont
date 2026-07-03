// @ont/indexer — LE-INDEX: live batched-claim enforcement driver (docs/core/LIVE_ENFORCEMENT_PLAN.md).
//
// The ADDITIVE sibling to confirmed-anchor ingest: for each confirmed RootAnchor candidate that carries
// verified batch-claim material, compose the audited `enforceBatchedClaim` (over the candidate + an injected
// batch-material seam) and, on accept, write ONE NameStateRecord per committed entry to @ont/name-state-store.
// A bare RootAnchor (no batch material) writes nothing — the G1/G2/G3 read path is untouched.
//
// This is an imperative shell: it RE-DERIVES no consensus rule. `enforceBatchedClaim` decides; the adapters
// firewall-mint witnesses (recompute-don't-trust); this driver only orchestrates and persists an accept's
// per-name delta. `enforceBatchedClaim` is pure + total (never throws); a bad inclusion / withheld bytes /
// incomplete batch is an `accepted:false` verdict, not an exception.
import { legacyTxidOf } from "@ont/bitcoin";
import { sha256Hex, utf8ToBytes } from "@ont/protocol";
import {
  decodeRootAnchorFields,
  buildCommittedBatchForRoot,
  createAvailabilitySource,
  type BuildConfirmedBatchAnchorInput,
} from "@ont/adapter-indexer";
import { buildMembershipProof, buildAccumulatorBatchClaimBundle, type ServedLeaf } from "@ont/evidence";
import { enforceBatchedClaim, type BatchedClaimPolicy, type BatchDataSource } from "@ont/claim-path";
import type { NameStateProofBundle, NameStateRecord, NameStateStore } from "@ont/name-state-store";

/** The published batch material for an anchored root — the B3/B4 DA-transport seam (fixture in tests / the
 *  hermetic e2e; the real `/da/{root}` transport in LE-DA-SERVE). The indexer NEVER trusts it: it is re-verified
 *  by `buildCommittedBatchForRoot` (recompute leaf keys, bind to the anchored root) and the availability replay. */
export interface BatchMaterial {
  /** The committed delta: canonical name + 32-byte lowercase-hex owner pubkey (value === ownerPubkey, B3). */
  readonly committedEntries: readonly { readonly name: string; readonly ownerPubkey: string }[];
  /** The K-deep base accumulator leaves for `prevRoot` (leafKey → ownerPubkey). */
  readonly baseLeaves: ReadonlyMap<string, string>;
  /** The presented served bytes (the delta) that must reconstruct the anchored root over the base. */
  readonly servedLeaves: readonly ServedLeaf[];
}

/** The injected batch-material source: the verified batch for an anchor, or null if none (a bare RootAnchor). */
export type BatchMaterialSource = (anchoredRoot: string, prevRoot: string) => BatchMaterial | null;

export interface EnforceBatchedClaimsDeps {
  readonly batchMaterial: BatchMaterialSource;
  readonly nameStateStore: NameStateStore;
  /** Trusted launch params (DA window + gate-fee schedule) — NOT producer material; a seam can't choose them. */
  readonly policy: BatchedClaimPolicy;
}

export interface EnforceBatchedClaimsReport {
  readonly accepted: readonly string[]; // anchoredRoots whose batch was accepted + written
  readonly skipped: readonly string[]; // anchoredRoots with no batch material (bare RootAnchor) — no writes
  readonly rejected: readonly { readonly anchoredRoot: string; readonly reason: string }[];
  readonly namesWritten: number;
}

/**
 * Drive live enforcement over `candidates`, persisting per-name state for accepted batches only. The
 * ENFORCEMENT logic is total — a decode/serialize failure or a rejected verdict skips that candidate
 * fail-closed, never throwing. The deliberate exceptions are source/persistence failures: a throwing
 * batch-material source and an accept's atomic `putMany` both run OUTSIDE the fail-closed catch, so the tick
 * THROWS OUT (cursor not advanced → retry) rather than silently skipping missing live material or a lost write.
 * On accept it writes ALL committed entries (per LIVE_ENFORCEMENT_PLAN §2a) — never just the bundle's member.
 */
export async function enforceBatchedClaims(
  candidates: readonly BuildConfirmedBatchAnchorInput[],
  deps: EnforceBatchedClaimsDeps,
): Promise<EnforceBatchedClaimsReport> {
  const accepted: string[] = [];
  const skipped: string[] = [];
  const rejected: { anchoredRoot: string; reason: string }[] = [];
  let namesWritten = 0;

  for (const candidate of candidates) {
    // The anchored root is known only after a successful decode; label rejects with "?" until then.
    let anchoredRoot = "?";
    // The accept's records are COLLECTED inside the try and written atomically OUTSIDE it (see step 8): a
    // persistence failure must throw out of the tick (cursor not advanced) rather than be swallowed as a reject.
    let recordsToWrite: readonly NameStateRecord[] | null = null;
    let fields: ReturnType<typeof decodeRootAnchorFields> = null;
    try {
      // 1. Decode the anchor's RootAnchor fields (prevRoot + vout are what the ConfirmedBatchAnchor mint drops).
      fields = decodeRootAnchorFields(candidate.anchorTx, candidate.anchorVout);
      if (fields === null) continue; // not a decodable RootAnchor candidate — nothing to enforce
      anchoredRoot = fields.newRoot;
    } catch {
      rejected.push({ anchoredRoot, reason: "enforce-error" });
      continue;
    }

    // 2. The published batch material (re-verified below). Absent ⇒ a bare RootAnchor → no name-state mutation.
    // Source failures are I/O/config failures, not consensus verdicts: throw out of the tick so the cursor is not
    // advanced and a misconfigured live daemon cannot silently "reject" its way past missing material.
    const material = deps.batchMaterial(anchoredRoot, fields.prevRoot);

    try {
      if (material === null) {
        skipped.push(anchoredRoot);
        continue;
      }

      // Fail CLOSED before picking entry[0]: an empty committed set / batchSize 0 is not a batch to enforce.
      if (material.committedEntries.length === 0 || fields.batchSize === 0) {
        rejected.push({ anchoredRoot, reason: "empty-committed-set" });
        continue;
      }

      const txid = legacyTxidOf(candidate.anchorTx);
      if (txid === null) {
        rejected.push({ anchoredRoot, reason: "anchor-not-serializable" });
        continue;
      }

      // 3. The FULL accumulator leaves (base ∪ committed delta) — for the representative membership proof only.
      const fullLeaves = new Map(material.baseLeaves);
      for (const e of material.committedEntries) fullLeaves.set(sha256Hex(utf8ToBytes(e.name)), e.ownerPubkey);

      // 4. The anchorInclusionBundle — an anchor/root INCLUSION CARRIER, NOT a batch validator (CL contract
      //    guard). It binds the cited anchor txid to Bitcoin (against the candidate's trusted headerSource) and
      //    proves ONE representative member's membership in the anchored root; the FULL batch is validated by the
      //    batchDataSource + completeness below. No valueRecords ride here, so `ownershipRef` is a SYNTHETIC
      //    carrier ref = the member leaf key H(name) inside the proof bundle only; it must not be reused once
      //    real value records (with their own ref) are attached.
      const inclusion = {
        txid,
        height: candidate.minedHeight,
        blockHeaderHex: candidate.blockHeaderHex,
        merkle: candidate.merkle, // already firewalled upstream; re-verified by verifyProofBundleAgainstBitcoin
        pos: candidate.pos,
      };
      const bundleForEntry = (entry: (typeof material.committedEntries)[number]) => {
        const leaf = sha256Hex(utf8ToBytes(entry.name));
        return buildAccumulatorBatchClaimBundle({
          name: entry.name,
          assuranceTier: "accumulator-batched",
          verificationGoal: "live-enforcement LE-INDEX anchor/root inclusion carrier (no value records)",
          ownership: { currentOwnerPubkey: entry.ownerPubkey, ownershipRef: leaf /* synthetic carrier ref */ },
          membership: buildMembershipProof(fullLeaves, leaf),
          anchor: { anchorTxid: txid, anchorHeight: candidate.minedHeight },
          inclusion,
        });
      };
      const rep = material.committedEntries[0]!;
      const anchorInclusionBundle = bundleForEntry(rep);

      // 5. The batchDataSource the audited stages consume: availability (base/served) + the committed-batch
      //    RECOMPUTE + the fee witness (the candidate's own anchorTx + prevouts — one tx for inclusion AND fees).
      const availability = createAvailabilitySource([
        { prevRoot: fields.prevRoot, anchoredRoot, baseLeaves: material.baseLeaves, presentedServed: material.servedLeaves },
      ]);
      const committedBatch = buildCommittedBatchForRoot({
        anchoredRoot,
        batchSize: fields.batchSize,
        baseLeaves: material.baseLeaves,
        prevRoot: fields.prevRoot,
        batchEntries: material.committedEntries.map((e) => ({ name: e.name, ownerPubkey: e.ownerPubkey })),
      });
      const batchDataSource: BatchDataSource = {
        baseLeavesForPrevRoot: (r) => availability.baseLeavesForPrevRoot(r),
        servedLeavesForRoot: (r) => availability.servedLeavesForRoot(r),
        committedBatchForRoot: (r) => (r === anchoredRoot ? committedBatch : null),
        feeTxForAnchor: (t) => (t === txid ? { anchorTx: candidate.anchorTx, prevoutTxs: candidate.prevoutTxs } : null),
      };

      // 6. Enforce (pure, never throws). The bundle is re-verified against Bitcoin; the full batch by the seam.
      const verdict = enforceBatchedClaim(
        { proofBundle: anchorInclusionBundle, anchor: { txid, prevRoot: fields.prevRoot, anchoredRoot, anchorHeight: candidate.minedHeight, batchSize: fields.batchSize } },
        { headerSource: candidate.headerSource, batchDataSource },
        deps.policy,
      );
      if (!verdict.accepted || verdict.nameStateDelta === undefined) {
        rejected.push({ anchoredRoot, reason: verdict.reason });
        continue;
      }

      // 7. Accept ⇒ COLLECT one record per committed entry from the VERIFIED committed-entry seam (NOT the
      //    bundle's single member). The trace is the accepted verdict path; the anchor vout is the decoded one.
      //    The write is deferred to step 8 so a persistence failure is NOT swallowed by this catch.
      const firstServableHeight = verdict.nameStateDelta.firstServableHeight;
      const trace = verdict.trace.map((e) => ({
        step: e.step,
        ok: e.ok,
        reason: e.reason,
        ...(e.evidence === undefined ? {} : { evidence: e.evidence }),
      }));
      recordsToWrite = material.committedEntries.map((e, batchLocalIndex) => ({
        canonicalName: e.name,
        leafKeyHex: sha256Hex(utf8ToBytes(e.name)),
        owner: { kind: "owner-key", ownerPubkeyHex: e.ownerPubkey } as const,
        batchLocalIndex,
        anchoredRoot,
        anchor: { txid, minedHeight: candidate.minedHeight, txIndex: candidate.pos, vout: fields.vout },
        firstServableHeight,
        trace,
        proofBundle: bundleForEntry(e) as unknown as NameStateProofBundle,
      }));
    } catch {
      // Total: an unexpected ENFORCEMENT-logic throw (decode/build/verdict) never aborts the batch — that
      // candidate fails closed and the loop continues. The STORE WRITE is deliberately NOT in this try (step 8).
      rejected.push({ anchoredRoot, reason: "enforce-error" });
      continue;
    }

    // 8. ATOMIC persist OUTSIDE the try: write ALL the accepted batch's records in one all-or-nothing putMany.
    //    A persistence failure THROWS OUT of the driver (and runIndexerTick) so the cursor is not advanced and
    //    the batch retries — never partial or lost name-state ("accept writes all committed entries or none").
    if (recordsToWrite === null) continue; // only an accept set it; reject/skip/decode-null already `continue`d
    await deps.nameStateStore.putMany(recordsToWrite);
    namesWritten += recordsToWrite.length;
    accepted.push(anchoredRoot);
  }

  return { accepted, skipped, rejected, namesWritten };
}

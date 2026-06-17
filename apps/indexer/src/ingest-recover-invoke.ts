// @ont/indexer — recover-owner-invoke ingest driver (slice 4). The parallel firewall path to slice-1
// confirmed-anchors: the service drives the @ont/adapter-indexer recover-invoke inclusion firewall
// (buildConfirmedRecoverOwnerInvoke — recompute-don't-trust) over candidates and persists ONLY accepted
// ConfirmedRecoverOwnerInvoke facts through an injected, Promise-shaped store, idempotent per txid; a rejected
// candidate mints nothing (fail-closed). The firewall is a narrow, pure injected seam defaulting to the real
// adapter. It re-derives no firewall/consensus rule. Total; never throws.
//
// RED battery slice: `ingestRecoverInvokes` is a stub (empty report) until the reviewed green slice lands.
import {
  buildConfirmedRecoverOwnerInvoke,
  type BuildConfirmedRecoverOwnerInvokeInput,
  type ConfirmedRecoverOwnerInvokeRejectReason,
} from "@ont/adapter-indexer";
import type { ConfirmedRecoverOwnerInvoke } from "@ont/claim-path";

/** The narrow, pure recover-invoke firewall seam — default = the real buildConfirmedRecoverOwnerInvoke. */
export type ConfirmRecoverInvoke = typeof buildConfirmedRecoverOwnerInvoke;

/** Persistence port for confirmed recover-invoke facts — Promise-shaped, keyed by on-chain txid. */
export interface RecoverInvokeStore {
  has(txid: string): Promise<boolean>;
  put(invoke: ConfirmedRecoverOwnerInvoke): Promise<void>;
}

export type RecoverInvokeRejectReason = ConfirmedRecoverOwnerInvokeRejectReason | "ingest-error";

export interface IngestRecoverInvokesReport {
  readonly accepted: readonly string[]; // txids newly persisted
  readonly skipped: readonly string[]; // txids already present (idempotent)
  readonly rejected: readonly { readonly reason: RecoverInvokeRejectReason }[]; // reason-only
}

/**
 * Drive the recover-invoke firewall over `candidates`, persisting only accepted facts (idempotent per txid),
 * fail-closed on reject, total. Green: per candidate, `confirm(candidate)` → ok ⇒ if not already stored,
 * `store.put(confirmedInvoke)` (the exact firewall fact, no service-added fields) + accept, else skip; reject ⇒
 * tally reason; any unexpected throw ⇒ `ingest-error`, continue.
 */
export async function ingestRecoverInvokes(
  candidates: readonly BuildConfirmedRecoverOwnerInvokeInput[],
  store: RecoverInvokeStore,
  confirm: ConfirmRecoverInvoke = buildConfirmedRecoverOwnerInvoke
): Promise<IngestRecoverInvokesReport> {
  const accepted: string[] = [];
  const skipped: string[] = [];
  const rejected: { reason: RecoverInvokeRejectReason }[] = [];
  for (const candidate of candidates) {
    try {
      const result = confirm(candidate);
      if (!result.ok) {
        rejected.push({ reason: result.reason });
        continue;
      }
      const txid = result.confirmedInvoke.txid;
      if (await store.has(txid)) {
        skipped.push(txid);
        continue;
      }
      // Persist exactly the firewall fact — no service-added fields.
      await store.put(result.confirmedInvoke);
      accepted.push(txid);
    } catch {
      rejected.push({ reason: "ingest-error" });
    }
  }
  return { accepted, skipped, rejected };
}

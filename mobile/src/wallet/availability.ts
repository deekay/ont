// Name availability: the single source of truth for "what can I do with this
// name right now," shared by the Claim guard and the discovery → claim wiring.
//
// The namespace is real even in demo mode: demo only fakes the cheap-rail
// payment + anchor, never the resolver's view of who owns what. So availability
// always consults the live resolver; demo-local claims are layered on top by the
// caller (a name you claimed in demo isn't on the resolver, but you still
// "own" it on this device).
import { ApiError } from "../api/client";
import { resolver } from "../api/resolver";
import type { NameRecord } from "../api/types";
import { normalizeName } from "./accumulator";

export type NameAvailability =
  | { readonly kind: "available"; readonly record: NameRecord | null }
  | { readonly kind: "owned-by-you"; readonly record: NameRecord | null }
  | { readonly kind: "taken"; readonly record: NameRecord }
  | { readonly kind: "in-auction"; readonly record: NameRecord };

const IN_AUCTION_STATUSES = new Set(["contested", "auction", "in_auction"]);
const RELEASED_STATUSES = new Set(["released", "expired", "invalidated"]);

/**
 * Resolve what a name's current state means for the acting wallet.
 * - 404 (resolver doesn't know it) → available to claim.
 * - released/expired/no owner → available to claim again.
 * - contested / in auction → must go through the auction, not a cheap claim.
 * - owned by this wallet → already yours.
 * - owned by another key → taken.
 */
export async function checkNameAvailability(
  name: string,
  ownerPubkey: string | null,
): Promise<NameAvailability> {
  const normalized = normalizeName(name);
  let record: NameRecord;
  try {
    record = await resolver.name(normalized);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      return { kind: "available", record: null };
    }
    throw e;
  }

  const status = (record.status ?? "").toLowerCase();
  if (IN_AUCTION_STATUSES.has(status)) {
    return { kind: "in-auction", record };
  }

  const owner = (record.currentOwnerPubkey ?? "").toLowerCase();
  if (!owner || RELEASED_STATUSES.has(status)) {
    return { kind: "available", record };
  }
  if (ownerPubkey && owner === ownerPubkey.toLowerCase()) {
    return { kind: "owned-by-you", record };
  }
  return { kind: "taken", record };
}

/** Derive availability from an already-loaded record (no extra fetch). */
export function availabilityFromRecord(
  record: NameRecord,
  ownerPubkey: string | null,
): NameAvailability {
  const status = (record.status ?? "").toLowerCase();
  if (IN_AUCTION_STATUSES.has(status)) return { kind: "in-auction", record };
  const owner = (record.currentOwnerPubkey ?? "").toLowerCase();
  if (!owner || RELEASED_STATUSES.has(status)) return { kind: "available", record };
  if (ownerPubkey && owner === ownerPubkey.toLowerCase()) return { kind: "owned-by-you", record };
  return { kind: "taken", record };
}

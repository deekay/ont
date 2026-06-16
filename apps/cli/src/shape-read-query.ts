import { isCanonicalName, isHex32Rendering } from "@ont/wire";

// B5-CLI — read-query shaping (pure surface cores). Per-family shapers validate the caller's arg, consuming
// @ont/wire rules (reject-don't-normalize), never reimplementing them. A thin dispatcher routes each read
// command to its family shaper (keeping the dispatcher from becoming a rule bucket). Total; never throws.

export type ReadCommand = "get-value-history" | "get-recovery-descriptor-history" | "get-tx";

export type ShapeRejectReason =
  | "malformed" // arg not a string
  | "non-canonical-name" // name fails @ont/wire isCanonicalName (reject-don't-normalize)
  | "malformed-txid" // txid fails @ont/wire isHex32Rendering (syntactic 32-byte lowercase hex guard)
  | "unknown-command";

export type NameQuery = { readonly ok: true; readonly name: string } | { readonly ok: false; readonly reason: ShapeRejectReason };
export type TxidQuery = { readonly ok: true; readonly txid: string } | { readonly ok: false; readonly reason: ShapeRejectReason };

export type ReadQuery =
  | { readonly ok: true; readonly command: "get-value-history" | "get-recovery-descriptor-history"; readonly name: string }
  | { readonly ok: true; readonly command: "get-tx"; readonly txid: string }
  | { readonly ok: false; readonly reason: ShapeRejectReason };

/** typeof guard BEFORE isCanonicalName (its regex coerces non-strings). Reject-don't-normalize. Never throws. */
export function shapeNameQuery(name: string): NameQuery {
  try {
    if (typeof name !== "string") return { ok: false, reason: "malformed" };
    if (!isCanonicalName(name)) return { ok: false, reason: "non-canonical-name" };
    return { ok: true, name };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/** typeof guard before isHex32Rendering. Syntactic 32-byte-lowercase-hex guard only — not a protocol rule. Never throws. */
export function shapeTxidQuery(txid: string): TxidQuery {
  try {
    if (typeof txid !== "string" || !isHex32Rendering(txid)) return { ok: false, reason: "malformed-txid" };
    return { ok: true, txid };
  } catch {
    return { ok: false, reason: "malformed-txid" };
  }
}

/** ROUTING ONLY (not a rule bucket): dispatch command → its family shaper, propagate the reject. Never throws. */
export function shapeReadQuery(command: ReadCommand, arg: string): ReadQuery {
  try {
    if (command === "get-value-history" || command === "get-recovery-descriptor-history") {
      const q = shapeNameQuery(arg);
      return q.ok ? { ok: true, command, name: q.name } : { ok: false, reason: q.reason };
    }
    if (command === "get-tx") {
      const q = shapeTxidQuery(arg);
      return q.ok ? { ok: true, command: "get-tx", txid: q.txid } : { ok: false, reason: q.reason };
    }
    return { ok: false, reason: "unknown-command" };
  } catch {
    return { ok: false, reason: "unknown-command" };
  }
}

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

/** RED stub. Green: typeof name==="string" (BEFORE isCanonicalName, which coerces) && isCanonicalName(name). */
export function shapeNameQuery(name: string): NameQuery {
  void name;
  return { ok: false, reason: "malformed" };
}

/** RED stub. Green: typeof txid==="string" && isHex32Rendering(txid) (syntactic guard only — not a protocol rule). */
export function shapeTxidQuery(txid: string): TxidQuery {
  void txid;
  return { ok: false, reason: "malformed-txid" };
}

/** RED stub. Green: route command → family shaper (name reads → shapeNameQuery; get-tx → shapeTxidQuery; else unknown-command). */
export function shapeReadQuery(command: ReadCommand, arg: string): ReadQuery {
  void command;
  void arg;
  return { ok: false, reason: "unknown-command" };
}

// B5-WEB — the tx-display view (read/display; CL design-concur event adc4cc64). Server-rendered HTML; no crypto.
// Shapes the txid (reject-don't-normalize), reads a served tx from the injected WebReadPort, renders the tx
// fields, and — if a carrier payload is present — decodes it via @ont/wire decodeEvent (the published parser; no
// web-side carrier/consensus reimplementation) and renders the decoded ONT event. A Bitcoin tx proves on-chain
// bytes only, NOT ONT ownership: bitcoin-chain + not-ownership-authority copy on every section. AuctionBid is
// rendered PARKED (wire-codec-consolidation) only after the decoder identifies it. Total: never throws.
import { isHex32Rendering, decodeEvent, hexToBytes, EventType } from "@ont/wire";
import { htmlEscape } from "./render-name-view.js";
import type { WebReadPort, ServedTx } from "./web-read-port.js";

export const TX_CHAIN_NOTICE =
  "bitcoin-chain — a Bitcoin transaction proves on-chain bytes only, NOT ONT ownership. " +
  "not-ownership-authority: ownership is decided by the audited kernel, not by this view.";

export type ShapeTxidResult =
  | { readonly ok: true; readonly txid: string }
  | { readonly ok: false; readonly reason: "not-a-string" | "non-hex32" };

/** Reject-don't-normalize: typeof guard BEFORE isHex32Rendering (the helper coerces non-strings). */
export function shapeTxid(txid: unknown): ShapeTxidResult {
  if (typeof txid !== "string") return { ok: false, reason: "not-a-string" };
  if (!isHex32Rendering(txid)) return { ok: false, reason: "non-hex32" };
  return { ok: true, txid };
}

/**
 * RED stub. Green: shapeTxid(txid) → else escaped error view (never touches the port). port.tx(txid) in a
 * whole-body try/catch → null/throw → unavailable view (never throws). Render the tx fields (escaped) + a carrier
 * section: decodeEvent(hexToBytes(carrierPayloadHex)) → AuctionBid → PARKED notice (no commitment fields);
 * Transfer/RecoverOwner/RootAnchor → decoded fields (escaped); decode failure → degraded line. bitcoin-chain +
 * not-ownership-authority copy on each section; no ownership/canonicality upgrade language.
 */
export function renderTxView(input: { readonly txid: unknown; readonly port: WebReadPort }): string {
  void input;
  void decodeEvent;
  void hexToBytes;
  void EventType;
  void htmlEscape;
  void TX_CHAIN_NOTICE;
  void shapeTxid;
  const _served: ServedTx | null = null;
  void _served;
  return "<!-- not-implemented -->";
}

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
  const shaped = shapeTxid(input.txid);
  if (!shaped.ok) return errorView(input.txid); // invalid txid → escaped error view, never touches the port
  const txid = shaped.txid;
  try {
    const served = input.port.tx(txid);
    if (served === null) return unavailableView(txid);
    // a served tx whose txid is malformed or differs from the request is malformed → unavailable
    if (!isHex32Rendering(served.txid) || served.txid !== txid) return unavailableView(txid);
    return txPage(txid, txFieldsSection(served) + carrierSection(served.carrierPayloadHex));
  } catch {
    return unavailableView(txid); // null/throwing/malformed → unavailable, never a thrown render
  }
}

/** label/value row — every value HTML-escaped. */
function field(label: string, value: unknown): string {
  return `<div class="field"><span class="k">${htmlEscape(label)}</span>: <code>${htmlEscape(String(value))}</code></div>`;
}

/** A tx/carrier section carries the bitcoin-chain / not-ownership-authority notice itself. */
function txSection(title: string, body: string): string {
  return `<section class="tx"><h2>${htmlEscape(title)}</h2><p class="provenance">${htmlEscape(TX_CHAIN_NOTICE)}</p>${body}</section>`;
}

function txFieldsSection(served: ServedTx): string {
  const outputs = served.outputs
    .map(
      (o, i) =>
        `<li>${field("vout", i)}${field("value (sats)", o.valueSats)}${field("script", o.scriptHex)}${field(
          "address",
          o.address ?? "none"
        )}</li>`
    )
    .join("");
  return txSection(
    "Transaction",
    `${field("txid", served.txid)}${field("block hash", served.blockHash ?? "unconfirmed")}${field(
      "block height",
      served.blockHeight ?? "unconfirmed"
    )}<ol class="outputs">${outputs}</ol>`
  );
}

function carrierSection(payloadHex: string | null): string {
  if (payloadHex === null) return txSection("Carrier", "<p>No ONT carrier in this transaction.</p>");
  let ev;
  try {
    ev = decodeEvent(hexToBytes(payloadHex));
  } catch {
    return txSection("Carrier", "<p>Carrier present but could not be decoded.</p>");
  }
  switch (ev.type) {
    case EventType.AuctionBid:
      return txSection(
        "Carrier — AuctionBid",
        "<p>PARKED — auction display pending wire-codec-consolidation; commitment fields not shown.</p>"
      );
    case EventType.Transfer:
      return txSection(
        "Carrier — Transfer",
        `${field("prevStateTxid", ev.prevStateTxid)}${field("newOwnerPubkey", ev.newOwnerPubkey)}${field(
          "flags",
          ev.flags
        )}${field("successorBondVout", ev.successorBondVout)}${field("signature", ev.signature)}`
      );
    case EventType.RecoverOwner:
      return txSection(
        "Carrier — RecoverOwner",
        `${field("prevStateTxid", ev.prevStateTxid)}${field("newOwnerPubkey", ev.newOwnerPubkey)}${field(
          "flags",
          ev.flags
        )}${field("successorBondVout", ev.successorBondVout)}${field(
          "challengeWindowBlocks",
          ev.challengeWindowBlocks
        )}${field("recoveryDescriptorHash", ev.recoveryDescriptorHash)}${field("signature", ev.signature)}`
      );
    case EventType.RootAnchor:
      return txSection(
        "Carrier — RootAnchor",
        `${field("prevRoot", ev.prevRoot)}${field("newRoot", ev.newRoot)}${field("batchSize", ev.batchSize)}`
      );
    default:
      return txSection("Carrier", "<p>Unrecognized carrier event.</p>");
  }
}

function txPage(txid: string, body: string): string {
  return `<!doctype html><html><head><title>${htmlEscape(txid)}</title></head><body><h1>Transaction: ${htmlEscape(
    txid
  )}</h1>${body}</body></html>`;
}

function unavailableView(txid: string): string {
  return `<!doctype html><html><head><title>${htmlEscape(
    txid
  )}</title></head><body><h1>Transaction: ${htmlEscape(
    txid
  )}</h1><section class="unavailable"><p>This transaction is not currently served by this resolver.</p><p class="provenance">${htmlEscape(
    TX_CHAIN_NOTICE
  )}</p></section></body></html>`;
}

function errorView(rawTxid: unknown): string {
  return `<!doctype html><html><head><title>Invalid transaction id</title></head><body><h1>Invalid transaction id</h1><p>Invalid txid: <code>${htmlEscape(
    String(rawTxid)
  )}</code></p></body></html>`;
}

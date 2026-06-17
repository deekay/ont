// B5-WEB — the name-resolution view (first read/display slice; CL design-concur event 6ab36188). Server-rendered
// pure HTML string; no client bundle, no crypto, no signing. Shapes the name (reject-don't-normalize), reads the
// served value + recovery state from the injected WebReadPort, projects it through the B4 adapters, and renders
// HTML — every dynamic field HTML-escaped, every served section carrying resolver-indexed-mirror /
// not-ownership-authority copy, and NO canonical/longest-chain/tie-break adjudication (MR1). Total: never throws
// (malformed/absent → an unavailable/error view).
import { isCanonicalName } from "@ont/wire";
import { projectServedValueHistory, projectServedRecoveryHistory } from "@ont/adapter-resolver";
import type { SignedValueRecord, SignedRecoveryDescriptor } from "@ont/protocol";
import type { WebReadPort, ServedValueState, ServedRecoveryState } from "./web-read-port.js";

// Visible provenance copy — the web is a resolver-indexed mirror, never the ownership authority.
export const RESOLVER_MIRROR_NOTICE =
  "resolver-indexed-mirror — served by a resolver's off-chain index, NOT the ownership authority. " +
  "not-ownership-authority: ownership is decided on-chain and by the audited kernel, not by this view.";

/** HTML-escape every dynamic field before rendering (defense-in-depth; pinned via a malicious-name fixture). */
export function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type ShapeNameResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: "not-a-string" | "non-canonical" };

/** Reject-don't-normalize: typeof guard BEFORE isCanonicalName (the helper coerces non-strings). */
export function shapeName(name: unknown): ShapeNameResult {
  if (typeof name !== "string") return { ok: false, reason: "not-a-string" };
  if (!isCanonicalName(name)) return { ok: false, reason: "non-canonical" };
  return { ok: true, name };
}

/**
 * RED stub. Green: shapeName(name) → else an error view echoing the rejected name (escaped). Read
 * port.valueHistory / port.recoveryHistory (in try/catch → error view; never throws); both null → unavailable
 * view. Project via projectServedValueHistory / projectServedRecoveryHistory and render each served section with
 * the RESOLVER_MIRROR_NOTICE + every field HTML-escaped. No canonical/longest/winning language — the served
 * state is rendered as-is (the projection's head is shown without ranking across alternatives). Returns HTML.
 */
export function renderNameView(input: { readonly name: unknown; readonly port: WebReadPort }): string {
  const shaped = shapeName(input.name);
  if (!shaped.ok) return errorView(input.name); // invalid name → escaped error view, never touches the port
  const name = shaped.name;
  try {
    const value = input.port.valueHistory(name);
    const recovery = input.port.recoveryHistory(name);
    if (value === null && recovery === null) return unavailableView(name);
    return page(name, valueSection(name, value) + recoverySection(name, recovery));
  } catch {
    // any thrown/malformed served result fails closed to the unavailable view — never a thrown render
    return unavailableView(name);
  }
}

/** label/value row — every value HTML-escaped (no innerHTML-style trust boundary). */
function field(label: string, value: unknown): string {
  return `<div class="field"><span class="k">${htmlEscape(label)}</span>: <code>${htmlEscape(String(value))}</code></div>`;
}

/** A served-state section carries the mirror notice itself, not just the page footer. */
function servedSection(title: string, body: string): string {
  return `<section class="served"><h2>${htmlEscape(title)}</h2><p class="provenance">${htmlEscape(
    RESOLVER_MIRROR_NOTICE
  )}</p>${body}</section>`;
}

function renderValueRecord(r: SignedValueRecord): string {
  return `<li class="record">${field("sequence", r.sequence)}${field("owner pubkey", r.ownerPubkey)}${field(
    "ownership ref",
    r.ownershipRef
  )}${field("previous record hash", r.previousRecordHash ?? "none")}${field("value type", r.valueType)}${field(
    "payload",
    r.payloadHex
  )}${field("issued at", r.issuedAt)}${field("signature", r.signature)}</li>`;
}

function renderRecoveryDescriptor(d: SignedRecoveryDescriptor): string {
  return `<li class="descriptor">${field("sequence", d.sequence)}${field("owner pubkey", d.ownerPubkey)}${field(
    "ownership ref",
    d.ownershipRef
  )}${field("recovery address", d.recoveryAddress)}${field("signing profile", d.signingProfile)}${field(
    "challenge window blocks",
    d.challengeWindowBlocks
  )}${field("issued at", d.issuedAt)}${field("signature", d.signature)}</li>`;
}

function valueSection(name: string, served: ServedValueState | null): string {
  if (served === null) return servedSection("Value history", "<p>No value history served for this name.</p>");
  const result = projectServedValueHistory({ name, currentOwnership: served.currentOwnership, records: served.records });
  if (!result.ok) {
    return servedSection("Value history", `<p>Served value history could not be projected: ${htmlEscape(result.reason)}.</p>`);
  }
  const rows = result.records.map((r) => renderValueRecord(r)).join("");
  return servedSection(
    "Value history",
    `${field("ownership ref", result.ownershipRef)}<ol class="records">${rows}</ol>`
  );
}

function recoverySection(name: string, served: ServedRecoveryState | null): string {
  if (served === null) return servedSection("Recovery descriptors", "<p>No recovery descriptors served for this name.</p>");
  const result = projectServedRecoveryHistory({
    name,
    currentOwnership: served.currentOwnership,
    descriptors: served.descriptors,
  });
  if (!result.ok) {
    return servedSection(
      "Recovery descriptors",
      `<p>Served recovery history could not be projected: ${htmlEscape(result.reason)}.</p>`
    );
  }
  const rows = result.descriptors.map((d) => renderRecoveryDescriptor(d)).join("");
  return servedSection(
    "Recovery descriptors",
    `${field("ownership ref", result.ownershipRef)}<ol class="descriptors">${rows}</ol>`
  );
}

function page(name: string, body: string): string {
  return `<!doctype html><html><head><title>${htmlEscape(name)}</title></head><body><h1>Name: ${htmlEscape(
    name
  )}</h1>${body}</body></html>`;
}

function unavailableView(name: string): string {
  return `<!doctype html><html><head><title>${htmlEscape(
    name
  )}</title></head><body><h1>Name: ${htmlEscape(name)}</h1><section class="unavailable"><p>This name is not currently served by this resolver.</p><p class="provenance">${htmlEscape(
    RESOLVER_MIRROR_NOTICE
  )}</p></section></body></html>`;
}

function errorView(rawName: unknown): string {
  return `<!doctype html><html><head><title>Invalid name</title></head><body><h1>Invalid name</h1><p>Invalid name: <code>${htmlEscape(
    String(rawName)
  )}</code></p></body></html>`;
}

// B5-WEB — the name-resolution view (first read/display slice; CL design-concur event 6ab36188). Server-rendered
// pure HTML string; no client bundle, no crypto, no signing. Shapes the name (reject-don't-normalize), reads the
// served value + recovery state from the injected WebReadPort, projects it through the B4 adapters, and renders
// HTML — every dynamic field HTML-escaped, every served section carrying resolver-indexed-mirror /
// not-ownership-authority copy, and NO canonical/longest-chain/tie-break adjudication (MR1). Total: never throws
// (malformed/absent → an unavailable/error view).
import { isCanonicalName } from "@ont/wire";
import { projectServedValueHistory, projectServedRecoveryHistory } from "@ont/adapter-resolver";
import type { WebReadPort } from "./web-read-port.js";

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
  void input;
  void projectServedValueHistory;
  void projectServedRecoveryHistory;
  void RESOLVER_MIRROR_NOTICE;
  void htmlEscape;
  void shapeName;
  return "<!-- not-implemented -->";
}

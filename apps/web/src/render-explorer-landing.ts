// B5-WEB — explorer landing + query router (final web read slice; CL design-concur event bcc17e00). renderLanding
// is pure (no port): a search affordance + the resolver-indexed-mirror / not-ownership-authority framing shown
// before any result. route(query, port) trims only transport whitespace, then dispatches by the EXISTING shapers
// — hex32 txid → renderTxView, canonical name → renderNameView, neither → escaped landing-with-error (the router
// adds no parser/rule logic). An invalid query never touches the port; the view renderers keep their own
// fail-closed behavior. No network, no client bundle, no crypto. Total.
import { renderTxView, shapeTxid } from "./render-tx-view.js";
import { renderNameView, shapeName, htmlEscape } from "./render-name-view.js";
import type { WebReadPort } from "./web-read-port.js";

export const LANDING_NOTICE =
  "Open Name Tags explorer — a resolver-indexed-mirror of served state. not-ownership-authority: ownership is " +
  "decided on-chain and by the audited kernel, not by this explorer. Search a name or a transaction id.";

/**
 * RED stub. Green: a pure search page — heading + `<form>`/`<input>` search affordance + the LANDING_NOTICE
 * provenance copy, shown before any result. No port, no ownership/canonicality language.
 */
const SEARCH_FORM = '<form class="search"><input name="q" placeholder="name or transaction id" /><button>Search</button></form>';

export function renderLanding(): string {
  return (
    `<!doctype html><html><head><title>Open Name Tags Explorer</title></head><body>` +
    `<h1>Open Name Tags Explorer</h1>` +
    `<p class="provenance">${htmlEscape(LANDING_NOTICE)}</p>` +
    SEARCH_FORM +
    `</body></html>`
  );
}

/** The landing page plus an escaped note that the query matched neither a name nor a transaction id. */
function landingWithError(rawQuery: unknown): string {
  return (
    `<!doctype html><html><head><title>Open Name Tags Explorer</title></head><body>` +
    `<h1>Open Name Tags Explorer</h1>` +
    `<p class="provenance">${htmlEscape(LANDING_NOTICE)}</p>` +
    SEARCH_FORM +
    `<p class="error">Query not recognized as a name or transaction id: <code>${htmlEscape(String(rawQuery))}</code></p>` +
    `</body></html>`
  );
}

/**
 * RED stub. Green: q = typeof query === "string" ? query.trim() : ""; shapeTxid(q).ok → renderTxView({txid:q,port});
 * else shapeName(q).ok → renderNameView({name:q,port}); else a landing-with-error echoing the escaped query
 * (never touches the port). Dispatch order is txid-first intentionally (isHex32Rendering is strictly 64 lowercase
 * hex; names are ≤32, so no current overlap — the order is fixed for the future-overlap case).
 */
export function route(query: unknown, port: WebReadPort): string {
  // Trim ONLY transport whitespace — no lowercasing / no name normalization (reject-don't-normalize).
  const q = typeof query === "string" ? query.trim() : "";
  if (q === "") return renderLanding(); // empty / whitespace-only → plain landing, never touches the port
  const txid = shapeTxid(q);
  if (txid.ok) return renderTxView({ txid: q, port }); // dispatch order: txid first (intentional)
  const name = shapeName(q);
  if (name.ok) return renderNameView({ name: q, port });
  return landingWithError(query); // malformed non-empty → escaped landing-with-error, never touches the port
}

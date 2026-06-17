import { describe, expect, it } from "vitest";
import { renderLanding, route } from "./render-explorer-landing.js";
import type { WebReadPort } from "./web-read-port.js";

// B5-WEB explorer landing + router red battery (CL design-concur event bcc17e00). renderLanding pure/no-port;
// route trims transport whitespace then dispatches by the existing shapers (txid-first), invalid → escaped
// landing-with-error without touching the port. No ownership/canonicality language.

const TXID = "33".repeat(32); // 64 lowercase hex → a txid
const NAME = "alice"; // ≤32 lowercase alnum → a name

// A port that throws on every method — proves the router does not touch it for invalid queries.
const throwingPort: WebReadPort = {
  valueHistory() {
    throw new Error("touched");
  },
  recoveryHistory() {
    throw new Error("touched");
  },
  tx() {
    throw new Error("touched");
  },
};

// A port that serves nothing (null) — dispatched views still render their header (Name:/Transaction:).
const nullPort: WebReadPort = {
  valueHistory: () => null,
  recoveryHistory: () => null,
  tx: () => null,
};

describe("renderLanding — pure search page", () => {
  it("shows a search affordance + not-authority framing, no ownership/canonicality language", () => {
    const out = renderLanding();
    expect(out).toMatch(/<form|<input|search/i);
    expect(out).toContain("resolver-indexed-mirror");
    expect(out).toContain("not-ownership-authority");
    expect(out).not.toMatch(/canonical|longest|winning|owner[- ]authority/i);
  });
});

describe("route — dispatch by shaper", () => {
  it("a hex32 txid → tx view", () => {
    const out = route(TXID, nullPort);
    expect(out).toContain("Transaction:");
    expect(out).not.toContain("Name:");
  });
  it("a canonical name → name view", () => {
    const out = route(NAME, nullPort);
    expect(out).toContain("Name:");
    expect(out).not.toContain("Transaction:");
  });
  it("trims transport whitespace before dispatch", () => {
    const out = route("  alice  ", nullPort);
    expect(out).toContain("Name:");
  });
});

describe("route — invalid query", () => {
  it("neither txid nor name → landing-with-error, never touches the port, never throws", () => {
    let out = "";
    expect(() => {
      out = route("Not A Query!", throwingPort);
    }).not.toThrow();
    expect(out).not.toContain("Transaction:");
    expect(out).not.toContain("Name:");
    expect(out).toMatch(/could not|invalid|not recognized/i);
  });
  it("escapes a malicious query in the landing-with-error (no raw <script>)", () => {
    const out = route("<script>alert(1)</script>", throwingPort);
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>alert");
  });
});

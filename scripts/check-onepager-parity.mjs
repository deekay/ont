// Guard against content drift between the two one-pager sources:
//   docs/ONT_ONE_PAGER.md   (canonical text)
//   docs/onepager/onepager.html (hand-styled print/PDF version)
// They are hand-synced (the HTML's layout/SVG make full generation impractical
// today), and they HAVE drifted before. This check asserts a list of load-bearing
// phrases — numbers, claims, links, feedback asks — appears in BOTH, so a content
// edit to one without the other fails CI instead of shipping a fork.
//
// When you intentionally change one of these phrases, change it in BOTH files
// (and re-render the PDF: bash docs/onepager/render.sh), then update this list.
import { readFileSync } from "node:fs";

const md = normalize(readFileSync("docs/ONT_ONE_PAGER.md", "utf8"));
const html = normalize(stripTags(readFileSync("docs/onepager/onepager.html", "utf8")));

// Load-bearing phrases that must exist in both renderings.
const SHARED_PHRASES = [
  "₿1,000",
  "₿50,000",
  "₿100,000,000",
  "claim.opennametags.org",
  "who can screw you",
  "Where the money goes",
  "What touches Bitcoin",
  "publisher", // role present
  "resolver",
  "watchtower",
  "sunk, not rent",
  "the real cost is carry, not the headline",
  "separate at the protocol layer",
  "pay-first with reputable publishers",
  "deny, never award",
  "nullify",
  "one bond ends the game",
  "Not mainnet-ready",
  "single-writer",
  "fail-closed",
  "folded into the anchor",
  "abort-only",
  "bond-first",
  "largest bond wins",
  "not frozen today",
  "up to ~171 bytes",
  "12-word phrase",
  "verify, compare resolvers, or self-host",
];

const missing = [];
for (const phrase of SHARED_PHRASES) {
  const want = normalize(phrase).toLowerCase();
  if (!md.toLowerCase().includes(want)) missing.push(`MD lacks: "${phrase}"`);
  if (!html.toLowerCase().includes(want)) missing.push(`HTML lacks: "${phrase}"`);
}

if (missing.length > 0) {
  console.error("One-pager parity check FAILED — the two sources have drifted:\n" + missing.map((m) => `  - ${m}`).join("\n"));
  console.error("\nFix both docs/ONT_ONE_PAGER.md and docs/onepager/onepager.html (then re-render the PDF), or update scripts/check-onepager-parity.mjs if the change is intentional.");
  process.exit(1);
}
console.log(`one-pager parity OK — ${SHARED_PHRASES.length} load-bearing phrases present in both sources.`);

function stripTags(s) {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&#10003;/g, "✓");
}

function normalize(s) {
  // Strip markdown emphasis/code markers so "**abort-only** credential" matches.
  return s.replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
}

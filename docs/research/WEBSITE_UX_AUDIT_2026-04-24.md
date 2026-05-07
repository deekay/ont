# Website UX Audit - April 24, 2026

This historical pass reviewed the main Open Name Tags website surfaces as a first-time user would have encountered them before the auction-first cleanup: Home, Overview, Explore, Setup, the retired Claim page, Values, Transfer, Advanced, and Auctions.

The browser DOM snapshots were captured under `/tmp/ont-visual-audit-20260424/`. Image screenshots were attempted through the in-app browser and headless Chromium, but both visual capture paths were blocked by the local macOS sandbox. The audit therefore combines DOM snapshots, existing user-provided screenshots, and source-level layout review.

## Overall Read

The site is much closer to a coherent product walkthrough than it was earlier, but several pages still explain by stacking cards instead of guiding the user through a mental model. The best simplification is to make every page answer three questions quickly:

- What am I doing here?
- What do I need before I start?
- What happens next?

Advanced protocol details should stay available, but they should not be visually equal to the first-time path.

## Changes Made In This Pass

- The Overview "How It Works" section was redesigned from three essay-like cards into the then-current connected flow: Bitcoin acquisition, resolver record, client verification.
- The "One Name, Many Destinations" section was redesigned as a layered diagram: Bitcoin anchor, off-chain resolver record, then clients using the destinations they understand.
- Overview hero sizing was reduced so the page gets to explanatory content faster.
- The Overview jump links were reframed as a compact section index instead of loose floating pills.
- The retired Claim page headline changed from "Prepare A Claim" to "Claim A Name" with a more direct first-time explanation for that older surface.

## Page-By-Page Notes

### Home

What works:

- The homepage now has a clear thesis: human-readable names you can actually own.
- The "two ideas" section is doing the right job: scarcity without rent, and ownership on-chain with records off-chain.
- The three path cards are useful and keep the home page from becoming a full protocol essay.

Needs improvement:

- "Check A Name" should eventually show canonical examples when the private signet seed is available.
- The home page should remain lightweight. Avoid reintroducing the full destinations diagram here.

### Overview

What works:

- This is the right home for the deeper explanation.
- The consistent `alice` example gives readers a thread to follow.

Needs improvement:

- The page should feel like a guided explanation, not docs copied into cards.
- Diagrams should show flow and layer separation: Bitcoin anchor, resolver data, client use.

Implemented:

- The first section is now a three-step flow.
- The destinations section is now a layered map.

### Explore

What works:

- It has the right live/demo purpose.
- Recent names, grouped names, activity, auction state, and network details are useful.

Needs improvement:

- Empty or reset states must be very explicit. A new user should not see `0 names` and wonder whether the protocol is broken.
- Advanced diagnostics such as network details should stay collapsed and visually secondary.
- Canonical demo names should be surfaced prominently when available.

### Setup

What works:

- The setup path is focused on Sparrow and the hosted private signet, which is good.
- It avoids asking new users to understand public signet, faucets, or server internals.

Needs improvement:

- The endpoint should behave like a single copyable setup card.
- The page could be structured as "Install Sparrow", "Connect to private signet", "Fund wallet", then "Open auctions".
- Wallet compatibility should remain below the main path.

### Auctions

What works:

- The bid-prep structure should be clear: inspect an auction state, set owner key, build Sparrow files.
- Local key generation should stay recommended over hosted helper.
- Advanced/custom options are hidden behind a details section.

Needs improvement:

- The page should keep using everyday language: "Bid For A Name", "owner key", "Sparrow files".
- The user should never have to wonder which files go into Sparrow versus which files are local recovery artifacts.

### Values

What works:

- "Update A Name's Destinations" is the right framing.
- The owner-key warning is important and should stay visible.
- The key/value bundle examples are useful.

Needs improvement:

- The page should avoid making value formats feel like protocol knobs.
- The common path should be "add destinations", while single URL/payment target and raw/custom payloads should feel secondary or CLI-oriented.
- The canonical demo names section should be visually tied to "try this safely".

### Transfer

What works:

- Buyer and seller roles are now explicit.
- The sale trust-boundary warning is important.
- Exporting separate buyer/seller/shared packages is the right direction.

Needs improvement:

- The role split should become more visual, almost like two checklists or tabs: "I am the seller" and "I am the buyer".
- The seller payout address field should feel conditional and sale-only.
- The page should keep emphasizing that this is not yet a complete two-party PSBT wizard.

### Advanced

What works:

- Advanced now acts as a containment area for expert surfaces.
- It helps keep auctions and protocol-review docs out of the first-time path.

Needs improvement:

- Keep reducing duplicated "advanced / optional" language.
- Consider grouping links by audience: operator, reviewer, protocol engineer.

### Auctions

What works:

- It was clearly marked advanced at the time; the current auction-first product
  direction makes Auctions a primary surface instead.
- The read-only policy defaults are safer than exposing simulator knobs to first-time users.

Needs improvement:

- Auction pages should continue to look visually aligned with the rest of the site.
- The page should separate "what is live-chain observed" from "what is fixture/reference state".
- A small phase legend would help: pre-eligibility, eligible to open, live
  bidding, soft close, settled, released.

## Recommended Next UX Work

1. Add copyable "known good demo names" to the Home and Explore surfaces when the resolver has the canonical private-signet seed.
2. Simplify the Values tool into a first-class "destination bundle" editor, with single URL/payment and raw/custom formats demoted to advanced/CLI language.
3. Turn Transfer into a stronger buyer/seller guided flow, not just role cards plus one shared form.
4. Add a compact auction phase legend to the Auctions page.
5. Review mobile screenshots once browser image capture is available outside this sandbox.

# Reviewer Feedback Backlog

This document captures the major open questions and objections raised during recent external review of the ONT video, one-pager, and prototype framing.

Its job is not to resolve everything immediately. Its job is to preserve the real points of contention so they can be worked through deliberately before broader outreach.

## How To Use This

- Treat this as a pre-broader-review checklist, not a changelog.
- Keep concerns grouped by issue cluster rather than by who said them.
- Update the `Current status` line as we form a clearer viewpoint or close an issue.

## 1. Terminology And Lifecycle Clarity

### Concern

Some basic protocol terms still created confusion in the one-pager and surrounding materials:

- `settlement period`
- `launch`
- `epoch`
- `maturity`

Reviewers were not always sure whether these referred to:

- mainnet launch
- the initial public opening of the namespace
- the life cycle of an individual name
- a recurring protocol epoch

### Why It Matters

If these terms are unclear in a short explainer, reviewers will infer that the design itself is still vague even when the underlying rule is already fairly specific.

### Current Status

Open, but partly improved in recent edits. Still worth treating as a first-class communication risk.

## 2. Fixed-At-Launch Versus Changeable-Later Rules

### Concern

Reviewers wanted a sharper distinction between:

- design choices that are still under discussion now
- parameters that will be frozen before launch
- things that could actually change after launch

This came up most clearly around the maturity schedule and epoch logic.

### Why It Matters

People are trying to assess whether ONT is governed by stable protocol rules or by future discretionary changes.

### Current Status

Partly answered in `DECISIONS.md`, but still not fully internalized in reviewer-facing materials.

## 3. Owner-Key Loss And Recovery

### Concern

If the owner key is lost, is the name effectively frozen forever?

Follow-on question:

- should a future version allow recovery through the wallet that controls the original or current bond UTXO?

### Why It Matters

This is both a usability issue and a sovereignty issue. Reviewers want to know whether the system has an unforgiving failure mode and whether that is intentional.

### Current Status

Reopened as a v1 design issue.

The current working recommendation is that, while a name is still backed by a
live immature bond, control of the current bond UTXO should be able to rotate
the ONT owner key by moving the bond into a valid successor bond output in the
same transaction.

The signed recovery descriptor foundation, a prototype `RECOVER_OWNER`
challenge-window state machine, protocol-level BIP322 proof-envelope
verification, resolver proof storage, and indexer proof-availability
enforcement are implemented. The remaining details still need protocol review:

- whether recovery exists only before maturity, or can remain available through
  an optional post-maturity recovery anchor
- how to handle conflicts between owner-key authority and bond-spend authority
- how resolver/client proof fanout and late-proof replay should work for
  variable-size wallet proofs committed by hash on chain

## 4. Premium Brands And Top-End Squatting

### Concern

The strongest economic objection so far is that the current bond model may be too focused on the total namespace and not focused enough on the economically relevant subset of names:

- major brands
- common words
- premium terms
- memorable personal or business names

The specific challenge is not "can someone corner all 6-character names?" but rather:

- can a wealthy actor rationally lock up the top 10,000 or 100,000 names people most care about?

### Why It Matters

This is currently the most serious challenge to the fairness story.

### Current Status

The current working direction is now simpler:

- use one auction allocation rule for every launch-eligible name
- remove semantic reserved lists and pre-launch reservation systems from the
  launch design
- handle very short names through the same auction rule, with parameter review
  focused on whether the length-based opening floors are aggressive enough
- let markets reveal which names have real demand instead of asking ONT to
  classify names ahead of time

Still open, but no longer structurally vague: final windows, increments, caps,
floors, and settlement-lock details need real parameter work.

## 5. Bond Curve Justification

### Concern

Reviewers want a more defendable explanation for the current launch curve:

- why `1 BTC` for 1-character names?
- why a simple halving per character?
- why this floor?
- what real-world behaviors is the curve supposed to prevent or tolerate?

### Why It Matters

If the curve feels arbitrary, the fairness story feels arbitrary too.

### Current Status

Open. Existing spreadsheets and reasoning are helpful but do not yet answer the premium-name objection well enough.

## 6. Permissionlessness Versus Brand Expectations

### Concern

A permissionless, identity-free namespace may allow names that resemble short words or real-world brands to be won at auction by someone other than the real-world brand holder.

That creates a challenge:

- is permissionlessness a virtue here?
- or does it weaken the usefulness of the namespace for names that people already expect to map to existing entities?

### Why It Matters

This is not just a trademark concern. It cuts directly into the AI and consumer trust story.

### Current Status

Open. There is a real worldview split here between:

- "existing brands are a bootstrapping problem"
- and "this is a major utility problem if not addressed"

## 7. Why ONT Instead Of DNS Plus Ranking Signals

### Concern

Reviewers are not yet fully convinced that ONT solves a sufficiently important problem that DNS, search, ranking signals, or other trust signals do not already cover.

The current AI/agent framing helped, but it did not close the case by itself.

### Why It Matters

If ONT is framed only as "another naming system," skepticism stays high. The product thesis needs to make clear what DNS does not do and why that matters more in an agentic world.

### Current Status

Open, but clearer framing language is emerging.

## 8. Need For A Concrete End-To-End Use Case

### Concern

Reviewers want a compelling example that shows:

- the human intent
- the agent interpretation step
- the authoritative resolution step
- the final payment or API action

They want to see the actual user payoff, not just the protocol properties.

### Why It Matters

The abstract argument is easier to dismiss than a realistic flow.

### Current Status

Open. We have draft language around the "Presidio Bitcoin" example, but it has not been turned into a canonical shared walkthrough yet.

## 9. Resolver Decentralization And Incentives

### Concern

Reviewers asked:

- who runs resolvers?
- why would they run them?
- how many are enough?
- how are they discovered?
- what incentives keep them complete and up to date?

### Why It Matters

The ownership story is strong, but if resolver availability feels hand-wavy, people may conclude that decentralization has simply been deferred to a weaker layer.

### Current Status

Open, but we do have real design material:

- completeness scoring
- multi-resolver publish/read
- bootstrap strategies
- possible on-chain announcements

The remaining gap is turning that into a tighter reviewer-facing position.

## 10. Blockspace And Throughput

### Concern

Reviewers want a stronger answer to:

- how much blockspace does this consume?
- how many auction acquisitions or transfers fit at realistic fee levels?
- does this compete too much with Bitcoin's monetary use case?

The concern sharpened into a request for stronger footprint minimization and a more concrete scaling path.

### Why It Matters

This is a core Bitcoin-cultural question, not just an engineering optimization.

### Current Status

Open. Current footprint is measured, but the future minimization story is not settled.

## 11. Footprint And Future Compactness

### Concern

Reviewers want us to revisit smaller-footprint alternatives such as:

- OpenTimestamps-style anchoring
- Taproot tweaks
- multi-bid or multi-transfer packaging

The key question is whether some version of this should be part of launch rather than treated only as future work.

### Why It Matters

This is the main candidate answer to "respect blockspace more aggressively before launch."

### Current Status

Open. The current launch direction no longer depends on the retired direct-allocation batching work. Footprint review should focus first on auction openings, auction bids, transfers, and owner-signed value publication.

## 12. Auction Dynamics

### Concern

The current launch direction uses auctions for every launch-eligible name.
Reviewers are now explicitly asking whether:

- auction windows are long enough
- opening floors are high enough
- settlement locks are too long given quantum concerns
- very short names need stronger floors or other objective parameter treatment

### Why It Matters

This is the central design question behind premium-name squatting and fairness at launch.

### Current Status

Open. Needs explicit comparison of auction parameters and their trade-offs.

## 13. Transaction-Level Technical Transparency

### Concern

Reviewers asked for clearer technical detail on:

- payload shapes
- script types
- signatures
- auction bid contents
- transfer contents

### Why It Matters

Critical Bitcoin reviewers often want to see the exact transaction shape before they form an opinion.

### Current Status

Partly answered in the implementation plan and decision log, but not yet distilled into a simple reviewer-facing explanation.

## 14. Existing Brands Versus Future Brands

### Concern

There is a live disagreement about whether the brand problem is:

- primarily a bootstrapping issue for already-famous names
- or a deeper reason why people and agents may not trust the namespace at all

### Why It Matters

This distinction drives whether ONT should be optimized mainly for future-native adoption or must solve more of the legacy brand-mapping problem before launch.

### Current Status

Open. This likely needs a clearer protocol and product stance, not just economic modeling.

## 15. Pre-Launch Review Readiness

### Concern

There is real interest in sharing ONT with sharper Bitcoin developers and potentially attracting outside implementation help, but only after the strongest open issues are addressed clearly enough.

### Why It Matters

We want broader review to create signal, not avoidable confusion.

### Current Status

Open. This backlog is part of getting to that point.

## 16. Post-Quantum Migration And Signature Agility

### Concern

If ONT contemplates long-lived names and premium lock periods measured in many years, reviewers may reasonably ask what happens if Bitcoin's current signature assumptions become vulnerable before those timelines finish.

The concern is not that ONT must solve post-quantum migration by itself. The concern is that long-duration commitments make it harder to ignore.

### Why It Matters

For decade-scale names or bonds, "we'll think about it later" is not a satisfying answer. We should have an explicit position on:

- what ONT can and cannot promise
- whether owner-key migration is part of the design story
- and how dependent the answer is on Bitcoin's own future path

### Current Status

Open. See [POST_QUANTUM_AND_SIGNATURE_AGILITY.md](../research/POST_QUANTUM_AND_SIGNATURE_AGILITY.md).

## 17. Implementation Simplification Before Wider Review

### Concern

The v1 story is now simpler than some of the implementation history still
visible in code and tooling. Reviewers may infer unnecessary complexity from
leftover abstractions that no longer match the one-path claim launch model.

Current examples:

- legacy `gns` names remain in deployment scripts as compatibility fallbacks
- retired auction-class fields have been removed from active bid packages,
  fixtures, policy, simulators, and app consumers; the remaining simplification
  work is terminology/docs cleanup around the same one-rule contested path
- older epoch-halving maturity helpers remain as deprecated compatibility code;
  active claim state now uses the fixed maturity constant
- recovery now has BIP322 proof-envelope verification, but challenge-window
  language and proof distribution rules still need a cleaner reviewer-facing
  explanation
- transfer tooling still exposes too much "successor bond" machinery instead
  of presenting immature transfer as a guided ownership move
- the portable proof-bundle format should become the center of v1 review before
  more mechanism design is added

### Why It Matters

The external design brief now says "v1 is one public claim path, with L1 auction
only after contest." The code and tools should progressively converge on that
same mental model. Otherwise reviewers have to audit historical flexibility that
we no longer intend to use.

### Current Status

In progress. Suggested order:

1. Standardize reviewer-facing terminology on `ONT`; quarantine or remove
   legacy `gns` deployment compatibility where safe.
2. Remove deprecated epoch-halving helpers from the v1 protocol surface after
   downstream fixtures/tests no longer import them.
3. Tighten recovery docs around the challenge window, proof fanout, and
   late-proof/replay behavior.
5. Add a CLI/browser helper abstraction for successor-bond linking so immature
   transfers feel like ownership transfers, not manual UTXO surgery.
6. Prototype or specify canonical proof bundles for claim acquisition, auction
   escalation, maturity, release, transfer, and value-record history.

## Suggested Discussion Order

If we work through these one by one, the most leveraged order is probably:

1. premium brands and top-end squatting
2. fixed bonds versus auction dynamics
3. batching / Merkle / lower-footprint launch options
4. why ONT over DNS + ranking signals in the agentic age
5. resolver decentralization and discovery
6. owner-key loss and possible future recovery

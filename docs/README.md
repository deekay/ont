# Documentation

This repository has four documentation buckets:

## Core

These are the best places to start if you want to understand the current prototype.

- [ONT_ONE_PAGER.md](./core/ONT_ONE_PAGER.md): short overview of the design, economics, and blockspace footprint
- [SELF_HOSTING.md](./core/SELF_HOSTING.md): easiest path for running your own ONT website + resolver stack
- [ARCHITECTURE.md](./core/ARCHITECTURE.md): system structure, trust boundaries, and runtime modes
- [DECISIONS.md](./core/DECISIONS.md): protocol decisions and tradeoffs that are already explicit
- [NEW_USER_TESTING_GUIDE.md](./core/NEW_USER_TESTING_GUIDE.md): friendly first-time testing guide for reviewers and friends
- [TESTING.md](./core/TESTING.md): fixture, regtest, and private signet testing paths

## Demo

These documents are specifically about the current hosted and private-signet demo flows.

- [FLINT_DEMO.md](./demo/FLINT_DEMO.md): shortest hosted-demo script for reviewers, friends, and first-time testers
- [SPARROW_PRIVATE_SIGNET.md](./demo/SPARROW_PRIVATE_SIGNET.md): Sparrow + private signet setup for the hosted demo
- [RUN_SIGNET.md](./demo/RUN_SIGNET.md): running the prototype against signet backends
- [COLD_USER_WALKTHROUGH.md](./demo/COLD_USER_WALKTHROUGH.md): how to run and record a first-time user walkthrough

## Operators

These are mainly useful if you are self-hosting or running the prototype infrastructure.

- [VPS_SETUP.md](./operators/VPS_SETUP.md)
- [ONT_DOMAIN_DEPLOY.md](./operators/ONT_DOMAIN_DEPLOY.md)
- [SUPABASE_SETUP.md](./operators/SUPABASE_SETUP.md)

## Research And Drafts

These documents are useful, but they are more speculative, essay-like, or draft-oriented than the core docs above.

- [UNIVERSAL_AUCTION_LAUNCH_MODEL.md](./research/UNIVERSAL_AUCTION_LAUNCH_MODEL.md): current lead launch model; public bonded auctions for every valid name, no reserved list
- [AUCTION_EDGE_CASE_MATRIX.md](./research/AUCTION_EDGE_CASE_MATRIX.md): human-readable auction edge-case and test-planning matrix
- [AUCTION_SIMULATOR.md](./research/AUCTION_SIMULATOR.md): current simulator and CLI commands for auction policy, single-auction cases, and market scenarios
- [ONT_VS_PUBKY_PKARR.md](./research/ONT_VS_PUBKY_PKARR.md)
- [ONT_AND_PRIVATE_MESSAGING_BOOTSTRAP.md](./research/ONT_AND_PRIVATE_MESSAGING_BOOTSTRAP.md)
- [VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md](./research/VALUE_RECORD_HISTORY_AND_KEYBASE_NOTES.md)
- [NARRATIVE_FRAMEWORK.md](./research/NARRATIVE_FRAMEWORK.md)
- [PAYMENT_NAMES_AND_TRUST_SIGNALS.md](./research/PAYMENT_NAMES_AND_TRUST_SIGNALS.md)
- [PRIVATE_RELATIONSHIP_GRAPH_AND_NOSTR.md](./research/PRIVATE_RELATIONSHIP_GRAPH_AND_NOSTR.md)
- [USE_CASE_SCENES.md](./research/USE_CASE_SCENES.md)
- [REVIEW_FEEDBACK_BACKLOG.md](./research/REVIEW_FEEDBACK_BACKLOG.md)
- [POST_QUANTUM_AND_SIGNATURE_AGILITY.md](./research/POST_QUANTUM_AND_SIGNATURE_AGILITY.md)
- [HYPE_VIDEO_SCRIPT.md](./research/HYPE_VIDEO_SCRIPT.md)
- [HANDSOFF_DEMO_WALLET_PLAN.md](./research/HANDSOFF_DEMO_WALLET_PLAN.md)
- [ONT_EXPLAINER.md](./research/ONT_EXPLAINER.md)
- [ONT-v2-draft.md](./research/ONT-v2-draft.md)
- [IMPLEMENTATION_PLAN.md](./research/IMPLEMENTATION_PLAN.md)
- [TRANSFER_RELAY_OPTIONS.md](./research/TRANSFER_RELAY_OPTIONS.md)
- [FUTURE_EXPLORATIONS.md](./research/FUTURE_EXPLORATIONS.md)
- [NOSTR_STRATEGY.md](./research/NOSTR_STRATEGY.md)

Superseded launch-list and two-lane notes are intentionally removed from this
index. The current launch model does not use a reserved-word list, salience
spreadsheet, pre-launch reservation system, or separate ordinary lane.

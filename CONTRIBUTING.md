# Contributing

Thanks for helping with Open Name Tags.

This repository is still a prototype, so the most helpful contributions tend to be:

- making the flows easier to understand
- reducing operational surprises
- improving test coverage around lifecycle edge cases
- keeping the trust boundary between hosted tooling and user-controlled signing clear

## Prerequisites

- Node.js 22+
- npm 11+
- Sparrow Wallet if you want to exercise the private signet wallet flow

Optional:

- a Bitcoin node if you want to work on RPC-backed modes
- SSH access to the demo VPS if you are touching private signet operations

## Local Setup

```bash
npm install
```

## Common Commands

### Run the local website + resolver

```bash
npm run dev:all
```

Then open:

- `http://127.0.0.1:3000`

### Run the full check suite

```bash
npm run check
```

## Repository Structure

### Apps

- `apps/web`: website and browser-side flows
- `apps/cli`: operator tooling
- `apps/resolver`: read API and value-record API
- `apps/indexer`: indexing entrypoint

### Packages

- `packages/protocol`: wire format and protocol rules
- `packages/architect`: pure claim/PSBT building logic
- `packages/bitcoin`: Bitcoin parsing and source helpers
- `packages/core`: state machine and activity tracking
- `packages/db`: persistence layer

### Scripts

- `scripts/bootstrap-*.sh`: VPS bootstrap
- `scripts/deploy-*.sh`: deploy flows
- `scripts/*sparrow*`: local Sparrow setup helpers
- `scripts/*demo*` and `scripts/*suite*`: testing flows

## Working Style

When making changes, try to keep these boundaries clean:

- website prepares, wallet signs
- resolver explains, chain decides
- protocol logic lives in shared packages, not in ad hoc app code

Prefer:

- adding tests for lifecycle or builder changes
- extracting shared logic instead of duplicating it across CLI and web
- keeping public-facing pages concise, with detail moved behind sections or info affordances

## Before Opening A Public PR

Please make sure:

- `npm run check` passes
- docs are updated if the user flow changed
- new scripts have executable permissions if they are meant to be run directly
- website copy reflects the current product name: `Open Name Tags`

## Good First Areas

- website UX cleanup
- clearer onboarding copy
- provenance/history UX
- transfer-flow ergonomics
- test coverage around value publication and transfer edge cases

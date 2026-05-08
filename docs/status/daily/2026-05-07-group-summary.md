# 2026-05-07 ONT Group Summary

## Executive Summary

Today focused on turning owner-key loss from an unforgiving failure mode into a
reviewable v1 recovery path. The current direction is now:

> owner key for normal control, wallet-backed recovery descriptor by default.

We also cleaned up the working tree at the file level, kept the broader auction
and docs refresh as intentional project progress, and verified the workspace.

## Decisions

- Keep universal public bonded auctions as the lead launch model.
- Add a daily status-log discipline under `docs/status/daily/`.
- Use signed recovery descriptors as a distinct resolver-served control-record
  family.
- Add a distinct `RECOVER_OWNER` event instead of overloading `TRANSFER`.
- Recovery requests for immature names must spend the live bond into a valid
  successor bond and wait through a challenge window.
- The current owner key can cancel pending recovery before finalization.

## Progress

- Added protocol support for signed recovery descriptors.
- Added resolver storage and endpoints for recovery descriptor history.
- Added CLI commands to sign, publish, and fetch recovery descriptors.
- Added a BIP322-shaped recovery proof message format.
- Added prototype `RECOVER_OWNER` wire encoding/decoding.
- Added core pending recovery state, finalization, and owner-key cancellation.
- Added tests for recovery request, cancel, late cancel, invalid successor bond,
  checkpoint restore, and initial auction edge cases.
- Added `CODEX.md` and daily status-log docs.

## Verification

- `npm test` passed with full workspace build and all Vitest suites.
- `git diff --check` passed.
- `npm run test:e2e:fixture-web` is still blocked in the Codex macOS sandbox by
  Chromium Mach rendezvous permissions and should be rerun in a normal shell or
  CI.

## Open Questions For Review

- Should indexers require full BIP322 wallet-proof verification before entering
  pending recovery, or is bond-spend authority plus descriptor hash acceptable
  for the prototype?
- Is a 144-block challenge window enough?
- Should recovery remain immature-only, or support post-maturity recovery with
  an explicit retained anchor?
- Should variable-size wallet proofs be distributed off-chain by resolvers, with
  only a proof hash/profile on-chain?
- Which wallet/script profiles must v1 support for Sparrow, Electrum, and
  hardware signers?

## Proposed Next Focus

- Implement full BIP322 verification against the recovery descriptor address or
  script.
- Add CLI/web flows for recovery request and cancellation.
- Continue converting the auction edge-case matrix into executable tests.

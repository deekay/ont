# Decision packet — wire-codec-consolidation (DK call)

**Status:** RATIFIED + APPLIED — DK approved option C / quarantine-now on 2026-06-17; implemented on `clean-build-b5`. Analysis/advisory tier.
**Proposed stable name:** `wire-codec-consolidation`
**Raised by:** ClaudeleLunatique, surfaced while building the B5-WALLET auction-bid slice.
**Reviewer:** ChatLunatique (concurs the framing + recommendation; see ONT-dev channel).
**Parks:** the B5-WALLET **auction-bid** sub-slice (gift-transfer + the cooperative-sale design are unaffected and proceed).

## Outcome — 2026-06-17

DK approved option C with quarantine-now timing. The pre-W16 cluster is now
outside active workspaces under `legacy/`: `apps/publisher`, `apps/indexer`,
`apps/resolver`, `packages/core`, `packages/architect`, and
`packages/protocol/src/wire.ts` plus its codec tests. During implementation,
`@ont/consensus` was found to be the remaining active consumer of the protocol
wire decoder; it was migrated to `@ont/wire` before the protocol wire export
was removed. `@ont/protocol` remains active for clean value/recovery/signing
helpers and `auction-bid-package`; its auction lot/bidder commitments now
render full W16 32-byte hex commitments, and auction bid package version moved
from 3 to 4. **No 16-byte compatibility bridge remains anywhere in active code.**

This is a quarantine **move**, not a deletion: the legacy code stays fully
recoverable from `legacy/` plus git history (the moves are recorded as renames,
so history is preserved). The reopen trigger below stays in force.

Verification (independent re-run at commit): full active `npm test` →
**1045 passed / 2 skipped**; `@ont/consensus` 466; `typecheck`, `check:surfaces`
(claim/cli/wallet/web), `check-doc-links.sh`, and `git diff --check` all clean.
Landed @ `676a545` on `clean-build-b5` (local/unpushed — DK's merge/push gate).

## TL;DR

The clean build currently contains **two wire codecs**: the clean `@ont/wire` (B1, W16 full-width **32-byte** auction commitments, 184-byte max bid) and a **carried-over pre-W16** codec inside `@ont/protocol/wire.ts` (**16-byte** lot/bidder commitments, 152-byte bid). The W16 ruling (DK `27a1030b` — full-width 32-byte commitments) reached `@ont/wire` and B2/consensus but never propagated to `@ont/protocol`'s codec or its riders (`@ont/core`, `@ont/architect`, and the old apps). Building auction-bid (which must emit a wire-valid 32-byte carrier via `@ont/wire`) needs `@ont/protocol`'s package commitments at 32-byte — but they can't move alone without breaking the whole pre-W16 cluster. **Recommendation: quarantine the carried-over pre-W16 cluster to `legacy/`** (per `nothing-is-precious`), which isolates the W16 fix and unblocks auction-bid. DK owns this composition boundary + its timing.

## The finding (evidence)

- `@ont/wire` (clean, B1): AuctionBid event 0x07 requires **32-byte** commitments — `checkHex32` on encode, `h32(51/83/115)` on decode; max bid 184 B (post-W16).
- `@ont/protocol/wire.ts` (carried-over): `encodeAuctionBidPayload`/`decodeAuctionBidPayload` are hardcoded **16-byte** — decode `slice(51,67)` (lot) + `slice(99,115)` (bidder); `wire-size.test.ts` pins the **152-byte** bid. This is a *duplicate, out-of-sync* codec.
- `computeAuctionLotCommitment` / `computeAuctionBidderCommitment` (`auction-bid-package.ts:369,387`) end with `sha256Hex(...).slice(0,32)` — `.slice` on a **hex string** → 32 hex chars = **16 bytes** (the truncated 128-bit form). `createAuctionBidPackage` validates those package fields at 16 bytes (`:105,127`).
- `compute*` is consumed by the pre-W16 codec, so it cannot move in isolation: `protocol.test.ts:139` feeds `compute*` into `encodeAuctionBidPayload`; `@ont/core` (`indexer.test.ts`, `experimental-auction`) and `@ont/architect` (`index.ts:284`, `browser.ts:179`) build AuctionBid payloads from `compute*`/package commitments — **47 `compute*` couplings** across those two packages.
- **The cluster is cleanly separable after one active consumer cleanup.** The clean stack had no dependency on `@ont/core` or `@ont/architect`; the only remaining active dependency on the duplicate protocol codec was `@ont/consensus` event decoding, which migrated to `@ont/wire` during application. Only the carried-over old apps depended on `@ont/core` / `@ont/architect`: `apps/publisher`, `apps/indexer`, `apps/resolver` (→ `@ont/core`) and the pre-B5 `apps/web` (→ `@ont/architect` + `@ont/core`).
- W16 is ratified (`DECISIONS.md` — "B2 may treat ... full-width commitments collision-resistant per the W16 ruling"). So this is **propagation of a ratified decision + a composition cleanup**, not new law.

## Why this is a DK call

It is not a B5 wallet sub-slice — it decides the clean-build **composition boundary**: which carried-over packages/apps are retired to `legacy/` vs migrated in place, and the **timing** (the old apps are the live placeholders until the clean B5-WEB/explorer surface — the last B5 surface — is built). `nothing-is-precious` (old apps have no protected status, downtime accepted) supports retiring now, but the boundary + timing are DK's to own.

## Options

- **A — decouple the clean path only.** Make `compute*`/`createAuctionBidPackage` 32-byte; freeze the legacy codec's tests on 16-byte literals so the cluster keeps blessing the old codec. *Rejected* (CL concurs): knowingly leaves two live contradictory wire codecs, wallet trusts one while protocol/core/architect bless the other.
- **B — migrate the whole cluster through W16 in this B5 flow.** Move `@ont/protocol/wire.ts` to 32-byte, fix `wire-size` (152→184) and all 47 `core`/`architect` couplings. *Rejected* (CL concurs): wrong blast radius — drags the "name dies in rewrite" machinery through a B5 wallet flow.
- **C — quarantine the carried-over pre-W16 cluster to `legacy/`** (`@ont/protocol/wire.ts` + `@ont/core` + `@ont/architect` + the old apps that ride them), leaving `@ont/wire` as the sole wire codec. `@ont/protocol` keeps its clean, in-use functions (value-record / recovery-descriptor / signing / `auction-bid-package`); only its duplicate `wire.ts` goes. **Recommended.**

## Recommendation: C

Quarantine the cluster. Because the clean stack does not depend on it, removing it **isolates** the W16 commitment fix — afterward, the only consumer of `compute*` is the clean `auction-bid-package`, so dropping the `.slice(0,32)` + bumping the asserts 16→32 becomes the small, contained change originally envisioned, and the auction-bid wallet slice resumes immediately. Timing: do it now (per `nothing-is-precious`, accepting the old `publisher/indexer/resolver/web` go dark until their clean replacements land — clean B4 adapters already exist; clean B5-WEB/explorer is the last B5 surface). DK may instead choose to defer quarantine until B5-WEB lands; that keeps auction-bid parked longer but avoids any old-app gap.

## Ripple

- Old apps `publisher/indexer/resolver/web` go dark on quarantine (no clean web/explorer yet — it is the last B5 surface). Clean B4 adapter packages already cover indexer/resolver/publisher logic.
- `@ont/protocol` retains its clean functions; only `wire.ts` (the duplicate codec) is removed/quarantined. `wire-size.test.ts` (protocol-codec sizes) goes with it.
- STATUS.md + SOFTWARE_INVENTORY.md updated to record the quarantine (one decommission event, per the B0 decommission pattern).
- After C: the W16 `compute*`→32-byte fix is a contained `@ont/protocol` change; auction-bid wallet red/green resumes with the single-signer pins already agreed.

## What DK must rule

1. Adopt the stable name `wire-codec-consolidation` (or rename).
2. Option **C** (quarantine the cluster) vs defer vs other.
3. Timing: quarantine **now** (old apps dark until B5-WEB) vs **at B5-WEB**.

## Reopen trigger

If any clean-stack package is later found to depend on `@ont/core`/`@ont/architect`/`@ont/protocol/wire.ts`, or if an old app must stay live past B5-WEB, revisit before quarantining.

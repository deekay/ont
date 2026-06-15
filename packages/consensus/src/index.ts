// @ont/consensus — the frozen sovereignty core.
//
// This package is the whole trust surface inside the ONT codebase: the rules
// that decide whether a name can be taken. A name's owner moves only if its
// current owner key signed it; uniqueness and finality come from deterministic
// Bitcoin replay; ownership is provable to anyone. trust-surface.test.ts splits
// the package into four audited tiers, each with its own dependency allowlist:
// the state/replay deciders ride @ont/protocol + @ont/bitcoin (and engine.ts also
// the B1 @ont/wire §5 owner-key auth digests, pinned per file — #61), the scanner
// (consensus-support) rides the @ont/wire grammar + @ont/bitcoin, the parameter
// surface rides nothing external, and the verdict predicates ride only the B1
// @ont/wire digest/verification primitives where a specific verdict needs them
// (pinned per file: da-verdict rides nothing external, only the value-record
// authority predicate admits @ont/wire — never the legacy @ont/protocol records,
// never host I/O or state mutation). No tier may import allocation
// (auctions), the indexer/resolver, the website, or research/simulation code;
// the per-tier allowlists freeze that, and the package boundary makes it
// physically impossible to import the rest of the system in here.
//
// See docs/DESIGN.md (trust surface / sovereignty map).
export * from "./engine.js";
export * from "./state.js";
export * from "./proof-bundle.js";
// Consensus-support (non state-deciding) — see DECISIONS b2-scanner-boundary (#57).
export * from "./scanner.js";
// Consensus-parameter surface (pure, non state-deciding) — the validated
// (K, W, C) DA-window triple; see DECISIONS b2-consensus-params-boundary (#58).
export * from "./params.js";
// Consensus-verdict predicates (pure, consensus-deciding, non state-mutating) —
// the DA-verdict predicate (#59) and the value-record authority predicate, which
// rides the B1 @ont/wire v1 §8.1 record primitives; see DECISIONS
// b2-consensus-verdicts-boundary (#59) and b2-consensus-verdicts-wire-primitives
// (#60, amending #59).
export * from "./da-verdict.js";
export * from "./value-record-authority.js";
// The gate-fee validation predicate (#62, riding #59's verdict tier): a pure structural
// gate over witnessed (anchor, batch, fee) with no publisher-identity channel — rides
// nothing external (the g(name) schedule is B3). See DECISIONS b2-gate-fee-boundary (#62).
export * from "./gate-fee.js";
// The transcript-completeness predicate (#63, riding #59's verdict tier): a pure
// predicate over a counted bid transcript + a B3-verified completeness witness, with no
// actor/source channel — fail-closed on an absent/producer-asserted witness; rides nothing
// external (the witness format + lot range are B3). See DECISIONS b2-transcript-completeness-boundary (#63).
export * from "./transcript-completeness.js";
// The bond-qualification predicate (#64, riding #59's verdict tier): the pure #37 escalation
// qualification test (bond >= floor); rides nothing external (the floor is a launch-freeze
// parameter). See DECISIONS b2-bond-qualification-boundary (#64).
export * from "./bond-qualification.js";
// The settlement predicates (#65, riding #59's verdict tier): the S5 lock-commitment match
// (settlementLockBlocks === maturityBlocks) and the S15 materialization gate (ownership only from
// an accepted winning bid); both pure, riding nothing external. See DECISIONS b2-settlement-boundary (#65).
export * from "./settlement.js";
// The recovery-invoke authorization/evidence gate (#67, riding #59's verdict tier): the pure
// acceptRecoverOwner predicate (R7/R10/R6/R3/R2/R4/R5 + §3c evidence-gated admission). Rides the
// audited @ont/wire digests/verifier only. See DECISIONS b2-recovery-invoke-authority-boundary (#67).
export * from "./recovery-invoke-authority.js";
// The auction-resolution predicates (#68, riding #59's verdict tier): pure opening-floor,
// bid-acceptance, and winner-selection verdicts. Rides no external package; launch values and
// B3-verified lot/script facts enter as caller inputs.
export * from "./auction-resolution.js";
// The notice-window resolution predicate (#69, riding #59's verdict tier): the pure
// finalize/nullify/escalate/provisional verdict at the notice deadline (T17/F11/A13/D10/#37).
// #49-independent — consumes each claim's resolved DA verdict as a fact; rides nothing external.
export * from "./notice-window.js";
// The reopen/re-auction resolution predicate (#70, riding #59's verdict tier): recognizes a reopen
// lot keyed off the latest KERNEL-DERIVED bond-break release height (T22/B19/S7/S9/#56). Rides
// nothing external — witnessed break facts + the parsed lot anchor enter as caller inputs.
export * from "./reopen-resolution.js";
// The name-occupancy predicate (#71, riding #59's verdict tier): the pure insertion-only /
// no-takeover-of-final gate over a name's resolved post-DA-verdict occupancy (A11/#26). Rides
// nothing external — the resolved governing occupancy enters as a caller input.
export * from "./occupancy.js";
// The batch-exclusion locality predicate (#72, riding #59's verdict tier): the pure insert-only
// batched-insertion derivation that makes the DA-exclusion locality / state-equivalence property
// checkable (B10/D7). Rides nothing external — the DA verdict enters as consumed excludedBatchIds.
export * from "./batch-exclusion.js";
// The window-schedule predicate (#74, riding #59's verdict tier): the pure height-keyed, extend-only
// window-length verdict with no market-signal input channel (B22/Z11). Rides nothing external —
// anchor height + a frozen value-free schedule enter as caller inputs.
export * from "./window-schedule.js";
// The name-canonicalization predicate (#75, riding #59's verdict tier): the pure A6 reject-don't-
// normalize gate over leaf name bytes, riding the audited B1 @ont/wire isCanonicalName primitive.
export * from "./name-canonicalization.js";
// The claim-path-eligibility predicate (#76, riding #59's verdict tier): the pure PR-15 short-name
// threshold gate (canonical byte length <= T => bond-first only). Rides nothing external.
export * from "./claim-path-eligibility.js";
// The post-final-attempt predicate (#77, riding #59's verdict tier): the pure B7 state-shape gate —
// a post-final claim/bond attempt is refused with no state effect, incumbent byte-unchanged. Rides
// nothing external — the resolved final incumbent + the attempt kind enter as caller inputs.
export * from "./post-final-attempt.js";

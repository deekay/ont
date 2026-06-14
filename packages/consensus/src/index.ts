// @ont/consensus — the frozen sovereignty core.
//
// This package is the whole trust surface inside the ONT codebase: the rules
// that decide whether a name can be taken. A name's owner moves only if its
// current owner key signed it; uniqueness and finality come from deterministic
// Bitcoin replay; ownership is provable to anyone. trust-surface.test.ts splits
// the package into four audited tiers, each with its own dependency allowlist:
// the state/replay deciders ride @ont/protocol + @ont/bitcoin, the scanner
// (consensus-support) rides the @ont/wire grammar + @ont/bitcoin, and the
// parameter surface and verdict predicates ride nothing external. No tier may
// import allocation (auctions), the indexer/resolver, the website, or research/
// simulation code; the per-tier allowlists freeze that, and the package boundary
// makes it physically impossible to import the rest of the system in here.
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
// the DA-verdict predicate; see DECISIONS b2-consensus-verdicts-boundary (#59).
export * from "./da-verdict.js";
